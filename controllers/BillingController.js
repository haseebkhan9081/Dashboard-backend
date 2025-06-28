import pool from "../config/db.js"

export const getBillingData = async (req, res) => {
  const { schoolId } = req.params
  const { month } = req.query

  if (!schoolId || !month) {
    return res.status(400).json({ error: "Missing parameters" })
  }

  try {
    const startDate = new Date(`${month}-01`)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)

    // Fetch meals and associated items
    const query = `
      SELECT 
        m.id AS meal_id,
        m.date,
        m.school_id,
        s.name AS school_name,
        mi.id AS item_id,
        mi.item_name,
        mi.unit_price,
        mi.quantity,
        mi.total
      FROM meal m
      JOIN school s ON m.school_id = s.id
      LEFT JOIN meal_item mi ON m.id = mi.meal_id
      WHERE m.school_id = $1 AND m.date >= $2 AND m.date <= $3
      ORDER BY m.date ASC
    `

    const { rows } = await pool.query(query, [schoolId, startDate, endDate])

    // Group by meal
    const mealsMap = new Map()

    rows.forEach(row => {
      const {
        meal_id,
        date,
        school_id,
        school_name,
        item_id,
        item_name,
        unit_price,
        quantity,
        total
      } = row

      if (!mealsMap.has(meal_id)) {
        mealsMap.set(meal_id, {
          id: meal_id,
          date: date.toISOString().split("T")[0],
          school_id,
          school_name,
          meal_items: [],
        })
      }

      if (item_id) {
        mealsMap.get(meal_id).meal_items.push({
          id: item_id,
          item_name,
          unit_price,
          quantity,
          total,
        })
      }
    })

    return res.json(Array.from(mealsMap.values()))
  } catch (err) {
    console.error("❌ Error fetching billing data:", err)
    return res.status(500).json({ error: "Server error" })
  }
}
