import express from "express"
import { MealCost } from "../controllers/mealCost.controller.js";


const router=express.Router();

 router.get("/mealCost",MealCost);
export default router;