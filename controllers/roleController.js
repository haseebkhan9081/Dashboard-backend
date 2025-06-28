import db from "../config/db.js"

export const getUserRole = async (req, res) => {
  const { userId, schoolId } = req.query

  console.log("Received request to fetch user role.")
  console.log("Query params:", { userId, schoolId })

  if (!userId || !schoolId) {
    console.warn("Missing userId or schoolId in request.")
    return res.status(400).json({ error: "Missing userId or schoolId" })
  }

  try {
    const query = `
      SELECT role
      FROM school_access
      WHERE user_id = $1 AND school_id = $2
      LIMIT 1;
    `
    const values = [userId, Number(schoolId)]

    console.log("Executing SQL query to fetch role...")
    console.log("Query:", query.trim())
    console.log("Values:", values)

    const { rows } = await db.query(query, values)

    if (rows.length === 0) {
      console.log("No role found. Returning default role: viewer.")
      return res.json({ role: "viewer" })
    }

    console.log("Role fetched successfully:", rows[0].role)
    return res.json({ role: rows[0].role })
  } catch (error) {
    console.error("Error occurred while fetching user role:", error)
    return res.status(500).json({ role: "viewer" })
  }
}
