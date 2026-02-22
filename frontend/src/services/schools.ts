/**
 * Schools API Service
 * Handles school CRUD operations (Root admin only)
 */

import { School, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

class SchoolsService {
  private endpoint = `${API_BASE_URL}/schools`;

  /**
   * Get all schools (Root only)
   */
  async getAllSchools(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<School>> {
    try {
      logger.info('SCHOOLS', `Fetching schools (page ${page})`);
      
      const response = await fetch(`${this.endpoint}?page=${page}&page_size=${pageSize}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch schools: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SCHOOLS', `Fetched ${data.items?.length || 0} schools`);
      return data;
    } catch (error: any) {
      logger.error('SCHOOLS', `Error fetching schools: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get school by ID
   */
  async getSchool(id: string): Promise<School> {
    try {
      logger.info('SCHOOLS', `Fetching school: ${id}`);
      const response = await fetch(`${this.endpoint}/${id}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`School not found: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('SCHOOLS', `School loaded: ${data.displayName}`);
      return data;
    } catch (error: any) {
      logger.error('SCHOOLS', `Error fetching school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new school (Root only)
   */
  async createSchool(school: Partial<School>): Promise<School> {
    try {
      logger.info('SCHOOLS', `Creating school: ${school.displayName}`);
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(school),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create school');
      }

      const data = await response.json();
      logger.info('SCHOOLS', `School created: ${data.displayName}`);
      return data;
    } catch (error: any) {
      logger.error('SCHOOLS', `Error creating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update school (Root only)
   */
  async updateSchool(id: string, updates: Partial<School>): Promise<School> {
    try {
      logger.info('SCHOOLS', `Updating school: ${id}`);
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update school');
      }

      const data = await response.json();
      logger.info('SCHOOLS', `School updated: ${data.displayName}`);
      return data;
    } catch (error: any) {
      logger.error('SCHOOLS', `Error updating school: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete school (Root only)
   */
  async deleteSchool(id: string): Promise<void> {
    try {
      logger.info('SCHOOLS', `Deleting school: ${id}`);
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete school');
      }

      logger.info('SCHOOLS', `School deleted: ${id}`);
    } catch (error: any) {
      logger.error('SCHOOLS', `Error deleting school: ${error.message}`);
      throw error;
    }
  }
}

export const schoolsService = new SchoolsService();
