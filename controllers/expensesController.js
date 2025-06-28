import pool from "../config/db.js"


export const copyExpensesFromPreviousMonth = async (req, res) => {
  const schoolId = parseInt(req.params.schoolId)
  const { previousMonth, currentMonth } = req.body

  if (!schoolId || !previousMonth || !currentMonth) {
    return res.status(400).json({ error: "Missing required data" })
  }

  try {
    // Step 1: Fetch previous month expenses
    const prevQuery = `
      SELECT expense_name, amount
      FROM expense
      WHERE school_id = $1 AND month_year = $2
    `
    const { rows: previousExpenses } = await pool.query(prevQuery, [schoolId, previousMonth])

    if (previousExpenses.length === 0) {
      return res.status(200).json({ message: "No expenses to copy" })
    }

    // Step 2: Fetch current month existing expense names
    const currQuery = `
      SELECT expense_name
      FROM expense
      WHERE school_id = $1 AND month_year = $2
    `
    const { rows: currentExpenses } = await pool.query(currQuery, [schoolId, currentMonth])
    const existingNames = new Set(currentExpenses.map(e => e.expense_name))

    // Step 3: Filter new expenses
    const newExpenses = previousExpenses
      .filter(e => !existingNames.has(e.expense_name))
      .map(e => `(${schoolId}, '${currentMonth}', '${e.expense_name.replace(/'/g, "''")}', ${e.amount})`)

    if (newExpenses.length === 0) {
      return res.status(200).json({ message: "All expenses already exist for this month" })
    }

    // Step 4: Bulk insert
    const insertQuery = `
      INSERT INTO expense (school_id, month_year, expense_name, amount)
      VALUES ${newExpenses.join(", ")}
    `
    await pool.query(insertQuery)

    return res.status(200).json({ message: `Copied ${newExpenses.length} new expenses.` })
  } catch (error) {
    console.error("❌ Error copying expenses:", error)
    return res.status(500).json({ error: "Failed to copy expenses" })
  }
}


export const deleteExpense = async (req, res) => {
  const schoolId = parseInt(req.params.schoolId)
  const expenseId = parseInt(req.params.expenseId)

  console.log("🗑️ DELETE /schools/:schoolId/expenses/:expenseId called", { schoolId, expenseId })

  if (isNaN(schoolId) || isNaN(expenseId)) {
    return res.status(400).json({ error: "Invalid ID(s) provided" })
  }

  try {
    // Optional: Verify that the expense belongs to the given school
    const checkQuery = `SELECT * FROM expense WHERE id = $1`
    const result = await pool.query(checkQuery, [expenseId])
    const expense = result.rows[0]

    if (!expense || expense.school_id !== schoolId) {
      return res.status(404).json({ error: "Expense not found for this school" })
    }

    const deleteQuery = `DELETE FROM expense WHERE id = $1`
    await pool.query(deleteQuery, [expenseId])

    return res.status(200).json({ message: "Expense deleted" })
  } catch (err) {
    console.error("❌ Error deleting expense:", err)
    return res.status(500).json({ error: "Failed to delete expense" })
  }
}


export const addExpense = async (req, res) => {
  console.log("📥 POST /expenses called", req.body)

  const { school_id, month_year, expense_name, amount } = req.body

  if (!school_id || !month_year || !expense_name || amount === undefined) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum < 0) {
    return res.status(400).json({ error: "Amount must be a non-negative number" })
  }

  try {
    const query = `
      INSERT INTO expense (school_id, month_year, expense_name, amount)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `
    const values = [school_id, month_year, expense_name, amountNum]

    const result = await pool.query(query, values)

    return res.status(201).json(result.rows[0])
  } catch (err) {
    console.error("❌ Error adding expense:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
}

export const getExpenses = async (req, res) => {
  const { schoolId } = req.params
  const { month } = req.query

  if (!schoolId || !month) {
    return res.status(400).json({ error: "Missing parameters" })
  }

  try {
    const query = `
      SELECT *
      FROM expense
      WHERE school_id = $1 AND month_year = $2
      ORDER BY created_at ASC
    `
    const values = [schoolId, month]

    const result = await pool.query(query, values)
    return res.json(result.rows)
  } catch (err) {
    console.error("❌ Error fetching expenses:", err)
    return res.status(500).json({ error: "Server error" })
  }
}


export const getPreviousMonths = async (req, res) => {
  const { schoolId } = req.params
  const { excludeMonth } = req.query

  if (!schoolId || !excludeMonth) {
    return res.status(400).json({ error: "Missing parameters" })
  }

  try {
    const query = `
      SELECT DISTINCT month_year
      FROM expense
      WHERE school_id = $1 AND month_year != $2
      ORDER BY month_year DESC
    `
    const values = [schoolId, excludeMonth]

    const result = await pool.query(query, values)

    const uniqueMonths = result.rows.map(row => row.month_year)
    return res.json(uniqueMonths)
  } catch (err) {
    console.error("❌ Error fetching previous months:", err)
    return res.status(500).json({ error: "Server error" })
  }
}
