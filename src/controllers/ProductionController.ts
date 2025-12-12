import { Request, Response } from 'express';
import { ProductionTimeModel, ProductionTimeResult, JobPassCountResult } from '../model/ProductionTimeModel';
import { AttendanceModel, AttendanceResult, OvertimeResult } from '../model/attendenceModel';
import redis from "../dbConfig/redis";

// Cache TTL in seconds (30 minutes)
const CACHE_TTL = 30 * 60;

interface EmployeeUtilization {
  employee_id: string;
  name: string;
  machine: string;
  jobtitle: string;
  total_gross_hours: number;
  total_production_time_hours: number;
  utilization_percentage: number;
}

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
      //console.log(`Cache hit for key: ${cacheKey}`);
      return JSON.parse(cachedData);
    }

    //console.log(`Cache miss for key: ${cacheKey}`);
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

export class ProductionController {
  // Convert time string "Xh Ym" to minutes
  private static convertTimeToMinutes(timeString: string): number {
    if (!timeString) return 0;
    
    const hoursMatch = timeString.match(/(\d+)h/);
    const minutesMatch = timeString.match(/(\d+)m/);
    
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
    
    return (hours * 60) + minutes;
  }

  // Convert decimal hours to minutes
  private static convertDecimalHoursToMinutes(decimalHours: number): number {
    return Math.round(decimalHours * 60);
  }

  // Validate date format YYYY-MM-DD
  private static isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Validate custom date range format
  private static isValidCustomDateRange(timeFilter: string): boolean {
    if (!timeFilter.includes("_to_")) return false;
    
    const [startDate, endDate] = timeFilter.split("_to_");
    return ProductionController.isValidDate(startDate) && ProductionController.isValidDate(endDate);
  }

  static async getEmployeeUtilization(req: Request, res: Response) {
    try {
      const { machine, timeFilter } = req.params;

      // Validate required parameters
      if (!machine || !timeFilter) {
        return res.status(400).json({
          error: 'Machine and timeFilter parameters are required'
        });
      }

      // Validate machine parameter
      const validMachines = ['KOMORI', 'RYOBI2', 'RYOBI 3'];
      if (!validMachines.includes(machine)) {
        return res.status(400).json({
          error: 'Invalid machine. Must be one of: KOMORI, RYOBI2, RYOBI 3'
        });
      }

      // Validate timeFilter parameter
      const validTimeFilters = ['Today', 'Yesterday', 'This Week', 'Last Week', 'Two Weeks Ago'];
      const isCustomDateRange = ProductionController.isValidCustomDateRange(timeFilter);
      
      if (!validTimeFilters.includes(timeFilter) && !isCustomDateRange) {
        return res.status(400).json({
          error: 'Invalid timeFilter. Must be one of: Today, Yesterday, This Week, Last Week, Two Weeks Ago OR a custom date range in format YYYY-MM-DD_to_YYYY-MM-DD'
        });
      }

      // Generate cache key for this specific request
      const cacheKey = generateCacheKey('production:employee_utilization', { 
        machine, 
        timeFilter 
      });

      // Try to get cached response
      const cachedResponse = await redis.get(cacheKey);
      if (cachedResponse) {
        //console.log('Cache hit for employee utilization');
        return res.json(JSON.parse(cachedResponse));
      }

      //console.log('Cache miss for employee utilization, fetching data...');

      // Fetch data from both models
      const [productionData, attendanceData] = await Promise.all([
        ProductionTimeModel.getTotalProductionTime(machine, timeFilter),
        AttendanceModel.getAttendanceData(machine, timeFilter)
      ]);

      // Check if production data exists
      if (productionData.length === 0) {
        return res.status(404).json({
          error: 'No production data found for the specified machine and time period'
        });
      }

      // Get total production time in minutes
      const productionTime = productionData[0];
      const totalProductionMinutes = ProductionController.convertTimeToMinutes(productionTime.total_production_time);

      // Calculate utilization for each employee
      const employeeUtilizations: EmployeeUtilization[] = attendanceData.map(employee => {
        const totalGrossMinutes = ProductionController.convertDecimalHoursToMinutes(employee.total_gross_hours);
        
        // Calculate utilization percentage
        let utilization_percentage = 0;
        if (totalGrossMinutes > 0) {
          utilization_percentage = (totalProductionMinutes / totalGrossMinutes) * 100;
          // Cap at 100% to avoid unrealistic values
          utilization_percentage = Math.min(utilization_percentage, 100);
        }

        return {
          employee_id: employee.employee_id,
          name: employee.name,
          machine: employee.machine,
          jobtitle: employee.jobtitle,
          total_gross_hours: parseFloat((employee.total_gross_hours).toFixed(2)),
          total_production_time_hours: parseFloat((totalProductionMinutes/60).toFixed(2)) as unknown as number,
          utilization_percentage: parseFloat(utilization_percentage.toFixed(2))
        };
      });

      // Sort by employee_id
      employeeUtilizations.sort((a, b) => a.employee_id.localeCompare(b.employee_id));

      const response = {
        machine,
        timeFilter,
        total_production_time: productionTime.total_production_time,
        total_production_time_minutes: totalProductionMinutes,
        employees: employeeUtilizations,
        _cache: {
          cached: true,
          ttl: CACHE_TTL,
          expires_in: `${CACHE_TTL / 60} minutes`
        }
      };

      // Cache the response
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);

    } catch (error) {
      console.error('Error in getEmployeeUtilization:', error);
      res.status(500).json({
        error: 'Internal server error while fetching employee utilization data'
      });
    }
  }

  static async getOvertimeWithJobs(req: Request, res: Response) {
    try {
      const { machine, timeFilter } = req.params;

      // Validate required parameters
      if (!machine || !timeFilter) {
        return res.status(400).json({
          error: 'Machine and timeFilter parameters are required'
        });
      }

      // Validate machine parameter
      const validMachines = ['KOMORI', 'RYOBI2', 'RYOBI 3'];
      if (!validMachines.includes(machine)) {
        return res.status(400).json({
          error: 'Invalid machine. Must be one of: KOMORI, RYOBI2, RYOBI 3'
        });
      }

      // Validate timeFilter parameter
      const validTimeFilters = ['Today', 'Yesterday', 'This Week', 'Last Week', 'Two Weeks Ago'];
      const isCustomDateRange = ProductionController.isValidCustomDateRange(timeFilter);
      
      if (!validTimeFilters.includes(timeFilter) && !isCustomDateRange) {
        return res.status(400).json({
          error: 'Invalid timeFilter. Must be one of: Today, Yesterday, This Week, Last Week, Two Weeks Ago OR a custom date range in format YYYY-MM-DD_to_YYYY-MM-DD'
        });
      }

      // Generate cache key
      const cacheKey = generateCacheKey('production:overtime_with_jobs', { 
        machine, 
        timeFilter 
      });

      // Try to get cached response
      const cachedResponse = await redis.get(cacheKey);
      if (cachedResponse) {
        //console.log('Cache hit for overtime with jobs');
        return res.json(JSON.parse(cachedResponse));
      }

      //console.log('Cache miss for overtime with jobs, fetching data...');

      // Cache individual data fetches for better performance
      const [overtimeData, jobData, employeeData] = await Promise.all([
        getCachedOrFetch(
          generateCacheKey('attendance:overtime_data', { machine, timeFilter }),
          () => AttendanceModel.getOvertimeData(machine, timeFilter)
        ),
        getCachedOrFetch(
          generateCacheKey('production:job_pass_count', { machine, timeFilter }),
          () => ProductionTimeModel.getJobAndPassCount(machine, timeFilter)
        ),
        getCachedOrFetch(
          generateCacheKey('attendance:employees_by_machine', { machine }),
          () => AttendanceModel.getEmployeesByMachine(machine)
        )
      ]);

      // Structure the response
      const response = {
        machine: machine,
        timeFilter: timeFilter,
        overtime_employees: overtimeData.map(employee => ({
          employee_id: employee.employee_id,
          name: employee.name,
          machine: employee.machine,
          total_effective_hours: parseFloat(employee.total_effective_hours.toFixed(2)),
          total_effective_overtime_duration: parseFloat(employee.total_effective_overtime_duration.toFixed(2)),
          jobs: jobData.filter(job => job.MACHINE_USED === machine)
        })),
        employees: employeeData.map(employee => ({
          employee_id: employee.employee_id,
          name: employee.name,
          machine: employee.machine
        })),
        _cache: {
          cached: true,
          ttl: CACHE_TTL,
          expires_in: `${CACHE_TTL / 60} minutes`
        }
      };

      // Cache the full response
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

      res.json(response);

    } catch (error) {
      console.error('Error in getOvertimeWithJobs:', error);
      res.status(500).json({
        error: 'Internal server error while fetching overtime data with jobs'
      });
    }
  }

  // Optional: Clear cache endpoint
  static async clearProductionCache(req: Request, res: Response) {
    try {
      const { machine, timeFilter } = req.query;
      
      if (machine && timeFilter) {
        // Clear specific cache
        const keys = await redis.keys(`production:*machine=${machine}*timeFilter=${timeFilter}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        res.json({
          success: true,
          message: `Cleared production cache for machine=${machine}, timeFilter=${timeFilter}`,
          clearedKeys: keys.length
        });
      } else if (machine) {
        // Clear all cache for specific machine
        const keys = await redis.keys(`*machine=${machine}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        res.json({
          success: true,
          message: `Cleared all cache for machine=${machine}`,
          clearedKeys: keys.length
        });
      } else {
        // Clear all production-related cache
        const productionKeys = await redis.keys('production:*');
        const attendanceKeys = await redis.keys('attendance:*');
        const allKeys = [...productionKeys, ...attendanceKeys];
        
        if (allKeys.length > 0) {
          await redis.del(...allKeys);
        }
        res.json({
          success: true,
          message: "Cleared all production-related cache",
          clearedKeys: allKeys.length
        });
      }
    } catch (error) {
      console.error('Error clearing production cache:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear production cache'
      });
    }
  }
}