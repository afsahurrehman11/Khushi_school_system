/**
 * Analytics API Service
 * Handles real-time analytics and data visualization
 */

import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

export interface DashboardOverview {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  total_fee_categories: number;
  students_with_images: number;
  students_without_images: number;
  active_students: number;
  inactive_students: number;
  total_fees_expected: number;
  total_fees_collected: number;
  collection_rate: number;
  students_with_pending_fees: number;
}

export interface AttendanceSummary {
  date_range: { start: string; end: string };
  total_records: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  attendance_rate: number;
  daily_breakdown: Array<{
    date: string;
    present: number;
    absent: number;
    late: number;
    total: number;
  }>;
}

export interface ClassAttendance {
  class_id: string;
  class_name: string;
  section: string;
  total_students: number;
  present_today: number;
  absent_today: number;
  attendance_rate: number;
}

export interface FeeSummary {
  total_expected: number;
  total_collected: number;
  total_pending: number;
  collection_rate: number;
  by_category: Array<{
    category_id: string;
    category_name: string;
    expected: number;
    collected: number;
    pending: number;
  }>;
  by_class: Array<{
    class_id: string;
    class_name: string;
    section: string;
    expected: number;
    collected: number;
    pending: number;
  }>;
  monthly_collection: Array<{
    month: string;
    amount: number;
  }>;
}

export interface MissingDataStudent {
  student_id: string;
  roll_number: string;
  first_name: string;
  last_name: string;
  class_name: string;
  section: string;
  missing_fields: string[];
  has_profile_image: boolean;
  has_cnic_image: boolean;
}

export interface EnrollmentTrend {
  monthly_data: Array<{
    month: string;
    new_students: number;
    total_students: number;
  }>;
  class_distribution: Array<{
    class_name: string;
    section: string;
    student_count: number;
  }>;
}

export interface FaceRecognitionStatus {
  total_students: number;
  students_with_embeddings: number;
  students_without_embeddings: number;
  embedding_coverage: number;
  last_recognition_activity: string | null;
}

class AnalyticsService {
  private baseUrl = `${API_BASE_URL}/analytics`;

  /**
   * Get dashboard overview statistics
   */
  async getDashboardOverview(): Promise<DashboardOverview> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching dashboard overview`);
      
      const response = await fetch(`${this.baseUrl}/dashboard/overview`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch overview: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Dashboard overview fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching overview: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get attendance summary
   */
  async getAttendanceSummary(days: number = 30): Promise<AttendanceSummary> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching attendance summary for ${days} days`);
      
      const response = await fetch(`${this.baseUrl}/attendance/summary?days=${days}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch attendance: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Attendance summary fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching attendance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get class-wise attendance
   */
  async getClassWiseAttendance(): Promise<ClassAttendance[]> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching class-wise attendance`);
      
      const response = await fetch(`${this.baseUrl}/attendance/class-wise`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch class attendance: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Class-wise attendance fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching class attendance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get fee summary
   */
  async getFeeSummary(): Promise<FeeSummary> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching fee summary`);
      
      const response = await fetch(`${this.baseUrl}/fees/summary`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fee summary: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Fee summary fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching fee summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get students with missing data
   */
  async getMissingData(): Promise<MissingDataStudent[]> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching students with missing data`);
      
      const response = await fetch(`${this.baseUrl}/students/missing-data`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch missing data: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Missing data fetched: ${data.length} students`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching missing data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get enrollment trends
   */
  async getEnrollmentTrends(): Promise<EnrollmentTrend> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching enrollment trends`);
      
      const response = await fetch(`${this.baseUrl}/students/enrollment-trend`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch enrollment trends: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Enrollment trends fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching enrollment trends: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get face recognition status
   */
  async getFaceRecognitionStatus(): Promise<FaceRecognitionStatus> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] 📊 Fetching face recognition status`);
      
      const response = await fetch(`${this.baseUrl}/face-recognition/status`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch face recognition status: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('ANALYTICS', `[SCHOOL:${schoolId}] ✅ Face recognition status fetched`);
      return data;
    } catch (error: any) {
      logger.error('ANALYTICS', `[API] ❌ Error fetching face recognition status: ${error.message}`);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
