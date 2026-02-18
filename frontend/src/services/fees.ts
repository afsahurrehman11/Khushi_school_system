/**
 * Fees API Service
 * Handles fee and fee category management
 */

import { Fee, FeeCategory, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class FeesService {
  private feesEndpoint = `${API_BASE_URL}/fees`;
  private categoriesEndpoint = `${API_BASE_URL}/fee-categories`;

  // ========== Fee Categories ==========

  /**
   * Get all fee categories
   */
  async getCategories(): Promise<FeeCategory[]> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEES', `[SCHOOL:${schoolId}] 📋 Fetching fee categories`);
      
      const response = await fetch(this.categoriesEndpoint, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Fetched ${data.length} categories`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error fetching categories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create fee category
   */
  async createCategory(category: Partial<FeeCategory>): Promise<FeeCategory> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ➕ Creating fee category: ${category.name}`);
      
      const response = await fetch(this.categoriesEndpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(category),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create category');
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Category created: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error creating category: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update fee category
   */
  async updateCategory(id: string, updates: Partial<FeeCategory>): Promise<FeeCategory> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ✏️ Updating category: ${id}`);
      
      const response = await fetch(`${this.categoriesEndpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update category');
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Category updated: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error updating category: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete fee category
   */
  async deleteCategory(id: string): Promise<void> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] 🗑️ Deleting category: ${id}`);
      
      const response = await fetch(`${this.categoriesEndpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete category');
      }

      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Category deleted: ${id}`);
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error deleting category: ${error.message}`);
      throw error;
    }
  }

  // ========== Fees ==========

  /**
   * Get all fees
   */
  async getFees(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<Fee>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEES', `[SCHOOL:${schoolId}] 📋 Fetching fees (page ${page})`);
      
      const response = await fetch(
        `${this.feesEndpoint}?page=${page}&page_size=${pageSize}`,
        { headers: authService.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch fees: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Fetched ${data.items?.length || 0} fees`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error fetching fees: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create fee
   */
  async createFee(fee: Partial<Fee>): Promise<Fee> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ➕ Creating fee: ${fee.name}`);
      
      const response = await fetch(this.feesEndpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(fee),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create fee');
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Fee created: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error creating fee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update fee
   */
  async updateFee(id: string, updates: Partial<Fee>): Promise<Fee> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ✏️ Updating fee: ${id}`);
      
      const response = await fetch(`${this.feesEndpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update fee');
      }

      const data = await response.json();
      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Fee updated: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error updating fee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete fee
   */
  async deleteFee(id: string): Promise<void> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('FEES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] 🗑️ Deleting fee: ${id}`);
      
      const response = await fetch(`${this.feesEndpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete fee');
      }

      logger.info('FEES', `[SCHOOL:${schoolId}] ✅ Fee deleted: ${id}`);
    } catch (error: any) {
      logger.error('FEES', `[API] ❌ Error deleting fee: ${error.message}`);
      throw error;
    }
  }
}

export const feesService = new FeesService();
