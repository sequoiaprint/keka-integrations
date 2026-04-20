import { Router } from "express";
import { kekaTokenMiddleware } from "../middleware/kekaToken";
import { collectLeavesController } from "../controllers/leavesController";

const router = Router();

// GET /leaves/collect
// Fetches leave requests + balances from Keka API and stores them in DB
router.get("/collect", kekaTokenMiddleware, collectLeavesController);

export default router;
