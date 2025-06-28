import pool from "../config/db.js"
import { randomUUID } from "crypto"

export const processBatch = async (req, res) => {
  const { batch, batchIndex, totalBatches, schoolId } = req.body

  if (!Array.isArray(batch) || batch.length === 0 || !schoolId) {
    return res.status(400).json({ error: "Invalid batch data" })
  }

  try {
    console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} records)`)

    const schoolCheck = await pool.query("SELECT * FROM school WHERE id = $1", [schoolId])
    if (schoolCheck.rowCount === 0) {
      return res.status(400).json({ error: `School with ID ${schoolId} not found` })
    }

    let newStudentsCount = 0
    let attendanceRecordsCount = 0
    const errors = []

    for (const record of batch) {
      try {
        if (!record.student_id || !record.name || !record.date) {
          errors.push(`Skipping record with missing fields: ${JSON.stringify(record)}`)
          continue
        }

        const dateObj = new Date(record.date)
        if (isNaN(dateObj.getTime())) {
          errors.push(`Invalid date format: ${record.date}`)
          continue
        }

        // Check if student exists
        const studentRes = await pool.query(
          `SELECT * FROM student WHERE student_id = $1 AND school_id = $2 LIMIT 1`,
          [record.student_id, schoolId]
        )

        let student
        if (studentRes.rowCount === 0) {
          const newStudentRes = await pool.query(
            `INSERT INTO student (student_id, name, class_department, school_id, system_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [record.student_id, record.name, record.class_department || "", schoolId, randomUUID()]
          )
          student = newStudentRes.rows[0]
          newStudentsCount++
        } else {
          student = studentRes.rows[0]

          if (record.name !== student.name || (record.class_department && record.class_department !== student.class_department)) {
            await pool.query(
              `UPDATE student SET name = $1, class_department = $2 WHERE id = $3`,
              [record.name, record.class_department || student.class_department, student.id]
            )
          }
        }

        // Punch times
        const validPunchTimes = (record.punch_times || [])
          .filter((t) => t && t.trim())
          .map((t) => t.trim())

        // Check attendance
        const attendanceRes = await pool.query(
          `SELECT * FROM attendance WHERE student_id = $1 AND date = $2 LIMIT 1`,
          [student.id, dateObj]
        )

        if (attendanceRes.rowCount > 0) {
          const existing = attendanceRes.rows[0]
          const allTimes = [...(existing.punch_times || []), ...validPunchTimes]
          const uniqueTimes = [...new Set(allTimes)].sort()

          await pool.query(
            `UPDATE attendance SET punch_times = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [uniqueTimes, existing.id]
          )
        } else {
          await pool.query(
            `INSERT INTO attendance (student_id, date, punch_times)
             VALUES ($1, $2, $3)`,
            [student.id, dateObj, validPunchTimes.sort()]
          )
        }

        attendanceRecordsCount++
      } catch (err) {
        errors.push(`Error processing record for ${record.student_id}: ${err.message}`)
        continue
      }
    }

    console.log(`✅ Completed batch ${batchIndex + 1}/${totalBatches}`)

    return res.json({
      success: true,
      batchIndex,
      totalBatches,
      summary: {
        newStudentsRegistered: newStudentsCount,
        attendanceRecordsProcessed: attendanceRecordsCount,
        recordsProcessed: batch.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (err) {
    console.error("❌ Batch processing error:", err)
    return res.status(500).json({
      error: "Failed to process batch",
      details: err.message || "Unknown error",
    })
  }
}
