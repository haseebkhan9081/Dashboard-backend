import express from "express";
import { AttendancePercentageIncrease } from "../controllers/attendancePercentageIncrease.controller.js";

const router=express.Router();


router.get("/attendancePercentageIncrease",AttendancePercentageIncrease);

export default router;