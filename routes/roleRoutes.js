import express from "express"
import { getUserRole } from "../controllers/roleController.js"

const router = express.Router()

router.get("/role", getUserRole)

export default router
