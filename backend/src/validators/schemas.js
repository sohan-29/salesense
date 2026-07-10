import { z } from 'zod';

// --- Auth: customer -----------------------------------------------------
export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().trim().optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
});

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// --- Auth: vendor -------------------------------------------------------
export const vendorRegisterSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().trim().optional().or(z.literal('')),
  gstNumber: z.string().trim().optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().optional().or(z.literal('')),
});

export const vendorLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// Admin login uses the same shape as vendor login.
export const adminLoginSchema = vendorLoginSchema;

export const adminRegisterSchema = z.object({
  businessName: z.string().trim().min(2, 'Name is required').optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().trim().optional().or(z.literal('')),
});

// --- Vendor profile -----------------------------------------------------
export const updateProfileSchema = z.object({
  businessName: z.string().min(2).optional(),
  phone: z.string().optional(),
  businessDetails: z
    .object({
      address: z.string().optional(),
      gstNumber: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  categories: z.array(z.string()).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const submitVerificationSchema = z.object({
  documents: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().min(1),
      })
    )
    .min(1, 'At least one verification document is required'),
  notes: z.string().optional(),
});

export const vendorStatusSchema = z.object({
  status: z.enum(['Active', 'Suspended', 'Pending']),
  notes: z.string().optional(),
});

// --- Products -----------------------------------------------------------
export const productCreateSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  category: z.string().optional(),
  price: z.number().min(0, 'Price must be >= 0'),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  stock: z.number().int().min(0).optional().default(0),
  reorderThreshold: z.number().int().min(0).optional().default(10),
  status: z.enum(['draft', 'active', 'archived']).optional().default('active'),
});

export const productUpdateSchema = productCreateSchema.partial();

// --- Inventory ----------------------------------------------------------
export const restockSchema = z.object({
  stockAvailable: z.number().int().min(0),
  reorderThreshold: z.number().int().min(0).optional(),
});

export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).optional(),
});

// --- Transactions -------------------------------------------------------
export const transactionCreateSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product id'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});
