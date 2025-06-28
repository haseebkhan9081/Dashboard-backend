// routes/meals.js
import express from 'express'
import { fetchMeals } from '../controllers/mealController.js'
import { createMeal } from '../controllers/mealController.js'
import { deleteMeal } from "../controllers/mealController.js"
const router = express.Router()

router.get('/', fetchMeals)
router.post('/create', createMeal)
router.delete("/delete", deleteMeal)

export default router
