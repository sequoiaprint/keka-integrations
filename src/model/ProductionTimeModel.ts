import Jobpool from "../dbConfig/jobsDb";

export interface ProductionTimeResult {
  MACHINE_USED: string;
  total_pass_duration_hrs_min: string;
  total_wash_duration_hrs_min: string;
  total_production_time: string;
}

export interface JobPassCountResult {
  JOBNO: string;
  JOBNAME: string;
  MACHINE_USED: string;
  total_passes: number;
}

export class ProductionTimeModel {
  static async getTotalProductionTime(
    machineName: string,
    timeFilter: string
  ): Promise<ProductionTimeResult[]> {
    let condition = "";

    // Check if it's a custom date range (format: "YYYY-MM-DD_to_YYYY-MM-DD")
    if (timeFilter.includes("_to_")) {
      const [startDate, endDate] = timeFilter.split("_to_");
      condition = `WHERE PASS_START_TIME BETWEEN '${startDate} 00:00:00' AND '${endDate} 23:59:59'`;
    } else {
      // Build time filter condition for predefined filters
      switch (timeFilter) {
        case "Today":
          condition = `WHERE PASS_START_TIME BETWEEN CONCAT(CURDATE(), ' 00:00:00') 
                       AND CONCAT(CURDATE(), ' 23:59:59')`;
          break;
        case "Yesterday":
          condition = `WHERE PASS_START_TIME BETWEEN CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), ' 00:00:00') 
                       AND CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), ' 23:59:59')`;
          break;
        case "This Week":
          condition = `WHERE PASS_START_TIME BETWEEN CONCAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), ' 00:00:00') 
                       AND CONCAT(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), ' 23:59:59')`;
          break;
        case "Last Week":
          condition = `WHERE PASS_START_TIME BETWEEN CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY), ' 00:00:00') 
                       AND CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 1) DAY), ' 23:59:59')`;
          break;
        case "Two Weeks Ago":
          condition = `WHERE PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 14) DAY), ' 00:00:00')
                       AND PASS_START_TIME < CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY), ' 00:00:00')`;
          break;
      }
    }

    // Add machine filter
    const machineFilter = `AND MACHINE_USED = '${machineName}'`;
    const whereClause = condition ? condition + " " + machineFilter : `WHERE MACHINE_USED = '${machineName}'`;

    const query = `
      SELECT 
        MACHINE_USED,
        CONCAT(
          FLOOR(ABS(COALESCE(SUM(PassDuration), 0)) / 60), 'h ', 
          ABS(MOD(COALESCE(SUM(PassDuration), 0), 60)), 'm'
        ) AS total_pass_duration_hrs_min,
        CONCAT(
          FLOOR(ABS(COALESCE(SUM(
            COALESCE(TIMESTAMPDIFF(MINUTE, WASH_START_TIME, WASH_END_TIME), 0) + 
            COALESCE(TIMESTAMPDIFF(MINUTE, postWashtimeStart, postWashtimeEnd), 0)
          ), 0)) / 60), 'h ', 
          ABS(MOD(COALESCE(SUM(
            COALESCE(TIMESTAMPDIFF(MINUTE, WASH_START_TIME, WASH_END_TIME), 0) + 
            COALESCE(TIMESTAMPDIFF(MINUTE, postWashtimeStart, postWashtimeEnd), 0)
          ), 0), 60)), 'm'
        ) AS total_wash_duration_hrs_min,
        CONCAT(
          FLOOR(ABS(COALESCE(SUM(PassDuration), 0) + 
                 ABS(COALESCE(SUM(
                   COALESCE(TIMESTAMPDIFF(MINUTE, WASH_START_TIME, WASH_END_TIME), 0) + 
                   COALESCE(TIMESTAMPDIFF(MINUTE, postWashtimeStart, postWashtimeEnd), 0)
                 ), 0))) / 60), 'h ',
          ABS(MOD(ABS(COALESCE(SUM(PassDuration), 0)) + 
               ABS(COALESCE(SUM(
                 COALESCE(TIMESTAMPDIFF(MINUTE, WASH_START_TIME, WASH_END_TIME), 0) + 
                 COALESCE(TIMESTAMPDIFF(MINUTE, postWashtimeStart, postWashtimeEnd), 0)
               ), 0)), 60)), 'm'
        ) AS total_production_time
      FROM OFFSET_DEPT_details
      ${whereClause}
      GROUP BY MACHINE_USED
    `;

    try {
      const result = await Jobpool.query(query);
     // console.log("Production Time Result:", result);
      return result[0] as ProductionTimeResult[];
    } catch (error) {
      console.error("Error fetching production time data:", error);
      throw new Error("Failed to fetch production time data");
    }
  }

  static async getJobAndPassCount(
    machineName: string,
    timeFilter: string
  ): Promise<JobPassCountResult[]> {
    let dateCondition = "";

    // Check if it's a custom date range
    if (timeFilter.includes("_to_")) {
      const [startDate, endDate] = timeFilter.split("_to_");
      dateCondition = `od.PASS_START_TIME >= '${startDate} 00:00:00' 
                       AND od.PASS_START_TIME < DATE_ADD('${endDate}', INTERVAL 1 DAY)`;
    } else {
      // Build time filter condition for predefined filters
      switch (timeFilter) {
        case "Today":
          dateCondition = `od.PASS_START_TIME >= CONCAT(CURDATE(), ' 00:00:00') 
                           AND od.PASS_START_TIME < CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')`;
          break;
        case "Yesterday":
          dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), ' 00:00:00') 
                           AND od.PASS_START_TIME < CONCAT(CURDATE(), ' 00:00:00')`;
          break;
        case "This Week":
          dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), ' 00:00:00') 
                           AND od.PASS_START_TIME < CONCAT(DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY), ' 00:00:00')`;
          break;
        case "Last Week":
          dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY), ' 00:00:00') 
                           AND od.PASS_START_TIME < CONCAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), ' 00:00:00')`;
          break;
        case "Two Weeks Ago":
          dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 14) DAY), ' 00:00:00')
                           AND od.PASS_START_TIME < CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY), ' 00:00:00')`;
          break;
      }
    }

    const query = `
      SELECT 
        o.JOBNO,
        o.JOBNAME,
        od.MACHINE_USED,
        COUNT(DISTINCT od.cid) AS total_passes
      FROM OFFSET_DEPT o
      JOIN OFFSET_DEPT_details od ON o.id = od.id 
      WHERE ${dateCondition}
        AND od.MACHINE_USED = '${machineName}'
      GROUP BY o.JOBNO, o.JOBNAME, od.MACHINE_USED
      ORDER BY o.JOBNO;
    `;

    try {
      const result = await Jobpool.query(query);
      return result[0] as JobPassCountResult[];
    } catch (error) {
      console.error("Error fetching job and pass count data:", error);
      throw new Error("Failed to fetch job and pass count data");
    }
  }
}