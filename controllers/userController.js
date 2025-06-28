// controllers/userController.js
import pool from '../config/db.js'

export const fetchUserSchools = async (req, res) => {
  try {
    const userId = req.query.userId
    console.log("➡️ fetchUserSchools called with userId:", userId)

    if (!userId) {
      console.warn("⚠️ Missing userId in query")
      return res.status(400).json({ error: "Missing userId" })
    }

    // Step 1: Get current user's access records and the related schools
    const accessDataQuery = `
      SELECT sa.*, row_to_json(s.*) AS school
      FROM school_access sa
      JOIN school s ON sa.school_id = s.id
      WHERE sa.user_id = $1
      ORDER BY s.name ASC
    `
    const accessResult = await pool.query(accessDataQuery, [userId])
    const accessData = accessResult.rows

    // Extract all school_ids the user has access to
    const schoolIds = accessData.map(row => row.school_id)

    if (schoolIds.length === 0) {
      // No schools, return empty
      return res.json({ accessData: [], allAccessData: [] })
    }

    // Step 2: Get access records for all users for those school_ids
    const allAccessQuery = `
      SELECT * FROM school_access
      WHERE school_id = ANY($1)
    `
    const allAccessResult = await pool.query(allAccessQuery, [schoolIds])
    const allAccessData = allAccessResult.rows

    return res.json({
      accessData,
      allAccessData
    })
  } catch (error) {
    console.error("❌ Error fetching user schools:", error)
    return res.status(500).json({ error: "Failed to fetch user schools" })
  }
}

