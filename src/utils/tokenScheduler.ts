// utils/tokenScheduler.ts
import cron from "node-cron";
import { fetchKekaToken } from "../middleware/kekaToken";
import redis from "../dbConfig/redis";

export const scheduleTokenRefresh = async () => {
  try {

    const redisToken = await redis.get("keka_access_token");
    
    if (!redisToken) {
      console.log(" No existing token found. Fetching initial token...");
      await fetchKekaToken();
    } else {
      console.log(" Existing token found in Redis. Skipping initial fetch.");
    }


    cron.schedule("0 7 * * *", async () => {
      console.log(" 7:00 AM IST - Token refresh started:", new Date().toISOString());
      try {
        await fetchKekaToken();
        console.log(" Token refreshed successfully at 7:00 AM");
      } catch (error) {
        console.error("7:00 AM token refresh failed:", error);
      }
    }, {
      timezone: "Asia/Kolkata"
    });

  
    cron.schedule("50 6 * * *", async () => {
      console.log(" 6:50 AM IST - Safety token refresh started:", new Date().toISOString());
      try {
        await fetchKekaToken();
        console.log(" Safety token refresh successful at 6:50 AM");
      } catch (error) {
        console.error(" Safety token refresh failed:", error);
      }
    }, {
      timezone: "Asia/Kolkata"
    });

    console.log(" Token refresh scheduler initialized");
    console.log(" Scheduled: 6:50 AM IST (safety) and 7:00 AM IST (main) daily");
    
  } catch (error) {
    console.error(" Token scheduler initialization failed:", error);
  }
};