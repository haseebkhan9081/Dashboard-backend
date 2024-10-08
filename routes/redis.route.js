import express from "express";
import { CleanRedis } from "../controllers/redis.controller.js";

const router=express.Router();


router.get('/clean',CleanRedis)


export default router;