import { z } from 'zod';

export const registerSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  contactEmail: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

export const loginSchema = z.object({
  contactEmail: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

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

export const restockSchema = z.object({
  stockAvailable: z.number().int().min(0),
  reorderThreshold: z.number().int().min(0).optional(),
});

export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).optional(),
});

export const transactionCreateSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product id'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});
