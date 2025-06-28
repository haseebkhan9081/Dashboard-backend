import express from "express"
import { addExpense, copyExpensesFromPreviousMonth, deleteExpense, getExpenses } from "../controllers/expensesController.js"
import { getPreviousMonths } from "../controllers/expensesController.js"



const router = express.Router()
router.get("/:schoolId", getExpenses)
router.get("/previousMonths/:schoolId", getPreviousMonths)
router.post("/", addExpense)
router.delete("/schools/:schoolId/expenses/:expenseId", deleteExpense)
router.post("/schools/:schoolId/copy-expenses", copyExpensesFromPreviousMonth)
export default router
