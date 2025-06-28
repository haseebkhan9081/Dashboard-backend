// /routes/attendanceRoutes.js
import express from 'express';
import { createAttendance, deleteAttendance, getAttendance } from '../controllers/attendanceController.js';
import { addPunchTime, deletePunchTime } from "../controllers/attendanceController.js"
import { generateAttendanceReport } from "../controllers/attendanceController.js"



const router = express.Router();

router.post("/report", generateAttendanceReport)
router.get('/', getAttendance); // /attendance?...
router.put("/:id/punch", addPunchTime)
router.delete("/:id/punch", deletePunchTime)
router.post("/", createAttendance)
router.delete("/:id", deleteAttendance)
export default router;
