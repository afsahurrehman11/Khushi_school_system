// API Configuration
import { config } from '../config';
import { authService } from '../services/auth';
import logger from './logger';

// Helper function to get authorization headers
export const getAuthHeaders = (): HeadersInit => {
  const token = authService.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper function to make API calls
export const apiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const url = `${config.API_BASE_URL}${endpoint}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  logger.info('API', `${options.method || 'GET'} ${url}`);
  const response = await fetch(url, {
    ...options,
    headers,
  });
  logger.info('API', `Response ${response.status} ${url}`);

  return response;
};

// Helper function for JSON API calls
export const apiCallJSON = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  logger.info('API', `JSON ${endpoint}`);
  const response = await apiCall(endpoint, options);
  
  if (response.status === 401) {
    logger.warn('API', '401 Unauthorized - clearing token and redirecting to login');
    // Unauthorized - redirect to login
    authService.logout();
    window.location.href = '#/login';
    throw new Error('Unauthorized - redirecting to login');
  }
  
  if (!response.ok) {
    try {
      const error = await response.json();
      logger.error('API', `Request failed: ${error.detail || `Status ${response.status}`}`);
      throw new Error(error.detail || `Request failed with status ${response.status}`);
    } catch (parseErr) {
      logger.error('API', `Request failed: Status ${response.status}, parse error: ${parseErr}`);
      throw new Error(`Request failed with status ${response.status}`);
    }
  }
  
  const data = await response.json();
  logger.info('API', `JSON success ${endpoint}`);
  return data;
};

// API methods
export const api = {
  get: async <T = any>(endpoint: string): Promise<T> => {
    return apiCallJSON<T>(endpoint, { method: 'GET' });
  },

  post: async <T = any>(endpoint: string, data: any): Promise<T> => {
    return apiCallJSON<T>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  },

  put: async <T = any>(endpoint: string, data: any): Promise<T> => {
    return apiCallJSON<T>(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  },

  delete: async <T = any>(endpoint: string): Promise<T> => {
    return apiCallJSON<T>(endpoint, { method: 'DELETE' });
  },
};

export default api;
