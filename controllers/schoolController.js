// controllers/schoolController.js
import pool from '../config/db.js'

export const createSchool = async (req, res) => {
  const { name, address, user_id } = req.body

  console.log("📌 Create school called with:", { name, address, user_id })

  if (!user_id || !name) {
    return res.status(400).json({ error: "Missing user_id or name" })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const insertSchoolQuery = `
      INSERT INTO school (name, address)
      VALUES ($1, $2)
      RETURNING *
    `
    const schoolResult = await client.query(insertSchoolQuery, [name, address])
    const school = schoolResult.rows[0]

    const insertAccessQuery = `
      INSERT INTO school_access (school_id, user_id, role)
      VALUES ($1, $2, 'admin')
    `
    await client.query(insertAccessQuery, [school.id, user_id])

    await client.query('COMMIT')

    return res.json({ success: true, school })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error("❌ Error creating school:", error)
    return res.status(500).json({ error: "Failed to create school" })
  } finally {
    client.release()
  }
}



export const deleteSchool = async (req, res) => {
  try {
    const schoolId = parseInt(req.query.id)
    console.log("🔧 Incoming school ID:", schoolId)

    if (!schoolId || isNaN(schoolId)) {
      return res.status(400).json({ error: "Missing or invalid school ID" })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const deleteAttendance = await client.query(`
        DELETE FROM attendance
        WHERE student_id IN (
          SELECT id FROM student WHERE school_id = $1
        )
      `, [schoolId])
      console.log(`🧹 Deleted ${deleteAttendance.rowCount} attendance records`)

      const deleteMealItems = await client.query(`
        DELETE FROM meal_item
        WHERE meal_id IN (
          SELECT id FROM meal WHERE school_id = $1
        )
      `, [schoolId])
      console.log(`🧹 Deleted ${deleteMealItems.rowCount} meal items`)

      const deleteMeals = await client.query(`DELETE FROM meal WHERE school_id = $1`, [schoolId])
      console.log(`🧹 Deleted ${deleteMeals.rowCount} meals`)

      const deleteStudents = await client.query(`DELETE FROM student WHERE school_id = $1`, [schoolId])
      console.log(`🧹 Deleted ${deleteStudents.rowCount} students`)

      const deleteExpenses = await client.query(`DELETE FROM expense WHERE school_id = $1`, [schoolId])
      console.log(`🧹 Deleted ${deleteExpenses.rowCount} expenses`)

      const deleteAccess = await client.query(`DELETE FROM school_access WHERE school_id = $1`, [schoolId])
      console.log(`🧹 Deleted ${deleteAccess.rowCount} access records`)

      const deleteSchool = await client.query(`DELETE FROM school WHERE id = $1`, [schoolId])
      console.log(`🏫 Deleted ${deleteSchool.rowCount} school record(s)`)

      await client.query('COMMIT')

      if (deleteSchool.rowCount === 0) {
        return res.status(404).json({ error: "School not found" })
      }

      return res.json({ success: true, message: "School deleted successfully" })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error("❌ Error during delete transaction:", error)
      return res.status(500).json({ error: "Failed to delete school" })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err)
    return res.status(500).json({ error: "Server error" })
  }
}

