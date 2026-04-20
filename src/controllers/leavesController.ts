import { Request, Response } from "express";
import { collectAllLeaveData } from "../services/collectLeaves";

export const collectLeavesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.kekaToken;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Keka token not found. Ensure kekaTokenMiddleware is applied.",
      });
      return;
    }

    const result = await collectAllLeaveData(token);

    res.status(200).json({
      success: true,
      message: "Leave data collected and stored successfully.",
      data: {
        leaveRequests: {
          inserted: result.requests.inserted,
          errors: result.requests.errors,
        },
        leaveBalances: {
          inserted: result.balances.inserted,
          errors: result.balances.errors,
        },
      },
    });
  } catch (error: any) {
    console.error(" collectLeavesController error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to collect leave data from Keka.",
      error: error.message,
    });
  }
};
