import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectTestDb } from './setup.js';
import Vendor from '../src/models/Vendor.js';
import Category from '../src/models/Category.js';
import mongoose from 'mongoose';

const app = createApp();

let adminToken;
let vendorToken;
let vendorId;
let pendingId;

async function registerVendor(overrides) {
  const v = new Vendor({
    businessName: overrides.businessName,
    contactEmail: overrides.contactEmail,
    role: overrides.role || 'vendor',
    status: overrides.status || 'Pending',
  });
  await v.setPassword(overrides.password);
  await v.save();
  return v;
}

beforeAll(async () => {
  await connectTestDb();
  await Category.create({ name: 'Electronics', slug: 'electronics', commissionDefault: 8 });

  const admin = await registerVendor({
    businessName: 'Admin',
    contactEmail: 'admin@test.com',
    password: 'admin123',
    role: 'admin',
    status: 'Active',
  });
  adminToken = admin.issueJwt();

  const vendor = await registerVendor({
    businessName: 'Acme',
    contactEmail: 'vendor@test.com',
    password: 'vendor123',
    role: 'vendor',
    status: 'Active',
  });
  vendorId = vendor._id;
  vendorToken = vendor.issueJwt();

  const pending = await registerVendor({
    businessName: 'Beta',
    contactEmail: 'beta@test.com',
    password: 'beta123',
    role: 'vendor',
    status: 'Pending',
  });
  pendingId = pending._id;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Auth', () => {
  it('registers a new vendor (status Pending) and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      businessName: 'New Vendor',
      contactEmail: 'new@test.com',
      password: 'secret123',
      phone: '555',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.vendor.status).toBe('Pending');
    expect(res.body.vendor.contactEmail).toBe('new@test.com');
    expect(res.body.vendor).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      businessName: 'Dup',
      contactEmail: 'vendor@test.com',
      password: 'secret123',
    });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      businessName: 'Bad',
      contactEmail: 'not-an-email',
      password: 'secret123',
    });
    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      contactEmail: 'vendor@test.com',
      password: 'vendor123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      contactEmail: 'vendor@test.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
  });

  it('rejects /me without token with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns profile with valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vendor.contactEmail).toBe('vendor@test.com');
  });
});

describe('Vendor profile', () => {
  it('updates own profile', async () => {
    const res = await request(app)
      .put('/api/vendors/me')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        businessName: 'Acme Renamed',
        businessDetails: { address: 'New Address' },
        commissionRate: 12,
      });
    expect(res.status).toBe(200);
    expect(res.body.vendor.businessName).toBe('Acme Renamed');
    expect(res.body.vendor.businessDetails.address).toBe('New Address');
    expect(res.body.vendor.commissionRate).toBe(12);
  });

  it('changes password and can login with new one', async () => {
    const res = await request(app)
      .put('/api/vendors/me/password')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ currentPassword: 'vendor123', newPassword: 'newpass123' });
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({
      contactEmail: 'vendor@test.com',
      password: 'newpass123',
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    vendorToken = login.body.token;
  });

  it('rejects wrong current password', async () => {
    const res = await request(app)
      .put('/api/vendors/me/password')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ currentPassword: 'nope', newPassword: 'another123' });
    expect(res.status).toBe(401);
  });

  it('submits verification documents', async () => {
    const res = await request(app)
      .post('/api/vendors/me/verification')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ documents: [{ name: 'GST', url: 'https://example.com/g.pdf' }], notes: 'please review' });
    expect(res.status).toBe(200);
    expect(res.body.verification.documents).toHaveLength(1);
    expect(res.body.verification.submittedAt).toBeTruthy();
  });
});

describe('Admin vendor management', () => {
  it('forbids non-admin from listing vendors', async () => {
    const res = await request(app).get('/api/vendors').set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });

  it('admin lists vendors', async () => {
    const res = await request(app).get('/api/vendors').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vendors.length).toBeGreaterThanOrEqual(3);
  });

  it('admin filters vendors by status', async () => {
    const res = await request(app)
      .get('/api/vendors?status=Pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vendors.every((v) => v.status === 'Pending')).toBe(true);
  });

  it('admin approves a pending vendor (Pending -> Active)', async () => {
    const res = await request(app)
      .patch(`/api/vendors/${pendingId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Active', notes: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.vendor.status).toBe('Active');
    expect(res.body.vendor.verification.reviewedAt).toBeTruthy();
  });

  it('admin suspends a vendor', async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Suspended' });
    expect(res.status).toBe(200);
    expect(res.body.vendor.status).toBe('Suspended');
  });
});
