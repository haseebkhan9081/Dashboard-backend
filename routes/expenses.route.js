import express from  "express"
import { Expenses } from "../controllers/expenses.controller.js";


const router=express.Router();

router.get("/expenses",Expenses)

export default router;