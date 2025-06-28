// /controllers/attendanceController.js
import pool from '../config/db.js';

export const getAttendance = async (req, res) => {
  console.log("📥 GET /attendance called", req.query);

  const {
    school_id,
    month,
    date,
    page = "1",
    limit = "25",
    sortBy = "date",
    sortOrder = "desc",
    search = "",
  } = req.query;

  if (!school_id) {
    return res.status(400).json({ error: "school_id is required" });
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(10, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const validSortColumns = {
    name: "s.name",
    class: "s.class_department",
    date: "a.date",
  };
  const orderByColumn = validSortColumns[sortBy] || "a.date";

  const dateParams = [];
  let whereClause = `s.school_id = $1`;
  let paramIndex = 2;

  if (search.trim()) {
    whereClause += `
      AND (
        s.name ILIKE $${paramIndex++}
        OR s.class_department ILIKE $${paramIndex++}
        OR s.student_id ILIKE $${paramIndex++}
      )
    `;
    dateParams.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
  }

  if (date) {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const start = new Date(inputDate.setHours(0, 0, 0, 0));
    const end = new Date(inputDate.setHours(23, 59, 59, 999));

    whereClause += ` AND a.date >= $${paramIndex++} AND a.date <= $${paramIndex++}`;
    dateParams.push(start.toISOString(), end.toISOString());
  } else if (month) {
    const [year, monthStr] = month.split("-");
    const monthInt = parseInt(monthStr) - 1;

    const start = new Date(year, monthInt, 1);
    const end = new Date(year, monthInt + 1, 0, 23, 59, 59, 999);

    whereClause += ` AND a.date >= $${paramIndex++} AND a.date <= $${paramIndex++}`;
    dateParams.push(start.toISOString(), end.toISOString());
  } else {
    return res.status(400).json({
      error: "Either 'month' or 'date' must be provided",
    });
  }

  const fullParams = [school_id, ...dateParams];

  const baseQuery = `
    FROM attendance a
    JOIN student s ON a.student_id = s.id
    WHERE ${whereClause}
  `;

  try {
    // 1. Paginated records
    const query = `
      SELECT a.*, s.name, s.class_department, s.student_id
      ${baseQuery}
      ORDER BY ${orderByColumn} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const attendanceRecords = await pool.query(query, [...fullParams, limitNum, offset]);

    // 2. Total count
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const countResult = await pool.query(countQuery, fullParams);
    const total = parseInt(countResult.rows[0].count, 10);
    const hasMore = offset + limitNum < total;

    // 3. Summary (only for date)
    let summary = null;
    if (date) {
      const present = attendanceRecords.rows.filter(r => r.punch_times?.length > 0).length;
      summary = {
        total: attendanceRecords.rows.length,
        present,
        date,
      };
    }

    // 4. Format
   // 4. Format to match: Attendance & { students: Student }
const formatted = attendanceRecords.rows.map(r => {
  const {
    name,
    class_department,
    student_id,
    ...attendanceData
  } = r

  return {
    ...attendanceData,
    date: attendanceData.date.toISOString().split("T")[0],
    students: {
      name,
      class_department,
      student_id,
      // Optional: Include other `Student` fields if needed
    }
  }
})


    return res.json({
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore,
      },
      summary,
    });
  } catch (err) {
    console.error("❌ Error in getAttendance:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const generateAttendanceReport = async (req, res) => {
  const { studentIds, month, schoolId } = req.body

  if (!studentIds || !month || !schoolId) {
    return res.status(400).json({
      error: "Missing required parameters: studentIds, month, schoolId",
    })
  }

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: "studentIds must be a non-empty array" })
  }

  try {
    const [year, monthNum] = month.split("-")
    const startDate = new Date(year, monthNum - 1, 1)
    const endDate = new Date(year, monthNum, 0)

    // Step 1: Get internal student IDs from student_id field
    const studentQuery = `
      SELECT id FROM student
      WHERE school_id = $1
      AND student_id = ANY($2::text[])
    `
    const studentResult = await pool.query(studentQuery, [schoolId, studentIds])
    const studentDbIds = studentResult.rows.map(row => row.id)

    if (studentDbIds.length === 0) {
      return res.status(404).json({ error: "No students found with provided IDs" })
    }

    // Step 2: Fetch attendance records with student info
    const attendanceQuery = `
      SELECT 
        a.*, 
        s.name as student_name, 
        s.class_department, 
        s.student_id 
      FROM attendance a
      JOIN student s ON s.id = a.student_id
      WHERE a.student_id = ANY($1::int[])
      AND a.date BETWEEN $2 AND $3
      ORDER BY a.date ASC
    `
    const attendanceResult = await pool.query(attendanceQuery, [studentDbIds, startDate, endDate])

    return res.json(attendanceResult.rows)
  } catch (error) {
    console.error("❌ Error generating attendance report:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}


// 🗑️ Delete Attendance Record
export const deleteAttendance = async (req, res) => {
  const attendanceId = parseInt(req.params.id)
console.log("deleet attendance hit")    
  if (isNaN(attendanceId)) {
    return res.status(400).json({ error: "Invalid attendance ID" })
  }

  try {
    const result = await pool.query(
      `DELETE FROM attendance WHERE id = $1 RETURNING *`,
      [attendanceId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Attendance record not found" })
    }

    return res.json({ message: "Deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting attendance:", error)
    return res.status(500).json({ error: "Failed to delete attendance" })
  }
}


// 🆕 Create New Attendance Record
export const createAttendance = async (req, res) => {
  const { student_id, date } = req.body

  if (!student_id || !date) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  try {
    // Check for existing attendance
    const checkQuery = `
      SELECT * FROM attendance
      WHERE student_id = $1 AND DATE(date) = DATE($2)
      LIMIT 1
    `
    const checkResult = await pool.query(checkQuery, [student_id, date])

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ error: "Attendance already exists for this student on this date" })
    }

    // Insert new attendance with empty punch_times
    const insertQuery = `
      INSERT INTO attendance (student_id, date, punch_times)
      VALUES ($1, $2, $3)
      RETURNING *
    `
    const result = await pool.query(insertQuery, [student_id, date, []])

    return res.status(200).json(result.rows[0])
  } catch (error) {
    console.error("❌ Error creating attendance:", error)
    return res.status(500).json({ error: "Server error" })
  }
}



// ➕ Add Punch Time
export const addPunchTime = async (req, res) => {
  const attendanceId = parseInt(req.params.id)
  const { newPunchTime } = req.body

  if (!newPunchTime) {
    return res.status(400).json({ error: "Missing punch time" })
  }

  try {
    const result = await pool.query(
      `UPDATE attendance
       SET punch_times = array_append(punch_times, $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newPunchTime, attendanceId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Attendance record not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error("❌ Error adding punch time:", error)
    res.status(500).json({ error: "Failed to add punch time" })
  }
}

// ❌ Remove Punch Time by Index
export const deletePunchTime = async (req, res) => {
  const attendanceId = parseInt(req.params.id)
  const { timeIndex } = req.body

  if (typeof timeIndex !== "number") {
    return res.status(400).json({ error: "Invalid timeIndex" })
  }

  try {
    const currentResult = await pool.query(
      `SELECT punch_times FROM attendance WHERE id = $1`,
      [attendanceId]
    )

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ error: "Attendance record not found" })
    }

    const punchTimes = currentResult.rows[0].punch_times
    const updatedTimes = punchTimes.filter((_, index) => index !== timeIndex)

    const updateResult = await pool.query(
      `UPDATE attendance
       SET punch_times = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [updatedTimes, attendanceId]
    )

    res.json(updateResult.rows[0])
  } catch (error) {
    console.error("❌ Error removing punch time:", error)
    res.status(500).json({ error: "Failed to remove punch time" })
  }
}
