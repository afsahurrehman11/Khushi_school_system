/**
 * SaaS Management API Service
 * Handles multi-tenant SaaS operations (Root only)
 */

import { 
  SaaSSchool, 
  SaaSSchoolCreate, 
  SaaSOverviewStats, 
  SchoolStorageHistory,
  SchoolPlan,
  SchoolStatus
} from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

class SaaSService {
  private endpoint = `${API_BASE_URL}/saas`;

  // ================= School Management =================

  /**
   * Create a new school with its own database
   */
  async createSchool(schoolData: SaaSSchoolCreate): Promise<SaaSSchool> {
    try {
      logger.info('SAAS', `Creating school: ${schoolData.school_name}`);
      
      const response = await fetch(`${this.endpoint}/schools`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(schoolData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create school');
      }

      const data = await response.json();
      logger.info('SAAS', `School created: ${data.school_name} (DB: ${data.database_name})`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error creating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all schools with optional filtering
   */
  async getSchools(params?: {
    status?: SchoolStatus;
    plan?: SchoolPlan;
    search?: string;
    skip?: number;
    limit?: number;
  }): Promise<{ items: SaaSSchool[]; total: number }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      if (params?.plan) queryParams.append('plan', params.plan);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());

      const url = `${this.endpoint}/schools?${queryParams.toString()}`;
      logger.info('SAAS', 'Fetching schools');

      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch schools: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SAAS', `Fetched ${data.items?.length || 0} schools`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error fetching schools: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get school by ID
   */
  async getSchool(schoolId: string): Promise<SaaSSchool> {
    try {
      logger.info('SAAS', `Fetching school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`School not found: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SAAS', `School loaded: ${data.school_name}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error fetching school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update school information
   */
  async updateSchool(schoolId: string, updates: Partial<SaaSSchoolCreate>): Promise<SaaSSchool> {
    try {
      logger.info('SAAS', `Updating school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update school');
      }

      const data = await response.json();
      logger.info('SAAS', `School updated: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error updating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Suspend a school (blocks login immediately)
   */
  async suspendSchool(schoolId: string, reason?: string): Promise<SaaSSchool> {
    try {
      logger.info('SAAS', `Suspending school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/suspend`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to suspend school');
      }

      const data = await response.json();
      logger.info('SAAS', `School suspended: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error suspending school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reactivate a suspended school
   */
  async reactivateSchool(schoolId: string): Promise<SaaSSchool> {
    try {
      logger.info('SAAS', `Reactivating school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/reactivate`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reactivate school');
      }

      const data = await response.json();
      logger.info('SAAS', `School reactivated: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error reactivating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a school
   */
  async deleteSchool(schoolId: string, hardDelete: boolean = false): Promise<void> {
    try {
      logger.info('SAAS', `Deleting school: ${schoolId} (hard: ${hardDelete})`);

      const response = await fetch(
        `${this.endpoint}/schools/${schoolId}?hard_delete=${hardDelete}`,
        {
          method: 'DELETE',
          headers: authService.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete school');
      }

      logger.info('SAAS', `School deleted: ${schoolId}`);
    } catch (error: any) {
      logger.error('SAAS', `Error deleting school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset school admin password
   */
  async resetAdminPassword(schoolId: string, newPassword: string): Promise<void> {
    try {
      logger.info('SAAS', `Resetting password for school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/reset-password`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify({ new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset password');
      }

      logger.info('SAAS', `Password reset for school: ${schoolId}`);
    } catch (error: any) {
      logger.error('SAAS', `Error resetting password: ${error.message}`);
      throw error;
    }
  }

  // ================= Analytics =================

  /**
   * Get overview statistics for SaaS dashboard
   */
  async getOverviewStats(): Promise<SaaSOverviewStats> {
    try {
      logger.info('SAAS', 'Fetching overview stats');

      const response = await fetch(`${this.endpoint}/analytics/overview`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SAAS', 'Overview stats loaded');
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error fetching stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get storage history for a school or all schools
   */
  async getStorageHistory(schoolId?: string, days: number = 30): Promise<SchoolStorageHistory[]> {
    try {
      const params = new URLSearchParams();
      if (schoolId) params.append('school_id', schoolId);
      params.append('days', days.toString());

      logger.info('SAAS', `Fetching storage history (${days} days)`);

      const response = await fetch(
        `${this.endpoint}/analytics/storage-history?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch storage history: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SAAS', 'Storage history loaded');
      
      // Handle both single school and array response
      return Array.isArray(data) ? data : [data];
    } catch (error: any) {
      logger.error('SAAS', `Error fetching storage history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Manually refresh stats for a school
   */
  async refreshSchoolStats(schoolId: string): Promise<any> {
    try {
      logger.info('SAAS', `Refreshing stats for school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/analytics/refresh-stats/${schoolId}`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to refresh stats');
      }

      const data = await response.json();
      logger.info('SAAS', `Stats refreshed for school: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error refreshing stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get database stats for a school
   */
  async getSchoolDatabaseStats(schoolId: string): Promise<any> {
    try {
      logger.info('SAAS', `Fetching database stats for school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/database-stats`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch database stats: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SAAS', `Database stats loaded for school: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error fetching database stats: ${error.message}`);
      throw error;
    }
  }
}

export const saasService = new SaaSService();
export default saasService;
