/**
 * Teachers API Service
 * Handles teacher CRUD operations (Admin users only)
 */

import { Teacher, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

class TeachersService {
  private endpoint = `${API_BASE_URL}/teachers`;

  /**
   * Get all teachers for current school
   */
  async getTeachers(
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResponse<Teacher>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('TEACHERS', `Fetching teachers (page ${page}) for school ${schoolId}`);
      
      const response = await fetch(
        `${this.endpoint}?page=${page}&page_size=${pageSize}`,
        { headers: authService.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch teachers: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('TEACHERS', `Fetched ${data.items?.length || 0} teachers for school ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('TEACHERS', `Error fetching teachers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get teacher by ID
   */
  async getTeacher(id: string): Promise<Teacher> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('TEACHERS', `Fetching teacher ${id} for school ${schoolId}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Teacher not found: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('TEACHERS', `Teacher loaded: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('TEACHERS', `Error fetching teacher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new teacher
   */
  async createTeacher(teacher: Partial<Teacher>): Promise<Teacher> {
    try {
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('TEACHERS', `Creating teacher ${teacher.firstName} by ${adminEmail}`);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(teacher),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create teacher');
      }

      const data = await response.json();
      logger.info('TEACHERS', `Teacher created: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('TEACHERS', `Error creating teacher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update teacher
   */
  async updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher> {
    try {
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('TEACHERS', `Updating teacher ${id} by ${adminEmail}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update teacher');
      }

      const data = await response.json();
      logger.info('TEACHERS', `Teacher updated: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('TEACHERS', `Error updating teacher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete teacher
   */
  async deleteTeacher(id: string): Promise<void> {
    try {
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('TEACHERS', `Deleting teacher ${id} by ${adminEmail}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete teacher');
      }

      logger.info('TEACHERS', `Teacher deleted: ${id}`);
    } catch (error: any) {
      logger.error('TEACHERS', `Error deleting teacher: ${error.message}`);
      throw error;
    }
  }
}

export const teachersService = new TeachersService();
