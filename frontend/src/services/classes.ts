/**
 * Classes API Service
 * Handles class CRUD operations
 */

import { Class, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

class ClassesService {
  private endpoint = `${API_BASE_URL}/classes`;

  /**
   * Get all classes
   */
  async getClasses(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<Class>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('CLASSES', `[SCHOOL:${schoolId}] 📋 Fetching classes (page ${page})`);
      
      const response = await fetch(
        `${this.endpoint}?page=${page}&page_size=${pageSize}`,
        { headers: authService.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch classes: ${response.statusText}`);
      }

      const data = await response.json();
      // Backend sometimes returns an array of classes (non-paginated) or a paginated object { items: [], total }
      const normalized = Array.isArray(data) ? { items: data, total: data.length } : data;
      logger.info('CLASSES', `[SCHOOL:${schoolId}] ✅ Fetched ${normalized.items?.length || 0} classes`);
      return normalized;
    } catch (error: any) {
      logger.error('CLASSES', `[API] ❌ Error fetching classes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get class by ID
   */
  async getClass(id: string): Promise<Class> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('CLASSES', `[SCHOOL:${schoolId}] 🔍 Fetching class: ${id}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Class not found: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('CLASSES', `[SCHOOL:${schoolId}] ✅ Class loaded: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('CLASSES', `[API] ❌ Error fetching class: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new class
   */
  async createClass(classData: Partial<Class>): Promise<Class> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('CLASSES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ➕ Creating class: ${classData.name}`);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(classData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create class');
      }

      const data = await response.json();
      logger.info('CLASSES', `[SCHOOL:${schoolId}] ✅ Class created: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('CLASSES', `[API] ❌ Error creating class: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update class
   */
  async updateClass(id: string, updates: Partial<Class>): Promise<Class> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('CLASSES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] ✏️ Updating class: ${id}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update class');
      }

      const data = await response.json();
      logger.info('CLASSES', `[SCHOOL:${schoolId}] ✅ Class updated: ${data.name}`);
      return data;
    } catch (error: any) {
      logger.error('CLASSES', `[API] ❌ Error updating class: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete class
   */
  async deleteClass(id: string): Promise<void> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('CLASSES', `[SCHOOL:${schoolId}] [ADMIN:${adminEmail}] 🗑️ Deleting class: ${id}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete class');
      }

      logger.info('CLASSES', `[SCHOOL:${schoolId}] ✅ Class deleted: ${id}`);
    } catch (error: any) {
      logger.error('CLASSES', `[API] ❌ Error deleting class: ${error.message}`);
      throw error;
    }
  }
}

export const classesService = new ClassesService();
