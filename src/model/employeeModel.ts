import { error } from "console";
import pool from "../dbConfig/dbConfig";

export const getAllEmployees = async (floor?: "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all") => {
  let query = "SELECT * FROM employees";
  let params: any[] = [];

  if (floor && floor !== "all") {
    query += " WHERE floor = ?";
    params.push(floor);
  }

  const [rows] = await pool.query(query, params);
  if (rows) {
    return rows;
  } else {
    console.log(error);
  }
}
export const getEmployeeById = async (id: string) => {
  const [rows] = await pool.query("SELECT * FROM employees where id = ?", [id]);
  if (rows) {
    return rows;
  } else {
    console.log(error);
  }
}
export const getEmployeeByMachine = async (timeFilter: string = "Today") => {
  let dateCondition = "";

  // Build time filter condition for attendance_date
  if (timeFilter === "Today") {
    dateCondition = "AND a.attendance_date = CURDATE()";
  } else if (timeFilter === "Yesterday") {
    dateCondition = "AND a.attendance_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
  } else if (timeFilter === "This Week") {
    dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND CURDATE()";
  } else if (timeFilter === "Last Week") {
    dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 1 DAY)";
  } else {
    // Default to today if no valid time filter
    dateCondition = "AND a.attendance_date = CURDATE()";
  }

  const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.machine,
            a.total_effective_hours
        FROM employees e
        LEFT JOIN attendance a ON e.employee_id = a.employee_id
        WHERE e.machine IN ('Ryobi 2', 'Ryobi 3', 'Komori')
        AND a.employee_id IS NOT NULL
        ${dateCondition}
    `;

  try {
    const [rows] = await pool.query(query);

    // Aggregate and sum total_effective_hours for each employee
    const employeeMap = new Map();

    for (const row of rows as any[]) {
      const key = `${row.employee_id}-${row.name}-${row.machine}`;

      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employee_id: row.employee_id,
          name: row.name,
          machine: row.machine,
          total_effective_hours: 0
        });
      }

      // Sum the total_effective_hours
      employeeMap.get(key).total_effective_hours += parseFloat(row.total_effective_hours) || 0;
    }

    // Convert map back to array
    const aggregatedResults = Array.from(employeeMap.values());

    return aggregatedResults;
  } catch (error) {
    console.log('Error fetching employee data:', error);
    throw error;
  }
}
export const createEmployees = async (employees: any[]) => {
  const cols = employees.map(e => [
    e.name, e.floor, e.division, e.machine, e.jobtitle,
    e.regularShiftStart, e.regularShiftEnd, e.offdays
  ]);
  const [result] = await pool.query(`INSERT INTO employees 
    (name, floor, division, machine, jobtitle, regularShiftStart, regularShiftEnd, offdays)
    VALUES ?`, [cols])
  if (result) {
    return result;
  } else {
    console.log(error);
  }
}
export const updateEmployee = async (id: string, fields: any) => {
  const keys = Object.keys(fields);
  if (!keys.length) return null;
  const values = Object.values(fields);
  const setClause = keys.map(k => `${k} = ?`).join(", ");
  const sql = `UPDATE employees SET ${setClause} WHERE employee_id = ?`;
  const [result] = await pool.query(sql, [...values, id]);
  if (result) {
    return result;
  } else {
    console.log(error);
  }
};
export const deleteEmployee = async (id: string) => {
  const [result] = await pool.query("DELETE FROM employees WHERE employee_id = ?", [id]);
  if (result) {
    return result;
  } else {
    console.log(error);
  }
};

//-------------Overtime Specific Functions----------------//

export const getEmployeesForOvertime = async (
  division?: 
    | "Accounts"
    | "Admin"
    | "Admin Accounts"
    | "CTP"
    | "Data Entry"
    | "Fabricator"
    | "HR Admin"
    | "Personal Accounts"
    | "Post Press"
    | "Pre Press"
    | "Press, Post Press"
    | "Proof Dept"
    | "Silk Screen"
    | "all",
  timeFilter: string = "Today",
  startDate?: string,
  endDate?: string
) => {
  let dateCondition = "";
  const params: any[] = [];

  // Handle custom date range
  if (timeFilter === "Custom" && startDate && endDate) {
    dateCondition = "AND a.attendance_date BETWEEN ? AND ?";
    params.push(startDate, endDate);
  } else if (timeFilter === "Today") {
    dateCondition = "AND a.attendance_date = CURDATE()";
  } else if (timeFilter === "Yesterday") {
    dateCondition = "AND a.attendance_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
  } else if (timeFilter === "This Week") {
    dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND CURDATE()";
  } else if (timeFilter === "Last Week") {
    dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 1 DAY)";
  } else if (timeFilter === "Last Month") {
    dateCondition = `
      AND a.attendance_date BETWEEN
        DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
        AND LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
    `;
  }

  let query = `
    SELECT 
      e.employee_id,
      e.name,
      e.floor,
      e.jobtitle,
      e.division,
      e.machine,
      a.id AS attendance_id
    FROM employees e
    JOIN attendance a ON e.employee_id = a.employee_id
    WHERE a.total_effective_overtime_duration <> 0
    ${dateCondition}
  `;

  // 🔥 Division Filter (Replaces floor filter)
  if (division && division !== "all") {
    query += " AND e.division = ?";
    params.push(division);
  }

  // Add floor ordering to maintain your floor-wise order
  query += " ORDER BY e.floor, e.name";

  const [rows]: any = await pool.query(query, params);

  // ---- GROUP BY EMPLOYEE ----
  const grouped: any = {};

  for (const r of rows) {
    if (!grouped[r.employee_id]) {
      grouped[r.employee_id] = {
        employee_id: r.employee_id,
        name: r.name,
        floor: r.floor,
        jobtitle: r.jobtitle,
        division: r.division,
        machine: r.machine,
        attendanceIds: [],
        totalAttendance: 0
      };
    }

    grouped[r.employee_id].attendanceIds.push(r.attendance_id);
    grouped[r.employee_id].totalAttendance++;
  }

  // Convert object to array (already sorted by floor due to SQL ORDER BY)
  const finalResult = Object.values(grouped);

  return {
    totalEmployees: finalResult.length,
    data: finalResult
  };
};




export const getAttendanceByIds = async (attendanceIds: string[]) => {
  if (!attendanceIds || attendanceIds.length === 0) {
    return [];
  }

  const placeholders = attendanceIds.map(() => "?").join(",");

  const query = `
    SELECT
      id AS attendance_id,
      attendance_date,
      shift_start,
      shift_end,
      shift_duration,
      first_in_of_the_day_time,
      last_out_of_the_day_time,
      total_gross_hours,
      total_break_duration,
      total_effective_hours,
      total_effective_overtime_duration,
      total_undertime,
      is_offday
    FROM attendance
    WHERE id IN (${placeholders})
  `;

  const [rows]: any = await pool.query(query, attendanceIds);
  return rows;
};
