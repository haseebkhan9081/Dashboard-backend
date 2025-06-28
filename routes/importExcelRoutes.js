import express from "express"
import { processBatch } from "../controllers/importExcelController.js"

const router = express.Router()

router.post("/batch", processBatch)

export default router
