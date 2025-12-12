import { Request, Response } from "express";
import getNightShifts from "../model/NightShiftModel";
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

export const nightShiftController = async (req: Request, res: Response) => {
    const timeFilter = req.query.timeFilter as string || "Today";

    try {
        // Generate cache key based on timeFilter
        const cacheKey = generateCacheKey('night_shift', { timeFilter });
        
        const result = await getCachedOrFetch(
            cacheKey,
            () => getNightShifts(timeFilter)
        );

        // Add cache metadata to response (optional)
        const responseWithCache = {
            ...result,
            _cache: {
                cached: true,
                ttl: CACHE_TTL,
                expires_in: `${CACHE_TTL / 60} minutes`
            }
        };

        return res.status(200).json(responseWithCache);
    } catch (err) {
        console.error("Error in nightShiftController:", err);
        return res.status(500).json({ 
            message: "Internal server error", 
            error: err instanceof Error ? err.message : "Unknown error" 
        });
    }
};

// Optional: Clear cache endpoint for night shift data
export const clearNightShiftCache = async (req: Request, res: Response) => {
    try {
        const { timeFilter } = req.query;
        
        if (timeFilter) {
            // Clear cache for specific timeFilter
            const keys = await redis.keys(`night_shift:*timeFilter=${timeFilter}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            res.json({
                success: true,
                message: `Cleared night shift cache for timeFilter: ${timeFilter}`,
                clearedKeys: keys.length
            });
        } else {
            // Clear all night shift cache
            const keys = await redis.keys('night_shift:*');
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            res.json({
                success: true,
                message: "Cleared all night shift cache",
                clearedKeys: keys.length
            });
        }
    } catch (error) {
        console.error('Error clearing night shift cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear night shift cache'
        });
    }
};