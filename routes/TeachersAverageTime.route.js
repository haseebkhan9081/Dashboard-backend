import express from "express";
import { TeachersAverageTime } from "../controllers/TeachersAverageTime.controller.js";

const router=express.Router();


router.get("/TeachersAverageTime",TeachersAverageTime);

export default router;