import express from "express";
import { TeachersAttendanceSummary } from "../controllers/teachersAttendanceSummary.controller.js";
const router = express.Router();

router.get("/TeachersAttendanceSummary", TeachersAttendanceSummary);

export default router;
