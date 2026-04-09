# API Documentation

## 1. Employee Module

---

### Endpoint: GET /employees

* Controller Function: `getEmployees` (in `employeeController.ts`)
* Required Params:
  * none

* Optional Query Params:
  * floor (string) → Valid values: "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor", "all" (Default: "all")

* Response:
  * JSON (Array of employees)

* Error Cases:
  * 400 → "Invalid floor parameter"

---

### Endpoint: GET /employees/:id

* Controller Function: `getEmployee` (in `employeeController.ts`)
* Required Path Params:
  * id (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Employee data)

* Error Cases:
  * 400 → "Employee ID is required"

---

### Endpoint: POST /employees

* Controller Function: `createEmp` (in `employeeController.ts`)
* Required Body Fields:
  * Array of employees or a single employee object

* Optional Params:
  * none

* Response:
  * JSON (Result of employee creation)

* Error Cases:
  * 500 → "Internal server error"

---

### Endpoint: PUT /employees/:id

* Controller Function: `updateEmp` (in `employeeController.ts`)
* Required Path Params:
  * id (string) → REQUIRED

* Required Body Fields:
  * Employee fields to update

* Optional Params:
  * none

* Response:
  * JSON (Update result)

* Error Cases:
  * 400 → "Employee ID is required"

---

### Endpoint: DELETE /employees/:id

* Controller Function: `deleteEmp` (in `employeeController.ts`)
* Required Path Params:
  * id (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Deletion result)

* Error Cases:
  * 400 → "Employee ID is required"

---

### Endpoint: GET /employees/overtime/list

* Controller Function: `getEmployeesOvertime` (in `employeeController.ts`)
* Required Query Params:
  * none

* Optional Query Params:
  * division (string) → Valid options: "Accounts", "Admin", etc.
  * timeFilter (string) → Default: "Today"
  * startDate (string) → Format: YYYY-MM-DD
  * endDate (string) → Format: YYYY-MM-DD

* Response:
  * JSON (List of employees with overtime data)

* Error Cases:
  * 400 → "Custom date range requires both startDate and endDate parameters"
  * 400 → "Invalid date format. Use YYYY-MM-DD format for dates"
  * 400 → "startDate must be before or equal to endDate"

---

### Endpoint: POST /employees/attendance/by-ids

* Controller Function: `getAttendanceByIdsController` (in `employeeController.ts`)
* Required Body Fields:
  * attendanceIds (array) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (success status, total length, data)

* Error Cases:
  * 400 → "attendanceIds must be a non-empty array."

---

### Endpoint: POST /employees/sync-global-locations

* Controller Function: `syncLocationController` (in `employeeController.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON (Success message)

* Error Cases:
  * 500 → "Failed to sync"

---

## 2. Dashboard Module

---

### Endpoint: GET /api/dashboard/stats

* Controller Function: `getAttendanceStatistics` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Attendance statistics)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/present

* Controller Function: `getPresentEmployeesList` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (List of present employees)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/absent

* Controller Function: `getAbsentEmployeesList` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (List of absent employees)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/on-time

* Controller Function: `getOnTimeEmployeesList` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (List of on-time employees)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/late

* Controller Function: `getLateEmployeesList` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (List of late employees)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/no-clock-out

* Controller Function: `getNoClockOutEmployeesList` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (List of employees who didn't clock out)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."

---

### Endpoint: GET /api/dashboard/most-on-time

* Controller Function: `getMostOnTimeEmployee` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Employee(s) with most on-time arrivals)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."
  * 400 → "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"

---

### Endpoint: GET /api/dashboard/most-missing-clock-out

* Controller Function: `getMostMissingClockOutEmployee` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Employee(s) with most missing clock outs)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."
  * 400 → "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"

---

### Endpoint: GET /api/dashboard/most-late

* Controller Function: `getMostLateEmployee` (in `dashboardController.ts`)
* Required Query Params:
  * floor (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Employee(s) who are most frequently late)

* Error Cases:
  * 400 → "Floor and timeFilter are required parameters"
  * 400 → "Invalid timeFilter. Must be one of \"today\", \"yesterday\", \"this week\", \"last week\", or a date range in \"YYYY-MM-DD_to_YYYY-MM-DD\" format."
  * 400 → "Invalid floor parameter. Must be one of: 'all', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor'"

---

### Endpoint: GET /api/dashboard/monday-friday-absent

* Controller Function: `getMostMondayFridayAbsentByDivisionController` (in `dashboardController.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON (Most Monday/Friday absent employees grouped by division)

* Error Cases:
  * 500 → "Failed to fetch Monday/Friday absent employee data"

---

### Endpoint: GET /api/dashboard/proof-ctp-stats

* Controller Function: `getProofCTPAttendanceStatsController` (in `dashboardController.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON (Proof Dept & CTP attendance stats for last 30 days)

* Error Cases:
  * 500 → "Failed to fetch Proof/CTP attendance statistics"

---

## 3. Production / Utilization

---

### Endpoint: GET /api/utilization/:machine/:timeFilter

* Controller Function: `ProductionController.getEmployeeUtilization` (in `ProductionController.ts`)
* Required Path Params:
  * machine (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Employee utilization for specified machine and time duration)

* Error Cases:
  * 400 → "Machine and timeFilter parameters are required"
  * 400 → "Invalid machine. Must be one of: KOMORI, RYOBI2, RYOBI 3"
  * 400 → "Invalid timeFilter. Must be one of: Today, Yesterday, This Week, Last Week, Two Weeks Ago OR a custom date range in format YYYY-MM-DD_to_YYYY-MM-DD"
  * 404 → "No production data found for the specified machine and time period"

---

### Endpoint: GET /api/overtime/:machine/:timeFilter

* Controller Function: `ProductionController.getOvertimeWithJobs` (in `ProductionController.ts`)
* Required Path Params:
  * machine (string) → REQUIRED
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Overtime metrics with jobs for given machine and timeFilter)

* Error Cases:
  * 400 → "Machine and timeFilter parameters are required"
  * 400 → "Invalid machine. Must be one of: KOMORI, RYOBI2, RYOBI 3"
  * 400 → "Invalid timeFilter. Must be one of: Today, Yesterday, This Week, Last Week, Two Weeks Ago OR a custom date range in format YYYY-MM-DD_to_YYYY-MM-DD"

---

## 4. Machine Idle Module

---

### Endpoint: GET /api/machine-idle

* Controller Function: `getMachineWiseIdle` (in `machineIdleController.ts`)
* Required Params:
  * none

* Optional Query Params:
  * timeFilter (string) → Default: "Today"

* Response:
  * JSON (Machine wise idle data)

* Error Cases:
  * 500 → "Server error"

---

## 5. Overtime Module

---

### Endpoint: GET /api/overtimeRouter/top-overtime/:timeFilter

* Controller Function: `getTopJobTitlesByOvertime` (in `OverTimeController.ts`)
* Required Path Params:
  * timeFilter (string) → REQUIRED

* Optional Params:
  * none

* Response:
  * JSON (Top 5 job titles by overtime)

* Error Cases:
  * 400 → "timeFilter parameter is required"

---

### Endpoint: GET /api/overtimeRouter/max

* Controller Function: `getOverTimeMax` (in `OverTimeController.ts`)
* Required Params:
  * none

* Optional Query Params:
  * timeFilter (string) → Default: "Today"

* Response:
  * JSON (Max overtime statistics)

* Error Cases:
  * 500 → "Internal server error"

---

### Endpoint: GET /api/overtimeRouter/weekly-summary

* Controller Function: `getWeeklyOvertimeSummary` (in `OverTimeController.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON (Last 30 days weekly overtime summary)

* Error Cases:
  * 500 → "Internal server error"

---

### Endpoint: GET /api/overtimeRouter/max-attendance-min-hours

* Controller Function: `getMaxAttendanceMinHoursHandler` (in `OverTimeController.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON (Max attendance minimum hours for CTP and Proof Dept divisions)

* Error Cases:
  * 404 → "No data found for CTP and Proof Dept divisions"

---

## 6. Night Shift Module

---

### Endpoint: GET /api/night-shifts

* Controller Function: `nightShiftController` (in `NightShiftController.ts`)
* Required Params:
  * none

* Optional Query Params:
  * timeFilter (string) → Default: "Today"

* Response:
  * JSON (Night shifts data)

* Error Cases:
  * 500 → "Internal server error"

---

## 7. App System / Docker

---

### Endpoint: GET /health

* Controller Function: Inline handler (in `server.ts`)
* Required Params:
  * none

* Optional Params:
  * none

* Response:
  * JSON ({ status: "ok" })

* Error Cases:
  * none

---
