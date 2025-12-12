import axios from "axios";
import redis from "../dbConfig/redis";
import pool from "../dbConfig/dbConfig";
import { fetchKekaToken } from "../middleware/kekaToken";

interface KekaGroup {
  id: string;
  title: string;
  groupType: number;
}

interface KekaEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  dateOfJoin: string; 
  resignationSubmittedDate: string | null;
  groups: KekaGroup[];
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
    
    // Define target groups to filter employees
    const targetGroupIds = [
      "6a216ce7-156b-460e-8172-3b62c0c45381", // 21 Udayan Industrial Estate
      "d6769f4b-5882-421f-9a5a-0b1d72e3371e"  // PP
    ];

    let allFilteredEmployees: KekaEmployee[] = [];
    let currentPage = rateLimitState.currentPage || 1;
    let totalPages = rateLimitState.totalPages || 1;
    let retryCount = 0;
    const maxRetries = 1;

   // console.log(` Resuming from page ${currentPage}`);

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

        // Filter employees who belong to target groups AND have not resigned
        const filteredEmployees = data.data.filter(employee => 
          employee.groups && 
          employee.groups.some(group => targetGroupIds.includes(group.id)) &&
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
    const [dbEmployees] = await pool.query("SELECT employee_id, name, joining_date FROM employees") as [DatabaseEmployee[], any];
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
        const [dbEmployees] = await pool.query("SELECT employee_id, name, joining_date FROM employees") as [DatabaseEmployee[], any];
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

// Function to sync Keka employees with database - ONLY UPDATES, NO INSERTS
const syncEmployeesWithDatabase = async (kekaEmployees: KekaEmployee[], dbEmployees: DatabaseEmployee[]): Promise<void> => {
  let updates = 0;
  let matched = 0;

  // Get ALL employee_ids that are already assigned in the database
  const [existingEmployeeIds] = await pool.query(
    "SELECT employee_id FROM employees WHERE employee_id IS NOT NULL AND employee_id != ''"
  ) as [{ employee_id: string }[], any];
  
  const usedEmployeeIdsInDB = new Set(existingEmployeeIds.map(row => row.employee_id));
 // console.log(` Found ${usedEmployeeIdsInDB.size} employee_ids already assigned in database`);

  // Track employee_ids we're going to assign in this sync
  const employeeIdsToAssign = new Set<string>();

  for (const dbEmployee of dbEmployees) {
    // For each database employee, find matching Keka employee by multiple criteria
    const matchingKekaEmployee = findMatchingKekaEmployee(dbEmployee.name, kekaEmployees, usedEmployeeIdsInDB, employeeIdsToAssign);

    if (matchingKekaEmployee) {
      matched++;
      
      // Convert API date format "2014-06-01T00:00:00Z" to MySQL date format "2014-06-01"
      const mysqlDate = convertToMySQLDate(matchingKekaEmployee.dateOfJoin);
      
      try {
        // Check if this employee_id is already used by someone else
        const isEmployeeIdUsedByOther = 
          usedEmployeeIdsInDB.has(matchingKekaEmployee.id) && 
          dbEmployee.employee_id !== matchingKekaEmployee.id;

        if (isEmployeeIdUsedByOther) {
          // Find who has this employee_id
          const [duplicateEmployees] = await pool.query(
            "SELECT name FROM employees WHERE employee_id = ?", 
            [matchingKekaEmployee.id]
          ) as any;
          console.log(` Skipping "${dbEmployee.name}" - employee_id ${matchingKekaEmployee.id} already assigned to: ${duplicateEmployees.map((emp: any) => emp.name).join(', ')}`);
          continue;
        }

        // Update only if employee_id or joining_date is different or empty
        const needsUpdate = 
          !dbEmployee.employee_id || 
          dbEmployee.employee_id !== matchingKekaEmployee.id || 
          dbEmployee.joining_date !== mysqlDate;
        
        if (needsUpdate) {
          await pool.query(
            "UPDATE employees SET employee_id = ?, joining_date = ? WHERE name = ?",
            [matchingKekaEmployee.id, mysqlDate, dbEmployee.name]
          );
          
          // Add to tracking sets
          employeeIdsToAssign.add(matchingKekaEmployee.id);
          usedEmployeeIdsInDB.add(matchingKekaEmployee.id);
          
          updates++;
          //console.log(` Updated: "${dbEmployee.name}" -> ID: ${matchingKekaEmployee.id}, Join Date: ${mysqlDate}`);
        } else {
          //console.log(` Already synced: "${dbEmployee.name}"`);
          // Still track as used even if not updating
          employeeIdsToAssign.add(matchingKekaEmployee.id);
        }
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(` Database duplicate key error for: "${dbEmployee.name}" - ID: ${matchingKekaEmployee.id}`);
          const [duplicateEmployees] = await pool.query(
            "SELECT name FROM employees WHERE employee_id = ?", 
            [matchingKekaEmployee.id]
          ) as any;
          //console.log(`   This ID is already assigned to: ${duplicateEmployees.map((emp: any) => emp.name).join(', ')}`);
        } else {
          throw error;
        }
      }
    } else {
      //console.log(` No match found for: "${dbEmployee.name}"`);
    }
  }

  // console.log(` Database sync completed: ${matched} names matched, ${updates} records updated`);
  // console.log(` ${dbEmployees.length - matched} employees not found in Keka`);
};

// Enhanced function to find matching Keka employee with multiple name combinations
const findMatchingKekaEmployee = (
  dbName: string, 
  kekaEmployees: KekaEmployee[], 
  usedEmployeeIdsInDB: Set<string>,
  employeeIdsToAssign: Set<string>
): KekaEmployee | null => {
  const normalizedDbName = dbName.trim().toLowerCase();
  
  // Manual mapping for known name discrepancies
  const nameMappings: { [dbName: string]: string } = {
    'soumen ghoshal': 'somen ghoshal',
    // Add more mappings as you discover them
  };

  // Try all possible name combinations from Keka data
  for (const kekaEmp of kekaEmployees) {
    // Skip if this employee_id is already used in the database OR already assigned in this sync
    if (usedEmployeeIdsInDB.has(kekaEmp.id) || employeeIdsToAssign.has(kekaEmp.id)) {
      continue;
    }

    // Generate all possible name combinations from Keka data
    const nameCombinations = [
      // Combination 1: firstName + lastName
      `${kekaEmp.firstName} ${kekaEmp.lastName}`.toLowerCase(),
      
      // Combination 2: firstName + middleName + lastName (if middleName exists)
      kekaEmp.middleName ? `${kekaEmp.firstName} ${kekaEmp.middleName} ${kekaEmp.lastName}`.toLowerCase() : '',
      
      // Combination 3: displayName
      kekaEmp.displayName?.toLowerCase() || '',
      
      // Combination 4: Manual mapping
      nameMappings[normalizedDbName] || '',
      
      // Combination 5: lastName, firstName (reverse order)
      `${kekaEmp.lastName} ${kekaEmp.firstName}`.toLowerCase(),
    ].filter(name => name.length > 0); // Remove empty combinations

    // Check if any combination matches the database name
    const isMatch = nameCombinations.some(combination => 
      combination === normalizedDbName || 
      areNamesSimilar(normalizedDbName, combination)
    );

    if (isMatch) {
      //console.log(` Matched: "${dbName}" with Keka: "${kekaEmp.firstName} ${kekaEmp.lastName}" (Used combination: ${nameCombinations.find(comb => comb === normalizedDbName || areNamesSimilar(normalizedDbName, comb))})`);
      return kekaEmp;
    }
  }

  return null;
};

// Helper function to convert API date to MySQL date format
const convertToMySQLDate = (apiDate: string): string => {
  if (!apiDate) {
    console.warn(` Empty date provided`);
    return '';
  }
  
  try {
    // Handle formats like "2014-06-01T00:00:00Z" or "2014-06-01"
    let dateStr = apiDate;
    
    // If it's a full timestamp, extract just the date part
    if (dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }
    
    // Validate the date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(dateStr)) {
      return dateStr;
    } else {
      //console.warn(` Invalid date format after processing: ${apiDate} -> ${dateStr}`);
      return '';
    }
  } catch (error) {
    console.error(` Date conversion error for: ${apiDate}`, error);
    return '';
  }
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