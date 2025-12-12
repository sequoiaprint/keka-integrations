import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config()
const Jobpool = mysql.createPool({
    host: process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    database: process.env.JOB_DB_NAME,
    timezone: process.env.DB_TIMEZONE,
    waitForConnections: true,
    ssl: { rejectUnauthorized: false },
    connectionLimit:10,
    queueLimit:0
});
export default Jobpool;