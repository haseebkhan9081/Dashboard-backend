import db from "../config/db.js"

export const getUserRole = async (req, res) => {
  const { userId, schoolId } = req.query

  if (!userId || !schoolId) {
    return res.status(400).json({ error: "Missing userId or schoolId" })
  }

  try {
    const query = `
      SELECT role
      FROM "SchoolAccess"
      WHERE user_id = $1 AND school_id = $2
      LIMIT 1;
    `
    const values = [userId, Number(schoolId)]
    const { rows } = await db.query(query, values)

    if (rows.length === 0) {
      return res.json({ role: "viewer" })
    }
console.log("permissions fetched success")
    return res.json({ role: rows[0].role })
  } catch (error) {
    console.error("Error fetching role:", error)
    return res.status(500).json({ role: "viewer" })
  }
}
