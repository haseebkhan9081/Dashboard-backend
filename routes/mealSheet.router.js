import express from "express";
import { addNewMealSheet, getMealSheet, getUniqueMonthYearPairs } from "../controllers/mealSheet.controller.js";

const router=express.Router();


router.post("/create",addNewMealSheet);
router.post("/mealSheet",getMealSheet);
router.get("/getUniqueMonthYearPairs",getUniqueMonthYearPairs)
export default router;