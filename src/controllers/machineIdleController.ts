import { Request, Response } from "express";
import { IdleTimeModel } from "../model/IdleTimeModel";
import { getEmployeeByMachine } from "../model/employeeModel";
import redis from "../dbConfig/redis";

// Cache TTL in seconds (30 minutes)
const CACHE_TTL = 30 * 60;

const MACHINE_MAP: Record<string, string> = {
    "RYOBI 2": "ryobi 2",
    "RYOBI2": "ryobi 2",
    "Ryobi 2": "ryobi 2",

    "RYOBI 3": "ryobi 3",
    "RYOBI3": "ryobi 3",
    "Ryobi 3": "ryobi 3",

    "KOMORI": "komori",
    "Komori": "komori"
};

const ALLOWED = ["ryobi 2", "ryobi 3", "komori"];

function secondsToHours(seconds: number): number {
    return seconds / 3600;
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

// Helper function to clear machine idle cache
async function clearMachineIdleCache(): Promise<void> {
    try {
        // Clear all machine idle-related cache
        const keys = await redis.keys('machine_idle:*');
        if (keys.length > 0) {
            await redis.del(...keys);
            //console.log(`Cleared ${keys.length} machine idle cache keys`);
        }
    } catch (error) {
        console.error('Error clearing machine idle cache:', error);
    }
}

// Helper function to get machine data with caching
async function getCachedMachineData(timeFilter: string) {
    const cacheKey = generateCacheKey('machine_idle:machine_data', { timeFilter });
    return getCachedOrFetch(
        cacheKey,
        () => IdleTimeModel.getIdleTime(timeFilter)
    );
}

// Helper function to get employee by machine with caching
async function getCachedEmployeeByMachine(timeFilter: string) {
    const cacheKey = generateCacheKey('machine_idle:employee_data', { timeFilter });
    return getCachedOrFetch(
        cacheKey,
        () => getEmployeeByMachine(timeFilter)
    );
}

export const getMachineWiseIdle = async (req: Request, res: Response) => {
    try {
        const { timeFilter } = req.query;
        const timeFilterStr = String(timeFilter || "Today");

        // Generate cache key for the entire response
        const responseCacheKey = generateCacheKey('machine_idle:full_response', { 
            timeFilter: timeFilterStr 
        });

        // Try to get complete response from cache first
        const cachedResponse = await redis.get(responseCacheKey);
        if (cachedResponse) {
            //console.log('Full response cache hit for machine idle');
            return res.json(JSON.parse(cachedResponse));
        }

        //console.log('Full response cache miss, fetching data...');
        
        // Get machine data and employee data (with individual caching)
        const [machineData, employeesRaw] = await Promise.all([
            getCachedMachineData(timeFilterStr),
            getCachedEmployeeByMachine(timeFilterStr)
        ]);

        const employees: any[] = Array.isArray(employeesRaw) ? employeesRaw : Array.from(employeesRaw || []);

        //console.log('Machine Data:', machineData);
        //console.log('Employees Data:', employees);

        // Group employees by machine
        const employeesByMachine: Record<string, any[]> = {};
        
        for (const emp of employees) {
            const machineKey = emp.machine?.toLowerCase();
            if (machineKey && ALLOWED.includes(machineKey)) {
                if (!employeesByMachine[machineKey]) {
                    employeesByMachine[machineKey] = [];
                }
                employeesByMachine[machineKey].push(emp);
            }
        }

        // Create result object
        const result: Record<string, any> = {};

        for (const machine of ALLOWED) {
            // Find machine data
            const machineInfo = machineData.find(m => {
                const key = MACHINE_MAP[m.MACHINE_USED] || m.MACHINE_USED.toLowerCase();
                return key === machine;
            });

            // Get employees for this machine
            const machineEmployees = employeesByMachine[machine] || [];

            // Convert machine times from seconds to hours with validation
            const totalRunTimeHours = machineInfo && machineInfo.total_run_time_seconds > 0 
                ? secondsToHours(machineInfo.total_run_time_seconds) 
                : 0;
            
            const totalDownTimeHours = machineInfo && machineInfo.total_down_time_seconds > 0
                ? secondsToHours(machineInfo.total_down_time_seconds)
                : 0;

            // Calculate productive time (runtime - downtime)
            const productiveTimeHours = Math.max(0, totalRunTimeHours - totalDownTimeHours);

            // Calculate idle time for each employee individually
            const idleEmployees = [];
            
            for (const emp of machineEmployees) {
                const empEffectiveHours = parseFloat(emp.total_effective_hours) || 0;
                
                // Individual employee idle time = employee effective hours - machine productive time
                const employeeIdleHours = empEffectiveHours - productiveTimeHours;
                
                // Only include employees with positive idle time
                if (employeeIdleHours > 0) {
                    idleEmployees.push({
                        employee_id: emp.employee_id,
                        name: emp.name,
                        idle_time_hours: parseFloat(employeeIdleHours.toFixed(2)),
                        effective_hours: parseFloat(empEffectiveHours.toFixed(2)),
                        productive_hours: parseFloat(productiveTimeHours.toFixed(2))
                    });
                }
            }

            // Sort idle employees by idle time (descending)
            idleEmployees.sort((a, b) => b.idle_time_hours - a.idle_time_hours);

            result[machine] = {
                runtime_hours: parseFloat(totalRunTimeHours.toFixed(2)),
                downtime_hours: parseFloat(totalDownTimeHours.toFixed(2)),
                productive_time_hours: parseFloat(productiveTimeHours.toFixed(2)),
                total_effective_hours: parseFloat(machineEmployees.reduce((sum, emp) => 
                    sum + (parseFloat(emp.total_effective_hours) || 0), 0
                ).toFixed(2)),
                idle_employees: idleEmployees,
                all_employees_count: machineEmployees.length,
                idle_employees_count: idleEmployees.length
            };
        }

        const response = { 
            success: true, 
            data: result,
            time_filter: timeFilterStr,
            cached_at: new Date().toISOString()
        };

        // Cache the full response
        await redis.setex(responseCacheKey, CACHE_TTL, JSON.stringify(response));

        return res.json(response);

    } catch (err) {
        console.error('Error in getMachineWiseIdle:', err);
        return res.status(500).json({ 
            success: false, 
            message: "Server error",
            error: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

// Clear cache endpoint for machine idle data
export const clearMachineIdleCacheController = async (req: Request, res: Response) => {
    try {
        const { timeFilter } = req.query;
        
        if (timeFilter) {
            // Clear cache for specific timeFilter
            const keys = await redis.keys(`machine_idle:*timeFilter=${timeFilter}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            res.json({
                success: true,
                message: `Cleared machine idle cache for timeFilter: ${timeFilter}`,
                clearedKeys: keys.length
            });
        } else {
            // Clear all machine idle cache
            await clearMachineIdleCache();
            res.json({
                success: true,
                message: "Cleared all machine idle cache"
            });
        }
    } catch (error) {
        console.error('Error clearing machine idle cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear machine idle cache'
        });
    }
};