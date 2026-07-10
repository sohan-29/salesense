import Category from '../models/Category.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/categories — list all categories. */
export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find().sort('name');
  res.json({ categories });
});

/** POST /api/categories — create a category (admin). */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, parent, commissionDefault } = req.body;
  const category = await Category.create({
    name,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
    parent: parent || undefined,
    commissionDefault,
  });
  res.status(201).json({ category });
});
