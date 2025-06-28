// routes/accessRoutes.js
import express from 'express'
import { addUserAccess } from '../controllers/accessController.js'
import { removeUserAccess } from "../controllers/accessController.js"
const router = express.Router()

router.post('/add', addUserAccess)
router.delete("/remove", removeUserAccess)

export default router
