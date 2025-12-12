import { Router } from "express";
import { getOverTimeMax, getWeeklyOvertimeSummary ,getMaxAttendanceMinHoursHandler,getTopJobTitlesByOvertime } from '../controllers/OverTimeController';

const router = Router();
router.get('/top-overtime/:timeFilter', getTopJobTitlesByOvertime);
router.get("/max", getOverTimeMax);
router.get('/weekly-summary', getWeeklyOvertimeSummary);
router.get('/max-attendance-min-hours', getMaxAttendanceMinHoursHandler);

export default router;