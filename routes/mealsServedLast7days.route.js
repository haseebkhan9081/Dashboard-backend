import express from "express"
import { MealsServedLast7days } from "../controllers/mealsServedLast7days.controller.js";

const router=express.Router();

router.get("/mealsServedLast7days",MealsServedLast7days)

export default router;