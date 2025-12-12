import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "cron";
import pool from "./dbConfig/dbConfig"
import redis from "./dbConfig/redis";
import Jobpool from "./dbConfig/jobsDb";
import { error } from "console";

import employeeRoutes from "./routes/employeeRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import utilization from './routes/productionRoutes'
import { scheduleTokenRefresh } from "./utils/tokenScheduler";
import { scheduleEmployeeCollection } from "./utils/employeeScheduler";
import { scheduleAttendanceCollection, manualAttendanceSync } from "./utils/attendanceScheduler";
import machineIdleRoutes from "./routes/machineIdleRoutes";
import OverTimeRoutes from "./routes/OverTimeRoutes";
import nightShiftRoutes from "./routes/NightShiftRoutes";
dotenv.config();
const app = express();
const port = process.env.Port;

app.use(cors());
app.use(express.json());

//fetching keka token
scheduleTokenRefresh();
scheduleEmployeeCollection();
scheduleAttendanceCollection();

manualAttendanceSync().catch(error => {
  console.error(' First-time attendance sync failed:', error);
});


//api routes 
app.use("/employees", employeeRoutes);
app.use("/api", utilization);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", machineIdleRoutes);
app.use("/api/overtimeRouter", OverTimeRoutes);
app.use("/api", nightShiftRoutes);

//for docker
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

//db test
async function dbtest() {
  const [rows] = await pool.query("SELECT 1 + 1 AS result")
  const [jobRows] = await Jobpool.query("SELECT 1 + 1 AS result")
  if (rows && jobRows) {
    console.log("Connection established with both dbs")
  } else {
    console.log(error)
  }
}

//redis test connection
async function redisTest() {
  await redis.set("testkey", "Redis connected successfully");
  const value = await redis.get("testkey")
  if (value) {
    console.log(value)
  } else {
    console.log(error)
  }
}

//call functions
dbtest()
redisTest()

//port
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
});