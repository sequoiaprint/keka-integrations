import { Router } from "express";
import { nightShiftController } from "../controllers/NightShiftController";

const router = Router();

router.get("/night-shifts", nightShiftController);

export default router;
