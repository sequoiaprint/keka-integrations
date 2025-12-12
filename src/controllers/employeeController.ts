import { Request, Response } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployees,
  updateEmployee,
  deleteEmployee,
  getEmployeesForOvertime,
  getAttendanceByIds 
} from "../model/employeeModel";
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

// Helper function to clear cache patterns related to employees
async function clearEmployeeCache(): Promise<void> {
  try {
    // Clear all employee-related cache
    const keys = await redis.keys('employees:*');
    const overtimeKeys = await redis.keys('overtime:*');
    const attendanceKeys = await redis.keys('attendance:*');
    
    const allKeys = [...keys, ...overtimeKeys, ...attendanceKeys];
    
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      //console.log(`Cleared ${allKeys.length} employee-related cache keys`);
    }
  } catch (error) {
    console.error('Error clearing employee cache:', error);
  }
}

// Helper function to clear specific employee cache
async function clearEmployeeByIdCache(employeeId: string): Promise<void> {
  try {
    // Clear cache for this specific employee
    const keys = await redis.keys(`*employee_${employeeId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    // Also clear the general employees list since it might be affected
    const listKeys = await redis.keys('employees:list*');
    if (listKeys.length > 0) {
      await redis.del(...listKeys);
    }
  } catch (error) {
    console.error(`Error clearing cache for employee ${employeeId}:`, error);
  }
}

export const getEmployees = async (req: Request, res: Response) => {
  try {
    const floor = req.query.floor as "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all" | undefined;
    
    // Validate floor parameter if provided
    const validFloors = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor", "all"];
    if (floor && !validFloors.includes(floor)) {
      return res.status(400).json({ 
        error: "Invalid floor parameter", 
        validFloors: validFloors.filter(f => f !== "all")
      });
    }

    // Generate cache key based on floor parameter
    const cacheKey = generateCacheKey('employees:list', { floor: floor || 'all' });
    
    const data = await getCachedOrFetch(
      cacheKey,
      () => getAllEmployees(floor)
    );

    res.json(data);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getEmployeesOvertime = async (req: Request, res: Response) => {
  try {
    const division = req.query.division as
      | "Accounts"
      | "Admin"
      | "Admin Accounts"
      | "CTP"
      | "Data Entry"
      | "Fabricator"
      | "HR Admin"
      | "Personal Accounts"
      | "Post Press"
      | "Pre Press"
      | "Press, Post Press"
      | "Proof Dept"
      | "Silk Screen"
      | "all"
      | undefined;

    const timeFilter = req.query.timeFilter as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Validate custom date range
    if (timeFilter === "Custom") {
      if (!startDate || !endDate) {
        return res.status(400).json({ 
          error: "Custom date range requires both startDate and endDate parameters" 
        });
      }
      
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ 
          error: "Invalid date format. Use YYYY-MM-DD format for dates" 
        });
      }

      // Validate start date is before or equal to end date
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ 
          error: "startDate must be before or equal to endDate" 
        });
      }
    }

    // Generate cache key for overtime data
    const cacheParams = {
      division: division || 'all',
      timeFilter: timeFilter || 'Today',
      startDate: startDate || '',
      endDate: endDate || ''
    };
    const cacheKey = generateCacheKey('overtime:employees', cacheParams);
    
    const data = await getCachedOrFetch(
      cacheKey,
      () => getEmployeesForOvertime(division, timeFilter || "Today", startDate, endDate)
    );

    res.json(data);
  } catch (error) {
    console.error("Error fetching employees for overtime:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getAttendanceByIdsController = async (req: Request, res: Response) => {
  try {
    const { attendanceIds } = req.body;

    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "attendanceIds must be a non-empty array."
      });
    }

    // Sort IDs to ensure consistent cache key for same set of IDs
    const sortedIds = [...attendanceIds].sort();
    const cacheKey = generateCacheKey('attendance:by_ids', { 
      ids: sortedIds.join(',')
    });

    const data = await getCachedOrFetch(
      cacheKey,
      () => getAttendanceByIds(attendanceIds)
    );

    return res.status(200).json({
      success: true,
      total: data.length,
      data
    });
    
  } catch (error: any) {
    console.error("Error fetching attendance by IDs:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

export const getEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "Employee ID is required" 
      });
    }

    const cacheKey = `employee:${id}`;
    
    const data = await getCachedOrFetch(
      cacheKey,
      () => getEmployeeById(id)
    );

    res.json(data);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

export const createEmp = async (req: Request, res: Response) => {
  try {
    const employees = Array.isArray(req.body) ? req.body : [req.body];
    //console.log(employees);
    
    const result = await createEmployees(employees);
    
    // Clear employee-related cache since data has been updated
    await clearEmployeeCache();
    
    res.json(result);
  } catch (error) {
    console.error("Error creating employee(s):", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

export const updateEmp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "Employee ID is required" 
      });
    }
    
    const result = await updateEmployee(id, req.body);
    
    // Clear cache for this specific employee and related lists
    await clearEmployeeByIdCache(id);
    
    res.json(result);
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

export const deleteEmp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false,
        error: "Employee ID is required" 
      });
    }
    
    const result = await deleteEmployee(id);
    
    // Clear cache for this specific employee and related lists
    await clearEmployeeByIdCache(id);
    
    res.json(result);
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

// Optional: Cache management endpoint
export const clearEmployeeCacheController = async (req: Request, res: Response) => {
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
      // Clear all employee-related cache
      await clearEmployeeCache();
      res.json({
        success: true,
        message: "Cleared all employee-related cache"
      });
    }
  } catch (error) {
    console.error('Error clearing employee cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear employee cache'
    });
  }
};