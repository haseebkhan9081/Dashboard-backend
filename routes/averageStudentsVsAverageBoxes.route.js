import express from "express";
import { AverageStudentVsBoxes } from "../controllers/averageStudentsVsAverageBoxes.controller.js";

const router=express.Router();


router.get("/AverageStudentVsBoxes",AverageStudentVsBoxes);

export default router;