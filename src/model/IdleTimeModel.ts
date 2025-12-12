import Jobpool from "../dbConfig/jobsDb";

export interface IdleTimeResult {
    MACHINE_USED: string;
    total_pass_time_seconds: number;
    total_wash_time_seconds: number;
    total_run_time_seconds: number;
    total_down_time_seconds: number;
    all_pause_reasons: string;
}

export interface RawIdleTimeData {
    cid: string;
    MACHINE_USED: string;
    total_pass_time_seconds: any;
    total_wash_time_seconds: any;
    total_run_time_seconds: any;
    total_down_time_seconds: any;
    all_pause_reasons: string;
}

export class IdleTimeModel {
    static async getIdleTime(timeFilter: string): Promise<IdleTimeResult[]> {
        let dateCondition = "";

        // Build time filter condition
        if (timeFilter === "Today") {
            dateCondition = `od.PASS_START_TIME >= CONCAT(CURDATE(), ' 00:00:00')
                   AND od.PASS_START_TIME < CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')`;
        } else if (timeFilter === "Yesterday") {
            dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')
                   AND od.PASS_START_TIME < CONCAT(CURDATE(), ' 00:00:00')`;
        } else if (timeFilter === "This Week") {
            dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), ' 00:00:00')
                   AND od.PASS_START_TIME < CONCAT(DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL 1 DAY), ' 00:00:00')`;
        } else if (timeFilter === "Last Week") {
            dateCondition = `od.PASS_START_TIME >= CONCAT(DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY), ' 00:00:00')
                   AND od.PASS_START_TIME < CONCAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), ' 00:00:00')`;
        } else {
            // Default to today if no valid time filter
            dateCondition = `od.PASS_START_TIME >= CONCAT(CURDATE(), ' 00:00:00')
                   AND od.PASS_START_TIME < CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')`;
        }

        // Always filter for these specific machines
        const machineCondition = `od.MACHINE_USED IN ('RYOBI 3', 'RYOBI2', 'KOMORI')`;

        // Combine conditions
        const whereClause = `WHERE ${dateCondition} AND ${machineCondition}`;

        const query = `
            SELECT 
                od.cid,
                od.MACHINE_USED,

                /* --- TOTAL PASS TIME --- */
                SUM(
                    CASE 
                        WHEN od.PASS_START_TIME IS NULL OR od.PASS_STOP_TIME IS NULL 
                        THEN 0
                        ELSE TIMESTAMPDIFF(SECOND, od.PASS_START_TIME, od.PASS_STOP_TIME)
                    END
                ) AS total_pass_time_seconds,

                /* --- TOTAL WASH TIME --- */
                SUM(
                    CASE 
                        WHEN od.WASH_START_TIME IS NULL OR od.WASH_END_TIME IS NULL 
                             OR od.WASH_START_TIME = '0000-00-00 00:00:00'
                             OR od.WASH_END_TIME = '0000-00-00 00:00:00'
                        THEN 0
                        ELSE TIMESTAMPDIFF(SECOND, od.WASH_START_TIME, od.WASH_END_TIME)
                    END
                )
                +
                SUM(
                    CASE 
                        WHEN od.postWashtimeStart IS NULL OR od.postWashtimeEnd IS NULL 
                             OR od.postWashtimeStart = '0000-00-00 00:00:00'
                             OR od.postWashtimeEnd = '0000-00-00 00:00:00'
                        THEN 0
                        ELSE TIMESTAMPDIFF(SECOND, od.postWashtimeStart, od.postWashtimeEnd)
                    END
                ) AS total_wash_time_seconds,

                /* --- TOTAL RUNTIME = pass time + wash time --- */
                (
                    SUM(
                        CASE 
                            WHEN od.PASS_START_TIME IS NULL OR od.PASS_STOP_TIME IS NULL 
                            THEN 0
                            ELSE TIMESTAMPDIFF(SECOND, od.PASS_START_TIME, od.PASS_STOP_TIME)
                        END
                    )
                    +
                    SUM(
                        CASE 
                            WHEN od.WASH_START_TIME IS NULL OR od.WASH_END_TIME IS NULL 
                                 OR od.WASH_START_TIME = '0000-00-00 00:00:00'
                                 OR od.WASH_END_TIME = '0000-00-00 00:00:00'
                            THEN 0
                            ELSE TIMESTAMPDIFF(SECOND, od.WASH_START_TIME, od.WASH_END_TIME)
                        END
                    )
                    +
                    SUM(
                        CASE 
                            WHEN od.postWashtimeStart IS NULL OR od.postWashtimeEnd IS NULL 
                                 OR od.postWashtimeStart = '0000-00-00 00:00:00'
                                 OR od.postWashtimeEnd = '0000-00-00 00:00:00'
                            THEN 0
                            ELSE TIMESTAMPDIFF(SECOND, od.postWashtimeStart, od.postWashtimeEnd)
                        END
                    )
                ) AS total_run_time_seconds,

                /* --- TOTAL DOWN TIME --- */
                SUM(COALESCE(p.duration, 0)) AS total_down_time_seconds,

                GROUP_CONCAT(p.reason SEPARATOR ', ') AS all_pause_reasons

            FROM OFFSET_DEPT_details od
            LEFT JOIN PauseLogs p 
                ON od.cid = p.cid
            ${whereClause}
            GROUP BY 
                od.cid, 
                od.MACHINE_USED
        `;

        try {
            // Execute the query using your database connection
            const [rows] = await Jobpool.execute(query);
            
            // Aggregate the results by machine
            const aggregatedResults = this.aggregateByMachine(rows as RawIdleTimeData[]);

            return aggregatedResults;
        } catch (error) {
            console.error('Error executing idle time query:', error);
            throw new Error('Failed to fetch idle time data');
        }
    }

    private static aggregateByMachine(rawData: RawIdleTimeData[]): IdleTimeResult[] {
        const machineMap = new Map<string, IdleTimeResult>();

        for (const row of rawData) {
            const machine = row.MACHINE_USED;
            
            if (!machineMap.has(machine)) {
                machineMap.set(machine, {
                    MACHINE_USED: machine,
                    total_pass_time_seconds: 0,
                    total_wash_time_seconds: 0,
                    total_run_time_seconds: 0,
                    total_down_time_seconds: 0,
                    all_pause_reasons: ''
                });
            }

            const machineData = machineMap.get(machine)!;
            
            // Convert string values to numbers safely
            const parseTimeValue = (value: any): number => {
                if (typeof value === 'number') return value;
                if (typeof value === 'string') {
                    // If it's a very large number string, it's likely invalid
                    const num = parseFloat(value);
                    if (isNaN(num) || num > 86400 * 365) { // More than a year in seconds is unreasonable
                        console.warn(`Invalid time value for ${machine}: ${value}, using 0`);
                        return 0;
                    }
                    return num;
                }
                return 0;
            };

            // Sum all the numeric values with safe parsing
            machineData.total_pass_time_seconds += parseTimeValue(row.total_pass_time_seconds);
            machineData.total_wash_time_seconds += parseTimeValue(row.total_wash_time_seconds);
            machineData.total_run_time_seconds += parseTimeValue(row.total_run_time_seconds);
            machineData.total_down_time_seconds += parseTimeValue(row.total_down_time_seconds);
            
            // Concatenate pause reasons (avoid duplicates)
            if (row.all_pause_reasons) {
                const existingReasons = machineData.all_pause_reasons ? machineData.all_pause_reasons.split(', ') : [];
                const newReasons = row.all_pause_reasons.split(', ');
                const allReasons = [...new Set([...existingReasons, ...newReasons])].filter(reason => reason.trim() !== '');
                machineData.all_pause_reasons = allReasons.join(', ');
            }
        }

        // Log the results for debugging
        const results = Array.from(machineMap.values());
        console.log('Processed Machine Data:', results);
        
        return results;
    }
}