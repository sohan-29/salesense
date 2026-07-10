import Vendor from '../models/Vendor.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/auth/vendor/register — vendor self-registration (status: Pending). */
export const vendorRegister = asyncHandler(async (req, res) => {
  const { businessName, email, password, phone, gstNumber, address, description } = req.body;

  const existing = await Vendor.findOne({ contactEmail: email });
  if (existing) throw ApiError.conflict('A vendor with that email already exists');

  const vendor = new Vendor({
    businessName,
    contactEmail: email,
    phone,
    businessDetails: { gstNumber, address, description },
  });
  await vendor.setPassword(password);
  await vendor.save();

  res.status(201).json({ token: vendor.issueJwt(), account: vendor, role: 'vendor' });
});

/** POST /api/auth/vendor/login — vendor email + password → JWT. */
export const vendorLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const vendor = await Vendor.findOne({ contactEmail: email }).select('+passwordHash');
  if (!vendor) throw ApiError.unauthorized('Invalid credentials');
  if (vendor.role === 'admin') throw ApiError.unauthorized('Invalid credentials'); // admin uses /admin/login

  const ok = await vendor.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  if (vendor.status === 'Suspended') throw ApiError.forbidden('Account suspended');

  res.json({ token: vendor.issueJwt(), account: vendor, role: 'vendor' });
});

/** POST /api/auth/admin/register — admin self-registration (status: Active). */
export const adminRegister = asyncHandler(async (req, res) => {
  const { businessName, email, password, phone } = req.body;

  const existing = await Vendor.findOne({ contactEmail: email });
  if (existing) throw ApiError.conflict('An admin with that email already exists');

  const admin = new Vendor({
    businessName: businessName || 'Platform Admin',
    contactEmail: email,
    phone,
    role: 'admin',
    status: 'Active',
    commissionRate: 0,
  });
  await admin.setPassword(password);
  await admin.save();

  res.status(201).json({ token: admin.issueJwt(), account: admin, role: 'admin' });
});

/** POST /api/auth/admin/login — admin email + password → JWT. */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const vendor = await Vendor.findOne({ contactEmail: email }).select('+passwordHash');
  if (!vendor || vendor.role !== 'admin') throw ApiError.unauthorized('Invalid credentials');

  const ok = await vendor.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  res.json({ token: vendor.issueJwt(), account: vendor, role: 'admin' });
});

/** GET /api/auth/me — current account (vendor/admin or customer). */
export const me = asyncHandler(async (req, res) => {
  if (req.customer) return res.json({ account: req.customer, role: 'customer' });
  res.json({ account: req.vendor, role: req.vendor.role });
});
