import express from "express"
import { AttendanceSummaryByDate } from "../controllers/attendanceSummarybyDate.controller.js";


const router=express.Router();


router.get("/AttendanceSummaryByDate",AttendanceSummaryByDate)

export default router;