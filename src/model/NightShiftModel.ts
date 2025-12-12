import pool from "../dbConfig/dbConfig";

const getNightShifts = async (timeFilter: string = "today") => {
    let dateCondition = "";

    if (timeFilter === "today") {
        dateCondition = "AND a.attendance_date = CURDATE()";
    } else if (timeFilter === "yesterday") {
        dateCondition = "AND a.attendance_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
    } else if (timeFilter === "this week") {
        dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND CURDATE()";
    } else if (timeFilter === "last week") {
        dateCondition = "AND a.attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 1 DAY)";
    } else if (timeFilter.includes("_to_")) {
      // Handle custom date range
      const [startDate, endDate] = timeFilter.split("_to_");
      dateCondition = `AND a.attendance_date BETWEEN '${startDate}' AND '${endDate}'`;
    }
    else {
        dateCondition = "AND a.attendance_date = CURDATE()";
    }

    const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            a.id AS attendance_id,
            a.attendance_date,
            a.shift_start,
            a.shift_end,
            a.shift_duration,
            a.first_in_of_the_day_time,
            a.last_out_of_the_day_time
        FROM employees e
        JOIN attendance a 
            ON e.employee_id = a.employee_id  
        WHERE 
            (
                TIME(a.first_in_of_the_day_time) >= '20:00:00'
                OR 
                TIME(a.first_in_of_the_day_time) < '02:00:00'
            )
            ${dateCondition}
            AND e.floor IN ('Ground Floor', '1st Floor')
        ORDER BY e.employee_id ASC, a.attendance_date DESC;
    `;

    try {
        const [rows] = await pool.query<any[]>(query);

        if (!rows || rows.length === 0) {
            return { count: 0, employees: [] };
        }

        // Group by employee_id
        const employeeMap = new Map();
        
        rows.forEach(r => {
            const employeeId = r.employee_id;
            
            if (!employeeMap.has(employeeId)) {
                // First time seeing this employee
                employeeMap.set(employeeId, {
                    employee_id: r.employee_id,
                    name: r.name,
                    floor: r.floor,
                    division: r.division,
                    machine: r.machine,
                    dayDuration: []  // Initialize as array
                });
            }
            
            // Add the attendance record to the dayDuration array
            const employee = employeeMap.get(employeeId);
            employee.dayDuration.push({
                attendance_id: r.attendance_id,
                attendance_date: r.attendance_date,
                shift_start: r.shift_start,
                shift_end: r.shift_end,
                shift_duration: r.shift_duration,
                firstIn: r.first_in_of_the_day_time,
                lastOut: r.last_out_of_the_day_time
            });
        });

        // Convert map to array of employees
        const employees = Array.from(employeeMap.values());

        return {
            count: employees.length,  
            employees                 
        };

    } catch (err) {
        console.log("Error in getNightShifts →", err);
        return { count: 0, employees: [] };
    }
};

export default getNightShifts;