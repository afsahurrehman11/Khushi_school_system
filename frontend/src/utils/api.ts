// API Configuration
import API_BASE_URL from '../config';

// Helper function to get authorization headers
export const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper function to make API calls
export const apiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  console.log(`[API] Making ${options.method || 'GET'} request to: ${url}`);
  const response = await fetch(url, {
    ...options,
    headers,
  });
  console.log(`[API] Response status: ${response.status} for ${url}`);

  return response;
};

// Helper function for JSON API calls
export const apiCallJSON = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  console.log(`[API JSON] Starting JSON request to: ${endpoint}`);
  const response = await apiCall(endpoint, options);
  
  if (response.status === 401) {
    console.log('[API JSON] 401 Unauthorized - clearing token and redirecting to login');
    // Unauthorized - redirect to login
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized - redirecting to login');
  }
  
  if (!response.ok) {
    try {
      const error = await response.json();
      console.error(`[API JSON] Request failed: ${error.detail || `Status ${response.status}`}`);
      throw new Error(error.detail || `Request failed with status ${response.status}`);
    } catch (parseErr) {
      console.error(`[API JSON] Request failed: Status ${response.status}, parse error: ${parseErr}`);
      throw new Error(`Request failed with status ${response.status}`);
    }
  }
  
  const data = await response.json();
  console.log(`[API JSON] Success: Received data for ${endpoint}`);
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
