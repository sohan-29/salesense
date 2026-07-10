import Customer from '../models/Customer.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/customers — admin lists all customers. */
export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().sort('-createdAt').select('-__v');
  res.json({ customers });
});
