import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface LoginFormData {
  email: string;
  password: string;
  twoFactorCode: string;
}

interface LoginResponse {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    admin: {
      id: number;
      email: string;
      role: string;
      permissions: string[];
    };
  };
  message?: string;
}

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    twoFactorCode: '',
  });
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await axios.post<LoginResponse>('/api/admin/auth/login', {
        email: formData.email,
        password: formData.password,
        twoFactorCode: formData.twoFactorCode || undefined,
      });

      if (response.data.success && response.data.data) {
        // Store tokens
        localStorage.setItem('adminAccessToken', response.data.data.accessToken);
        localStorage.setItem('adminRefreshToken', response.data.data.refreshToken);
        localStorage.setItem('adminUser', JSON.stringify(response.data.data.admin));

        // Redirect to admin dashboard
        navigate('/admin/dashboard');
      }
    } catch (err: unknown) {
      const error = err as Record<string, any>; // @ts-ignore
      if (error.response?.status === 403 && error.response?.data?.message?.includes('2FA')) {
        // 2FA required
        setRequiresTwoFactor(true);
        setError('Please enter your 2FA code');
      } else {
        setError(
          error.response?.data?.message ||
            'Login failed. Please check your credentials and try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-purple-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-full p-4">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
          <p className="text-blue-200">Flash Sale Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-semibold text-white mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-100 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                         text-white placeholder-blue-200/50 
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
                placeholder="admin@example.com"
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                         text-white placeholder-blue-200/50 
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
                placeholder="••••••••"
              />
            </div>

            {/* 2FA Code Field (conditional) */}
            {requiresTwoFactor && (
              <div className="animate-fadeIn">
                <label
                  htmlFor="twoFactorCode"
                  className="block text-sm font-medium text-blue-100 mb-2"
                >
                  Two-Factor Authentication Code
                </label>
                <input
                  type="text"
                  id="twoFactorCode"
                  name="twoFactorCode"
                  value={formData.twoFactorCode}
                  onChange={handleChange}
                  required={requiresTwoFactor}
                  disabled={loading}
                  maxLength={6}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg 
                           text-white text-center text-2xl tracking-widest
                           placeholder-blue-200/50 
                           focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200"
                  placeholder="000000"
                />
                <p className="mt-2 text-xs text-blue-200">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 
                       text-white font-semibold rounded-lg
                       hover:from-blue-600 hover:to-purple-700 
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-purple-900
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                       shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-blue-200">Secure admin access only</p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-blue-300">
            🔒 This is a secure area. All access is logged and monitored.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
