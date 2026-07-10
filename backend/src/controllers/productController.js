import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** POST /api/products — vendor creates a product (auto-creates inventory). */
export const createProduct = asyncHandler(async (req, res) => {
  const { stock, reorderThreshold, ...fields } = req.body;

  const product = await Product.create({ ...fields, vendorId: req.vendor._id });
  await Inventory.create({
    productId: product._id,
    vendorId: req.vendor._id,
    stockAvailable: stock,
    reorderThreshold,
  });

  res.status(201).json({ product });
});

/** GET /api/products — vendor sees own; admin sees all. */
export const listProducts = asyncHandler(async (req, res) => {
  const filter = req.vendor.role === 'admin' ? {} : { vendorId: req.vendor._id };
  const products = await Product.find(filter).sort('-createdAt');
  res.json({ products });
});

/** GET /api/products/:id — owner or admin. */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  if (req.vendor.role !== 'admin' && !product.vendorId.equals(req.vendor._id)) {
    throw ApiError.forbidden('Not allowed');
  }
  res.json({ product });
});

/** PUT /api/products/:id — owner or admin. */
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  if (req.vendor.role !== 'admin' && !product.vendorId.equals(req.vendor._id)) {
    throw ApiError.forbidden('Not allowed');
  }

  // stock/reorderThreshold are managed via inventory endpoints; ignore here
  const { stock, reorderThreshold, ...fields } = req.body;
  product.set(fields);
  await product.save();
  res.json({ product });
});

/** DELETE /api/products/:id — owner or admin. */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  if (req.vendor.role !== 'admin' && !product.vendorId.equals(req.vendor._id)) {
    throw ApiError.forbidden('Not allowed');
  }
  await product.deleteOne();
  await Inventory.deleteOne({ productId: product._id });
  res.json({ message: 'Product deleted' });
});
