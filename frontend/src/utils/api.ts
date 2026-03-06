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
  // Normalize endpoint to avoid double-prefixing when callers pass '/api/...' while
  // `config.API_BASE_URL` already contains '/api'. Also allow full URLs.
  let url: string;
  if (/^https?:\/\//i.test(endpoint)) {
    url = endpoint; // absolute URL passed
  } else {
    // remove any leading '/api' or slashes so we can safely join
    const trimmed = endpoint.replace(/^\/api/i, '').replace(/^\/+/, '');
    url = `${config.API_BASE_URL}/${trimmed}`;
  }
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
    // Handle error responses with robustness against non-JSON payloads
    const contentType = response.headers.get('content-type') || '';
    let errorMessage = `Request failed with status ${response.status}`;
    
    if (contentType.includes('application/json')) {
      try {
        const error = await response.json();
        errorMessage = error.detail || errorMessage;
      } catch (parseErr) {
        // Ignore JSON parse error; use generic message
      }
    } else {
      // Non-JSON response (HTML error page from backend/proxy)
      try {
        const text = await response.text();
        if (text.includes('Application Error')) {
          errorMessage = 'Backend service error - server may be restarting. Please try again in a moment.';
        } else if (text.includes('502') || text.includes('Bad Gateway')) {
          errorMessage = 'Backend temporarily unavailable (502). Please retry.';
        } else {
          errorMessage = `Server error: ${response.status}. Please try again.`;
        }
      } catch (e) {
        // Ignore any error reading response text
      }
    }
    
    logger.error('API', `Endpoint ${endpoint} failed: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  // Ensure we actually received JSON
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    logger.error('API', `Expected JSON but got: ${text.slice(0, 1000)}`);
    throw new Error('Invalid server response: expected JSON');
  }

  const data = await response.json();
  logger.info('API', `JSON success ${endpoint}`);
  // Log the actual response data for debugging
  logger.debug('API', `[${endpoint}] Full response body: ${JSON.stringify(data)}`);
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
