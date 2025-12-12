import { Router } from 'express';
import {
  getAttendanceStatistics,
  getPresentEmployeesList,
  getAbsentEmployeesList,
  getOnTimeEmployeesList,
  getLateEmployeesList,
  getNoClockOutEmployeesList,
  getMostOnTimeEmployee,
  getMostMissingClockOutEmployee,
  getMostLateEmployee,
  getMostMondayFridayAbsentByDivisionController ,
  getProofCTPAttendanceStatsController 
} from '../controllers/dashboardController';

const router = Router();


router.get('/stats', getAttendanceStatistics);


router.get('/present', getPresentEmployeesList);


router.get('/absent', getAbsentEmployeesList);


router.get('/on-time', getOnTimeEmployeesList);


router.get('/late', getLateEmployeesList);


router.get('/no-clock-out', getNoClockOutEmployeesList);

router.get('/most-on-time', getMostOnTimeEmployee);
router.get('/most-missing-clock-out', getMostMissingClockOutEmployee);
router.get('/most-late', getMostLateEmployee);
router.get('/monday-friday-absent', getMostMondayFridayAbsentByDivisionController);
router.get('/proof-ctp-stats', getProofCTPAttendanceStatsController);

export default router;