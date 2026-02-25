/**
 * Authentication Service
 * Handles login, token management, and user context
 * Uses centralized global_users for authentication
 */

import { LoginRequest, LoginResponse, User, TokenPayload } from '../types';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

class AuthService {
  private tokenKey = 'auth_token';
  private userKey = 'user';

  /**
   * Login user with email and password
   * Uses centralized authentication against global_users
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      logger.info('AUTH', `[API] 🔐 Logging in: ${credentials.email}`);
      // FastAPI OAuth2 token endpoint expects form-encoded fields 'username' and 'password'
      const params = new URLSearchParams();
      params.append('username', (credentials as any).email || (credentials as any).username || '');
      params.append('password', (credentials as any).password || '');

      const response = await fetch(`${API_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('AUTH', `[API] ❌ Login failed: ${error.detail || 'Unknown error'}`);
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();
      // backend returns { access_token, token_type, user }
      const token = data.access_token || data.token;
      const user = data.user;
      logger.info('AUTH', `[API] ✅ Login successful: ${user?.email} (${user?.role})`);

      if (token && user) {
        this.setToken(token);
        this.setUser(user);
      }

      return { token, user, access_token: token, token_type: 'bearer' } as LoginResponse;
    } catch (error: any) {
      logger.error('AUTH', `[API] ❌ Login error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set authentication from external source (e.g., after school creation)
   * This allows auto-login without a separate login request
   */
  setAuthFromResponse(authData: LoginResponse): void {
    const token = authData.access_token || (authData as any).token;
    const user = authData.user;
    
    if (token && user) {
      logger.info('AUTH', `[API] 🔓 Setting auth from response: ${user.email} (${user.role})`);
      this.setToken(token);
      this.setUser(user);
    }
  }

  /**
   * Logout user
   */
  logout(): void {
    logger.info('AUTH', '[API] 🔓 Logging out');
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Set token
   */
  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * Set user
   */
  setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken() && !!this.getUser();
  }

  /**
   * Get auth headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  /**
   * Parse JWT payload (no verification - client-side only)
   */
  parseToken(): TokenPayload | null {
    const token = this.getToken();
    if (!token) return null;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]));
      return payload as TokenPayload;
    } catch (error) {
      logger.error('AUTH', `[API] ❌ Failed to parse token: ${String(error)}`);
      return null;
    }
  }

  /**
   * Get current school_id from token
   */
  getSchoolId(): string | null {
    const payload = this.parseToken();
    return payload?.school_id || null;
  }

  /**
   * Get current school_slug from token
   */
  getSchoolSlug(): string | null {
    const payload = this.parseToken();
    return payload?.school_slug || null;
  }

  /**
   * Get current database_name from token
   */
  getDatabaseName(): string | null {
    const payload = this.parseToken();
    return payload?.database_name || null;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const payload = this.parseToken();
    if (!payload) return true;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now;
  }

  /**
   * Get redirect path based on user role
   */
  getRedirectPathForRole(role: string): string {
    const normalizedRole = role.toLowerCase();
    switch (normalizedRole) {
      case 'root':
        return '/root-admin';
      case 'admin':
        return '/students';
      case 'staff':
        return '/students';
      default:
        return '/login';
    }
  }
}

export const authService = new AuthService();
