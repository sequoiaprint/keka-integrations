import { Router } from 'express';
import { ProductionController } from '../controllers/ProductionController';

const router = Router();

router.get('/utilization/:machine/:timeFilter', ProductionController.getEmployeeUtilization);
router.get('/overtime/:machine/:timeFilter', ProductionController.getOvertimeWithJobs);

export default router;