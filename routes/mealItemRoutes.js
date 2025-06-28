// routes/mealItemRoutes.js
import express from 'express'
import { addMealItem } from '../controllers/mealItemController.js'
import { deleteMealItem } from "../controllers/mealItemController.js"
import { updateMealItem } from "../controllers/mealItemController.js"
const router = express.Router()

router.post('/add', (req, res, next) => {
  console.log("✅ /meal-items/add route hit")
  next()
}, addMealItem)
router.put("/update", updateMealItem)
router.post("/delete", deleteMealItem)
export default router
