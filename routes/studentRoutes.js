// /routes/studentRoutes.js
import express from "express";
import { getStudentsBySchool } from "../controllers/studentController.js";

const router = express.Router();

router.get("/:schoolId", getStudentsBySchool); // GET /students/:schoolId

export default router;
