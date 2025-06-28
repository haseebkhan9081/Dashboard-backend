import express from "express"
import { getBillingData } from "../controllers/BillingController.js"

const router = express.Router()

router.get("/:schoolId", getBillingData)

export default router
