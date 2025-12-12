<table style="border-collapse: collapse; border: none;">
  <tr>
    <td>
      <a href="https://employees.sequoia-print.com/">
        <img src="https://voicemsgsequoia.s3.ap-south-1.amazonaws.com/sequiaPrintLogo.png" alt="Sequoia Print Logo" width="500"/>
      </a>
    </td>
    <td>

### About Sequoia Employee Hub

Sequoia Employee Hub is the attendance server for Sequoia Print, a next-generation printing and packaging innovation company.
The server is built with **Node.js** and **TypeScript** for strong type safety, and is fully containerized using **Docker**.
For external attendance data integration, it seamlessly connects with the KEKA HR API. For **cache** using **Redis**. 

    
  </tr>
</table>

---

### ⚙️ Development Note

This server is intended to be run in development mode on `localhost:5080`. Accessing it from other origins without the proper CORS headers may result in CORS errors.

### 🧰 Tech Stack Used

<table style="border-collapse: collapse; border: none; text-align: center; width: 100%;">
  <tr>
    <td>
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Node.js_logo.svg/250px-Node.js_logo.svg.png" alt="Nodejs" width="100"/><br/>
      <strong>Node.js</strong><br/>
      <div>
        <a href="https://nodejs.org/docs/latest/api/" target="_blank">📘 Docs</a> · 
        <a href="https://github.com/nodejs/node" target="_blank">🔗 GitHub</a>
      </div>
    </td>
    <td>
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Typescript.svg/250px-Typescript.svg.png" alt="TypeScript" width="65"/><br/>
      <strong>TypeScript</strong><br/>
      <div>
        <a href="https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html" target="_blank">📘 Docs</a> · 
        <a href="https://github.com/microsoft/TypeScript" target="_blank">🔗 GitHub</a>
      </div>
    </td>
    <td>
      <img src="https://cdn.clever-cloud.com/uploads/2023/08/redis-color.png" alt="Redis" width="75"/><br/>
      <strong>Redis</strong><br/>
      <div>
        <a href="https://redis.io/docs/latest/" target="_blank">📘 Docs</a> · 
        <a href="https://github.com/redis/redis" target="_blank">🔗 GitHub</a>
      </div>
    </td>
    <td>
      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Docker_Logo.svg/250px-Docker_Logo.svg.png" alt="Docker" width="205" height="65"/><br/>
      <strong>Docker</strong><br/>
      <div>
        <a href="https://docs.docker.com/" target="_blank">📘 Docs</a> · 
        <a href="https://github.com/docker" target="_blank">🔗 GitHub</a>
      </div>
    </td>
  </tr>
</table>


## 📦 Installation & Setup

### **1️⃣ Clone the Repository**

```sh
git clone <your-repo-url>
cd <your-project-folder>
```

---

### **2️⃣ Install Dependencies**

```sh
npm install
```

---

### **3️⃣ Environment Setup**

Create a `.env` file **in the same directory as `server.ts`**.

Example:

```
.env
server.ts
src/
package.json
...
```

Add your correct environment variables inside `.env`.

---

### **4️⃣ Run the Server**

#### ▶️ **Development Mode**

```sh
npm run dev
```

---

#### 🚀 **Production Mode (Docker)**

Make sure Docker & Docker Compose are installed, then run:

```sh
docker compose up -d
```

This builds and starts the server in detached mode.

---




# 🗄️ Database & Redis Configuration

This project uses **MySQL** for primary data storage and **Redis** for caching and session management. Configuration is handled via environment variables.

---

## 📦 MySQL Database

We use `mysql2/promise` with connection pooling for efficient database operations.

<details>
<summary><strong>Database Configuration</strong></summary>

### Files:
- `dbConfig.ts` – Main application database
- `jobsDb.ts` – Dedicated database for job/queue processing

### Key Features:
- **Connection Pooling**: Limits connections to 10 (`connectionLimit: 10`) with no queue limit
- **SSL Support**: Enforced with `rejectUnauthorized: false`
- **Timezone Handling**: Configurable via `DB_TIMEZONE` environment variable
- **Environment-Based**: All credentials loaded from `.env`

### Required Environment Variables:
```env
DB_HOST=your_database_host
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_database_name
JOB_DB_NAME=your_jobs_database_name
DB_TIMEZONE=UTC
```

### Usage Example:
```typescript
import pool from "./dbConfig";
const [rows] = await pool.query("SELECT * FROM users");
```

</details>

---

## 🎯 Redis Cache

We use `ioredis` for Redis connectivity with optional TLS support.

<details>
<summary><strong>Redis Configuration</strong></summary>

### File:
- `redis.ts` – Redis client configuration

### Key Features:
- **TLS Support**: Conditionally enabled via `REDIS_TLS` environment variable
- **Authentication**: Supports username/password authentication
- **Type Safety**: Port converted to number, boolean handling for TLS

### Required Environment Variables:
```env
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_USERNAME=your_redis_username
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true/false
```

### Usage Example:
```typescript
import redis from "./redis";
await redis.set("key", "value");
const data = await redis.get("key");
```

</details>

---

## ⚙️ Environment Setup

1. Copy `.env.example` to `.env` (if available)
2. Fill in your database and Redis credentials
3. Ensure both MySQL and Redis services are running
4. For production, adjust `connectionLimit` and Redis settings as needed

---

# 🔐 Keka Token Management System

This system handles authentication token management for the Keka HRM API with automatic refresh and caching.

---

## 🎯 Token Flow Overview

<details>
<summary><strong>Token Lifecycle Diagram</strong></summary>

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Express   │────▶│  Middleware │────▶│     API    │
│   Request   │     │   (Check)   │     │   Routes    │
└─────────────┘     └─────────────┘     └─────────────┘
                         │                      │
                         ▼                      ▼
               ┌─────────────────┐    ┌─────────────────┐
               │  Memory Cache   │    │  Use Token in   │
               │  (accessToken)  │    │  Keka API Calls │
               └─────────────────┘    └─────────────────┘
                         │
                         ▼
               ┌─────────────────┐
               │   Redis Cache   │
               │  (24h TTL)      │
               └─────────────────┘
                         │
                         ▼
               ┌─────────────────┐
               │  Keka Auth API  │
               │  (Token Fetch)  │
               └─────────────────┘
```

</details>

---

##  Token Fetching (`kekaToken.ts`)

<details>
<summary><strong>Core Token Fetch Function</strong></summary>

```typescript
export const fetchKekaToken = async (): Promise<string> => {
  const params = new URLSearchParams();
  params.append("grant_type", "kekaapi");
  params.append("scope", "kekaapi");
  params.append("client_id", process.env.KEKA_CLIENT_ID!);
  params.append("client_secret", process.env.KEKA_CLIENT_SECRET!);
  params.append("api_key", process.env.KEKA_API_KEY!);

  const response = await axios.post(
    "https://login.keka.com/connect/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const token = response.data.access_token;
  
  // Store in memory and Redis
  accessToken = token;
  await redis.setex("keka_access_token", 86400, token); // 24 hours
  
  return token;
};
```

**Key Points:**
- Uses OAuth 2.0 client credentials flow with `grant_type=kekaapi`
- Stores token in both memory (`accessToken`) and Redis with 24-hour TTL
- Requires three credentials: `KEKA_CLIENT_ID`, `KEKA_CLIENT_SECRET`, `KEKA_API_KEY`

</details>

---

## 🛡️ Express Middleware

<details>
<summary><strong>Token Middleware Implementation</strong></summary>

```typescript
export const kekaTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Check memory cache first
    if (accessToken) {
      req.kekaToken = accessToken;
      return next();
    }

    // 2. Check Redis cache
    const redisToken = await redis.get("keka_access_token");
    if (redisToken) {
      accessToken = redisToken;
      req.kekaToken = accessToken;
      return next();
    }

    // 3. Fetch new token if not in cache
    const newToken = await fetchKekaToken();
    req.kekaToken = newToken;
    next();
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to get Keka access token",
      message: "Check Keka credentials configuration"
    });
  }
};
```

**Three-Level Cache Strategy:**
1. **Memory Cache** – Fastest, per-process
2. **Redis Cache** – Shared across instances, 24h persistence
3. **API Fetch** – Last resort if cache is empty

**TypeScript Extension:**
```typescript
declare global {
  namespace Express {
    interface Request {
      kekaToken?: string; // Adds kekaToken to all Express requests
    }
  }
}
```

</details>

---

## ⏰ Automatic Refresh Scheduler

<details>
<summary><strong>Token Refresh Scheduling</strong></summary>

```typescript
export const scheduleTokenRefresh = async () => {
  // Initial token fetch on startup
  const redisToken = await redis.get("keka_access_token");
  if (!redisToken) {
    await fetchKekaToken();
  }

  // Main refresh: 7:00 AM IST daily
  cron.schedule("0 7 * * *", async () => {
    await fetchKekaToken();
  }, { timezone: "Asia/Kolkata" });

  // Safety refresh: 6:50 AM IST daily (10 minutes before)
  cron.schedule("50 6 * * *", async () => {
    await fetchKekaToken();
  }, { timezone: "Asia/Kolkata" });
};
```

**Schedule Details:**
- **6:50 AM IST** – Safety refresh (handles API failures)
- **7:00 AM IST** – Main refresh (ensures fresh token for business hours)
- **Initial Fetch** – On server startup if no token exists in Redis

**Why Two Refreshes?**
- Ensures token is always fresh during peak usage hours
- Provides fallback if 7:00 AM refresh fails
- Matches Keka's typical token expiration patterns

</details>

---

## 🚀 Server Integration

<details>
<summary><strong>Server Initialization</strong></summary>

```typescript
// In server.ts startup
scheduleTokenRefresh();

// Middleware usage in routes
app.use("/employees", kekaTokenMiddleware, employeeRoutes);
// OR apply globally to specific route groups
```

**Startup Flow:**
1. Server starts and calls `scheduleTokenRefresh()`
2. Checks Redis for existing token
3. Fetches new token if missing
4. Sets up two daily cron jobs (6:50 AM & 7:00 AM IST)
5. All protected routes get token via middleware

</details>

---

## 📋 Required Environment Variables

```env
KEKA_CLIENT_ID=your_client_id
KEKA_CLIENT_SECRET=your_client_secret
KEKA_API_KEY=your_api_key
REDIS_HOST=localhost
REDIS_PORT=6379
# ... other Redis/DB configs
```

---

## 🛠️ Usage in API Routes

```typescript
// In any route handler with the middleware
app.get("/api/keka-data", kekaTokenMiddleware, async (req, res) => {
  const token = req.kekaToken; // Token is automatically available
  // Use token to call Keka APIs...
});
```

---

##  Token Storage Layers

| Layer | Duration | Purpose |
|-------|----------|---------|
| **Memory** | Process lifetime | Fastest access, resets on server restart |
| **Redis** | 24 hours | Persistence across restarts, shared between instances |
| **Keka API** | N/A | Source of truth, fetched when cache is empty |

This multi-layer approach ensures high availability and performance while maintaining security through regular token rotation.


---

# 👥 Employee Management System

This system synchronizes employee data between Keka HRM and the local database with intelligent matching and rate limiting.

---

## 🎯 System Overview

<details>
<summary><strong>Employee Sync Flow Diagram</strong></summary>

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Scheduler  │────▶│  Keka API       │────▶│  Redis     │
│  (7:00 AM)  │     │  (Rate Limited) │     │  (23h TTL)  │
└─────────────┘     └─────────────────┘     └─────────────┘
                         │                         │
                         ▼                         ▼
               ┌─────────────────┐     ┌─────────────────┐
               │  Name Matching  │────▶│  Local DB       │
               │  Algorithm      │     │  (Updates Only) │
               └─────────────────┘     └─────────────────┘
```

**Key Features:**
- Rate-limited Keka API calls (40/min)
- Intelligent name matching across multiple variations
- Redis caching for 23 hours
- Database updates only (no inserts)
- Resume capability on interruption

</details>

---

## ⏰ Scheduling System

<details>
<summary><strong>Automatic Sync Schedule</strong></summary>

```typescript
// employeeScheduler.ts
export const scheduleEmployeeCollection = (): void => {
  // Initial sync (10 seconds after startup)
  setTimeout(async () => {
    await triggerEmployeeCollection();
  }, 10000);

  // Regular syncs at specific times
  cron.schedule("0 7 * * *", async () => {  // 7:00 AM IST
    await collectAndSyncEmployees();
  }, { timezone: "Asia/Kolkata" });

  cron.schedule("30 7 * * *", async () => { // 7:30 AM IST (backup)
    await collectAndSyncEmployees();
  }, { timezone: "Asia/Kolkata" });

  cron.schedule("0 12 * * *", async () => { // 12:00 PM IST (midday)
    await collectAndSyncEmployees();
  }, { timezone: "Asia/Kolkata" });
};
```

**Schedule Summary:**
- **Server Start +10s** – Initial sync
- **7:00 AM IST** – Daily sync
- **7:30 AM IST** – Backup sync
- **12:00 PM IST** – Midday sync

</details>

---

##  Rate Limiting System

<details>
<summary><strong>Smart Rate Limiting Implementation</strong></summary>

```typescript
const MAX_CALLS_PER_MINUTE = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

interface EmployeeRateLimitState {
  count: number;
  currentPage: number;
  totalPages: number;
  resetTime: number;
  lastProcessedPage: number;
}

// Rate limit check before each API call
if (rateLimitState.count >= MAX_CALLS_PER_MINUTE) {
  console.log(`⏸️ Rate limit reached, pausing for 1 minute...`);
  
  // Save state for resumption
  await saveEmployeeRateLimitState(rateLimitState);
  await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW_MS));
  
  // Reset and continue
  rateLimitState.count = 0;
  rateLimitState.resetTime = Date.now();
}
```

**Features:**
- Tracks API calls per minute
- Automatically pauses when limit reached
- Saves progress to Redis for resumption
- Resets after 1 minute wait

</details>

---

## 🔍 Intelligent Name Matching

<details>
<summary><strong>Multi-Strategy Name Matching</strong></summary>

```typescript
const findMatchingKekaEmployee = (dbName: string, kekaEmployees: KekaEmployee[]): KekaEmployee | null => {
  const normalizedDbName = dbName.trim().toLowerCase();
  
  // Try multiple name combinations from Keka data
  const nameCombinations = [
    // Combination 1: firstName + lastName
    `${kekaEmp.firstName} ${kekaEmp.lastName}`.toLowerCase(),
    
    // Combination 2: firstName + middleName + lastName
    kekaEmp.middleName ? `${kekaEmp.firstName} ${kekaEmp.middleName} ${kekaEmp.lastName}`.toLowerCase() : '',
    
    // Combination 3: displayName
    kekaEmp.displayName?.toLowerCase() || '',
    
    // Combination 4: lastName, firstName (reverse order)
    `${kekaEmp.lastName} ${kekaEmp.firstName}`.toLowerCase(),
  ];

  // Check for name variations
  const variations: { [key: string]: string[] } = {
    'soumen': ['somen'],
    'subham': ['shubham', 'shubom'],
    'prosenjit': ['prasenjit', 'proshonjit'],
  };

  // Manual mapping for known discrepancies
  const nameMappings: { [dbName: string]: string } = {
    'soumen ghoshal': 'somen ghoshal',
  };
};
```

**Matching Strategies:**
1. **Exact match** – Case-insensitive comparison
2. **Name combinations** – Different formats from Keka
3. **Known variations** – Common spelling differences
4. **Manual mappings** – Hardcoded corrections

</details>

---

## 🗃️ Database Sync Logic

<details>
<summary><strong>Update-Only Database Sync</strong></summary>

```typescript
const syncEmployeesWithDatabase = async (kekaEmployees: KekaEmployee[], dbEmployees: DatabaseEmployee[]): Promise<void> => {
  for (const dbEmployee of dbEmployees) {
    // Find matching Keka employee
    const matchingKekaEmployee = findMatchingKekaEmployee(dbEmployee.name, kekaEmployees);
    
    if (matchingKekaEmployee) {
      // Convert date format
      const mysqlDate = convertToMySQLDate(matchingKekaEmployee.dateOfJoin);
      
      // Update only if different or empty
      const needsUpdate = 
        !dbEmployee.employee_id || 
        dbEmployee.employee_id !== matchingKekaEmployee.id || 
        dbEmployee.joining_date !== mysqlDate;
      
      if (needsUpdate) {
        await pool.query(
          "UPDATE employees SET employee_id = ?, joining_date = ? WHERE name = ?",
          [matchingKekaEmployee.id, mysqlDate, dbEmployee.name]
        );
      }
    }
  }
};
```

**Sync Rules:**
- **Updates only** – Never inserts new employees
- **Conditional updates** – Only when employee_id or date differs
- **Duplicate protection** – Checks for existing employee_id assignments
- **Resignation filter** – Ignores resigned employees from Keka

</details>

---

##  Target Group Filtering

<details>
<summary><strong>Employee Group Filtering</strong></summary>

```typescript
// Only sync employees from specific Keka groups
const targetGroupIds = [
  "6a216ce7-156b-460e-8172-3b62c0c45381", // 21 Udayan Industrial Estate
  "d6769f4b-5882-421f-9a5a-0b1d72e3371e"  // PP
];

// Filter logic in collectAndSyncEmployees
const filteredEmployees = data.data.filter(employee => 
  employee.groups && 
  employee.groups.some(group => targetGroupIds.includes(group.id)) &&
  (employee.resignationSubmittedDate === null || employee.resignationSubmittedDate === undefined)
);
```

**Filter Criteria:**
1. **Group membership** – Must be in specified Keka groups
2. **Active status** – Must not have resigned
3. **Location-based** – Targets specific company locations

</details>

---

##  Cache Strategy

<details>
<summary><strong>Redis Caching Implementation</strong></summary>

```typescript
// Store fetched data for 23 hours
await redis.setex("keka_employees_data", 23 * 60 * 60, JSON.stringify(allFilteredEmployees));

// Cache-first retrieval in getEmployeesData
export const getEmployeesData = async (): Promise<any> => {
  // Try cache first
  const cachedData = await redis.get("keka_employees_data");
  if (cachedData) {
    return { data: JSON.parse(cachedData), source: "cache" };
  }
  
  // Fallback to API
  await collectAndSyncEmployees();
  const freshData = await redis.get("keka_employees_data");
  return { data: JSON.parse(freshData), source: "api" };
};
```

**Cache Features:**
- **23-hour TTL** – Almost daily refresh
- **Graceful fallback** – Uses cache if API fails
- **Source tracking** – Identifies data source (cache/api/error)

</details>

---

## 🚀 Manual Triggers

<details>
<summary><strong>Manual Control Functions</strong></summary>

```typescript
// Trigger immediate sync
export const triggerEmployeeCollection = async (): Promise<void> => {
  console.log(" Manually triggering employee collection...");
  await collectAndSyncEmployees();
};

// Check rate limit status
export const getEmployeeRateLimitStatus = async (): Promise<{
  currentCount: number;
  maxLimit: number;
  currentPage: number;
  totalPages: number;
}> => {
  const state = await getEmployeeRateLimitState();
  return {
    currentCount: state.count,
    maxLimit: MAX_CALLS_PER_MINUTE,
    currentPage: state.currentPage,
    totalPages: state.totalPages
  };
};

// Reset rate limit
export const resetEmployeeRateLimit = async (): Promise<void> => {
  await clearEmployeeRateLimitState();
};
```

**Available Manual Controls:**
- Immediate sync trigger
- Rate limit status check
- Rate limit reset
- Error recovery via cached data

</details>

---

## ⚙️ Environment Variables Required

```env
KEKA_CLIENT_ID=your_client_id
KEKA_CLIENT_SECRET=your_client_secret
KEKA_API_KEY=your_api_key
KEKA_COMPANY=your_company_code
KEKA_ENVIRONMENT=keka_environment
```

---

# ⏱️ Attendance Collection System

This system synchronizes employee attendance data from Keka HRM API with intelligent rate limiting, resume capability, and automatic timezone conversion.

---

## 🎯 System Overview

<details>
<summary><strong>Attendance Sync Flow Diagram</strong></summary>

```
┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│   Scheduler  │────▶│   Keka API     │────▶│   UTC→IST     │
│  (Every 5min)│     │  (Per Employee)│     │   Conversion   │
└──────────────┘     └────────────────┘     └────────────────┘
                          │                         │
                          ▼                         ▼
                ┌────────────────┐     ┌────────────────┐
                │  Rate Limiting │────▶│  MySQL DB      │
                │  (40/min)      │     │  (UPSERT)      │
                └────────────────┘     └────────────────┘
                          │                         │
                          ▼                         ▼
                ┌────────────────┐     ┌────────────────┐
                │  Resume State  │◀────│  Redis Cache   │
                │  (Pause/Resume)│     │  (Progress)    │
                └────────────────┘     └────────────────┘
```

**Key Features:**
- Smart rate limiting with auto-pause/resume
- Resume from interruption capability
- UTC to IST timezone conversion
- Intelligent date range calculation
- Offday tracking support

</details>

---

## ⏰ Scheduling System

<details>
<summary><strong>Automatic Sync Schedule</strong></summary>

```typescript
// attendanceScheduler.ts
export const scheduleAttendanceCollection = (): void => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`🕙 Running scheduled attendance collection...`);
    await collectAndSyncAttendance();
  });
};

// Manual trigger for first-time sync
export const manualAttendanceSync = async (): Promise<void> => {
  console.log(' Manually triggering attendance sync...');
  await collectAndSyncAttendance();
};
```

**Schedule Summary:**
- **Every 5 minutes** – Continuous sync
- **Manual trigger** – Initial server startup sync
- **Real-time updates** – Keeps data fresh

</details>

---

## 🚦 Smart Rate Limiting

<details>
<summary><strong>Auto-Pause/Resume Rate Limiter</strong></summary>

```typescript
const MAX_CALLS_PER_MINUTE = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

interface RateLimitState {
  count: number;
  currentEmployeeIndex: number;
  currentPageNumber: number;
  resetTime: number;
  totalEmployees: number;
  currentEmployeeId: string;
  employeeIds: string[];
  isPaused: boolean; // New: Tracks pause state
}

const incrementRateLimitCountAndCheck = async (state: RateLimitState): Promise<boolean> => {
  state.count++;
  
  if (state.count >= MAX_CALLS_PER_MINUTE) {
    console.log(`⏸️ Rate limit reached. Auto-pausing for 1 minute...`);
    
    // Set pause flag and save state
    state.isPaused = true;
    await saveRateLimitState(state);
    
    // Auto-wait for 1 minute
    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    
    // Reset and resume
    state.count = 0;
    state.resetTime = Date.now();
    state.isPaused = false;
    console.log(` Auto-resume complete.`);
  }
  
  return true;
};
```

**Features:**
- **40 calls/minute** – Keka API limit
- **Auto-pause** – Automatically stops when limit reached
- **Auto-resume** – Continues after 1 minute wait
- **State persistence** – Remembers progress in Redis
- **Resume capability** – Can continue from interruption

</details>

---

## 📅 Intelligent Date Range Calculation

<details>
<summary><strong>Smart Date Window Strategy</strong></summary>

```typescript
const calculateDateRange = async (employeeId: string): Promise<{ fromDate: string; toDate: string }> => {
  const now = new Date();
  const toDate = now.toISOString().split('T')[0]; // Today
  
  // Check if employee has today's attendance record
  const [todaysRecord] = await pool.query(
    `SELECT COUNT(*) as count FROM attendance 
     WHERE employee_id = ? AND attendance_date = ?`,
    [employeeId, toDate]
  );
  
  const hasTodaysRecord = todaysRecord[0].count > 0;
  
  if (!hasTodaysRecord) {
    // First sync: Get last 2 weeks
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    fromDate = twoWeeksAgo.toISOString().split('T')[0];
    console.log(`🆕 Loading 2 weeks data for ${employeeId}`);
  } else {
    // Daily update: Get only yesterday's data
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    fromDate = yesterday.toISOString().split('T')[0];
    console.log(` Daily update for ${employeeId}`);
  }
  
  return { fromDate, toDate };
};
```

**Smart Fetching:**
- **Initial sync** – 2 weeks of historical data
- **Daily updates** – Only 24-hour window (reduces API calls)
- **Efficient** – Minimizes data transfer

</details>

---

## 🌐 Timezone Conversion (UTC→IST)

<details>
<summary><strong>Automatic Timezone Handling</strong></summary>

```typescript
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 5h 30m in milliseconds

const convertToIST = (utcTimeString: string): string | null => {
  if (!utcTimeString) return null;
  
  // Parse UTC time
  const utcTime = new Date(utcTimeString);
  
  // Add 5 hours 30 minutes for IST
  const istTime = new Date(utcTime.getTime() + IST_OFFSET_MS);
  
  // Format for MySQL: "YYYY-MM-DD HH:MM:SS"
  const istString = istTime.toISOString().slice(0, 19).replace('T', ' ');
  
  return istString;
};
```

**Converts:**
- `shiftStartTime` – UTC → IST
- `shiftEndTime` – UTC → IST
- `firstInOfTheDay` – UTC → IST
- `lastOutOfTheDay` – UTC → IST

</details>

---

## 🗃️ Database UPSERT Logic

<details>
<summary><strong>Intelligent Database Sync</strong></summary>

```typescript
const saveAttendanceData = async (attendanceData, employeeId, offdays) => {
  for (const attendance of attendanceData.data) {
    // Check if record exists
    const [existingRecord] = await pool.query(
      `SELECT id FROM attendance 
       WHERE employee_id = ? AND attendance_date = ?`,
      [employeeId, attendanceDate]
    );
    
    if (existingRecord.length > 0) {
      // UPDATE existing record
      await pool.query(`UPDATE attendance SET ... WHERE ...`);
      updatedRecords++;
    } else {
      // INSERT new record
      await pool.query(`INSERT INTO attendance ... VALUES ...`);
      newRecords++;
    }
  }
  
  return { newRecords, updatedRecords };
};
```

**Sync Features:**
- **UPSERT operations** – Updates existing, inserts new
- **Duplicate protection** – Handles `ER_DUP_ENTRY` errors
- **Offday tracking** – Marks records as offdays based on employee schedule
- **Batch processing** – Processes multiple records efficiently

</details>

---

##  Resume & Recovery System

<details>
<summary><strong>Interruption Recovery</strong></summary>

```typescript
// Rate limit state saved in Redis
interface RateLimitState {
  count: number;
  currentEmployeeIndex: number; // Where we left off
  currentPageNumber: number;    // Current page for this employee
  currentEmployeeId: string;    // Current employee being processed
  employeeIds: string[];        // All employees to process
  isPaused: boolean;           // Whether we're paused
}

// On restart, system resumes from saved position
const collectAndSyncAttendance = async (): Promise<void> => {
  let rateLimitState = await getRateLimitState();
  
  // Resume from saved position
  const startEmployeeIndex = Math.max(0, rateLimitState.currentEmployeeIndex);
  const startPageNumber = rateLimitState.currentPageNumber;
  
  console.log(` Resuming from employee ${startEmployeeIndex + 1}, page ${startPageNumber}`);
};
```

**Recovery Capabilities:**
- **Server restart** – Continues from last processed employee
- **API failure** – Skips to next employee on error
- **Rate limit pause** – Auto-resumes after 1 minute
- **Progress tracking** – Saves state after each successful page

</details>

---

## 👥 Employee Data Management

<details>
<summary><strong>Cached Employee ID System</strong></summary>

```typescript
const EMPLOYEE_IDS_CACHE_KEY = 'attendance_employee_ids_cache';

const loadEmployeeIds = async (): Promise<string[]> => {
  // Try Redis cache first (1 hour TTL)
  const cachedEmployeeIds = await redis.get(EMPLOYEE_IDS_CACHE_KEY);
  if (cachedEmployeeIds) {
    console.log(' Using cached employee IDs');
    return JSON.parse(cachedEmployeeIds);
  }
  
  // Fallback to database query
  const [employees] = await pool.query(`
    SELECT employee_id 
    FROM employees 
    WHERE employee_id IS NOT NULL AND employee_id != ''
  `);
  
  const employeeIds = employees.map(emp => emp.employee_id);
  
  // Cache for future use
  await redis.setex(EMPLOYEE_IDS_CACHE_KEY, 60 * 60, JSON.stringify(employeeIds));
  
  return employeeIds;
};
```

**Efficiency Features:**
- **Redis caching** – 1-hour TTL for employee IDs
- **Database fallback** – Always fresh data available
- **Filtered list** – Only employees with valid IDs

</details>

---

##  Offday Tracking

<details>
<summary><strong>Weekly Offday Detection</strong></summary>

```typescript
const checkIfOffday = (attendanceDate: string, offdays: string | null): boolean => {
  if (!offdays) return false;
  
  const date = new Date(attendanceDate);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  const offdayList = offdays.split(',').map(day => day.trim().toLowerCase());
  return offdayList.includes(dayName.toLowerCase());
};
```

**How it works:**
1. Each employee has `offdays` column (e.g., "Sunday,Monday")
2. System checks if attendance date matches offday
3. Marks record as `is_offday = true/false`
4. Used for reporting and calculations

</details>

---

## 🛠️ Manual Controls & Monitoring

<details>
<summary><strong>Developer Tools</strong></summary>

```typescript
// Manual trigger
export const triggerAttendanceCollection = async (): Promise<void> => {
  await collectAndSyncAttendance();
};

// Check rate limit status
export const getRateLimitStatus = async (): Promise<{
  currentCount: number;
  maxLimit: number;
  currentEmployeeIndex: number;
  timeUntilReset: number;
}> => {
  const state = await getRateLimitState();
  return {
    currentCount: state.count,
    maxLimit: MAX_CALLS_PER_MINUTE,
    currentEmployeeIndex: state.currentEmployeeIndex,
    timeUntilReset: Math.max(0, 60000 - (Date.now() - state.resetTime))
  };
};

// Reset system
export const resetRateLimit = async (): Promise<void> => {
  await clearRateLimitState();
};

// Clear cache
export const clearEmployeeIdsCache = async (): Promise<void> => {
  await redis.del(EMPLOYEE_IDS_CACHE_KEY);
};
```

**Available Controls:**
- Immediate sync trigger
- Rate limit status monitor
- System reset
- Cache clearing

</details>

---

#  Dashboard Analytics System

Comprehensive attendance analytics dashboard with filtering, statistics, and trend analysis capabilities.

---

## 🎯 **Dashboard Features**

### **1. Core Statistics**
- **Total/Present/Absent** employee counts with percentages
- **On-time/Late** arrival analysis
- **Filterable** by floor (Ground-5th) and time period (today, yesterday, this/last week)

<details>
<summary><strong>Key Statistics Calculation</strong></summary>

```typescript
// Smart percentage calculations
const presentPercentage = (presentCount / filteredCount) * 100;
const latePercentage = (lateCount / presentCount) * 100; // Only counts present employees
```

**Filters Supported:**
- Floor: `Ground Floor`, `1st Floor`, `2nd Floor`, `3rd Floor`, `4th Floor`, `5th Floor`, `all`
- Time: `today`, `yesterday`, `this week`, `last week`

</details>

---

## 👥 **Employee Categorization**

### **Five Employee Types:**
1. **Present** – Clocked in successfully
2. **Absent** – No clock-in (excluding offdays)
3. **On-time** – Arrived before/at shift start
4. **Late** – Arrived after shift start
5. **No Clock-out** – Clocked in but didn't clock out

<details>
<summary><strong>SQL Query Examples</strong></summary>

```sql
-- Late employees query
SELECT e.*, a.* FROM employees e
JOIN attendance a ON e.employee_id = a.employee_id
WHERE a.first_in_of_the_day_time IS NOT NULL 
  AND a.shift_start < a.first_in_of_the_day_time
```

**Special Flags:**
- `is_offday` – Filters out weekend/holiday absences
- `leave_early` – Flag for early departures
- `no_clock_out` – Missing clock-out records

</details>

---

## 🏆 **Trend Analysis & Rankings**

### **Top Performers Analysis:**
1. **Most On-time Employee** – Perfect attendance records
2. **Most Late Employee** – Detailed late arrival history
3. **Most Missing Clock-outs** – Employees forgetting to clock out

<details>
<summary><strong>Trend Detection Logic</strong></summary>

```typescript
// Finds employees with maximum occurrences
SELECT e.*, COUNT(*) as count
FROM employees e JOIN attendance a ON e.employee_id = a.employee_id
WHERE a.first_in_of_the_day_time IS NOT NULL 
  AND a.shift_start < a.first_in_of_the_day_time
GROUP BY e.employee_id
HAVING COUNT(*) = (
  SELECT MAX(record_count) FROM (...)
)
```

**Features:**
- **UTC→IST conversion** for accurate time display
- **Detailed breakdown** of late minutes per incident
- **Tie handling** – Multiple employees can share top spot

</details>

---

## 📈 **Advanced Analytics**

### **Division-wise Insights:**
- **Monday/Friday Absenteeism** – Pattern detection for specific days
- **Proof Dept & CTP Focus** – Specialized reporting for critical departments
- **30-day Trend Analysis** – Historical data insights

<details>
<summary><strong>Pattern Detection</strong></summary>

```typescript
// Monday/Friday absenteeism detection
const targetDays = ['Monday', 'Friday'];
const targetDates = getDatesInRange(startDate, endDate, targetDays);

// Find employees absent on target days
SELECT e.* FROM employees e
JOIN attendance a ON e.employee_id = a.employee_id
WHERE DATE(a.attendance_date) IN (?)
  AND a.first_in_of_the_day_time IS NULL
  AND a.is_offday = false
```

**Time Intelligence:**
- **IST Timezone** – All dates in Indian Standard Time
- **Smart date ranges** – Last 30 days analysis
- **Today filtering** – Excludes current day from "no clock-out" reports

</details>

---

## 🔧 **API Endpoints**

### **Dashboard Routes:**
```
GET /api/dashboard/stats           # Overall statistics
GET /api/dashboard/present         # Present employees
GET /api/dashboard/absent          # Absent employees
GET /api/dashboard/on-time         # On-time arrivals
GET /api/dashboard/late            # Late arrivals
GET /api/dashboard/no-clock-out    # Missing clock-outs
GET /api/dashboard/top-on-time     # Most punctual employees
GET /api/dashboard/top-late        # Most late employees
GET /api/dashboard/monday-friday   # Monday/Friday absenteeism
GET /api/dashboard/proof-ctp       # Department-specific stats
```

---

# 👤 Employee Management System

CRUD operations for employee management with advanced filtering and overtime tracking.

---

## 📋 **Core Features**

### **1. Employee CRUD Operations**
- **Get All Employees** – Filterable by floor (`Ground Floor` to `5th Floor`)
- **Get Single Employee** – By employee_id
- **Create Employees** – Bulk insert support
- **Update Employee** – Partial updates
- **Delete Employee** – Soft delete capability

<details>
<summary><strong>Filtering Example</strong></summary>

```typescript
// Floor filtering
GET /employees?floor=Ground Floor
GET /employees?floor=all

// Valid floors:
// "Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", 
// "4th Floor", "5th Floor", "all"
```

</details>

---

## 🕒 **Overtime Management**

### **Overtime Employee List**
- **Division-based filtering** – Filter by department (Accounts, CTP, Proof Dept, etc.)
- **Time period filtering** – Today, Yesterday, This Week, Last Week, Last Month
- **Attendance grouping** – Aggregates multiple attendance records per employee

<details>
<summary><strong>Overtime Query</strong></summary>

```sql
SELECT e.*, a.id AS attendance_id
FROM employees e
JOIN attendance a ON e.employee_id = a.employee_id
WHERE a.total_effective_overtime_duration <> 0
AND a.attendance_date = CURDATE()  -- Time filter
AND e.division = 'CTP'             -- Division filter
```

**Response Format:**
```json
{
  "employee_id": "EMP001",
  "name": "John Doe",
  "division": "CTP",
  "attendanceIds": [101, 102, 103],
  "totalAttendance": 3
}
```

</details>

---

##  **Attendance Lookup**

### **Bulk Attendance Data Fetch**
- **Multiple IDs** – Fetch attendance records by ID array
- **Complete details** – All attendance fields returned
- **Efficient query** – Single database call for multiple records

<details>
<summary><strong>Attendance Fetch Example</strong></summary>

```typescript
POST /employees/attendance/by-ids
{
  "attendanceIds": [101, 102, 103, 104]
}

// Returns detailed attendance data for each ID
```

</details>

---

## 🎯 **Specialized Functions**

### **Machine-specific Queries**
- **Ryobi 2, Ryobi 3, Komori** – Special machine operators
- **Effective hours aggregation** – Sums hours across multiple records
- **Time-based filtering** – Today, Yesterday, This Week, Last Week

### **Data Structure**
```typescript
interface Employee {
  employee_id: string;
  name: string;
  floor: string;
  division: string;
  machine: string;
  jobtitle: string;
  regularShiftStart: string;
  regularShiftEnd: string;
  offdays: string;
}
```

---

## 🔌 **API Endpoints**

```
GET    /employees                  # All employees (filter by floor)
GET    /employees/:id              # Single employee
POST   /employees                  # Create employee(s)
PUT    /employees/:id              # Update employee
DELETE /employees/:id              # Delete employee
GET    /employees/overtime/list    # Overtime employees (division/time filter)
POST   /employees/attendance/by-ids # Bulk attendance data
```

---

# 🌙 Night Shift Tracking

Identifies employees working night shifts (8 PM to 2 AM) for specific floors.

---

## 🎯 **Core Concept**

Detects employees who clocked in between **8:00 PM** and **2:00 AM** (night shift hours) for **Ground Floor** and **1st Floor** only.

<details>
<summary><strong>Night Shift Detection Logic</strong></summary>

```sql
WHERE (
    TIME(a.first_in_of_the_day_time) >= '20:00:00'
    OR 
    TIME(a.first_in_of_the_day_time) < '02:00:00'
)
AND e.floor IN ('Ground Floor', '1st Floor')
```

**Time Logic:**
- `>= '20:00:00'` – 8:00 PM or later
- `< '02:00:00'` – Before 2:00 AM (next day)

</details>

---

## ⏰ **Time Filtering**

### **Available Time Filters:**
- `today` – Current day
- `yesterday` – Previous day  
- `this week` – Current week (Sunday to Saturday)
- `last week` – Previous week

<details>
<summary><strong>Time Filter Examples</strong></summary>

```typescript
// Today's night shift workers
GET /api/night-shifts?timeFilter=today

// This week's night shift workers  
GET /api/night-shifts?timeFilter=this week
```

</details>

---

##  **Data Structure**

### **Response Format:**
```json
{
  "count": 5,
  "employees": [
    {
      "employee_id": "EMP001",
      "name": "John Doe",
      "floor": "Ground Floor",
      "division": "Production",
      "machine": "Press-1",
      "dayDuration": [
        {
          "attendance_id": 101,
          "attendance_date": "2024-01-15",
          "shift_start": "20:00:00",
          "shift_end": "06:00:00",
          "shift_duration": 10,
          "firstIn": "20:15:00",
          "lastOut": "06:05:00"
        }
      ]
    }
  ]
}
```

---

## 🔌 **API Endpoint**

```
GET /api/night-shifts?timeFilter=today
```

**Query Parameters:**
- `timeFilter` – (optional) `today`, `yesterday`, `this week`, `last week`

---

# ⏰ Overtime Analytics System

Advanced overtime tracking and workforce optimization analytics.

---

## 📈 **Core Analytics**

### **1. Maximum Overtime Per Floor**
- **Floor-based comparison** – Ground Floor vs 1st Floor
- **Time filtering** – Today, Yesterday, This Week, Last Week
- **Maximum detection** – Finds employees with highest overtime per floor

<details>
<summary><strong>Max Overtime Logic</strong></summary>

```sql
SELECT e.*, SUM(a.total_effective_overtime_duration) AS total_overtime
FROM attendance a JOIN employees e ON a.employee_id = e.employee_id
WHERE e.floor IN ('Ground Floor', '1st Floor')
GROUP BY e.employee_id
HAVING total_overtime = (
    SELECT MAX(total_overtime) FROM overtime_summary WHERE floor = e.floor
)
```

</details>

---

## 📅 **Weekly Overtime Patterns**

### **Last 30 Days Weekly Analysis**
- **Day-by-day breakdown** – Monday through Sunday
- **30-day trend analysis** – Identifies high-overtime days
- **Summary format** – Simplified total hours per day

<details>
<summary><strong>Response Example</strong></summary>

```json
{
  "Monday": { "total_hours": 45.5 },
  "Tuesday": { "total_hours": 38.2 },
  "Wednesday": { "total_hours": 42.8 },
  // ... all days
}
```

</details>

---

## 🎯 **Specialized Analytics**

### **1. Maximum Attendance, Minimum Hours**
- **Division focus** – Post Press and CTP departments
- **Attendance threshold** – Minimum 20 days in 30-day period
- **Efficiency ranking** – Highest attendance with lowest hours

<details>
<summary><strong>Ranking Logic</strong></summary>

```typescript
// Primary: Attendance count DESC
// Secondary: Total hours ASC
// Tertiary: Average daily hours ASC
```

**For identifying:** Employees with good attendance but low productivity

</details>

---

### **2. Top 5 Job Titles by Overtime**
- **Last 30 days** – Recent overtime trends
- **Job title ranking** – Which roles work most overtime
- **Strategic insights** – Workforce planning data

---

## 🔌 **API Endpoints**

```
GET /api/overtime/max                   # Max overtime per floor (time filter)
GET /api/overtime/weekly-summary        # Last 30 days weekly overtime
GET /api/overtime/max-attendance-min-hours  # Attendance vs hours analysis
GET /api/overtime/top-overtime          # Top 5 job titles by overtime
```

**Query Parameters for `/max`:**
- `timeFilter` – `Today`, `Yesterday`, `This Week`, `Last Week`

---

# 🏭 Production Efficiency System

Machine utilization and overtime analytics for printing press operations.

---

##  **Core Features**

### **1. Employee Utilization Analysis**
- **Machine-specific** – KOMORI, RYOBI2, RYOBI 3
- **Time filtering** – Today, Yesterday, This Week, Last Week, Two Weeks Ago
- **Utilization calculation** – Production time vs working hours

<details>
<summary><strong>Utilization Formula</strong></summary>

```typescript
utilization_percentage = (production_minutes / working_minutes) × 100
// Capped at 100% to avoid unrealistic values
```

**Response Example:**
```json
{
  "employee_id": "EMP001",
  "name": "John Doe",
  "machine": "KOMORI",
  "total_gross_hours": 8.5,
  "total_production_time_hours": 6.2,
  "utilization_percentage": 72.94
}
```

</details>

---

### **2. Overtime with Job Details**
- **Overtime tracking** – Per employee per machine
- **Job association** – Links overtime to specific jobs/passes
- **Production context** – Shows what work was done during overtime

<details>
<summary><strong>Overtime Response</strong></summary>

```json
{
  "employee_id": "EMP001",
  "name": "John Doe",
  "machine": "RYOBI2",
  "total_effective_hours": 10.5,
  "total_effective_overtime_duration": 2.5,
  "jobs": [
    { "JOBNO": "JOB-101", "JOBNAME": "Brochure Print", "total_passes": 12 }
  ]
}
```

</details>

---

## 🗃️ **Data Sources**

### **Production Database (Jobpool)**
- **OFFSET_DEPT_details** – Machine pass and wash duration data
- **OFFSET_DEPT** – Job information and metadata
- **Time calculations** – Pass duration, wash time, total production time

### **Attendance Database (Main DB)**
- **Employee working hours** – Gross hours, effective hours
- **Overtime tracking** – Effective overtime duration
- **Employee details** – Name, job title, machine assignment

---

## ⚙️ **Time Calculations**

### **Production Time Components:**
1. **Pass Duration** – Active printing time
2. **Wash Time** – Machine cleaning/preparation
3. **Total Production** = Pass + Wash durations

<details>
<summary><strong>Time Format Conversion</strong></summary>

```typescript
// "5h 30m" → 330 minutes
const hours = parseInt(timeString.match(/(\d+)h/)[1]); // 5
const minutes = parseInt(timeString.match(/(\d+)m/)[1]); // 30
return (hours * 60) + minutes;
```

</details>

---

## 🔌 **API Endpoints**

```
GET /api/utilization/:machine/:timeFilter     # Employee utilization
GET /api/overtime/:machine/:timeFilter        # Overtime with job details
```

**Path Parameters:**
- `machine` – `KOMORI`, `RYOBI2`, `RYOBI 3`
- `timeFilter` – `Today`, `Yesterday`, `This Week`, `Last Week`, `Two Weeks Ago`

---

