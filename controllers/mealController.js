// controllers/mealController.js
import pool from '../config/db.js'
import { startOfMonth, endOfMonth } from 'date-fns'

export const fetchMeals = async (req, res) => {
  console.log("✅ fetchMeals controller hit")

  const schoolId = req.query.school_id
  const month = req.query.month // Format: YYYY-MM

  console.log("🔍 Received query params:", { schoolId, month })

  if (!schoolId) {
    console.log("❌ Missing school_id")
    return res.status(400).json({ error: 'Missing school_id query parameter' })
  }

  let startDate = null
  let endDate = null

  if (month) {
    try {
      const parsedMonth = new Date(`${month}-01T00:00:00`)
      startDate = startOfMonth(parsedMonth)
      endDate = endOfMonth(parsedMonth)
      console.log("📆 Date filter range:", { startDate, endDate })
    } catch (err) {
      console.log("❌ Invalid month format")
      return res.status(400).json({ error: 'Invalid month format' })
    }
  }

  try {
    let query = `
      SELECT m.*, 
             json_agg(mi.*) AS meal_items
      FROM meal m
      LEFT JOIN meal_item mi ON m.id = mi.meal_id
      WHERE m.school_id = $1
    `
    const params = [schoolId]

    if (startDate && endDate) {
      query += ` AND m.date BETWEEN $2 AND $3`
      params.push(startDate, endDate)
    }

    query += ` GROUP BY m.id ORDER BY m.date DESC`

    console.log("📥 Executing query with params:", params)
    const result = await pool.query(query, params)

    console.log(`✅ Fetched ${result.rows.length} meal(s)`)

    return res.json(result.rows)
  } catch (err) {
    console.error('❌ Error fetching meals:', err)
    return res.status(500).json({ error: 'Failed to fetch meals' })
  }
}



export const createMeal = async (req, res) => {
  console.log("🆕 createMeal controller hit")

  try {
    const { school_id, date } = req.body
    console.log("📥 Payload:", { school_id, date })

    if (!school_id || !date) {
      console.log("❌ Missing required fields")
      return res.status(400).json({ error: "Missing required fields" })
    }

    const dateObj = new Date(date)
    const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" })

    // Check for existing meal
    const checkQuery = `
      SELECT * FROM meal
      WHERE school_id = $1 AND date::date = $2::date
      LIMIT 1
    `
    const existingResult = await pool.query(checkQuery, [school_id, dateObj])

    if (existingResult.rows.length > 0) {
      console.log("⚠️ Meal already exists for this date.")
      return res.status(409).json({ error: "A meal entry already exists for this date." })
    }

    const insertQuery = `
      INSERT INTO meal (school_id, date, day_of_week, total_cost)
      VALUES ($1, $2, $3, 0)
      RETURNING *
    `
    const insertValues = [school_id, dateObj, dayOfWeek]
    const result = await pool.query(insertQuery, insertValues)

    console.log("✅ Meal created:", result.rows[0])
    return res.status(201).json({ success: true, meal: result.rows[0] })

  } catch (err) {
    console.error("❌ Error creating meal:", err)
    return res.status(500).json({ error: "Failed to create new meal" })
  }
}


export const deleteMeal = async (req, res) => {
  try {
    const mealId = parseInt(req.query.mealId)

    if (!mealId || isNaN(mealId)) {
      return res.status(400).json({ error: "Missing or invalid mealId" })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // First delete meal items (since no ON DELETE CASCADE)
      await client.query(`DELETE FROM meal_item WHERE meal_id = $1`, [mealId])

      // Then delete the meal
      const result = await client.query(`DELETE FROM meal WHERE id = $1`, [mealId])

      await client.query("COMMIT")

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Meal not found" })
      }

      return res.json({ success: true })
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Error deleting meal:", error)
      return res.status(500).json({ error: "Failed to delete meal" })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return res.status(500).json({ error: "Server error" })
  }
}

