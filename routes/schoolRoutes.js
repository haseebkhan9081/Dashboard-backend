// routes/schoolRoutes.js
import express from 'express'
import { createSchool } from '../controllers/schoolController.js'
import { deleteSchool } from '../controllers/schoolController.js'
const router = express.Router()

router.post('/schools/create', createSchool)
router.delete('/schools/delete', deleteSchool)
export default router
