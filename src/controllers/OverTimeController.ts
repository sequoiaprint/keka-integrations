import { Request, Response } from "express";
import { 
    getOverMaxTime, 
    getLast30DaysWeeklyOvertimeSummary,
    getMaxAttendanceMinHoursByDivision,
    DivisionMaxAttendanceMinHours,
    getTop5JobTitlesByOvertime   
} from "../model/OverTimeModel";
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

export const getOverTimeMax = async (req: Request, res: Response) => {
    try {
        const timeFilter = req.query.timeFilter as string || "Today";
        
        // Generate cache key
        const cacheKey = generateCacheKey('overtime_max', { timeFilter });
        
        const data = await getCachedOrFetch(
            cacheKey,
            () => getOverMaxTime(timeFilter)
        );

        res.json({
            ...data,
            _cache: {
                cached: true,
                ttl: CACHE_TTL
            }
        });
    } catch (error) {
        console.error("Error fetching overtime data:", error);
        res.status(500).json({ 
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getWeeklyOvertimeSummary = async (req: Request, res: Response) => {
    try {
        // Generate cache key for weekly summary
        const cacheKey = 'overtime:weekly_summary';
        
        const data = await getCachedOrFetch(
            cacheKey,
            () => getLast30DaysWeeklyOvertimeSummary()
        );

        res.json({
            ...data,
            _cache: {
                cached: true,
                ttl: CACHE_TTL
            }
        });
    } catch (error) {
        console.error("Error fetching weekly overtime summary:", error);
        res.status(500).json({ 
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getMaxAttendanceMinHoursHandler = async (req: Request, res: Response) => {
    try {
        // Generate cache key
        const cacheKey = 'overtime:max_attendance_min_hours';
        
        const result: DivisionMaxAttendanceMinHours[] = await getCachedOrFetch(
            cacheKey,
            () => getMaxAttendanceMinHoursByDivision()
        );
        
        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No data found for CTP and Proof Dept divisions',
                data: []
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Max attendance min hours data retrieved successfully',
            data: result,
            _cache: {
                cached: true,
                ttl: CACHE_TTL
            }
        });
    } catch (error: any) {
        console.error('Error in getMaxAttendanceMinHoursHandler:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch max attendance min hours data',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

export const getTopJobTitlesByOvertime = async (req: Request, res: Response) => {
    try {
        const { timeFilter } = req.params;
        
        if (!timeFilter) {
            return res.status(400).json({
                error: 'timeFilter parameter is required'
            });
        }

        // Generate cache key
        const cacheKey = generateCacheKey('overtime:top_job_titles', { timeFilter });
        
        const topJobTitles = await getCachedOrFetch(
            cacheKey,
            () => getTop5JobTitlesByOvertime(timeFilter)
        );

        res.status(200).json({
            success: true,
            message: 'Top 5 job titles by overtime fetched successfully',
            data: topJobTitles,
            count: topJobTitles.length,
            time_period: 'Last 30 days',
            _cache: {
                cached: true,
                ttl: CACHE_TTL
            }
        });
        
    } catch (error) {
        console.error('Error in getTopJobTitlesByOvertime controller:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to fetch top job titles by overtime',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

// Optional: Clear cache endpoint for overtime data
export const clearOvertimeCache = async (req: Request, res: Response) => {
    try {
        const { type } = req.query;
        
        if (type) {
            // Clear specific cache type
            const keys = await redis.keys(`overtime:${type}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            res.json({
                success: true,
                message: `Cleared overtime cache for type: ${type}`,
                clearedKeys: keys.length
            });
        } else {
            // Clear all overtime cache
            const keys = await redis.keys('overtime:*');
            const maxKeys = await redis.keys('overtime_max:*');
            const allKeys = [...keys, ...maxKeys];
            
            if (allKeys.length > 0) {
                await redis.del(...allKeys);
            }
            res.json({
                success: true,
                message: "Cleared all overtime cache",
                clearedKeys: allKeys.length
            });
        }
    } catch (error) {
        console.error('Error clearing overtime cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear overtime cache'
        });
    }
};