import pool from "../dbConfig/dbConfig";

export interface AttendanceResult {
  employee_id: string;
  name: string;
  jobtitle: string;
  machine: string;
  total_gross_hours: number;
}
export interface OvertimeResult {
  employee_id: string;
  name: string;
  machine: string;
  total_effective_hours: number;
  total_effective_overtime_duration: number;
}
interface Employee {
  employee_id: string;
  name: string;
  machine: string;
}

export class AttendanceModel {
  private static mapMachineName(machine: string): string {
    const machineMap: { [key: string]: string } = {
      'KOMORI': 'Komori',
      'RYOBI2': 'Ryobi 2',
      'RYOBI 3': 'Ryobi 3'
    };
    return machineMap[machine] || machine;
  }
  static async getAttendanceData(
    machineName: string,
    timeFilter: string
  ): Promise<AttendanceResult[]> {
    let dateCondition = "";
    const mappedMachineName = this.mapMachineName(machineName);

    // Build time filter condition
    if (timeFilter === "Today") {
      dateCondition = `AND a.attendance_date = CURDATE()`;
    } else if (timeFilter === "Yesterday") {
      dateCondition = `AND a.attendance_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    } else if (timeFilter === "This Week") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) 
                       AND DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY)`;
    } else if (timeFilter === "Last Week") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY) 
                       AND DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 1) DAY)`;
    } else if (timeFilter === "Two Weeks Ago") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 14) DAY) 
                       AND DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 8) DAY)`;
    } else if (timeFilter.includes("_to_")) {
      // Handle custom date range
      const [startDate, endDate] = timeFilter.split("_to_");
      dateCondition = `AND a.attendance_date BETWEEN '${startDate}' AND '${endDate}'`;
    }

    const query = `
      SELECT 
        e.employee_id,
        e.name,
        e.machine,
        e.jobtitle,
        SUM(a.total_gross_hours) AS total_gross_hours
      FROM employees e
      JOIN attendance a 
        ON e.employee_id = a.employee_id
      WHERE 
        e.machine = ?
        ${dateCondition}
      GROUP BY 
        e.employee_id, e.name, e.machine, e.jobtitle
      ORDER BY 
        e.employee_id ASC
    `;

    try {
      const [result] = await pool.execute(query, [mappedMachineName]);
      return result as AttendanceResult[];
    } catch (error) {
      console.error("Error fetching attendance data:", error);
      throw new Error("Failed to fetch attendance data");
    }
  }

  static async getAttendanceByMachine(
    machineName: string,
    timeFilter: string
  ): Promise<AttendanceResult[]> {
    return this.getAttendanceData(machineName, timeFilter);
  }

  static async getOvertimeData(
    machineName: string,
    timeFilter: string
  ): Promise<OvertimeResult[]> {
    let dateCondition = "";
    const mappedMachineName = this.mapMachineName(machineName);

    // Build time filter condition
    if (timeFilter === "Today") {
      dateCondition = `AND a.attendance_date = CURDATE()`;
    } else if (timeFilter === "Yesterday") {
      dateCondition = `AND a.attendance_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    } else if (timeFilter === "This Week") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) 
                       AND DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY)`;
    } else if (timeFilter === "Last Week") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY) 
                       AND DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 1) DAY)`;
    } else if (timeFilter === "Two Weeks Ago") {
      dateCondition = `AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 14) DAY) 
                       AND DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 8) DAY)`;
    } else if (timeFilter.includes("_to_")) {
      // Handle custom date range
      const [startDate, endDate] = timeFilter.split("_to_");
      dateCondition = `AND a.attendance_date BETWEEN '${startDate}' AND '${endDate}'`;
    }

    const query = `
      SELECT 
        e.employee_id,
        e.name,
        e.machine,
        SUM(a.total_effective_hours) AS total_effective_hours,
        SUM(a.total_effective_overtime_duration) AS total_effective_overtime_duration
      FROM employees e
      LEFT JOIN attendance a ON e.employee_id = a.employee_id
      WHERE 
        e.machine = ?
        AND a.total_effective_overtime_duration > 0
        AND a.employee_id IS NOT NULL
        ${dateCondition}
      GROUP BY 
        e.employee_id, e.name, e.machine
      ORDER BY 
        e.employee_id ASC
    `;

    try {
      const [result] = await pool.execute(query, [mappedMachineName]);
      return result as OvertimeResult[];
    } catch (error) {
      console.error("Error fetching overtime data:", error);
      throw new Error("Failed to fetch overtime data");
    }
  }
  static async getEmployeesByMachine(machineName: string): Promise<Employee[]> {
    const mappedMachineName = this.mapMachineName(machineName);

    const query = `
    SELECT 
      employee_id,
      name,
      machine
    FROM employees
    WHERE machine = ?
    ORDER BY employee_id
  `;

    try {
      const [result] = await pool.execute(query, [mappedMachineName]);
      return result as Employee[];
    } catch (error) {
      console.error("Error fetching employees by machine:", error);
      throw new Error("Failed to fetch employees by machine");
    }
  }
}