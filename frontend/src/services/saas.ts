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
  SchoolStatus,
  SchoolCreatedResponse,
  LoginResponse
} from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

class SaaSService {
  private endpoint = `${API_BASE_URL}/saas`;

  // ================= School Management =================

  /**
   * Create a new school with its own database
   * Returns SchoolCreatedResponse with admin_auth for auto-login
   */
  async createSchool(schoolData: SaaSSchoolCreate): Promise<SchoolCreatedResponse> {
    try {
      logger.info('SAAS', `Creating school: ${schoolData.school_name}`);
      
      const response = await fetch(`${this.endpoint}/schools`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(schoolData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // Normalize validation error details into a readable string
        let msg = 'Failed to create school';
        if (error.detail) {
          if (Array.isArray(error.detail)) {
            msg = error.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
          } else if (typeof error.detail === 'string') {
            msg = error.detail;
          } else {
            msg = JSON.stringify(error.detail);
          }
        } else if (error.message) {
          msg = error.message;
        }
        throw new Error(msg);
      }

      const data: SchoolCreatedResponse = await response.json();
      logger.info('SAAS', `School created: ${data.school.school_name} (DB: ${data.school.database_name})`);
      
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error creating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create school and auto-login the admin
   * Use this when you want to redirect admin to their dashboard immediately
   */
  async createSchoolAndLoginAdmin(schoolData: SaaSSchoolCreate): Promise<{
    school: SaaSSchool;
    adminLoggedIn: boolean;
  }> {
    try {
      const result = await this.createSchool(schoolData);
      
      if (result.admin_auth) {
        // Auto-login the admin using the returned auth data
        authService.setAuthFromResponse(result.admin_auth);
        logger.info('SAAS', `Admin auto-logged in: ${result.admin_auth.user?.email}`);
        return { school: result.school, adminLoggedIn: true };
      }
      
      return { school: result.school, adminLoggedIn: false };
    } catch (error: any) {
      logger.error('SAAS', `Error in createSchoolAndLoginAdmin: ${error.message}`);
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

  // ================= Payment Settings =================

  /**
   * Update payment/suspension settings for a school
   */
  async updatePaymentSettings(schoolId: string, settings: {
    payment_due_day?: number;
    auto_suspend_enabled?: boolean;
    grace_period_days?: number;
    next_payment_due?: string;
  }): Promise<any> {
    try {
      logger.info('SAAS', `Updating payment settings for school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/payment-settings`, {
        method: 'PATCH',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update payment settings');
      }

      const data = await response.json();
      logger.info('SAAS', `Payment settings updated for school: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error updating payment settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record a payment received from a school
   */
  async recordPayment(schoolId: string, payment: {
    amount: number;
    payment_date?: string;
    notes?: string;
  }): Promise<any> {
    try {
      logger.info('SAAS', `Recording payment for school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/record-payment`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(payment),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to record payment');
      }

      const data = await response.json();
      logger.info('SAAS', `Payment recorded for school: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error recording payment: ${error.message}`);
      throw error;
    }
  }

  // ================= New Actions =================

  /**
   * Temporarily suspend a school (blocks all logins)
   */
  async temporarySuspendSchool(schoolId: string): Promise<any> {
    try {
      logger.info('SAAS', `Temporarily suspending school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/temporary-suspend`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to suspend school');
      }

      const data = await response.json();
      logger.info('SAAS', `School temporarily suspended: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error suspending school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Permanently delete a school and ALL its data (irreversible)
   */
  async permanentDeleteSchool(schoolId: string): Promise<any> {
    try {
      logger.info('SAAS', `PERMANENTLY DELETING school: ${schoolId}`);

      const response = await fetch(`${this.endpoint}/schools/${schoolId}/permanent`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to permanently delete school');
      }

      const data = await response.json();
      logger.info('SAAS', `School PERMANENTLY DELETED: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error permanently deleting school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set billing day for automatic payment suspension
   */
  async setBillingDay(schoolId: string, billingDay: number): Promise<any> {
    try {
      logger.info('SAAS', `Setting billing day ${billingDay} for school: ${schoolId}`);

      const response = await fetch(
        `${this.endpoint}/schools/${schoolId}/billing-day?billing_day=${billingDay}`,
        {
          method: 'PATCH',
          headers: authService.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to set billing day');
      }

      const data = await response.json();
      logger.info('SAAS', `Billing day set for school: ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error setting billing day: ${error.message}`);
      throw error;
    }
  }

  /**
   * Trigger overdue payment check
   */
  async checkOverduePayments(): Promise<any> {
    try {
      logger.info('SAAS', 'Triggering overdue payment check');

      const response = await fetch(`${this.endpoint}/billing/check-overdue`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to check overdue payments');
      }

      const data = await response.json();
      logger.info('SAAS', `Overdue check completed: ${data.suspended_count} schools suspended`);
      return data;
    } catch (error: any) {
      logger.error('SAAS', `Error checking overdue: ${error.message}`);
      throw error;
    }
  }
}

export const saasService = new SaaSService();
export default saasService;
