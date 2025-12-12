import axios from "axios";
import redis from "../dbConfig/redis";
import pool from "../dbConfig/dbConfig";
import { fetchKekaToken } from "../middleware/kekaToken";

interface KekaAttendanceData {
  id: string;
  employeeIdentifier: string;
  attendanceDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftDuration: number;
  firstInOfTheDay: {
    timestamp: string;
  } | null;
  lastOutOfTheDay: {
    timestamp: string;
  } | null;
  totalGrossHours: number;
  totalBreakDuration: number;
  totalEffectiveHours: number;
  totalEffectiveOvertimeDuration: number;
}

interface KekaAttendanceApiResponse {
  succeeded: boolean;
  message: string;
  errors: string[];
  data: KekaAttendanceData[];
  totalPages: number;
  totalRecords: number;
}

interface EmployeeWithOffdays {
  employee_id: string;
  offdays: string | null;
}

interface RateLimitState {
  count: number;
  currentEmployeeIndex: number;
  currentPageNumber: number;
  resetTime: number;
  totalEmployees: number;
  currentEmployeeId: string;
  employeeIds: string[]; // Cache of all employee IDs
  isPaused: boolean; // New field to track if we're paused due to rate limit
}

// Rate limiting constants
const MAX_CALLS_PER_MINUTE = 40; // Changed to 40 as per your requirement
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute in milliseconds
const AUTO_RESUME_DELAY_MS = 60 * 1000; // 1 minute in 
// Redis keys
const RATE_LIMIT_STATE_KEY = 'attendance_rate_limit_state';
const EMPLOYEE_IDS_CACHE_KEY = 'attendance_employee_ids_cache';

// Time conversion constants (UTC to IST: +5 hours 30 minutes)
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 5 hours 30 minutes in milliseconds

// Main function to collect and sync attendance data
export const collectAndSyncAttendance = async (): Promise<void> => {
  let rateLimitState: RateLimitState = await getRateLimitState();
  let accessToken: string | null = null;

  try {
    // //console.log(" Starting attendance collection and sync...");
    // //console.log(` Current rate limit: ${rateLimitState.count}/${MAX_CALLS_PER_MINUTE}`);
    // //console.log(`📍 Current position: Employee ${rateLimitState.currentEmployeeIndex + 1}/${rateLimitState.totalEmployees}, Page ${rateLimitState.currentPageNumber}`);

    // Check if we're resuming from a rate limit pause
    if (rateLimitState.isPaused) {
      ////console.log(`⏸️ Resuming from previous rate limit pause. Auto-resuming now...`);
      // Auto-resume immediately without waiting since we already waited during the pause
      rateLimitState.count = 0;
      rateLimitState.resetTime = Date.now();
      rateLimitState.isPaused = false;
      await saveRateLimitState(rateLimitState);
    }

    // Get access token from Redis
    accessToken = await redis.get("keka_access_token");
    
    if (!accessToken) {
    //  //console.log(" No token found in Redis, fetching new token...");
      accessToken = await fetchKekaToken();
      
      // Count token fetch as an API call and check rate limit
      await incrementRateLimitCountAndCheck(rateLimitState);
    }

    const company = process.env.KEKA_COMPANY;
    const environment = process.env.KEKA_ENVIRONMENT;
    
    if (!company || !environment) {
      throw new Error("KEKA_COMPANY or KEKA_ENVIRONMENT environment variables are not set");
    }

    // Load employee IDs (from cache or database)
    const employeeIds = await loadEmployeeIds();
    
    if (employeeIds.length === 0) {
    //  //console.log(" No employees found with valid employee_ids");
      await clearRateLimitState();
      return;
    }

    // Update state with employee IDs if they're different
    if (JSON.stringify(rateLimitState.employeeIds) !== JSON.stringify(employeeIds)) {
      rateLimitState.employeeIds = employeeIds;
      rateLimitState.totalEmployees = employeeIds.length;
      await saveRateLimitState(rateLimitState);
    }

    ////console.log(` Found ${employeeIds.length} employees with IDs for attendance sync`);

    let totalNewRecords = 0;
    let totalUpdatedRecords = 0;
    let processedEmployees = 0;

    // Start from where we left off
    const startEmployeeIndex = Math.max(0, rateLimitState.currentEmployeeIndex);
    const startPageNumber = rateLimitState.currentPageNumber;

   // //console.log(` Starting from employee ${startEmployeeIndex + 1}/${employeeIds.length}, page ${startPageNumber}`);

    // Process employees starting from last saved position
    for (let employeeIndex = startEmployeeIndex; employeeIndex < employeeIds.length; employeeIndex++) {
      const employeeId = employeeIds[employeeIndex];
      
      // Get employee offdays from database
      const offdays = await getEmployeeOffdays(employeeId);
      
      // Update current employee in state
      rateLimitState.currentEmployeeId = employeeId;
      rateLimitState.currentEmployeeIndex = employeeIndex;
      await saveRateLimitState(rateLimitState);

      let currentPage = (employeeIndex === startEmployeeIndex) ? startPageNumber : 1;
      let hasMorePages = true;
      let employeeProcessed = false;

      // Process pages for current employee
      while (hasMorePages && !employeeProcessed) {
        try {
          //console.log(`👤 Processing employee ${employeeIndex + 1}/${employeeIds.length}: ${employeeId}, page ${currentPage}`);
          //console.log(` API calls made this minute: ${rateLimitState.count}/${MAX_CALLS_PER_MINUTE}`);
          
          const employeeAttendance = await fetchEmployeeAttendancePage(
            accessToken!, 
            company, 
            environment, 
            employeeId,
            offdays,
            currentPage,
            async () => {
              // This will now auto-pause and auto-resume if rate limit is reached
              await incrementRateLimitCountAndCheck(rateLimitState);
            }
          );

          const { newRecords, updatedRecords, totalPages } = await saveAttendanceData(
            employeeAttendance, 
            employeeId,
            offdays
          );

          totalNewRecords += newRecords;
          totalUpdatedRecords += updatedRecords;

          // Update state after successful page processing
          rateLimitState.currentPageNumber = currentPage;
          rateLimitState.isPaused = false; // Reset pause flag if we're processing
          await saveRateLimitState(rateLimitState);

          // Check if there are more pages
          if (currentPage >= totalPages || totalPages === 0) {
            hasMorePages = false;
            employeeProcessed = true;
            processedEmployees++;
            //console.log(` Completed employee ${employeeId} (${totalPages} pages)`);
          } else {
            currentPage++;
          }

          // Small delay to avoid aggressive API calls
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(` Error processing attendance for employee ${employeeId}, page ${currentPage}:`, error);
          
          // Save error state and continue with next employee
          rateLimitState.currentPageNumber = currentPage;
          rateLimitState.isPaused = false;
          await saveRateLimitState(rateLimitState);
          hasMorePages = false; // Move to next employee on error
          continue;
        }
      }

      // Reset page number when moving to next employee
      rateLimitState.currentPageNumber = 1;
      await saveRateLimitState(rateLimitState);
    }

    // Clear rate limit state if all employees processed successfully
    await clearRateLimitState();
    //console.log(' Rate limit state cleared - all employees processed');
    //console.log(` Attendance sync completed: ${totalNewRecords} new records, ${totalUpdatedRecords} updated records, ${processedEmployees} employees processed`);

  } catch (error: any) {
    console.error(" Attendance collection error:", error.response?.data || error.message);
    // Save state even on error for recovery
    await saveRateLimitState(rateLimitState);
    throw error;
  }
};

// Load employee IDs from cache or database
const loadEmployeeIds = async (): Promise<string[]> => {
  // Try to get from cache first
  const cachedEmployeeIds = await redis.get(EMPLOYEE_IDS_CACHE_KEY);
  if (cachedEmployeeIds) {
    //console.log(' Using cached employee IDs');
    return JSON.parse(cachedEmployeeIds);
  }

  // Get from database if cache miss
  const [employees] = await pool.query(`
    SELECT employee_id 
    FROM employees 
    WHERE employee_id IS NOT NULL AND employee_id != ''
  `) as [EmployeeWithOffdays[], any];

  const employeeIds = employees.map(emp => emp.employee_id);
  
  // Cache for 1 hour
  await redis.setex(EMPLOYEE_IDS_CACHE_KEY, 60 * 60, JSON.stringify(employeeIds));
  //console.log(`💾 Cached ${employeeIds.length} employee IDs for 1 hour`);
  
  return employeeIds;
};

// Get employee offdays from database
const getEmployeeOffdays = async (employeeId: string): Promise<string | null> => {
  try {
    const [rows] = await pool.query(
      "SELECT offdays FROM employees WHERE employee_id = ?",
      [employeeId]
    ) as any[];
    
    return rows.length > 0 ? rows[0].offdays : null;
  } catch (error) {
    console.error(` Error fetching offdays for employee ${employeeId}:`, error);
    return null;
  }
};

// Rate limit state management
const getRateLimitState = async (): Promise<RateLimitState> => {
  const stateJson = await redis.get(RATE_LIMIT_STATE_KEY);
  const currentTime = Date.now();
  
  if (stateJson) {
    try {
      const state: RateLimitState = JSON.parse(stateJson);
      
      // Reset count if window has passed
      if ((currentTime - state.resetTime) > RATE_LIMIT_WINDOW_MS) {
        //console.log(' Rate limit window reset');
        state.count = 0;
        state.resetTime = currentTime;
        state.isPaused = false;
      }
      
      return state;
    } catch (parseError) {
      console.error(' Error parsing rate limit state, resetting...', parseError);
    }
  }
  
  // Initial state
  const initialState: RateLimitState = {
    count: 0,
    currentEmployeeIndex: 0,
    currentPageNumber: 1,
    resetTime: currentTime,
    totalEmployees: 0,
    currentEmployeeId: '',
    employeeIds: [],
    isPaused: false
  };
  
  await saveRateLimitState(initialState);
  return initialState;
};

const saveRateLimitState = async (state: RateLimitState): Promise<void> => {
  try {
    await redis.set(RATE_LIMIT_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error(' Error saving rate limit state:', error);
  }
};

const clearRateLimitState = async (): Promise<void> => {
  try {
    await redis.del(RATE_LIMIT_STATE_KEY);
    //console.log(' Rate limit state cleared');
  } catch (error) {
    console.error(' Error clearing rate limit state:', error);
  }
};

const incrementRateLimitCountAndCheck = async (state: RateLimitState): Promise<boolean> => {
  const currentTime = Date.now();
  
  // Reset count if window has passed
  if ((currentTime - state.resetTime) > RATE_LIMIT_WINDOW_MS) {
    //console.log(' Rate limit window reset, starting new minute');
    state.count = 1;
    state.resetTime = currentTime;
    state.isPaused = false;
  } else {
    state.count++;
  }
  
  //console.log(`📈 API call count: ${state.count}/${MAX_CALLS_PER_MINUTE}`);
  
  // Save state immediately after incrementing
  await saveRateLimitState(state);
  
  // Check if we've reached the limit
  if (state.count >= MAX_CALLS_PER_MINUTE) {
    //console.log(`⏸️ Rate limit reached (${state.count}/${MAX_CALLS_PER_MINUTE}). Auto-pausing for 1 minute...`);
    
    // Set pause flag
    state.isPaused = true;
    await saveRateLimitState(state);
    
    // Wait for 1 minute before allowing to continue
    //console.log(`⏳ Auto-resuming in 1 minute...`);
    await new Promise(resolve => setTimeout(resolve, AUTO_RESUME_DELAY_MS));
    
    // Reset count after waiting
    state.count = 0;
    state.resetTime = Date.now();
    state.isPaused = false;
    await saveRateLimitState(state);
    
    //console.log(` Auto-resume complete. Rate limit reset to 0/${MAX_CALLS_PER_MINUTE}`);
    return true; // Indicate that a pause occurred and was resumed
  }
  
  return false; // No pause occurred
};

// Fetch single page of attendance data
const fetchEmployeeAttendancePage = async (
  accessToken: string, 
  company: string, 
  environment: string, 
  employeeId: string,
  offdays: string | null,
  pageNumber: number,
  incrementRateLimit: () => Promise<void>
): Promise<{ data: KekaAttendanceData[], totalPages: number }> => {
  let retryCount = 0;
  const maxRetries = 1;

  // Calculate date range based on employee's existing data
  const { fromDate, toDate } = await calculateDateRange(employeeId);

  ////console.log(`📅 Fetching attendance for employee ${employeeId} from ${fromDate} to ${toDate}, page ${pageNumber}`);

  const apiUrl = `https://${company}.${environment}.com/api/v1/time/attendance`;
  
  try {
    // Increment rate limit count BEFORE making the API call
    await incrementRateLimit();

    const response = await axios.get<KekaAttendanceApiResponse>(apiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        employeeIds: employeeId,
        from: fromDate,
        to: toDate,
        pageNumber: pageNumber,
        pageSize: 100
      },
      timeout: 30000 // 30 second timeout
    });

    const data = response.data;
    
    if (data.succeeded && data.data) {
      //console.log(` Page ${pageNumber}/${data.totalPages}: Found ${data.data.length} attendance records for employee ${employeeId}`);
      return {
        data: data.data,
        totalPages: data.totalPages
      };
    } else {
      //console.log(` API call succeeded but no data for employee ${employeeId}, page ${pageNumber}:`, data.message);
      return {
        data: [],
        totalPages: 0
      };
    }
    
  } catch (apiError: any) {
    if (apiError.response?.status === 401 && retryCount < maxRetries) {
      //console.log(" Token expired or invalid, fetching new token...");
      const newToken = await fetchKekaToken();
      retryCount++;
      accessToken = newToken;
      
      // Count token refresh as API call
      await incrementRateLimit();
      
      // Retry with new token
      return fetchEmployeeAttendancePage(accessToken, company, environment, employeeId, offdays, pageNumber, incrementRateLimit);
    } else {
      console.error(` API Error for employee ${employeeId}, page ${pageNumber}:`, apiError.response?.data || apiError.message);
      throw apiError;
    }
  }
};

// Calculate date range with 24-hour rolling window
const calculateDateRange = async (employeeId: string): Promise<{ fromDate: string; toDate: string }> => {
  const now = new Date();
  const toDate = now.toISOString().split('T')[0]; // Today's date
  
  // Check if this specific employee has TODAY'S attendance record
  const [todaysRecord] = await pool.query(
    `SELECT COUNT(*) as count FROM attendance 
     WHERE employee_id = ? AND attendance_date = ?`,
    [employeeId, toDate]
  ) as [{ count: number }[], any];

  const hasTodaysRecord = todaysRecord[0].count > 0;
  let fromDate: string;

  if (!hasTodaysRecord) {
    // No record for today - get last 2 weeks to ensure we capture today's data
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    fromDate = twoWeeksAgo.toISOString().split('T')[0];
    //console.log(`🆕 Loading 2 weeks data for employee ${employeeId} (no today's record), fetching from ${fromDate} to ${toDate}`);
  } else {
    // Has today's record - just get yesterday's data for updates
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    fromDate = yesterday.toISOString().split('T')[0];
    //console.log(` Daily update for employee ${employeeId} (has today's record), fetching 24-hour window from ${fromDate} to ${toDate}`);
  }
  
  return { fromDate, toDate };
};

// Convert UTC to IST and format for MySQL
const convertToIST = (utcTimeString: string): string | null => {
  if (!utcTimeString) return null;
  
  try {
    // Parse the UTC time
    const utcTime = new Date(utcTimeString);
    
    // Validate the date
    if (isNaN(utcTime.getTime())) {
      console.warn(` Invalid UTC time string: ${utcTimeString}`);
      return null;
    }
    
    // Add 5 hours 30 minutes to convert to IST
    const istTime = new Date(utcTime.getTime() + IST_OFFSET_MS);
    
    // Format as MySQL datetime string in IST
    const istString = istTime.toISOString().slice(0, 19).replace('T', ' ');
    
    return istString;
  } catch (error) {
    console.error(` Error converting time: ${utcTimeString}`, error);
    return null;
  }
};

// Save attendance data with UPSERT logic
const saveAttendanceData = async (
  attendanceData: { data: KekaAttendanceData[], totalPages: number },
  employeeId: string,
  offdays: string | null
): Promise<{ newRecords: number; updatedRecords: number; totalPages: number }> => {
  let newRecords = 0;
  let updatedRecords = 0;

  for (const attendance of attendanceData.data) {
    try {
      const attendanceDate = attendance.attendanceDate.split('T')[0];
      
      // Check if it's an offday
      const isOffday = checkIfOffday(attendance.attendanceDate, offdays);
      
      // Convert UTC times to IST strings for MySQL
      const shiftStart = convertToIST(attendance.shiftStartTime);
      const shiftEnd = convertToIST(attendance.shiftEndTime);
      const firstIn = attendance.firstInOfTheDay?.timestamp ? 
        convertToIST(attendance.firstInOfTheDay.timestamp) : null;
      const lastOut = attendance.lastOutOfTheDay?.timestamp ? 
        convertToIST(attendance.lastOutOfTheDay.timestamp) : null;

      // Validate required fields
      if (!shiftStart || !shiftEnd) {
        console.warn(` Skipping record with invalid shift times for employee ${employeeId} on ${attendanceDate}`);
        continue;
      }

      // Check if record exists for this employee and date
      const [existingRecord] = await pool.query(
        `SELECT id FROM attendance 
         WHERE employee_id = ? AND attendance_date = ?`,
        [employeeId, attendanceDate]
      ) as any[];

      if (existingRecord.length > 0) {
        // Record exists - UPDATE with latest data
        await pool.query(
          `UPDATE attendance SET
            id = ?,
            shift_start = ?,
            shift_end = ?,
            shift_duration = ?,
            first_in_of_the_day_time = ?,
            last_out_of_the_day_time = ?,
            total_gross_hours = ?,
            total_break_duration = ?,
            total_effective_hours = ?,
            total_effective_overtime_duration = ?,
            is_offday = ?
          WHERE employee_id = ? AND attendance_date = ?`,
          [
            attendance.id,
            shiftStart,
            shiftEnd,
            attendance.shiftDuration || 0,
            firstIn,
            lastOut,
            attendance.totalGrossHours || 0,
            attendance.totalBreakDuration || 0,
            attendance.totalEffectiveHours || 0,
            attendance.totalEffectiveOvertimeDuration || 0,
            isOffday,
            employeeId,
            attendanceDate
          ]
        );

        updatedRecords++;
        
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO attendance (
            id, employee_id, attendance_date, shift_start, shift_end, shift_duration,
            first_in_of_the_day_time, last_out_of_the_day_time, total_gross_hours,
            total_break_duration, total_effective_hours, total_effective_overtime_duration, is_offday
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            attendance.id,
            employeeId,
            attendanceDate,
            shiftStart,
            shiftEnd,
            attendance.shiftDuration || 0,
            firstIn,
            lastOut,
            attendance.totalGrossHours || 0,
            attendance.totalBreakDuration || 0,
            attendance.totalEffectiveHours || 0,
            attendance.totalEffectiveOvertimeDuration || 0,
            isOffday
          ]
        );

        newRecords++;
      }

    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        //console.log(` Duplicate entry handled for employee ${employeeId} on ${attendance.attendanceDate.split('T')[0]}`);
        continue;
      } else {
        console.error(` Error saving attendance record for ${employeeId}:`, error);
        throw error;
      }
    }
  }

  return { newRecords, updatedRecords, totalPages: attendanceData.totalPages };
};

// Check if the attendance date is an offday
const checkIfOffday = (attendanceDate: string, offdays: string | null): boolean => {
  if (!offdays) return false;

  const date = new Date(attendanceDate);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  const offdayList = offdays.split(',').map(day => day.trim().toLowerCase());
  return offdayList.includes(dayName.toLowerCase());
};

// Function to manually trigger attendance collection
export const triggerAttendanceCollection = async (): Promise<void> => {
  //console.log(" Manually triggering attendance collection...");
  await collectAndSyncAttendance();
};

// Function to check current rate limit status
export const getRateLimitStatus = async (): Promise<{
  currentCount: number;
  maxLimit: number;
  currentEmployeeIndex: number;
  currentPageNumber: number;
  totalEmployees: number;
  currentEmployeeId: string;
  resetTime: number;
  isPaused: boolean;
  timeUntilReset: number;
}> => {
  const state = await getRateLimitState();
  const currentTime = Date.now();
  const timeUntilReset = Math.max(0, RATE_LIMIT_WINDOW_MS - (currentTime - state.resetTime));
  
  return {
    currentCount: state.count,
    maxLimit: MAX_CALLS_PER_MINUTE,
    currentEmployeeIndex: state.currentEmployeeIndex,
    currentPageNumber: state.currentPageNumber,
    totalEmployees: state.totalEmployees,
    currentEmployeeId: state.currentEmployeeId,
    resetTime: state.resetTime,
    isPaused: state.isPaused,
    timeUntilReset: timeUntilReset
  };
};

// Function to reset rate limit manually
export const resetRateLimit = async (): Promise<void> => {
  await clearRateLimitState();
  //console.log(' Rate limit manually reset');
};

// Function to clear employee IDs cache
export const clearEmployeeIdsCache = async (): Promise<void> => {
  await redis.del(EMPLOYEE_IDS_CACHE_KEY);
  //console.log(' Employee IDs cache cleared');
};