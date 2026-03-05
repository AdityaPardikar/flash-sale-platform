/**
 * Unified API Service
 * Week 8 Day 2: API Client Unification
 *
 * Single axios-based HTTP client with:
 * - VITE_API_URL environment variable support
 * - Automatic token injection (public + admin)
 * - Response/error interceptors
 * - Type-safe request methods
 * - Centralized error handling
 */

import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// ─── Configuration ───────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// ─── Axios Instance ──────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor (auto-inject token) ─────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Admin routes use adminAccessToken, public routes use token
    const isAdminRoute = config.url?.startsWith('/admin');
    const tokenKey = isAdminRoute ? 'adminAccessToken' : 'token';
    const token = localStorage.getItem(tokenKey);

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor (centralized error handling) ───────

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;

      if (status === 401) {
        // Token expired or invalid — check which token to clear
        const isAdmin = error.config?.url?.startsWith('/admin');
        if (isAdmin) {
          localStorage.removeItem('adminAccessToken');
          localStorage.removeItem('adminRefreshToken');
          localStorage.removeItem('adminUser');
          // Redirect to admin login if on admin page
          if (window.location.pathname.startsWith('/admin')) {
            window.location.href = '/admin/login';
          }
        } else {
          localStorage.removeItem('token');
        }
      }

      // Extract meaningful error message
      const message =
        error.response.data?.message ||
        error.response.data?.error ||
        `Request failed with status ${status}`;
      error.message = message;
    } else if (error.request) {
      error.message = 'Network error — please check your connection';
    }

    return Promise.reject(error);
  },
);

// ─── Typed API Methods ───────────────────────────────────────

export const API = {
  async get<T = unknown>(endpoint: string): Promise<T> {
    const response = await apiClient.get<T>(endpoint);
    return response.data;
  },

  async post<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.post<T>(endpoint, data);
    return response.data;
  },

  async put<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.put<T>(endpoint, data);
    return response.data;
  },

  async patch<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.patch<T>(endpoint, data);
    return response.data;
  },

  async delete<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.delete<T>(endpoint, { data });
    return response.data;
  },
};

// ─── Auth-specific Endpoints ─────────────────────────────────

interface AuthResponse {
  success: boolean;
  data?: {
    token: string;
    user: {
      id: number;
      email: string;
      username: string;
    };
  };
  message?: string;
}

export async function registerUser(
  email: string,
  username: string,
  password: string,
): Promise<AuthResponse> {
  return API.post<AuthResponse>('/auth/register', { email, username, password });
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return API.post<AuthResponse>('/auth/login', { email, password });
}

// ─── Export raw client for advanced use ──────────────────────

export { apiClient };
export default API;

export async function getProducts(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/products`);
  if (!response.ok) throw new Error('Failed to fetch products');
  const data = await response.json();
  return data.data || [];
}
