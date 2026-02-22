import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, CheckCircle } from 'lucide-react';
import { authService } from '../services/auth';
import logger from '../utils/logger';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      logger.info('AUTH', `[API] 🔐 Login attempt for ${email}`);
      
      const response = await authService.login({ email, password });
      
      if (response && response.token) {
        // Token is automatically saved by authService.login()
        const user = authService.getUser();
        const schoolId = authService.getSchoolId();
        
        logger.info('AUTH', `[API] ✅ Login successful for ${email}`);
        logger.info('AUTH', `[SCHOOL:${schoolId}] [ADMIN:${email}] 🎓 Authenticated as ${user?.role}`);
        
        setMessage({ type: 'success', text: 'Login successful! Redirecting...' });
        
        // Redirect based on role
        setTimeout(() => {
          if (user?.role === 'Root') {
            navigate('/root-admin');
          } else if (user?.role === 'Admin') {
            navigate('/admin');
          } else {
            navigate('/');
          }
        }, 1500);
      } else {
        throw new Error('No token received from server');
      }
    } catch (error: any) {
      logger.error('AUTH', `[API] ❌ Login failed: ${error.message}`);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Login failed. Please check your credentials.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-gradient-to-br from-blue-600 to-blue-500 rounded-full mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Khushi School</h1>
          <p className="text-slate-600">Student Information System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow p-8 border border-slate-200">
          {/* Messages */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.type === 'success' 
                ? <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0 text-green-600" /> 
                : <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 text-red-600" />
              }
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-white border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder-slate-400"
                required
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-white border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder-slate-400"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition text-sm px-2"
                  disabled={loading}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                className="w-4 h-4 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-700">
                Remember me
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 active:scale-95'
              }`}
            >
              <LogIn className="w-5 h-5" />
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials removed for security/privacy */}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          © 2024 Khushi School System. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
