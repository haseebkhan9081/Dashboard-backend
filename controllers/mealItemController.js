// controllers/mealItemController.js
import pool from '../config/db.js'

export const addMealItem = async (req, res) => {
  console.log("✅ addMealItem controller hit")

  try {
    const { meal_id, item_name, unit_price, quantity } = req.body
    console.log("📥 Request Body:", { meal_id, item_name, unit_price, quantity })

    if (!meal_id || !item_name || unit_price == null || quantity == null) {
      console.log("❌ Missing one or more required fields")
      return res.status(400).json({ error: "Missing required fields" })
    }

    const unitPriceNum = parseFloat(unit_price)
    const quantityNum = parseInt(quantity, 10)

    if (isNaN(unitPriceNum) || isNaN(quantityNum)) {
      console.log("❌ unit_price or quantity is not a valid number")
      return res.status(400).json({ error: "unit_price and quantity must be valid numbers" })
    }

    if (unitPriceNum < 0 || quantityNum < 0) {
      console.log("❌ unit_price or quantity is negative")
      return res.status(400).json({ error: "unit_price and quantity must be non-negative" })
    }

    const total = unitPriceNum * quantityNum
    console.log(`📊 Calculated total = ${unitPriceNum} * ${quantityNum} = ${total}`)

    const insertQuery = `
      INSERT INTO meal_item (meal_id, item_name, unit_price, quantity, total)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    const values = [meal_id, item_name, unitPriceNum, quantityNum, total]

    console.log("📝 Executing insert query:", insertQuery, "with values:", values)

    const result = await pool.query(insertQuery, values)
    console.log("✅ Meal item inserted:", result.rows[0])

    return res.json({ success: true, mealItem: result.rows[0] })
  } catch (err) {
    console.error("❌ Error adding meal item:", err)
    return res.status(500).json({ error: "Failed to add meal item" })
  }
}

export const updateMealItem = async (req, res) => {
  console.log("update meal item was hit")
  try {
    const { itemId, item_name, unit_price, quantity } = req.body

    if (!itemId || !item_name || !unit_price || !quantity) {
      return res.status(400).json({ error: "Missing fields" })
    }

    
    const result = await pool.query(
      `UPDATE meal_item
SET 
  item_name = $1, 
  unit_price = $2::numeric, 
  quantity = $3::numeric, 
  total = $2::numeric * $3::numeric
WHERE id = $4
`,
      [item_name, unit_price, quantity, itemId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Meal item not found" })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error("Error updating meal item:", err)
    return res.status(500).json({ error: "Failed to update meal item" })
  }
}


export const deleteMealItem = async (req, res) => {
  try {
    const { itemId } = req.body

    if (!itemId) {
      return res.status(400).json({ error: "Missing itemId" })
    }

    const result = await pool.query(
      `DELETE FROM meal_item WHERE id = $1`,
      [itemId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Meal item not found" })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error("Error deleting meal item:", error)
    return res.status(500).json({ error: "Failed to delete meal item" })
  }
}
