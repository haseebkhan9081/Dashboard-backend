// /controllers/studentController.js
import pool from "../config/db.js";

export const getStudentsBySchool = async (req, res) => {
  const { schoolId } = req.params;
console.log("getStudentsBySchool was hit with school id :",schoolId)
  if (!schoolId) {
    return res.status(400).json({ error: "Missing school ID" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM student WHERE school_id = $1 ORDER BY name ASC`,
      [schoolId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    return res.status(500).json({ error: "Failed to fetch students" });
  }
};
