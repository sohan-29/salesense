import Vendor from '../models/Vendor.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/vendors — admin list with status filter + search. */
export const listVendors = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status && ['Pending', 'Active', 'Suspended'].includes(status)) filter.status = status;
  if (q) {
    filter.$or = [
      { businessName: { $regex: q, $options: 'i' } },
      { contactEmail: { $regex: q, $options: 'i' } },
    ];
  }
  const vendors = await Vendor.find(filter).populate('categories', 'name slug').sort('-createdAt');
  res.json({ vendors });
});

/** GET /api/vendors/:id — admin fetch one. */
export const getVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).populate('categories', 'name slug');
  if (!vendor) throw ApiError.notFound('Vendor not found');
  res.json({ vendor });
});

/** GET /api/vendors/me — own profile (also covered by /api/auth/me). */
export const getMe = asyncHandler(async (req, res) => {
  await req.vendor.populate('categories', 'name slug');
  res.json({ vendor: req.vendor });
});

/** PUT /api/vendors/me — update own profile. */
export const updateMe = asyncHandler(async (req, res) => {
  const { businessName, phone, businessDetails, commissionRate, categories } = req.body;

  if (businessName !== undefined) req.vendor.businessName = businessName;
  if (phone !== undefined) req.vendor.phone = phone;
  if (businessDetails !== undefined) {
    req.vendor.businessDetails = { ...req.vendor.businessDetails.toObject(), ...businessDetails };
  }
  if (commissionRate !== undefined) req.vendor.commissionRate = commissionRate;
  if (categories !== undefined) req.vendor.categories = categories;

  await req.vendor.save();
  await req.vendor.populate('categories', 'name slug');
  res.json({ vendor: req.vendor });
});

/** PUT /api/vendors/me/password — change password. */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const vendor = await Vendor.findById(req.vendor._id).select('+passwordHash');
  const ok = await vendor.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  await vendor.setPassword(newPassword);
  await vendor.save();
  res.json({ message: 'Password updated' });
});

/** POST /api/vendors/me/verification — submit onboarding documents. */
export const submitVerification = asyncHandler(async (req, res) => {
  const { documents, notes } = req.body;
  req.vendor.verification = {
    documents,
    notes: notes || '',
    submittedAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
  };
  await req.vendor.save();
  res.json({ verification: req.vendor.verification });
});

/** PATCH /api/vendors/:id/status — admin approve/suspend/reactivate. */
export const updateStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw ApiError.notFound('Vendor not found');

  vendor.status = status;
  if (notes !== undefined) vendor.verification.notes = notes;
  vendor.verification.reviewedBy = req.vendor._id;
  vendor.verification.reviewedAt = new Date();
  await vendor.save();

  res.json({ vendor });
});
