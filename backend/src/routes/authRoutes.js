import express from 'express';
import { register, login, me } from '../controllers/authController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/schemas.js';

const router = express.Router();

router.post('/register', validate.body(registerSchema), register);
router.post('/login', validate.body(loginSchema), login);
router.get('/me', authenticate, me);

export default router;
