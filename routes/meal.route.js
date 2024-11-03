import express from "express";
import { update } from "../controllers/meal.controller.js";


const router=express.Router();



router.post("/update",update)



export default router;