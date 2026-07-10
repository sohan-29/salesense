import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { signToken } from '../utils/jwt.js';

const { Schema } = mongoose;

/**
 * A marketplace vendor (or platform admin via role).
 * Extends the concept-note starter with auth, business details, commission,
 * onboarding/verification, and lifecycle status.
 */
const vendorSchema = new Schema(
  {
    businessName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },

    businessDetails: {
      address: { type: String, trim: true, default: '' },
      gstNumber: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },

    // Categories the vendor sells in (refs to Category).
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],

    commissionRate: { type: Number, default: 0, min: 0, max: 100 },

    // lifecycle
    status: {
      type: String,
      enum: ['Pending', 'Active', 'Suspended'],
      default: 'Pending',
      index: true,
    },

    role: { type: String, enum: ['vendor', 'admin'], default: 'vendor' },

    verification: {
      documents: [
        {
          name: { type: String, trim: true },
          url: { type: String, trim: true },
        },
      ],
      submittedAt: { type: Date, default: null },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
      reviewedAt: { type: Date, default: null },
      notes: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

// --- password helpers -------------------------------------------------
// We keep the cleartext password on the instance only (not the schema) so it
// is never persisted.
vendorSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

vendorSchema.methods.comparePassword = async function (password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

vendorSchema.methods.issueJwt = function () {
  return signToken({ sub: this._id.toString(), role: this.role, status: this.status });
};

// strip sensitive fields from any JSON serialisation
vendorSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('Vendor', vendorSchema);
