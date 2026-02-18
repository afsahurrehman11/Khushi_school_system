/**
 * Students API Service
 * Handles student CRUD operations (Admin users only)
 */

import { Student, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class StudentsService {
  private endpoint = `${API_BASE_URL}/students`;

  /**
   * Get all students for current school
   */
  async getStudents(
    classId?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResponse<Student>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('STUDENTS', `Fetching students (page ${page}) for school ${schoolId}`);
      
      let url = `${this.endpoint}?page=${page}&page_size=${pageSize}`;
      if (classId) {
        url += `&class_id=${classId}`;
      }
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch students: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('STUDENTS', `Fetched ${data.items?.length || 0} students for school ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error fetching students: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get student by ID
   */
  async getStudent(id: string): Promise<Student> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('STUDENTS', `Fetching student ${id} for school ${schoolId}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Student not found: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('STUDENTS', `Student loaded: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error fetching student: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new student
   */
  async createStudent(student: Partial<Student>): Promise<Student> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('STUDENTS', `Creating student ${student.firstName} by ${adminEmail} in ${schoolId}`);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(student),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create student');
      }

      const data = await response.json();
      logger.info('STUDENTS', `Student created: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error creating student: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update student
   */
  async updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('STUDENTS', `Updating student ${id} by ${adminEmail}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update student');
      }

      const data = await response.json();
      logger.info('STUDENTS', `Student updated: ${data.firstName} ${data.lastName}`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error updating student: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete student
   */
  async deleteStudent(id: string): Promise<void> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('STUDENTS', `Deleting student ${id} by ${adminEmail}`);
      
      const response = await fetch(`${this.endpoint}/${id}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete student');
      }

      logger.info('STUDENTS', `Student deleted: ${id}`);
    } catch (error: any) {
      logger.error('STUDENTS', `Error deleting student: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import students from Excel
   */
  async importStudents(file: File): Promise<any> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('STUDENTS', `Importing students from: ${file.name}`);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/students-import-export/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authService.getToken() || ''}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to import students');
      }

      const data = await response.json();
      logger.info('STUDENTS', `Import prepared: ${data.valid_rows} valid rows`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error importing students: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirm student import
   */
  async confirmImport(importId: string): Promise<any> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('STUDENTS', `Confirming import: ${importId}`);
      
      const response = await fetch(`${API_BASE_URL}/students-import-export/confirm/${importId}`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to confirm import');
      }

      const data = await response.json();
      logger.info('STUDENTS', `Import confirmed`);
      return data;
    } catch (error: any) {
      logger.error('STUDENTS', `Error confirming import: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export students to Excel
   */
  async exportStudents(classId?: string): Promise<Blob> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('STUDENTS', `Exporting students`);
      
      let url = `${API_BASE_URL}/students-import-export/export`;
      if (classId) {
        url += `?class_id=${classId}`;
      }
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to export students: ${response.statusText}`);
      }

      const blob = await response.blob();
      logger.info('STUDENTS', `Students exported`);
      return blob;
    } catch (error: any) {
      logger.error('STUDENTS', `Error exporting students: ${error.message}`);
      throw error;
    }
  }
}

export const studentsService = new StudentsService();
