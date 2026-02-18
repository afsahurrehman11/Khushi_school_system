import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import Button from '../../../components/Button';
import { apiCall } from '../../../utils/api';
import logger from '../../../utils/logger';

interface LoginFormData {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    logger.info('AUTH', `Starting login attempt with email: ${formData.email}`);

    try {
      const body = new URLSearchParams();
      body.append('username', formData.email);
      body.append('password', formData.password);

      logger.info('AUTH', 'Sending login request to /api/token');
      const response = await apiCall('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      logger.info('AUTH', `Login API response status: ${response.status}`);

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();
      logger.info('AUTH', `Login API response data: ${JSON.stringify(data)}`);
      
      // Store token and user info
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      logger.info('AUTH', 'Stored token and user in localStorage');
      
      // Redirect based on role
      const role = data.user.role.toLowerCase();
      logger.info('AUTH', `Login successful for role: ${role}, navigating to /dashboard/${role}`);
      
      navigate(`/dashboard/${role}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Login failed';
      logger.error('AUTH', `Login failed: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-100 p-3 rounded-full">
            <LogIn className="w-8 h-8 text-indigo-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          School ERP
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Sign in to your account
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="admin@school.edu"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 mt-6"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

       
      </motion.div>
    </div>
  );
};

export default LoginPage;
