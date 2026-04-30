import axios from "axios";
import redis from "../dbConfig/redis";
import pool from "../dbConfig/dbConfig";
import { fetchKekaToken } from "../middleware/kekaToken";

interface KekaGroup {
  id: string;
  title: string;
  name?: string; // Added to match Keka's group naming payload
  groupType: number;
}

// Added to type the Keka API work location field properly
interface KekaWorkLocation {
  id: string;
  name: string;
}

// Added to type the Keka API reportsTo field properly
interface KekaReportsTo {
  firstName: string;
  lastName: string;
}

// Added to type the Keka API job title field properly
interface KekaJobTitle {
  identifier: string;
  title: string;
}

interface KekaEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  // FIX: Corrected field name from dateOfJoin to joiningDate as per Keka API response
  joiningDate: string;
  resignationSubmittedDate: string | null;
  groups: KekaGroup[];
  reportsTo?: KekaReportsTo; // Accurate Keka API structure for manager evaluation
  workLocation?: KekaWorkLocation; // Added back to support hybrid location API formats
  jobTitle?: KekaJobTitle; // Added to map missing title rows on insertion
  // FIX: Added fallback department fields — Keka may expose department outside of groups
  department?: { name: string } | null;
  departmentName?: string | null;
}

interface KekaApiResponse {
  data: KekaEmployee[];
  totalPages: number;
  totalRecords: number;
  succeeded: boolean;
}

interface DatabaseEmployee {
  id?: number;
  employee_id: string;
  name: string;
  joining_date?: string;
  // Added fields to match database schema for the newly extracted details
  manager_name?: string;
  group_name?: string;
  location_id?: string;
  location_name?: string;
}

// Rate limiting constants for employee API
const MAX_CALLS_PER_MINUTE = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Redis keys for employee rate limiting
const EMPLOYEE_RATE_LIMIT_STATE_KEY = 'employee_rate_limit_state';

interface EmployeeRateLimitState {
  count: number;
  currentPage: number;
  totalPages: number;
  resetTime: number;
  lastProcessedPage: number;
}

// Main function to collect and sync employees
export const collectAndSyncEmployees = async (): Promise<void> => {
  let rateLimitState: EmployeeRateLimitState = await getEmployeeRateLimitState();
  let accessToken: string | null = null;

  try {
    // console.log(" Starting employee collection and sync...");
    // console.log(` Current rate limit: ${rateLimitState.count}/${MAX_CALLS_PER_MINUTE}`);

    // Get access token from Redis
    accessToken = await redis.get("keka_access_token");

    // If no token in Redis, fetch a new one
    if (!accessToken) {
      console.log(" No token found in Redis, fetching new token...");
      accessToken = await fetchKekaToken();
      await incrementEmployeeRateLimitCount(rateLimitState); // Count token fetch as API call
    }

    const company = process.env.KEKA_COMPANY;
    const environment = process.env.KEKA_ENVIRONMENT;

    if (!company || !environment) {
      throw new Error("KEKA_COMPANY or KEKA_ENVIRONMENT environment variables are not set");
    }


    // FIX: Always start from page 1 to ensure full fetch of all employees
    // Do NOT resume from a stale rate limit state page — always do a clean sweep
    let allFilteredEmployees: KekaEmployee[] = [];
    let currentPage = 1;
    let totalPages = 1;
    let retryCount = 0;
    const maxRetries = 1;

    // FIX: Clear stale Redis employee cache so sync always uses fresh API data
    await redis.del("keka_employees_data");
    // console.log(' Cleared stale Redis employee cache for fresh fetch');

    // Fetch all pages from Keka API with rate limiting
    do {
      // Check rate limit before each API call
      if (rateLimitState.count >= MAX_CALLS_PER_MINUTE) {
        console.log(`⏸️ Rate limit reached (${rateLimitState.count}/${MAX_CALLS_PER_MINUTE}). Pausing for 1 minute...`);

        // Save current state before pausing
        rateLimitState.currentPage = currentPage;
        rateLimitState.totalPages = totalPages;
        rateLimitState.lastProcessedPage = currentPage - 1;
        await saveEmployeeRateLimitState(rateLimitState);

        // Wait for rate limit window to reset
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW_MS));

        // Reset counter and continue
        rateLimitState.count = 0;
        rateLimitState.resetTime = Date.now();
        await saveEmployeeRateLimitState(rateLimitState);
        //  console.log(' Rate limit reset, continuing...');
      }

      const apiUrl = `https://${company}.${environment}.com/api/v1/hris/employees?pageNumber=${currentPage}&pageSize=100`;

      //  console.log(`📡 Fetching page ${currentPage} from Keka API...`);

      try {
        await incrementEmployeeRateLimitCount(rateLimitState);

        const response = await axios.get<KekaApiResponse>(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 30000 // 30 second timeout
        });

        const data = response.data;
        totalPages = data.totalPages;

        // Update state with current progress
        rateLimitState.currentPage = currentPage;
        rateLimitState.totalPages = totalPages;
        rateLimitState.lastProcessedPage = currentPage;
        await saveEmployeeRateLimitState(rateLimitState);

        // Only filter out resigned employees — store ALL active Keka employees in DB
        // Location-based filtering should be done at query time from the database
        const filteredEmployees = data.data.filter(employee =>
          (employee.resignationSubmittedDate === null || employee.resignationSubmittedDate === undefined)
        );


        allFilteredEmployees = allFilteredEmployees.concat(filteredEmployees);
        //console.log(` Page ${currentPage}/${totalPages}: Found ${filteredEmployees.length} active employees in target groups`);
        currentPage++;

        // Small delay to avoid aggressive API calls
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (apiError: any) {
        // If unauthorized and we haven't retried yet, refresh token and retry
        if (apiError.response?.status === 401 && retryCount < maxRetries) {
          console.log(" Token expired or invalid, fetching new token...");
          accessToken = await fetchKekaToken();
          retryCount++;

          // Count token refresh as API call
          await incrementEmployeeRateLimitCount(rateLimitState);

          //  console.log(" Retrying API call with new token...");
          continue; // Retry the same page
        } else {
          // Save state on error for recovery
          rateLimitState.currentPage = currentPage;
          rateLimitState.totalPages = totalPages;
          rateLimitState.lastProcessedPage = currentPage - 1;
          await saveEmployeeRateLimitState(rateLimitState);
          throw apiError;
        }
      }

    } while (currentPage <= totalPages);


    // console.log(` Total filtered active employees from Keka: ${allFilteredEmployees.length}`);

    // Store the API response in Redis for 23 hours
    await redis.setex("keka_employees_data", 23 * 60 * 60, JSON.stringify(allFilteredEmployees));
    //console.log(" Employee data stored in Redis for 23 hours");

    // Clear rate limit state since we completed successfully
    await clearEmployeeRateLimitState();
    // console.log(' Employee rate limit state cleared - all pages processed');

    // Get existing employees from database
    // Modified to also fetch manager_name, group_name, location_id, location_name to evaluate if an update is needed
    const [dbEmployees] = await pool.query("SELECT employee_id, name, joining_date, manager_name, group_name, location_id, location_name FROM employees") as [DatabaseEmployee[], any];
    // console.log(` Found ${dbEmployees.length} employees in database`);

    // Sync employees with database - ONLY UPDATE EXISTING ONES
    await syncEmployeesWithDatabase(allFilteredEmployees, dbEmployees);

    // console.log(" Employee collection and sync completed successfully");

  } catch (error: any) {
    console.error(" Employee collection error:", error.response?.data || error.message);

    // Save state even on error for recovery
    await saveEmployeeRateLimitState(rateLimitState);

    // Try to use cached data from Redis if API call fails
    try {
      const cachedData = await redis.get("keka_employees_data");
      if (cachedData) {
        //console.log(" Using cached employee data from Redis due to API failure");
        const allFilteredEmployees: KekaEmployee[] = JSON.parse(cachedData);
        // Modified fallback query to match the extended fields same as the main query
        const [dbEmployees] = await pool.query("SELECT employee_id, name, joining_date, manager_name, group_name, location_id, location_name FROM employees") as [DatabaseEmployee[], any];
        await syncEmployeesWithDatabase(allFilteredEmployees, dbEmployees);
        //console.log(" Sync completed using cached data");
      }
    } catch (cacheError) {
      console.error(" Failed to use cached data:", cacheError);
    }

    throw error;
  }
};

// Employee Rate Limit State Management
const getEmployeeRateLimitState = async (): Promise<EmployeeRateLimitState> => {
  const stateJson = await redis.get(EMPLOYEE_RATE_LIMIT_STATE_KEY);
  const currentTime = Date.now();

  if (stateJson) {
    try {
      const state: EmployeeRateLimitState = JSON.parse(stateJson);

      // Reset count if window has passed
      if ((currentTime - state.resetTime) > RATE_LIMIT_WINDOW_MS) {
        state.count = 0;
        state.resetTime = currentTime;
      }

      return state;
    } catch (parseError) {
      console.error(' Error parsing employee rate limit state, resetting...', parseError);
    }
  }

  // Initial state
  return {
    count: 0,
    currentPage: 1,
    totalPages: 1,
    resetTime: currentTime,
    lastProcessedPage: 0
  };
};

const saveEmployeeRateLimitState = async (state: EmployeeRateLimitState): Promise<void> => {
  try {
    await redis.set(EMPLOYEE_RATE_LIMIT_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error(' Error saving employee rate limit state:', error);
  }
};

const clearEmployeeRateLimitState = async (): Promise<void> => {
  try {
    await redis.del(EMPLOYEE_RATE_LIMIT_STATE_KEY);
    //console.log(' Employee rate limit state cleared');
  } catch (error) {
    console.error(' Error clearing employee rate limit state:', error);
  }
};

const incrementEmployeeRateLimitCount = async (state: EmployeeRateLimitState): Promise<void> => {
  state.count++;
  await saveEmployeeRateLimitState(state);
};

// Helper function to convert API date to MySQL date format
// FIX: Return null instead of empty string to prevent MySQL incorrectly mapping to '00:00:00'
const convertToMySQLDate = (apiDate?: string | null): string | null => {
  if (!apiDate) return null;

  try {
    // Handle formats like "2014-06-01T00:00:00Z" or "2014-06-01"
    let dateStr = apiDate;
    // If it's a full timestamp, extract just the date part
    if (dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }
    // Validate the date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(dateStr) ? dateStr : null;
  } catch (error) {
    console.error(` Date conversion error for: ${apiDate}`, error);
    return null;
  }
};

// FIX: Loop over Keka employees instead of DB employees to ensure full sync
const syncEmployeesWithDatabase = async (kekaEmployees: KekaEmployee[], dbEmployees: DatabaseEmployee[]): Promise<void> => {
  let updates = 0;

  for (const kekaEmployee of kekaEmployees) {
    try {
      // Extract all fields directly from Keka data
      // FIX: Handle missing joiningDate by inserting NULL instead of invalid time
      let mysqlDate = kekaEmployee.joiningDate
        ? convertToMySQLDate(kekaEmployee.joiningDate)
        : null;
      if (!mysqlDate) mysqlDate = null;

      const managerName = kekaEmployee.reportsTo
        ? `${kekaEmployee.reportsTo.firstName} ${kekaEmployee.reportsTo.lastName}`.trim()
        : null;

      // FIX: Department/division mapping with three-tier fallback:
      //   1. groups array entry with groupType === 2 (standard department group)
      //   2. kekaEmployee.department?.name (top-level department object, if present)
      //   3. kekaEmployee.departmentName (flat string field, if present)
      // This ensures division is populated regardless of which field Keka uses.
      const departmentGroup = kekaEmployee.groups?.find((g: KekaGroup) => g.groupType === 2);
      const division =
        departmentGroup?.title ||
        kekaEmployee.department?.name ||
        kekaEmployee.departmentName ||
        null;

      // FIX: Support both groups and workLocation for location extraction
      const locationGroup = kekaEmployee.groups?.find((g: KekaGroup) => g.groupType === 3);
      const locationId = locationGroup?.id || kekaEmployee.workLocation?.id || null;
      const locationName = locationGroup?.title || kekaEmployee.workLocation?.name || null;

      // Machine mapping (groupType === 4) — e.g. "GTO", "Gravure", "Punching 1", "Silk Screen"
      // Only populated when Keka has a groupType 4 entry; null otherwise (preserves manual values)
      const machineGroup = kekaEmployee.groups?.find((g: KekaGroup) => g.groupType === 4);
      const machine = machineGroup?.title || null;

      const jobTitle = kekaEmployee.jobTitle?.title || null;

      // Check if employee already exists in DB by employee_id
      const [existingEmployee] = await pool.query(
        "SELECT id FROM employees WHERE employee_id = ?",
        [kekaEmployee.id]
      ) as any;

      if (existingEmployee.length > 0) {
        // Employee exists → UPDATE
        // FIX: Added `division` to UPDATE so existing rows with NULL division get corrected.
        // Previously only `group_name` was set; `division` (read by all reports) was never written.
        // Only update `machine` when Keka provides a value — preserves manually-set machine values.
        await pool.query(
          `UPDATE employees
           SET name = ?, jobtitle = ?, joining_date = ?, manager_name = ?, group_name = ?, division = ?,
               machine = COALESCE(?, machine), location_id = ?, location_name = ?
           WHERE employee_id = ?`,
          [
            kekaEmployee.displayName,
            jobTitle,
            mysqlDate,
            managerName,
            division,
            division,
            machine,
            locationId,
            locationName,
            kekaEmployee.id
          ]
        );
        updates++;
      } else {
        // Employee does not exist → INSERT new row
        // FIX (MYSQL): Include regularShiftStart/End to prevent duty_hours GENERATED column
        // from evaluating TIMESTAMPDIFF against NULL, causing ER_TRUNCATED_WRONG_VALUE in strict mode
        // FIX: Added `division` and `machine` to INSERT so new employees are fully populated from day one.
        await pool.query(
          `INSERT INTO employees (
            employee_id, name, jobtitle, manager_name, group_name, division, machine, location_id, location_name, joining_date, regularShiftStart, regularShiftEnd
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '00:00:00', '00:00:00')`,
          [
            kekaEmployee.id,
            kekaEmployee.displayName,
            jobTitle,
            managerName,
            division,
            division,
            machine,
            locationId,
            locationName,
            mysqlDate
          ]
        );
        updates++; // Count inserts too
      }
    } catch (error: any) {
      if (error.code !== 'ER_DUP_ENTRY') {
        console.error(` Error syncing employee "${kekaEmployee.displayName}":`, error.message);
      }
    }
  }

};


// FIX: Normalize spacing and remove hidden characters to ensure accurate matching
const normalize = (str?: string | null) => 
  str
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')   // collapse multiple spaces into one
    .replace(/[^\w\s]/g, '') // remove special characters (optional)
    || '';

// Enhanced function to find matching Keka employee
const findMatchingKekaEmployee = (
  dbName: string,
  kekaEmployees: KekaEmployee[],
  usedEmployeeIdsInDB: Set<string>,
  employeeIdsToAssign: Set<string>
): KekaEmployee | null => {

  for (const kekaEmp of kekaEmployees) {
    // FIX: Previously skipped valid employees already present in DB,
    // which prevented matching. Now allowing them for proper sync.
    // FIX: Allow matching even if employee exists in DB
    // Only prevent duplicate assignment in current sync
    if (employeeIdsToAssign.has(kekaEmp.id)) {
      continue;
    }

    // FIX: Use direct normalized displayName comparison for accurate matching
    const isMatch = normalize(kekaEmp.displayName) === normalize(dbName);

    if (isMatch) {
      return kekaEmp;
    }
  }

  return null;
};


// Helper function for flexible name matching
const areNamesSimilar = (name1: string, name2: string): boolean => {
  if (!name1 || !name2) return false;

  const n1 = name1.toLowerCase().replace(/\s+/g, ' ').trim();
  const n2 = name2.toLowerCase().replace(/\s+/g, ' ').trim();

  // Exact match after normalization
  if (n1 === n2) return true;

  // Common name variations mapping
  const variations: { [key: string]: string[] } = {
    'soumen': ['somen'],
    'somen': ['soumen'],
    'subham': ['shubham', 'shubom'],
    'shubham': ['subham', 'shubom'],
    'shubom': ['subham', 'shubham'],
    'prosenjit': ['prasenjit', 'proshonjit'],
    'prasenjit': ['prosenjit', 'proshonjit'],
    // Add more common variations as needed
  };

  // Check for known variations
  for (const [base, vars] of Object.entries(variations)) {
    if ((n1 === base && vars.includes(n2)) || (n2 === base && vars.includes(n1))) {
      return true;
    }
  }

  return false;
};

// Function to get employees (uses Redis cache first, then API)
export const getEmployeesData = async (): Promise<any> => {
  try {
    // Try to get cached data first
    const cachedData = await redis.get("keka_employees_data");
    if (cachedData) {
      // console.log(" Returning cached employee data from Redis");
      const employees = JSON.parse(cachedData);
      return {
        data: employees,
        totalRecords: employees.length,
        source: "cache",
        succeeded: true,
        message: "Data from cache",
        errors: null
      };
    }

    // If no cache, fetch fresh data
    await collectAndSyncEmployees();
    const freshData = await redis.get("keka_employees_data");

    if (freshData) {
      const employees = JSON.parse(freshData);
      return {
        data: employees,
        totalRecords: employees.length,
        source: "api",
        succeeded: true,
        message: "Data freshly fetched from API",
        errors: null
      };
    }

    throw new Error("Failed to fetch employee data");

  } catch (error: any) {
    console.error(" Get employees data error:", error);
    return {
      data: [],
      totalRecords: 0,
      source: "error",
      succeeded: false,
      message: error.message,
      errors: [error.message]
    };
  }
};

// Function to manually trigger employee collection
export const triggerEmployeeCollection = async (): Promise<void> => {
  //  console.log(" Manually triggering employee collection...");
  await collectAndSyncEmployees();
};

// Function to check current employee rate limit status
export const getEmployeeRateLimitStatus = async (): Promise<{
  currentCount: number;
  maxLimit: number;
  currentPage: number;
  totalPages: number;
  lastProcessedPage: number;
  resetTime: number;
}> => {
  const state = await getEmployeeRateLimitState();

  return {
    currentCount: state.count,
    maxLimit: MAX_CALLS_PER_MINUTE,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    lastProcessedPage: state.lastProcessedPage,
    resetTime: state.resetTime
  };
};

// Function to reset employee rate limit manually
export const resetEmployeeRateLimit = async (): Promise<void> => {
  await clearEmployeeRateLimitState();
  // console.log(' Employee rate limit manually reset');
};