import Vendor from '../models/Vendor.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/auth/register — vendor self-registration (status: Pending). */
export const register = asyncHandler(async (req, res) => {
  const { businessName, contactEmail, password, phone, gstNumber, address, description } = req.body;

  const existing = await Vendor.findOne({ contactEmail });
  if (existing) throw ApiError.conflict('A vendor with that email already exists');

  const vendor = new Vendor({
    businessName,
    contactEmail,
    phone,
    businessDetails: { gstNumber, address, description },
  });
  await vendor.setPassword(password);
  await vendor.save();

  const token = vendor.issueJwt();
  res.status(201).json({ token, vendor });
});

/** POST /api/auth/login — email + password → JWT. */
export const login = asyncHandler(async (req, res) => {
  const { contactEmail, password } = req.body;

  const vendor = await Vendor.findOne({ contactEmail }).select('+passwordHash');
  if (!vendor) throw ApiError.unauthorized('Invalid credentials');

  const ok = await vendor.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  if (vendor.status === 'Suspended') throw ApiError.forbidden('Account suspended');

  const token = vendor.issueJwt();
  res.json({ token, vendor });
});

/** GET /api/auth/me — current vendor profile. */
export const me = asyncHandler(async (req, res) => {
  res.json({ vendor: req.vendor });
});
