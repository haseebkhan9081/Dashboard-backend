// scripts/initDb.js
import pool from "../config/db.js"
import fs from "fs"
import dotenv from "dotenv"
dotenv.config()

const sql = fs.readFileSync("sql/schema.sql", "utf8")

async function initDB() {
  try {
    console.log("✅ Connected using shared pool")

    await pool.query(sql)
    console.log("✅ Tables created successfully")
  } catch (error) {
    console.error("❌ Error running init script:", error)
  } finally {
    await pool.end() // closes pool
    console.log("🔒 Connection closed")
  }
}

export default initDB;
