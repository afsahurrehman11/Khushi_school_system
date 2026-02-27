/**
 * Root Admin API Service
 * Handles admin user management (Root only)
 */

import { AdminUser } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

class RootAdminService {
  private endpoint = `${API_BASE_URL}/root-admin`;

  /**
   * Get all admins (Root only)
   */
  async getAllAdmins(): Promise<AdminUser[]> {
    try {
      logger.info('ROOT_ADMIN', 'Fetching all admins');
      const response = await fetch(`${this.endpoint}/admins`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch admins: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ROOT_ADMIN', `Fetched ${data.length} admins`);
      return data;
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error fetching admins: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get admins for a school (Root only)
   */
  async getSchoolAdmins(schoolId: string): Promise<AdminUser[]> {
    try {
      logger.info('ROOT_ADMIN', `Fetching admins for school: ${schoolId}`);
      const response = await fetch(`${this.endpoint}/schools/${schoolId}/admins`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch school admins: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ROOT_ADMIN', `Fetched ${data.length} admins for school`);
      return data;
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error fetching school admins: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new admin (Root only)
   */
  async createAdmin(admin: {
    email: string;
    name: string;
    phone?: string;
    school_id: string;
    password: string;
  }): Promise<AdminUser> {
    try {
      logger.info('ROOT_ADMIN', `Creating admin: ${admin.email}`);
      const response = await fetch(`${this.endpoint}/admins`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(admin),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create admin');
      }

      const data = await response.json();
      logger.info('ROOT_ADMIN', `Admin created: ${data.email}`);
      return data;
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error creating admin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update admin (Root only)
   */
  async updateAdmin(adminId: string, updates: Partial<AdminUser>): Promise<AdminUser> {
    try {
      logger.info('ROOT_ADMIN', `Updating admin: ${adminId}`);
      const response = await fetch(`${this.endpoint}/admins/${adminId}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update admin');
      }

      const data = await response.json();
      logger.info('ROOT_ADMIN', `Admin updated: ${data.email}`);
      return data;
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error updating admin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete admin (Root only)
   */
  async deleteAdmin(adminId: string): Promise<void> {
    try {
      logger.info('ROOT_ADMIN', `Deleting admin: ${adminId}`);
      const response = await fetch(`${this.endpoint}/admins/${adminId}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete admin');
      }

      logger.info('ROOT_ADMIN', `Admin deleted: ${adminId}`);
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error deleting admin: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset admin password (Root only)
   */
  async resetAdminPassword(adminId: string, newPassword: string): Promise<void> {
    try {
      logger.info('ROOT_ADMIN', `Resetting password for admin: ${adminId}`);
      const response = await fetch(`${this.endpoint}/admins/${adminId}/reset-password`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify({ new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset password');
      }

      logger.info('ROOT_ADMIN', `Admin password reset: ${adminId}`);
    } catch (error: any) {
      logger.error('ROOT_ADMIN', `Error resetting password: ${error.message}`);
      throw error;
    }
  }
}

export const rootAdminService = new RootAdminService();
