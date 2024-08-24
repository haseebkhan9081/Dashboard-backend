import express from "express";
import { QuotationperMeal } from "../controllers/quotationperMeal.controller.js";


const router=express.Router();


router.get('/quotationperMeal',QuotationperMeal)

export default router;