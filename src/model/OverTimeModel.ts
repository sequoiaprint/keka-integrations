import pool from "../dbConfig/dbConfig";
import moment from "moment";

// Define TypeScript interfaces
interface DayOvertimeDetail {
    date: string;
    hours: number;
}

interface DayOvertime {
    total_hours: number;
    days: DayOvertimeDetail[];
}

interface WeeklyOvertime {
    Monday: DayOvertime;
    Tuesday: DayOvertime;
    Wednesday: DayOvertime;
    Thursday: DayOvertime;
    Friday: DayOvertime;
    Saturday: DayOvertime;
    Sunday: DayOvertime;
}

interface WeeklyOvertimeSummary {
    [key: string]: { total_hours: number };
}

export interface JobTitleOvertime {
    jobtitle: string;
    total_overtime: number;
}

export interface DivisionMaxAttendanceMinHours {
    division: string;
    top_employees: {
        employee_id: string;
        name: string;
        floor: string;
        machine: string;
        attendance_count: number;
        total_effective_hours: number;
        avg_daily_hours: number;
    }[];
}

export const getOverMaxTime = async (timeFilter: string = "Today") => {
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

    const query = `WITH overtime_summary AS (
    SELECT 
        e.employee_id,
        e.name,
        e.floor,
        e.division,
        e.machine,
        SUM(a.total_effective_overtime_duration) AS total_overtime
    FROM attendance a
    JOIN employees e 
        ON a.employee_id = e.employee_id
    WHERE 
        e.floor IN ('Ground Floor', '1st Floor')
        ${dateCondition}  AND a.total_effective_overtime_duration <> 0
    GROUP BY 
        e.employee_id, e.name, e.floor, e.division, e.machine
)
SELECT *
FROM overtime_summary os
WHERE os.total_overtime = (
    SELECT MAX(total_overtime)
    FROM overtime_summary
    WHERE floor = os.floor
)
ORDER BY os.floor ASC;`

    try {
        const [rows] = await pool.query(query);
        if (rows) {
            return rows;
        } else {
            console.log("No data found");
        }
    }
    catch (err) {
        console.log(err);
    }
}

export const getLast30DaysWeeklyOvertime = async (): Promise<WeeklyOvertime> => {
    // Calculate date range (last 30 days)
    const endDate = moment().format('YYYY-MM-DD');
    const startDate = moment().subtract(29, 'days').format('YYYY-MM-DD'); // 30 days including today

    const query = `
        SELECT 
            DATE(a.attendance_date) as attendance_date,
            DAYNAME(a.attendance_date) as day_name,
            SUM(a.total_effective_overtime_duration) as daily_overtime
        FROM attendance a
        JOIN employees e 
            ON a.employee_id = e.employee_id
        WHERE 
            e.floor IN ('Ground Floor', '1st Floor')
            AND a.attendance_date BETWEEN ? AND ?
            AND a.total_effective_overtime_duration <> 0
        GROUP BY 
            DATE(a.attendance_date), DAYNAME(a.attendance_date)
        ORDER BY 
            a.attendance_date ASC;
    `;

    try {
        const [rows] = await pool.query<any[]>(query, [startDate, endDate]);

        if (!rows || rows.length === 0) {
            return initializeWeeklyOvertime();
        }

        // Initialize result structure with proper typing
        const weeklyOvertime = initializeWeeklyOvertime();

        // Process each row and accumulate overtime by day of week
        rows.forEach((row: any) => {
            const dayName = row.day_name as keyof WeeklyOvertime;
            const overtimeHours = row.daily_overtime || 0;

            // Type-safe property access
            if (weeklyOvertime[dayName]) {
                weeklyOvertime[dayName].total_hours += overtimeHours;
                
                // Store the actual date and hours for reference
                weeklyOvertime[dayName].days.push({
                    date: row.attendance_date,
                    hours: overtimeHours
                });
            }
        });

        return weeklyOvertime;

    } catch (err) {
        console.log("Error in getLast30DaysWeeklyOvertime →", err);
        return initializeWeeklyOvertime();
    }
}

// Helper function to initialize the weekly overtime structure
function initializeWeeklyOvertime(): WeeklyOvertime {
    return {
        Monday: {
            total_hours: 0,
            days: []
        },
        Tuesday: {
            total_hours: 0,
            days: []
        },
        Wednesday: {
            total_hours: 0,
            days: []
        },
        Thursday: {
            total_hours: 0,
            days: []
        },
        Friday: {
            total_hours: 0,
            days: []
        },
        Saturday: {
            total_hours: 0,
            days: []
        },
        Sunday: {
            total_hours: 0,
            days: []
        }
    };
}

// Export a more structured version without detailed day records
export const getLast30DaysWeeklyOvertimeSummary = async (): Promise<WeeklyOvertimeSummary> => {
    const detailedData = await getLast30DaysWeeklyOvertime();
    
    // Extract just the total hours for each day
    const summary: WeeklyOvertimeSummary = {};
    
    // Type-safe iteration over object keys
    (Object.keys(detailedData) as Array<keyof WeeklyOvertime>).forEach(dayName => {
        summary[dayName] = {
            total_hours: detailedData[dayName].total_hours
        };
    });
    
    return summary;
}




export async function getMaxAttendanceMinHoursByDivision(): Promise<DivisionMaxAttendanceMinHours[]> {
    // Calculate date range (last 30 days)
    const endDate = moment().utcOffset(330).format('YYYY-MM-DD');
    const startDate = moment().utcOffset(330).subtract(29, 'days').format('YYYY-MM-DD');

    const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            COUNT(a.id) as attendance_count,
            SUM(COALESCE(a.total_effective_hours, 0)) as total_effective_hours,
            AVG(COALESCE(a.total_effective_hours, 0)) as avg_daily_hours
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE 
            DATE(a.attendance_date) BETWEEN ? AND ?
            AND e.division IN ('Post Press', 'CTP')
            AND a.first_in_of_the_day_time IS NOT NULL 
            AND a.is_offday = false
            AND a.total_effective_hours IS NOT NULL
            AND a.total_effective_hours > 0
        GROUP BY e.employee_id, e.name, e.floor, e.division, e.machine
        HAVING attendance_count >= 20  -- Minimum attendance threshold (66% of 30 days)
        ORDER BY e.division, attendance_count DESC, total_effective_hours ASC, avg_daily_hours ASC;
    `;

    try {
        const [rows] = await pool.query<any[]>(query, [startDate, endDate]);
        
        if (!rows || rows.length === 0) {
            return [];
        }

        // Group by division
        const divisionMap = new Map<string, any[]>();
        
        rows.forEach((row: any) => {
            const division = row.division;
            
            if (!divisionMap.has(division)) {
                divisionMap.set(division, []);
            }
            
            divisionMap.get(division)!.push({
                employee_id: row.employee_id,
                name: row.name,
                floor: row.floor,
                machine: row.machine,
                attendance_count: row.attendance_count,
                total_effective_hours: parseFloat(row.total_effective_hours) || 0,
                avg_daily_hours: parseFloat(row.avg_daily_hours) || 0
            });
        });

        // Process each division to get top 3 employees per condition
        const result: DivisionMaxAttendanceMinHours[] = [];
        
        divisionMap.forEach((employees, division) => {
            if (employees.length === 0) return;
            
            // Sort by primary condition: attendance_count DESC, then total_effective_hours ASC
            const sortedEmployees = employees.sort((a, b) => {
                // First compare by attendance count (descending)
                if (b.attendance_count !== a.attendance_count) {
                    return b.attendance_count - a.attendance_count;
                }
                
                // If attendance count is equal, compare by total effective hours (ascending)
                if (a.total_effective_hours !== b.total_effective_hours) {
                    return a.total_effective_hours - b.total_effective_hours;
                }
                
                // If both are equal, compare by average daily hours (ascending)
                return a.avg_daily_hours - b.avg_daily_hours;
            });
            
            // Take top 3 employees
            const topEmployees = sortedEmployees.slice(0, 3);
            
            result.push({
                division,
                top_employees: topEmployees
            });
        });

        return result;

    } catch (error) {
        console.error("Error fetching max attendance min hours by division:", error);
        throw new Error("Failed to fetch max attendance min hours by division");
    }
}

export const getTop5JobTitlesByOvertime = async (timeFilter: string): Promise<JobTitleOvertime[]> => {
    let dateCondition = "";
    if (timeFilter.includes("_to_")) {
      // Handle custom date range
      const [startDate, endDate] = timeFilter.split("_to_");
      dateCondition = ` a.attendance_date BETWEEN '${startDate}' AND '${endDate}'`;
    }
    const query = `
        SELECT 
            e.jobtitle,
            SUM(a.total_effective_overtime_duration) AS total_overtime
        FROM employees e
        JOIN attendance a 
            ON e.employee_id = a.employee_id
        WHERE           
              ${dateCondition}
            AND a.total_effective_overtime_duration <> 0  
        GROUP BY e.jobtitle
        ORDER BY total_overtime DESC
        LIMIT 5;
    `;

    try {
        const [rows] = await pool.query<any[]>(query);
        
        if (!rows || rows.length === 0) {
            return [];
        }
        
        return rows.map(row => ({
            jobtitle: row.jobtitle || 'Unknown',
            total_overtime: parseFloat(row.total_overtime as any) || 0
        }));
        
    } catch (error) {
        console.error("Error fetching top 5 job titles by overtime:", error);
        throw new Error("Failed to fetch top 5 job titles by overtime");
    }
}