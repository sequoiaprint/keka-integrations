// routes/machineIdleRoutes.ts
import express from "express";
import { getMachineWiseIdle } from "../controllers/machineIdleController";

const router = express.Router();

router.get("/machine-idle", getMachineWiseIdle);

export default router;
