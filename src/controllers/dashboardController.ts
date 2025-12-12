import { Request, Response } from 'express';
import {
  getAttendanceStats,
  getPresentEmployees,
  getAbsentEmployees,
  getOnTimeEmployees,
  getLateEmployees,
  getNoClockOutEmployees,
  DashboardFilters,
  getMostOnTimeEmployeeCurrentMonth,
  getMostMissingClockOutEmployeeCurrentMonth,
  getMostLateEmployeeCurrentMonth,
  MostFrequentEmployeesResponse,
  getMostMondayFridayAbsentByDivision,
  getProofCTPAttendanceStats 
} from '../model/Dashboard';
import moment from "moment";
import redis from "../dbConfig/redis";

// Cache TTL in seconds (30 minutes)
const CACHE_TTL = 30 * 60;

// Helper function to generate cache key
function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return `${prefix}:${sortedParams}`;
}

// Helper function to get data from cache or fallback
async function getCachedOrFetch<T>(
  cacheKey: string,
  fetchFunction: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  try {
    // Try to get from cache
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Fetch from database
    const data = await fetchFunction();
    
    // Store in cache
    await redis.setex(cacheKey, ttl, JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error(`Cache error for key ${cacheKey}:`, error);
    // If cache fails, fall back to direct fetch
    return await fetchFunction();
  }
}

function isValidDateRange(timeFilter: string): boolean {
  if (!timeFilter.includes('_to_')) {
    return false;
  }
  const [startDate, endDate] = timeFilter.split('_to_');
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return false;
  }
  if (new Date(startDate) > new Date(endDate)) {
    return false;
  }
  return true;
}

export const getAttendanceStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('attendance_stats', { floor, timeFilter });
    
    const stats = await getCachedOrFetch(
      cacheKey,
      () => getAttendanceStats(filters)
    );

    res.json({
      success: true,
      data: stats,
      cached: false // You can modify this to indicate if data came from cache
    });
  } catch (error) {
    console.error('Error in getAttendanceStatistics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getPresentEmployeesList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('present_employees', { floor, timeFilter });
    
    const employees = await getCachedOrFetch(
      cacheKey,
      () => getPresentEmployees(filters)
    );

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Error in getPresentEmployeesList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getAbsentEmployeesList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('absent_employees', { floor, timeFilter });
    
    const employees = await getCachedOrFetch(
      cacheKey,
      () => getAbsentEmployees(filters)
    );

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Error in getAbsentEmployeesList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getOnTimeEmployeesList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('on_time_employees', { floor, timeFilter });
    
    const employees = await getCachedOrFetch(
      cacheKey,
      () => getOnTimeEmployees(filters)
    );

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Error in getOnTimeEmployeesList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getLateEmployeesList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('late_employees', { floor, timeFilter });
    
    const employees = await getCachedOrFetch(
      cacheKey,
      () => getLateEmployees(filters)
    );

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Error in getLateEmployeesList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getNoClockOutEmployeesList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    const cacheKey = generateCacheKey('no_clockout_employees', { floor, timeFilter });
    
    const employees = await getCachedOrFetch(
      cacheKey,
      () => getNoClockOutEmployees(filters)
    );

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Error in getNoClockOutEmployeesList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getMostOnTimeEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    // Validate floor parameter
    const validFloors = ["all", "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor"];
    if (!validFloors.includes(filters.floor)) {
      res.status(400).json({
        success: false,
        message: "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"
      });
      return;
    }

    const cacheKey = generateCacheKey('most_ontime_employee', { floor, timeFilter });
    
    const result = await getCachedOrFetch(
      cacheKey,
      () => getMostOnTimeEmployeeCurrentMonth(filters)
    );

    res.json({
      success: true,
      data: result.employees,
      max_count: result.max_count,
      message: result.employees.length > 0
        ? `Found ${result.employees.length} most on-time employee(s)`
        : 'No on-time employees found'
    });
  } catch (error) {
    console.error("Error in getMostOnTimeEmployee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch most on-time employee data"
    });
  }
};

export const getMostMissingClockOutEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const validTimeFilters = ["today", "yesterday", "this week", "last week"];
    if (!validTimeFilters.includes(timeFilter as string) && !isValidDateRange(timeFilter as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid timeFilter. Must be one of "today", "yesterday", "this week", "last week", or a date range in "YYYY-MM-DD_to_YYYY-MM-DD" format.'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week" | string
    };

    // Validate floor parameter
    const validFloors = ["all", "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor"];
    if (!validFloors.includes(filters.floor)) {
      res.status(400).json({
        success: false,
        message: "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"
      });
      return;
    }

    const cacheKey = generateCacheKey('most_missing_clockout', { floor, timeFilter });
    
    const result = await getCachedOrFetch(
      cacheKey,
      () => getMostMissingClockOutEmployeeCurrentMonth(filters)
    );

    res.json({
      success: true,
      data: result.employees,
      max_count: result.max_count,
      message: result.employees.length > 0
        ? `Found ${result.employees.length} employee(s) with most missing clock-outs`
        : 'No missing clock-out records found'
    });
  } catch (error) {
    console.error("Error in getMostMissingClockOutEmployee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch most missing clock-out employee data"
    });
  }
};

export const getMostLateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, timeFilter } = req.query;

    if (!floor || !timeFilter) {
      res.status(400).json({
        success: false,
        message: 'Floor and timeFilter are required parameters'
      });
      return;
    }

    const filters: DashboardFilters = {
      floor: floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all",
      timeFilter: timeFilter as "today" | "yesterday" | "this week" | "last week"
    };

    // Validate floor parameter
    const validFloors = ["all", "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor"];
    if (!validFloors.includes(filters.floor)) {
      res.status(400).json({
        success: false,
        message: "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"
      });
      return;
    }

    const cacheKey = generateCacheKey('most_late_employee', { floor, timeFilter });
    
    const result = await getCachedOrFetch(
      cacheKey,
      () => getMostLateEmployeeCurrentMonth(filters)
    );

    res.json({
      success: true,
      data: result.employees,
      max_count: result.max_count,
      message: result.employees.length > 0
        ? `Found ${result.employees.length} most late employee(s)`
        : 'No late employees found'
    });
  } catch (error) {
    console.error("Error in getMostLateEmployee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch most late employee data"
    });
  }
};

export const getMostMondayFridayAbsentByDivisionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = 'monday_friday_absent_by_division';
    
    const result = await getCachedOrFetch(
      cacheKey,
      () => getMostMondayFridayAbsentByDivision()
    );
    
    res.json({
      success: true,
      data: result,
      message: Object.keys(result).length > 0
        ? `Found absent employees for ${Object.keys(result).length} division(s)`
        : 'No Monday/Friday absent employees found in last 30 days'
    });
  } catch (error) {
    console.error("Error in getMostMondayFridayAbsentByDivision:", error);
    res.status(500).json({  
      success: false,
      message: "Failed to fetch Monday/Friday absent employee data"
    });
  }
};

export const getProofCTPAttendanceStatsController = async (req: Request, res: Response): Promise<void> => {
    try {
        const cacheKey = 'proof_ctp_attendance_stats';
        
        const result = await getCachedOrFetch(
            cacheKey,
            () => getProofCTPAttendanceStats()
        );

        // Today's IST date formatted like your mapping
        const todayIST = moment().utcOffset(330).format("DD-MM-YYYY");

        const formattedResult = Object.keys(result).reduce((acc: any, division) => {
            acc[division] = {
                total_absent_days: result[division].total_absent_days,
                total_no_clock_out_days: result[division].total_no_clock_out_days,

                absent_employees: result[division].absent_employees.map(emp => ({
                    ...emp,
                    absent_dates: emp.absent_dates.map(date =>
                        moment(date).format("DD-MM-YYYY")
                    ),
                })),

                no_clock_out_employees: result[division].no_clock_out_employees
                    .map(emp => {
                        // Format dates
                        const formattedDates = emp.no_clock_out_dates.map(date =>
                            moment(date).format("DD-MM-YYYY")
                        );

                        // Remove today's date
                        const filteredDates = formattedDates.filter(d => d !== todayIST);

                        // If no dates left, remove employee later by returning null
                        if (filteredDates.length === 0) return null;

                        return {
                            ...emp,
                            no_clock_out_dates: filteredDates,
                        };
                    })
                    .filter(emp => emp !== null) // Remove employees having zero dates
            };

            return acc;
        }, {});

        const date_range = {
            start: moment().utcOffset(330).subtract(29, "days").format("DD-MM-YYYY"),
            end: todayIST,
            days_analyzed: 30
        };

        res.json({
            success: true,
            data: formattedResult,
            date_range,
            timezone: "IST (UTC+5:30)",
            message: `Proof Dept & CTP attendance stats for last 30 days`,
        });

    } catch (error) {
        console.error("Error in getProofCTPAttendanceStats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch Proof/CTP attendance statistics"
        });
    }
};


export const clearCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pattern } = req.query;
    
    if (pattern) {
      const keys = await redis.keys(`${pattern}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      res.json({
        success: true,
        message: `Cleared cache for pattern: ${pattern}`,
        clearedKeys: keys.length
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Pattern parameter is required'
      });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache'
    });
  }
};