import axios from "axios";
import crypto from "crypto";
import pool from "../dbConfig/dbConfig";

const company = process.env.KEKA_COMPANY;
const environment = process.env.KEKA_ENVIRONMENT;

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface LeaveSelection {
  leaveTypeName: string;
  count: number;
}

interface KekaLeaveRequest {
  employeeIdentifier: string;
  employeeNumber: string;
  fromDate: string;
  toDate: string;
  note: string | null;
  status: string;
  selection: LeaveSelection[];
}

interface KekaLeaveBalance {
  employeeIdentifier: string;
  employeeNumber: string;
  employeeName: string;
  leaveBalance: {
    leaveTypeName: string;
    availableBalance: number;
  }[];
}

interface KekaPagedResponse<T> {
  data: T[];
  totalPages: number;
  succeeded: boolean;
}

// ─── Fetch & Store Leave Requests ────────────────────────────────────────────

export const collectLeaveRequests = async (token: string): Promise<{ inserted: number; errors: number }> => {
  if (!company || !environment) {
    throw new Error("KEKA_COMPANY or KEKA_ENVIRONMENT environment variables are not set");
  }

  let inserted = 0;
  let errors = 0;
  let currentPage = 1;
  let totalPages = 1;

  do {
    const url = `https://${company}.${environment}.com/api/v1/time/leaverequests?pageNumber=${currentPage}&pageSize=100`;

    const response = await axios.get<KekaPagedResponse<KekaLeaveRequest>>(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    const { data, totalPages: pages } = response.data;
    totalPages = pages;

    for (const req of data) {
      try {
        for (const sel of req.selection ?? []) {
          // Generate a stable unique ID: hash of employee + fromDate + leaveType
          // keka_leave_requests.id is VARCHAR(100) NOT NULL with no default
          const uniqueKey = `${req.employeeIdentifier}_${req.fromDate}_${sel.leaveTypeName}`;
          const rowId = crypto.createHash("md5").update(uniqueKey).digest("hex");

          await pool.query(
            `INSERT INTO keka_leave_requests
              (id, employee_identifier, employee_number, from_date, to_date, leave_type_name, leave_days, reason, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               leave_days = VALUES(leave_days),
               reason     = VALUES(reason),
               status     = VALUES(status)`,
            [
              rowId,
              req.employeeIdentifier,
              req.employeeNumber,
              req.fromDate ? req.fromDate.split("T")[0] : null,
              req.toDate   ? req.toDate.split("T")[0]   : null,
              sel.leaveTypeName,
              sel.count,
              req.note || null,
              req.status,
            ]
          );
          inserted++;
        }
      } catch (err: any) {
        console.error(` Error inserting leave request for ${req.employeeIdentifier}:`, err.message);
        errors++;
      }
    }

    currentPage++;
    await new Promise((r) => setTimeout(r, 300));
  } while (currentPage <= totalPages);

  return { inserted, errors };
};

// ─── Fetch & Store Leave Balances ────────────────────────────────────────────

export const collectLeaveBalances = async (token: string): Promise<{ inserted: number; errors: number }> => {
  if (!company || !environment) {
    throw new Error("KEKA_COMPANY or KEKA_ENVIRONMENT environment variables are not set");
  }

  let inserted = 0;
  let errors = 0;
  let currentPage = 1;
  let totalPages = 1;

  do {
    // Keka leave balance endpoint
    const url = `https://${company}.${environment}.com/api/v1/time/leavebalance?pageNumber=${currentPage}&pageSize=100`;
    console.log(` Fetching leave balances: ${url}`);

    const response = await axios.get<KekaPagedResponse<KekaLeaveBalance>>(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    const { data, totalPages: pages } = response.data;
    totalPages = pages;

    for (const emp of data) {
      try {
        // Clear existing balances for this employee before re-inserting (fresh snapshot)
        await pool.query(
          `DELETE FROM keka_leave_balance WHERE employee_identifier = ?`,
          [emp.employeeIdentifier]
        );

        for (const bal of emp.leaveBalance ?? []) {
          await pool.query(
            `INSERT INTO keka_leave_balance
              (employee_identifier, employee_number, employee_name, leave_type_name, available_balance)
             VALUES (?, ?, ?, ?, ?)`,
            [
              emp.employeeIdentifier,
              emp.employeeNumber,
              emp.employeeName,
              bal.leaveTypeName,
              bal.availableBalance,
            ]
          );
          inserted++;
        }
      } catch (err: any) {
        console.error(` Error inserting leave balance for ${emp.employeeIdentifier}:`, err.message);
        errors++;
      }
    }

    currentPage++;
    await new Promise((r) => setTimeout(r, 300));
  } while (currentPage <= totalPages);

  return { inserted, errors };
};

// ─── Combined Entry Point ─────────────────────────────────────────────────────

export const collectAllLeaveData = async (token: string): Promise<{
  requests: { inserted: number; errors: number };
  balances: { inserted: number; errors: number };
}> => {
  // Run sequentially so a failure in one does not abort the other
  let requests = { inserted: 0, errors: 0 };
  let balances = { inserted: 0, errors: 0 };

  try {
    requests = await collectLeaveRequests(token);
  } catch (err: any) {
    console.error(" collectLeaveRequests failed:", err.message);
    requests = { inserted: 0, errors: 1 };
  }

  try {
    balances = await collectLeaveBalances(token);
  } catch (err: any) {
    console.error(" collectLeaveBalances failed:", err.message);
    balances = { inserted: 0, errors: 1 };
  }

  return { requests, balances };
};
