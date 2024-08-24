import express from "express";
import { StudentAveragePerClass } from "../controllers/studentAveragePerClass.controller.js";


const router=express.Router();


router.get("/studentAveragePerClass",StudentAveragePerClass)
export default router;