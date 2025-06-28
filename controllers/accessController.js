// controllers/accessController.js
import pool from '../config/db.js'





export const removeUserAccess = async (req, res) => {
  try {
    const accessId = parseInt(req.query.id)

    if (!accessId || isNaN(accessId)) {
      return res.status(400).json({ error: "Missing or invalid access ID" })
    }

    const result = await pool.query(`DELETE FROM school_access WHERE id = $1`, [accessId])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Access record not found" })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error("API Error deleting access:", error)
    return res.status(500).json({ error: "Failed to remove user access" })
  }
}

export const addUserAccess = async (req, res) => {
  try {
    const { school_id, user_id, role } = req.body

    if (!school_id || !user_id || !role) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    // Check if user already has access
    const checkQuery = `
      SELECT * FROM school_access 
      WHERE school_id = $1 AND user_id = $2
    `
    const checkResult = await pool.query(checkQuery, [school_id, user_id])

    if (checkResult.rows.length > 0) {
      // User already has access, so update their role
      const updateQuery = `
        UPDATE school_access
        SET role = $3, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = $1 AND user_id = $2
      `
      await pool.query(updateQuery, [school_id, user_id, role])

      return res.json({ success: true, message: "Access role updated" })
    } else {
      // New access entry
      const insertQuery = `
        INSERT INTO school_access (school_id, user_id, role)
        VALUES ($1, $2, $3)
      `
      await pool.query(insertQuery, [school_id, user_id, role])

      return res.json({ success: true, message: "Access granted" })
    }
  } catch (err) {
    console.error("❌ Error adding/updating user access:", err)
    return res.status(500).json({ error: "Failed to add or update user access" })
  }
}

