// routes/userRoutes.js
import express from 'express'
import { fetchUserSchools } from '../controllers/userController.js'

const router = express.Router()

router.get('/user-schools', fetchUserSchools)

export default router
    