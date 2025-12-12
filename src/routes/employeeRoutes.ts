import { Router } from "express";
import {
  getEmployees,
  getEmployee,
  createEmp,
  updateEmp,
  deleteEmp,
  getEmployeesOvertime,
  getAttendanceByIdsController
} from "../controllers/employeeController";

const router = Router();

router.get("/", getEmployees);
router.get("/:id", getEmployee);
router.post("/", createEmp);
router.put("/:id", updateEmp);
router.delete("/:id", deleteEmp);
router.get("/overtime/list", getEmployeesOvertime);
router.post("/attendance/by-ids", getAttendanceByIdsController);

export default router;
