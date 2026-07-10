import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { signToken } from '../utils/jwt.js';

const { Schema } = mongoose;

/**
 * A marketplace customer. Browses vendor products. Distinct from Vendor
 * (vendors sell; customers buy/browse).
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['customer'], default: 'customer' },
  },
  { timestamps: true }
);

customerSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

customerSchema.methods.comparePassword = async function (password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

customerSchema.methods.issueJwt = function () {
  return signToken({ sub: this._id.toString(), role: 'customer' });
};

customerSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('Customer', customerSchema);
