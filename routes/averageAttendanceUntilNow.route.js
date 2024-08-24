import express from "express";
import { AverageAttendanceUntilNow } from "../controllers/averageAttendanceUntilNow.controller.js";


const router=express.Router();


router.get('/averageAttendanceUntilNow',AverageAttendanceUntilNow);
export default router;