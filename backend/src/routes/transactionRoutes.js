import express from 'express';
import { createTransaction, listTransactions } from '../controllers/transactionController.js';
import authenticate from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { transactionCreateSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

router.post('/', validate.body(transactionCreateSchema), createTransaction);
router.get('/', listTransactions);

export default router;
