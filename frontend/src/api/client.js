import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const client = axios.create({ baseURL: API_URL, withCredentials: false });

// Attach JWT from localStorage on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('shopsense_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token (lets the app redirect to login)
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('shopsense_token');
    }
    return Promise.reject(error);
  }
);

export default client;

// --- auth (role-aware) --------------------------------------------------
export const authApi = {
  customerRegister: (body) => client.post('/auth/customer/register', body).then((r) => r.data),
  customerLogin: (body) => client.post('/auth/customer/login', body).then((r) => r.data),
  vendorRegister: (body) => client.post('/auth/vendor/register', body).then((r) => r.data),
  vendorLogin: (body) => client.post('/auth/vendor/login', body).then((r) => r.data),
  adminLogin: (body) => client.post('/auth/admin/login', body).then((r) => r.data),
  adminRegister: (body) => client.post('/auth/admin/register', body).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
};

// --- vendor profile + admin vendor management ---------------------------
export const vendorApi = {
  getMe: () => client.get('/vendors/me').then((r) => r.data),
  updateMe: (body) => client.put('/vendors/me', body).then((r) => r.data),
  changePassword: (body) => client.put('/vendors/me/password', body).then((r) => r.data),
  submitVerification: (body) => client.post('/vendors/me/verification', body).then((r) => r.data),
  list: (params) => client.get('/vendors', { params }).then((r) => r.data),
  updateStatus: (id, body) => client.patch(`/vendors/${id}/status`, body).then((r) => r.data),
};

// --- customers (admin) --------------------------------------------------
export const customerApi = {
  list: () => client.get('/customers').then((r) => r.data),
  segments: () => client.get('/customers/segments').then((r) => r.data),
  behaviour: (id) => client.get(`/customers/${id}/behaviour`).then((r) => r.data),
};

// --- products -----------------------------------------------------------
export const productApi = {
  list: () => client.get('/products').then((r) => r.data),
  get: (id) => client.get(`/products/${id}`).then((r) => r.data),
  create: (body) => client.post('/products', body).then((r) => r.data),
  update: (id, body) => client.put(`/products/${id}`, body).then((r) => r.data),
  remove: (id) => client.delete(`/products/${id}`).then((r) => r.data),
};

export const inventoryApi = {
  list: () => client.get('/inventory').then((r) => r.data),
  restock: (productId, body) => client.patch(`/inventory/${productId}`, body).then((r) => r.data),
  lowStock: () => client.get('/inventory/low-stock').then((r) => r.data),
  forecast: (params) => client.get('/inventory/forecast', { params }).then((r) => r.data),
};

export const transactionApi = {
  list: () => client.get('/transactions').then((r) => r.data),
  create: (body) => client.post('/transactions', body).then((r) => r.data),
};

export const analyticsApi = {
  revenue: () => client.get('/analytics/revenue').then((r) => r.data),
  products: () => client.get('/analytics/products').then((r) => r.data),
  summary: () => client.get('/analytics/summary').then((r) => r.data),
  validate: () => client.get('/analytics/validate').then((r) => r.data),
};

export const recommendationApi = {
  forCustomer: (params) => client.get('/recommendations', { params }).then((r) => r.data),
  popular: (params) => client.get('/recommendations/popular', { params }).then((r) => r.data),
};

export const categoryApi = {
  list: () => client.get('/categories').then((r) => r.data),
};
