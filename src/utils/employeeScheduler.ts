
import cron from "node-cron";
import { collectAndSyncEmployees, triggerEmployeeCollection } from "../services/collectEmployee";

export const scheduleEmployeeCollection = (): void => {

  setTimeout(async () => {
    console.log("Starting initial employee collection on server start...");
    try {
      await triggerEmployeeCollection();
      console.log(" Initial employee collection completed successfully");
    } catch (error) {
      console.error(" Initial employee collection failed:", error);
    }
  }, 10000); 


  cron.schedule("0 7 * * *", async () => {
    console.log(" 7:00 AM IST - Starting scheduled employee collection...");
    try {
      await collectAndSyncEmployees();
      console.log(" Scheduled employee collection completed successfully");
    } catch (error) {
      console.error(" Scheduled employee collection failed:", error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

  
  cron.schedule("30 7 * * *", async () => {
    console.log(" 7:30 AM IST - Starting backup employee collection...");
    try {
      await collectAndSyncEmployees();
      console.log(" Backup employee collection completed successfully");
    } catch (error) {
      console.error(" Backup employee collection failed:", error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

 
  cron.schedule("0 12 * * *", async () => {
    console.log(" 12:00 PM IST - Starting midday employee collection...");
    try {
      await collectAndSyncEmployees();
      console.log("Midday employee collection completed successfully");
    } catch (error) {
      console.error(" Midday employee collection failed:", error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

  console.log(" Employee collection scheduler initialized");
  console.log("📅 Scheduled: 7:00 AM, 7:30 AM, and 12:00 PM IST daily");
  console.log("🚀 Initial collection will start in 10 seconds...");
};