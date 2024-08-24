import express from "express"
import { TotalMealsServed } from "../controllers/totalMealsServed.controller.js";

const router=express.Router();

router.get("/totalMealsServed",TotalMealsServed);

export default router;