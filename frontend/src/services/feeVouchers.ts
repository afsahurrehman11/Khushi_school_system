/**
 * Fee Vouchers API Service
 * Handles fee voucher generation and printing
 */

import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-school-system.onrender.com/api');

export interface ClassWithFees {
  class_id: string;
  class_name: string;
  section: string;
  student_count: number;
  total_fees: number;
  fee_categories: Array<{
    category_id: string;
    category_name: string;
    amount: number;
  }>;
}

export interface StudentForVoucher {
  student_id: string;
  roll_number: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name: string;
  section: string;
  father_name?: string;
  phone?: string;
  pending_fees: number;
  paid_fees: number;
  fee_details: Array<{
    category_name: string;
    amount: number;
    paid: number;
    balance: number;
  }>;
}

export interface VoucherGenerateRequest {
  student_id: string;
  selected_months: string[];
  include_arrears: boolean;
  due_date?: string;
  notes?: string;
}

export interface ClassVoucherGenerateRequest {
  class_id: string;
  selected_months: string[];
  include_arrears: boolean;
  due_date?: string;
  notes?: string;
}

class FeeVouchersService {
  private baseUrl = `${API_BASE_URL}/fee-vouchers`;

  /**
   * Get all classes with fee summary
   */
  async getClasses(): Promise<ClassWithFees[]> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] 📋 Fetching classes with fees`);
      
      const response = await fetch(`${this.baseUrl}/classes`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch classes: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] ✅ Fetched ${data.length} classes`);
      return data;
    } catch (error: any) {
      logger.error('FEE_VOUCHERS', `[API] ❌ Error fetching classes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get students for a specific class
   */
  async getStudentsByClass(classId: string): Promise<StudentForVoucher[]> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] 📋 Fetching students for class: ${classId}`);
      
      const response = await fetch(`${this.baseUrl}/classes/${classId}/students`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch students: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] ✅ Fetched ${data.length} students`);
      return data;
    } catch (error: any) {
      logger.error('FEE_VOUCHERS', `[API] ❌ Error fetching students: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get fee categories
   */
  async getFeeCategories(): Promise<Array<{ id: string; name: string; amount: number }>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] 📋 Fetching fee categories`);
      
      const response = await fetch(`${this.baseUrl}/fee-categories`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fee categories: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] ✅ Fetched ${data.length} categories`);
      return data;
    } catch (error: any) {
      logger.error('FEE_VOUCHERS', `[API] ❌ Error fetching fee categories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate voucher PDF for a single student
   */
  async generateStudentVoucher(request: VoucherGenerateRequest): Promise<Blob> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] 🖨️ Generating voucher for student: ${request.student_id}`);
      
      const response = await fetch(`${this.baseUrl}/generate/student`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate voucher');
      }

      const blob = await response.blob();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] ✅ Voucher generated`);
      return blob;
    } catch (error: any) {
      logger.error('FEE_VOUCHERS', `[API] ❌ Error generating voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate vouchers PDF for entire class
   */
  async generateClassVouchers(request: ClassVoucherGenerateRequest): Promise<Blob> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] 🖨️ Generating vouchers for class: ${request.class_id}`);
      
      const response = await fetch(`${this.baseUrl}/generate/class`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate class vouchers');
      }

      const blob = await response.blob();
      logger.info('FEE_VOUCHERS', `[SCHOOL:${schoolId}] ✅ Class vouchers generated`);
      return blob;
    } catch (error: any) {
      logger.error('FEE_VOUCHERS', `[API] ❌ Error generating class vouchers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download vouchers as PDF file
   */
  downloadPdf(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Open voucher PDF in new tab for printing
   */
  openPdfForPrint(blob: Blob): void {
    const url = window.URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }
}

export const feeVouchersService = new FeeVouchersService();
