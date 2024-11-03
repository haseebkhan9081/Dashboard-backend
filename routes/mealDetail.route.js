import express from "express";
import { create, update } from "../controllers/mealDetail.controller.js";


const router=express.Router();


router.post('/create',create);
router.post('/update',update)

export default router;

