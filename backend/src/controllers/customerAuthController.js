import Customer from '../models/Customer.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/auth/customer/register — customer self-registration. */
export const customerRegister = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  const existing = await Customer.findOne({ email });
  if (existing) throw ApiError.conflict('A customer with that email already exists');

  const customer = new Customer({ name, email, phone, address });
  await customer.setPassword(password);
  await customer.save();

  res.status(201).json({ token: customer.issueJwt(), account: customer, role: 'customer' });
});

/** POST /api/auth/customer/login — customer email + password → JWT. */
export const customerLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const customer = await Customer.findOne({ email }).select('+passwordHash');
  if (!customer) throw ApiError.unauthorized('Invalid credentials');

  const ok = await customer.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  res.json({ token: customer.issueJwt(), account: customer, role: 'customer' });
});
