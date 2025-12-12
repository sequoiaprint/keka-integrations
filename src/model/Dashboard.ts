import pool from "../dbConfig/dbConfig";
import moment from "moment";
export interface DashboardRow {
    employee_id: string;
    name: string;
    floor: string;
    division: string;
    machine: string;
    attendance_id: number;
    attendance_date: string;
    shift_start: string;
    shift_end: string;
    shift_duration: string;
    first_in_of_the_day_time: string;
    last_out_of_the_day_time: string;
    total_gross_hours: string;
    total_break_duration: string;
    total_effective_hours: string;
    total_effective_overtime_duration: string;
    total_undertime: string;
    is_offday: boolean;
    leave_early: boolean;
    no_clock_out: boolean;
}
export interface DashboardFilters {
    floor: "Ground Floor" | "1st Floor" | "2nd Floor" | "3rd Floor" | "4th Floor" | "5th Floor" | "all";
    timeFilter: "today" | "yesterday" | "this week" | "last week" | string;
}
export interface AttendanceStats {
    total_employees: number;
    present_count: number;
    absent_count: number;
    on_time_count: number;
    late_count: number;
    present_percentage: number;
    absent_percentage: number;
    on_time_percentage: number;
    late_percentage: number;
}
export interface MostFrequentEmployee {
    employee_id: string;
    name: string;
    floor: string;
    division: string;
    machine: string;
    count: number;
}
export interface MostFrequentEmployeeWithDetails extends MostFrequentEmployee {
    late_details: {
        date: string;
        shift_start: string;
        first_in_time: string;
        late_minutes: number;
    }[];
}
export interface MostFrequentEmployeesDetailedResponse {
    employees: MostFrequentEmployeeWithDetails[];
    max_count: number;
}
export interface MostFrequentEmployeesResponse {
    employees: MostFrequentEmployee[];
    max_count: number;
}
export interface DivisionAbsentEmployees {
    division: string;
    absent_employees: {
        employee_id: string;
        name: string;
        floor: string;
        machine: string;
        absent_dates: string[];
        total_absent_days: number;
    }[];
}
export interface DivisionWiseAbsentResponse {
    [division: string]: {
        absent_employees: {
            employee_id: string;
            name: string;
            floor: string;
            machine: string;
            absent_dates: string[];
            total_absent_days: number;
        }[];
    };
}
export interface DivisionAttendanceStats {
    division: string;
    total_absent_days: number;
    total_no_clock_out_days: number;
    absent_employees: Array<{
        employee_id: string;
        name: string;
        floor: string;
        machine: string;
        absent_days: number;
        absent_dates: string[];
    }>;
    no_clock_out_employees: Array<{
        employee_id: string;
        name: string;
        floor: string;
        machine: string;
        no_clock_out_days: number;
        no_clock_out_dates: string[];
    }>;
}

export interface DivisionsAttendanceResponse {
    [division: string]: {
        total_absent_days: number;
        total_no_clock_out_days: number;
        absent_employees: Array<{
            employee_id: string;
            name: string;
            floor: string;
            machine: string;
            absent_days: number;
            absent_dates: string[];
        }>;
        no_clock_out_employees: Array<{
            employee_id: string;
            name: string;
            floor: string;
            machine: string;
            no_clock_out_days: number;
            no_clock_out_dates: string[];
        }>;
    };
}
export async function getAttendanceStats(filters: DashboardFilters): Promise<AttendanceStats> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

    // Query 1: Get total employees based on floor filter only (no time filter)
    const totalQuery = `
        SELECT COUNT(*) as total_employees
        FROM employees e
        WHERE ${floor === 'all' ? '1=1' : `e.floor = '${floor}'`}
    `;

    // Query 2: Get attendance statistics with both floor and time filters
    const attendanceQuery = `
        SELECT 
            COUNT(*) as filtered_count,
            SUM(CASE WHEN a.first_in_of_the_day_time IS NOT NULL THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN a.first_in_of_the_day_time IS NULL and  a.is_offday = false THEN 1 ELSE 0 END) as absent_count,
            SUM(CASE WHEN a.first_in_of_the_day_time IS NOT NULL AND a.shift_start >= a.first_in_of_the_day_time THEN 1 ELSE 0 END) as on_time_count,
            SUM(CASE WHEN a.first_in_of_the_day_time IS NOT NULL AND a.shift_start < a.first_in_of_the_day_time THEN 1 ELSE 0 END) as late_count
        FROM employees e
        JOIN attendance a 
            ON e.employee_id = a.employee_id  
        WHERE ${floorCondition} AND ${dateCondition}
    `;

    try {
        // Execute both queries in parallel
        const [totalResult] = await pool.query(totalQuery);
        const [attendanceResult] = await pool.query(attendanceQuery);

        const totalData = (totalResult as any[])[0];
        const attendanceData = (attendanceResult as any[])[0];

        const totalEmployees = totalData.total_employees || 0;
        const presentCount = attendanceData.present_count || 0;
        const absentCount = attendanceData.absent_count || 0;
        const onTimeCount = attendanceData.on_time_count || 0;
        const lateCount = attendanceData.late_count || 0;
        const filteredCount = attendanceData.filtered_count || 0;

        // Corrected percentage calculations:
        // Present/Absent percentages based on filtered_count (total records in the time period)
        const presentPercentage = filteredCount > 0 ? Math.round((presentCount / filteredCount) * 100) : 0;
        const absentPercentage = filteredCount > 0 ? Math.round((absentCount / filteredCount) * 100) : 0;

        // On-time/Late percentages based on present_count (only employees who were present)
        const onTimePercentage = presentCount > 0 ? Math.round((onTimeCount / presentCount) * 100) : 0;
        const latePercentage = presentCount > 0 ? Math.round((lateCount / presentCount) * 100) : 0;

        return {
            total_employees: totalEmployees,
            present_count: presentCount,
            absent_count: absentCount,
            on_time_count: onTimeCount,
            late_count: lateCount,
            present_percentage: presentPercentage,
            absent_percentage: absentPercentage,
            on_time_percentage: onTimePercentage,
            late_percentage: latePercentage
        };
    } catch (error) {
        console.error("Error fetching attendance statistics:", error);
        throw new Error("Failed to fetch attendance statistics");
    }
}
export async function getPresentEmployees(filters: DashboardFilters): Promise<DashboardRow[]> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

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
      a.last_out_of_the_day_time,
      a.total_gross_hours,
      a.total_break_duration,
      a.total_effective_hours,
      a.total_effective_overtime_duration,
      a.total_undertime,
      a.is_offday
    FROM employees e
    JOIN attendance a 
      ON e.employee_id = a.employee_id  
    WHERE ${floorCondition} AND ${dateCondition} AND a.first_in_of_the_day_time IS NOT NULL
    ORDER BY e.employee_id ASC;
  `;

    try {
        const [rows] = await pool.query(query);
        return rows as DashboardRow[];
    } catch (error) {
        console.error("Error fetching present employees:", error);
        throw new Error("Failed to fetch present employees");
    }
}
export async function getAbsentEmployees(filters: DashboardFilters): Promise<DashboardRow[]> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

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
      a.last_out_of_the_day_time,
      a.total_gross_hours,
      a.total_break_duration,
      a.total_effective_hours,
      a.total_effective_overtime_duration,
      a.total_undertime,
      a.is_offday
    FROM employees e
    JOIN attendance a 
      ON e.employee_id = a.employee_id  
    WHERE ${floorCondition} AND ${dateCondition} AND a.first_in_of_the_day_time IS NULL and  a.is_offday = false
    ORDER BY e.employee_id ASC;
  `;

    try {
        const [rows] = await pool.query(query);
        return rows as DashboardRow[];
    } catch (error) {
        console.error("Error fetching absent employees:", error);
        throw new Error("Failed to fetch absent employees");
    }
}
export async function getOnTimeEmployees(filters: DashboardFilters): Promise<DashboardRow[]> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

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
      a.last_out_of_the_day_time,
      a.total_gross_hours,
      a.total_break_duration,
      a.total_effective_hours,
      a.total_effective_overtime_duration,
      a.total_undertime,
      a.is_offday
    FROM employees e
    JOIN attendance a 
      ON e.employee_id = a.employee_id  
    WHERE ${floorCondition} AND ${dateCondition} 
      AND a.first_in_of_the_day_time IS NOT NULL 
      AND a.shift_start >= a.first_in_of_the_day_time
    ORDER BY e.employee_id ASC;
  `;

    try {
        const [rows] = await pool.query(query);
        return rows as DashboardRow[];
    } catch (error) {
        console.error("Error fetching on-time employees:", error);
        throw new Error("Failed to fetch on-time employees");
    }
}
export async function getLateEmployees(filters: DashboardFilters): Promise<DashboardRow[]> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

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
      a.last_out_of_the_day_time,
      a.total_gross_hours,
      a.total_break_duration,
      a.total_effective_hours,
      a.total_effective_overtime_duration,
      a.total_undertime,
      a.is_offday,
      CASE 
        WHEN a.total_effective_overtime_duration = 0 AND a.total_undertime > 0 THEN TRUE 
        ELSE FALSE 
      END as leave_early
    FROM employees e
    JOIN attendance a 
      ON e.employee_id = a.employee_id  
    WHERE ${floorCondition} AND ${dateCondition} 
      AND a.first_in_of_the_day_time IS NOT NULL 
      AND a.shift_start < a.first_in_of_the_day_time
    ORDER BY e.employee_id ASC;
  `;

    try {
        const [rows] = await pool.query(query);
        return rows as DashboardRow[];
    } catch (error) {
        console.error("Error fetching late employees:", error);
        throw new Error("Failed to fetch late employees");
    }
}
export async function getNoClockOutEmployees(filters: DashboardFilters): Promise<DashboardRow[]> {
    const { floor, timeFilter } = filters;

    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

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
      a.last_out_of_the_day_time,
      a.total_gross_hours,
      a.total_break_duration,
      a.total_effective_hours,
      a.total_effective_overtime_duration,
      a.total_undertime,
      a.is_offday,
      TRUE as no_clock_out
    FROM employees e
    JOIN attendance a 
      ON e.employee_id = a.employee_id  
    WHERE ${floorCondition} AND ${dateCondition} 
      AND a.first_in_of_the_day_time IS NOT NULL 
      AND a.last_out_of_the_day_time IS NULL
    ORDER BY e.employee_id ASC;
  `;

    try {
        const [rows] = await pool.query(query);
        return rows as DashboardRow[];
    } catch (error) {
        console.error("Error fetching no clock-out employees:", error);
        throw new Error("Failed to fetch no clock-out employees");
    }
}
export async function getMostOnTimeEmployeeCurrentMonth(filters: DashboardFilters): Promise<MostFrequentEmployeesResponse> {
    const { floor, timeFilter } = filters;
    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

    const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            COUNT(*) as count
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE ${floorCondition} 
            AND ${dateCondition}
            AND a.first_in_of_the_day_time IS NOT NULL 
            AND a.shift_start >= a.first_in_of_the_day_time
        GROUP BY e.employee_id, e.name, e.floor, e.division, e.machine
        HAVING COUNT(*) = (
            SELECT MAX(record_count)
            FROM (
                SELECT COUNT(*) as record_count
                FROM employees e2
                JOIN attendance a2 ON e2.employee_id = a2.employee_id
                WHERE ${floorCondition.replace(/e\./g, 'e2.')}
                    AND ${dateCondition.replace(/a\./g, 'a2.')}
                    AND a2.first_in_of_the_day_time IS NOT NULL 
                    AND a2.shift_start >= a2.first_in_of_the_day_time
                GROUP BY e2.employee_id
            ) as counts
        )
        ORDER BY count DESC, e.name ASC;
    `;

    try {
        const [rows] = await pool.query(query);
        const employees = rows as MostFrequentEmployee[];

        const max_count = employees.length > 0 ? employees[0].count : 0;

        return {
            employees,
            max_count
        };
    } catch (error) {
        console.error("Error fetching most on-time employee:", error);
        throw new Error("Failed to fetch most on-time employee");
    }
}

export async function getMostMissingClockOutEmployeeCurrentMonth(filters: DashboardFilters): Promise<MostFrequentEmployeesResponse> {
    const { floor, timeFilter } = filters;
    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

    const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            COUNT(*) as count
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE ${floorCondition} 
            AND ${dateCondition}
            AND a.first_in_of_the_day_time IS NOT NULL 
            AND a.last_out_of_the_day_time IS NULL
        GROUP BY e.employee_id, e.name, e.floor, e.division, e.machine
        HAVING COUNT(*) = (
            SELECT MAX(record_count)
            FROM (
                SELECT COUNT(*) as record_count
                FROM employees e2
                JOIN attendance a2 ON e2.employee_id = a2.employee_id
                WHERE ${floorCondition.replace(/e\./g, 'e2.')}
                    AND ${dateCondition.replace(/a\./g, 'a2.')}
                    AND a2.first_in_of_the_day_time IS NOT NULL 
                    AND a2.last_out_of_the_day_time IS NULL
                GROUP BY e2.employee_id
            ) as counts
        )
        ORDER BY count DESC, e.name ASC;
    `;

    try {
        const [rows] = await pool.query(query);
        const employees = rows as MostFrequentEmployee[];

        const max_count = employees.length > 0 ? employees[0].count : 0;

        return {
            employees,
            max_count
        };
    } catch (error) {
        console.error("Error fetching most missing clock-out employee:", error);
        throw new Error("Failed to fetch most missing clock-out employee");
    }
}
export async function getMostLateEmployeeCurrentMonth(filters: DashboardFilters): Promise<MostFrequentEmployeesDetailedResponse> {
    const { floor, timeFilter } = filters;
    const { dateCondition, floorCondition } = buildConditions(floor, timeFilter);

    // Function to convert UTC to IST (UTC + 5:30)
    const convertUTCToIST = (utcDate: Date): Date => {
        return new Date(utcDate.getTime() + (5 * 60 + 30) * 60 * 1000);
    };

    // Function to format time in IST
    const formatISTTime = (date: Date): string => {
        return date.toISOString().replace('T', ' ').substring(11, 19);
    };

    // Function to format date in IST
    const formatISTDate = (date: Date): string => {
        return date.toISOString().split('T')[0];
    };

    // First, get the employees with maximum late count
    const employeeQuery = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            COUNT(*) as count
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE ${floorCondition} 
            AND ${dateCondition}
            AND a.first_in_of_the_day_time IS NOT NULL 
            AND a.shift_start < a.first_in_of_the_day_time
        GROUP BY e.employee_id, e.name, e.floor, e.division, e.machine
        HAVING COUNT(*) = (
            SELECT MAX(record_count)
            FROM (
                SELECT COUNT(*) as record_count
                FROM employees e2
                JOIN attendance a2 ON e2.employee_id = a2.employee_id
                WHERE ${floorCondition.replace(/e\./g, 'e2.')}
                    AND ${dateCondition.replace(/a\./g, 'a2.')}
                    AND a2.first_in_of_the_day_time IS NOT NULL 
                    AND a2.shift_start < a2.first_in_of_the_day_time
                GROUP BY e2.employee_id
            ) as counts
        )
        ORDER BY count DESC, e.name ASC;
    `;

    try {
        const [employeeRows] = await pool.query(employeeQuery);
        const employees = employeeRows as MostFrequentEmployee[];

        const max_count = employees.length > 0 ? employees[0].count : 0;

        // If we have employees, get their detailed late records
        if (employees.length > 0) {
            const employeeIds = employees.map(emp => `'${emp.employee_id}'`).join(',');

            const detailsQuery = `
                SELECT 
                    e.employee_id,
                    a.attendance_date as date,
                    a.shift_start,
                    a.first_in_of_the_day_time as first_in_time,
                    TIMESTAMPDIFF(MINUTE, a.shift_start, a.first_in_of_the_day_time) as late_minutes
                FROM employees e
                JOIN attendance a ON e.employee_id = a.employee_id
                WHERE e.employee_id IN (${employeeIds})
                    AND ${dateCondition}
                    AND a.first_in_of_the_day_time IS NOT NULL 
                    AND a.shift_start < a.first_in_of_the_day_time
                ORDER BY e.employee_id, a.attendance_date;
            `;

            const [detailRows] = await pool.query(detailsQuery);
            const lateDetails = detailRows as any[];

            // Group late details by employee and convert times to IST
            const employeesWithDetails: MostFrequentEmployeeWithDetails[] = employees.map(emp => ({
                ...emp,
                late_details: lateDetails
                    .filter(detail => detail.employee_id === emp.employee_id)
                    .map(detail => {
                        // Convert UTC times to IST
                        const shiftStartUTC = new Date(detail.shift_start);
                        const firstInTimeUTC = new Date(detail.first_in_time);

                        const shiftStartIST = convertUTCToIST(shiftStartUTC);
                        const firstInTimeIST = convertUTCToIST(firstInTimeUTC);

                        return {
                            date: formatISTDate(new Date(detail.date)),
                            shift_start: formatISTTime(shiftStartIST),
                            first_in_time: formatISTTime(firstInTimeIST),
                            late_minutes: detail.late_minutes
                        };
                    })
            }));

            return {
                employees: employeesWithDetails,
                max_count
            };
        }

        // Return empty array if no employees found
        return {
            employees: [],
            max_count: 0
        };
    } catch (error) {
        console.error("Error fetching most late employee:", error);
        throw new Error("Failed to fetch most late employee");
    }
}
function buildConditions(floor: string, timeFilter: string) {
    let dateCondition = "";
    let floorCondition = "";
    const currentDate = new Date();

    // Build date condition
    switch (timeFilter) {
        case "today":
            const today = currentDate.toISOString().split('T')[0];
            dateCondition = `a.attendance_date = '${today}'`;
            break;

        case "yesterday":
            const yesterday = new Date(currentDate);
            yesterday.setDate(currentDate.getDate() - 1);
            dateCondition = `a.attendance_date = '${yesterday.toISOString().split('T')[0]}'`;
            break;

        case "this week":
            const startOfWeek = new Date(currentDate);
            startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
            const endOfWeek = new Date(currentDate);
            endOfWeek.setDate(currentDate.getDate() + (6 - currentDate.getDay()));
            dateCondition = `a.attendance_date BETWEEN '${startOfWeek.toISOString().split('T')[0]}' AND '${endOfWeek.toISOString().split('T')[0]}'`;
            break;

        case "last week":
            const startOfLastWeek = new Date(currentDate);
            startOfLastWeek.setDate(currentDate.getDate() - currentDate.getDay() - 7);
            const endOfLastWeek = new Date(currentDate);
            endOfLastWeek.setDate(currentDate.getDate() - currentDate.getDay() - 1);
            dateCondition = `a.attendance_date BETWEEN '${startOfLastWeek.toISOString().split('T')[0]}' AND '${endOfLastWeek.toISOString().split('T')[0]}'`;
            break;
        default:
            if (timeFilter.includes("_to_")) {
                const [startDate, endDate] = timeFilter.split("_to_");
                dateCondition = `a.attendance_date BETWEEN '${startDate}' AND '${endDate}'`;
            } else {
                throw new Error("Invalid time filter");
            }
    }

    // Build floor condition
    if (floor === "all") {
        floorCondition = "1=1"; // Always true condition for all floors
    } else {
        floorCondition = `e.floor = '${floor}'`;
    }

    return { dateCondition, floorCondition };
}
export async function getMostMondayFridayAbsentByDivision(): Promise<DivisionWiseAbsentResponse> {
    // Calculate date range (last 30 days) in IST
    const endDate = moment().utcOffset(330).format('YYYY-MM-DD'); // IST timezone
    const startDate = moment().utcOffset(330).subtract(29, 'days').format('YYYY-MM-DD');

    // Get all Mondays and Fridays in the last 30 days
    const targetDays = ['Monday', 'Friday'];

    // Get all dates that are Monday or Friday in the range (IST)
    const targetDates: string[] = [];
    let currentDate = moment(startDate).utcOffset(330);

    while (currentDate <= moment(endDate).utcOffset(330)) {
        const dayName = currentDate.format('dddd');
        if (targetDays.includes(dayName)) {
            targetDates.push(currentDate.format('YYYY-MM-DD'));
        }
        currentDate = currentDate.add(1, 'day');
    }

    if (targetDates.length === 0) {
        return {};
    }

    // Helper function to convert UTC to IST
    const convertUTCToIST = (utcDate: string): string => {
        return moment(utcDate).utcOffset(330).format('YYYY-MM-DD');
    };

    // Query to get absent employees on Mondays and Fridays in last 30 days
    const query = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            a.attendance_date as absent_date_utc,
            DATE(a.attendance_date) as absent_date_raw,
            DAYNAME(a.attendance_date) as day_name
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE 
            DATE(a.attendance_date) IN (?)
            AND a.first_in_of_the_day_time IS NULL 
            AND a.is_offday = false
            AND e.division IS NOT NULL
            AND e.division != ''
        ORDER BY e.division, e.employee_id, a.attendance_date;
    `;

    try {
        const [rows] = await pool.query<any[]>(query, [targetDates]);

        if (!rows || rows.length === 0) {
            return {};
        }

        const normalizeDivision = (division: string): string => {
            // Normalize input for safe comparison
            const d = division.trim().toLowerCase();

            const map: Record<string, string> = {
                "accounts": "Accounts",
                "admin": "Admin",
                "admin accounts": "Admin Accounts",
                "ctp": "CTP",
                "data entry": "Data Entry",
                "fabricator": "Fabricator",
                "hr admin": "HR Admin",
                "personal accounts": "Personal Accounts",
                "post press": "Post Press",
                "pre press": "Pre Press",
                "press, post press": "Press, Post Press",
                "proof dept": "Proof Dept",
                "silk screen": "Silk Screen"
            };

            // Return mapped value or original if not matched
            return map[d] ?? division;
        };



        // Group data by normalized division
        const divisionMap = new Map<string, Map<string, any>>();

        rows.forEach((row: any) => {
            const normalizedDivision = normalizeDivision(row.division);
            const employeeId = row.employee_id;

            if (!divisionMap.has(normalizedDivision)) {
                divisionMap.set(normalizedDivision, new Map());
            }

            const employeeMap = divisionMap.get(normalizedDivision)!;

            // Convert UTC date to IST
            const absentDateIST = convertUTCToIST(row.absent_date_utc);

            if (!employeeMap.has(employeeId)) {
                employeeMap.set(employeeId, {
                    employee_id: employeeId,
                    name: row.name,
                    floor: row.floor,
                    machine: row.machine,
                    absent_dates: [] as string[],
                    total_absent_days: 0
                });
            }

            const employee = employeeMap.get(employeeId)!;

            // Add IST formatted date if not already present
            if (!employee.absent_dates.includes(absentDateIST)) {
                employee.absent_dates.push(absentDateIST);
                employee.total_absent_days++;
            }
        });

        // Convert to the required response format
        const response: DivisionWiseAbsentResponse = {};

        divisionMap.forEach((employeeMap, division) => {
            // Convert employee map to array
            const employeesArray = Array.from(employeeMap.values());

            // Sort employees by total absent days (descending)
            employeesArray.sort((a, b) => b.total_absent_days - a.total_absent_days);

            // Sort absent dates chronologically
            employeesArray.forEach(emp => {
                emp.absent_dates.sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
            });

            // Only include employees with at least 2 absent days (to find "most" absent)
            const filteredEmployees = employeesArray.filter(emp => emp.total_absent_days >= 2);

            if (filteredEmployees.length > 0) {
                response[division] = {
                    absent_employees: filteredEmployees
                };
            }
        });

        return response;

    } catch (error) {
        console.error("Error fetching Monday/Friday absent employees by division:", error);
        throw new Error("Failed to fetch Monday/Friday absent employees by division");
    }
}

export async function getProofCTPAttendanceStats(): Promise<DivisionsAttendanceResponse> {
    const endDate = moment().utcOffset(330).format('YYYY-MM-DD');
    const startDate = moment().utcOffset(330).subtract(29, 'days').format('YYYY-MM-DD');
    const todayIST = moment().utcOffset(330).format('YYYY-MM-DD');

    const convertUTCToIST = (utcDate: string): string => {
        return moment(utcDate).utcOffset(330).format('YYYY-MM-DD');
    };

    const absentQuery = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            a.attendance_date as date_utc
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE 
            DATE(a.attendance_date) BETWEEN ? AND ?
            AND e.division IN ('Proof Dept', 'CTP')
            AND a.first_in_of_the_day_time IS NULL 
            AND a.is_offday = false
        ORDER BY e.division, e.employee_id, a.attendance_date;
    `;

    const noClockOutQuery = `
        SELECT 
            e.employee_id,
            e.name,
            e.floor,
            e.division,
            e.machine,
            a.attendance_date as date_utc
        FROM employees e
        JOIN attendance a ON e.employee_id = a.employee_id
        WHERE 
            DATE(a.attendance_date) BETWEEN ? AND ?
            AND e.division IN ('Proof Dept', 'CTP')
            AND a.first_in_of_the_day_time IS NOT NULL 
            AND a.last_out_of_the_day_time IS NULL
        ORDER BY e.division, e.employee_id, a.attendance_date;
    `;

    try {
        const [absentRows] = await pool.query<any[]>(absentQuery, [startDate, endDate]);
        const [noClockOutRows] = await pool.query<any[]>(noClockOutQuery, [startDate, endDate]);

        const response: DivisionsAttendanceResponse = {
            'Proof Dept': {
                total_absent_days: 0,
                total_no_clock_out_days: 0,
                absent_employees: [],
                no_clock_out_employees: []
            },
            'CTP': {
                total_absent_days: 0,
                total_no_clock_out_days: 0,
                absent_employees: [],
                no_clock_out_employees: []
            }
        };

        const absentByDivision = new Map<string, Map<string, any>>();
        const noClockOutByDivision = new Map<string, Map<string, any>>();

        // ABSENT PROCESSING
        absentRows.forEach((row) => {
            const division = row.division;
            const empId = row.employee_id;
            const dateIST = convertUTCToIST(row.date_utc);

            if (!absentByDivision.has(division)) {
                absentByDivision.set(division, new Map());
            }
            const map = absentByDivision.get(division)!;

            if (!map.has(empId)) {
                map.set(empId, {
                    employee_id: empId,
                    name: row.name,
                    floor: row.floor,
                    machine: row.machine,
                    absent_dates: [],
                    absent_days: 0
                });
            }

            const emp = map.get(empId);

            if (!emp.absent_dates.includes(dateIST)) {
                emp.absent_dates.push(dateIST);
                emp.absent_days++;
                response[division].total_absent_days++;
            }
        });

        // NO CLOCK OUT PROCESSING
        noClockOutRows.forEach((row) => {
            const division = row.division;
            const empId = row.employee_id;
            const dateIST = convertUTCToIST(row.date_utc);

            if (!noClockOutByDivision.has(division)) {
                noClockOutByDivision.set(division, new Map());
            }
            const map = noClockOutByDivision.get(division)!;

            if (!map.has(empId)) {
                map.set(empId, {
                    employee_id: empId,
                    name: row.name,
                    floor: row.floor,
                    machine: row.machine,
                    no_clock_out_dates: [],
                    no_clock_out_days: 0
                });
            }

            const emp = map.get(empId);

            if (!emp.no_clock_out_dates.includes(dateIST)) {
                emp.no_clock_out_dates.push(dateIST);
                emp.no_clock_out_days++;
            }
        });

        // FILTER TODAY'S DATE FROM NO CLOCK OUT
        ["Proof Dept", "CTP"].forEach((division) => {
            const map = noClockOutByDivision.get(division);
            if (!map) return;

            const finalList: any[] = [];
            let totalDays = 0;

            map.forEach((emp) => {
                // Remove today's IST
                emp.no_clock_out_dates = emp.no_clock_out_dates.filter(
                    (d: string) => d !== todayIST
                );

                // Update count
                emp.no_clock_out_days = emp.no_clock_out_dates.length;

                // Keep only if they still have remaining days
                if (emp.no_clock_out_days > 0) {
                    totalDays += emp.no_clock_out_days;
                    emp.no_clock_out_dates.sort();
                    finalList.push(emp);
                }
            });

            // Sort employees by days desc
            finalList.sort((a, b) => b.no_clock_out_days - a.no_clock_out_days);

            response[division].no_clock_out_employees = finalList;
            response[division].total_no_clock_out_days = totalDays;
        });

        // SORT ABSENT
        absentByDivision.forEach((map, division) => {
            const arr = Array.from(map.values());
            arr.forEach(emp => emp.absent_dates.sort());
            arr.sort((a, b) => b.absent_days - a.absent_days);
            response[division].absent_employees = arr;
        });

        return response;

    } catch (error) {
        console.error("Error fetching Proof/CTP attendance stats:", error);
        throw new Error("Failed to fetch Proof/CTP attendance stats");
    }
}
