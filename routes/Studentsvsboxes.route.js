import express from "express";
import { Studentsvsboxes } from "../controllers/Studentsvsboxes.controller.js";



const router=express.Router();


router.get("/Studentsvsboxes",Studentsvsboxes)


export default router;
