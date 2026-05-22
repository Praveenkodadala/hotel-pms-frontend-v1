/**
 * Axios API instance (ESM) — v5
 *
 * Request interceptor reads localStorage on EVERY request.
 * This is the critical layer that ensures the correct X-Property-ID
 * is always sent, even if the header wasn't set on the axios defaults
 * (defensive coding).
 *
 * Priority for X-Property-ID:
 *   1. axios.defaults.headers (set synchronously by switchProperty)
 *   2. localStorage fallback (set synchronously by switchProperty)
 *   3. Nothing (super admin without a property selected)
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30 second timeout
});

// ── Request interceptor ───────────────────────────────────────────
api.interceptors.request.use((config) => {
  // Token
  const token = localStorage.getItem('pms_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;

  // Property header — read from localStorage on each request
  // (localStorage is updated synchronously by switchProperty before any refetch)
  const propertyId = localStorage.getItem('pms_active_property_id');
  if (propertyId) {
    config.headers['X-Property-ID'] = propertyId;
  } else {
    // Ensure stale header doesn't persist if property was cleared
    delete config.headers['X-Property-ID'];
  }

  return config;
}, (error) => Promise.reject(error));

// ── Response interceptor ──────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const code   = err.response?.data?.code;

    // Token expired or invalid — force logout
    if (status === 401) {
      localStorage.removeItem('pms_token');
      localStorage.removeItem('pms_active_property_id');
      delete api.defaults.headers.common['Authorization'];
      delete api.defaults.headers.common['X-Property-ID'];
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    // Property access denied — clear stale property ID
    if (status === 403 && code === 'PROPERTY_ACCESS_DENIED') {
      console.error('[API] Property access denied — clearing stored property ID');
      localStorage.removeItem('pms_active_property_id');
      delete api.defaults.headers.common['X-Property-ID'];
      window.dispatchEvent(new CustomEvent('property-access-denied'));
      return Promise.reject(err);
    }

    // No property selected — shouldn't happen with correct frontend
    if (status === 400 && code === 'NO_PROPERTY_SELECTED') {
      console.warn('[API] No property selected — this is a frontend bug');
      return Promise.reject(err);
    }

    // Subscription expired
    if (status === 403 && code === 'SUBSCRIPTION_EXPIRED') {
      window.dispatchEvent(new CustomEvent('subscription-expired', {
        detail: err.response.data,
      }));
    }

    return Promise.reject(err);
  }
);

export default api;
