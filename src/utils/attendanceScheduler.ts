import cron from 'node-cron';
import { collectAndSyncAttendance } from '../services/attendanceByEmployee';

export const scheduleAttendanceCollection = (): void => {
  console.log('📅 Attendance scheduler initialized - will run every 5 minutes');
  
  // Schedule to run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    const currentTime = new Date().toLocaleTimeString();
    console.log(`🕙 Running scheduled attendance collection at ${currentTime}...`);
    
    try {
      await collectAndSyncAttendance();
      console.log(` Attendance collection completed at ${currentTime}`);
    } catch (error) {
      console.error(` Attendance collection failed at ${currentTime}:`, error);
    }
  });
};

// Manual trigger function for testing
export const manualAttendanceSync = async (): Promise<void> => {
  console.log(' Manually triggering attendance sync...');
  await collectAndSyncAttendance();
};