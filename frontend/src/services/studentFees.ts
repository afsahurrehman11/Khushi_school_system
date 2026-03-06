/**
 * Student Fee Service - M2, M3, M4, M6 Frontend Implementation
 * Handles scholarship, monthly fees, payments, and chart data
 */

import { 
  StudentMonthlyFee, 
  StudentPayment, 
  MonthlyFeeSummary, 
  StudentFeeOverview,
  StudentPaymentSummary,
  PaymentMethodType 
} from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

// ==================== RESPONSE TYPES ====================

interface PaginatedFees {
  total: number;
  page: number;
  page_size: number;
  fees: StudentMonthlyFee[];
}

interface PaginatedPayments {
  total: number;
  page: number;
  page_size: number;
  payments: StudentPayment[];
}

interface ChartData {
  year: number;
  status_pie_chart: {
    labels: string[];
    data: number[];
  };
  monthly_bar_chart: {
    labels: string[];
    fees: number[];
    paid: number[];
    remaining: number[];
  };
  monthly_details: {
    month: number;
    month_name: string;
    fee: number;
    paid: number;
    remaining: number;
  }[];
}

interface GenerateClassFeesResponse {
  generated_count: number;
  fees: StudentMonthlyFee[];
}

// ==================== SERVICE CLASS ====================

class StudentFeeService {
  private endpoint = `${API_BASE_URL}/student-fees`;

  // ==================== M2: SCHOLARSHIP ====================

  /**
   * Get student's scholarship and arrears
   */
  async getScholarship(studentId: string): Promise<{
    student_id: string;
    scholarship_percent: number;
    arrears_balance: number;
  }> {
    try {
      logger.info('STUDENT_FEE', `Fetching scholarship for student ${studentId}`);
      
      const response = await fetch(`${this.endpoint}/scholarship/${studentId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch scholarship: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching scholarship: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update student's scholarship percentage
   */
  async updateScholarship(studentId: string, scholarshipPercent: number): Promise<{
    success: boolean;
    scholarship_percent: number;
  }> {
    try {
      logger.info('STUDENT_FEE', `Updating scholarship for ${studentId} to ${scholarshipPercent}%`);
      
      const response = await fetch(`${this.endpoint}/scholarship/${studentId}`, {
        method: 'PUT',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scholarship_percent: scholarshipPercent }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update scholarship');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error updating scholarship: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update student's arrears balance
   */
  async updateArrears(studentId: string, arrearsBalance: number): Promise<{
    success: boolean;
    arrears_balance: number;
  }> {
    try {
      logger.info('STUDENT_FEE', `Updating arrears for ${studentId} to ${arrearsBalance}`);
      
      const response = await fetch(`${this.endpoint}/arrears/${studentId}`, {
        method: 'PUT',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ arrears_balance: arrearsBalance }),
      });

      if (!response.ok) {
        throw new Error('Failed to update arrears');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error updating arrears: ${error.message}`);
      throw error;
    }
  }

  // ==================== M3: MONTHLY FEES ====================

  /**
   * Generate monthly fee for a student
   */
  async generateMonthlyFee(
    studentId: string, 
    month: number, 
    year: number
  ): Promise<StudentMonthlyFee> {
    try {
      logger.info('STUDENT_FEE', `Generating fee for ${studentId}: ${month}/${year}`);
      
      const response = await fetch(`${this.endpoint}/generate/${studentId}`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month, year }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate fee');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error generating fee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate monthly fees for all students in a class
   */
  async generateClassFees(
    classId: string,
    month: number,
    year: number
  ): Promise<GenerateClassFeesResponse> {
    try {
      logger.info('STUDENT_FEE', `Generating fees for class ${classId}: ${month}/${year}`);
      
      const response = await fetch(`${this.endpoint}/generate-class`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ class_id: classId, month, year }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate class fees');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error generating class fees: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get paginated monthly fees for a student
   */
  async getMonthlyFees(
    studentId: string,
    year?: number,
    status?: string,
    page: number = 1,
    pageSize: number = 12
  ): Promise<PaginatedFees> {
    try {
      logger.info('STUDENT_FEE', `Fetching monthly fees for ${studentId}`);
      
      let url = `${this.endpoint}/monthly/${studentId}?page=${page}&page_size=${pageSize}`;
      if (year) url += `&year=${year}`;
      if (status) url += `&status=${status}`;
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch monthly fees');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching monthly fees: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current month's fee for a student
   */
  async getCurrentMonthFee(studentId: string): Promise<StudentMonthlyFee> {
    try {
      const response = await fetch(`${this.endpoint}/monthly/${studentId}/current`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch current month fee');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching current fee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get detailed fee record with payments
   */
  async getFeeDetail(feeId: string): Promise<StudentMonthlyFee & { payments: StudentPayment[] }> {
    try {
      const response = await fetch(`${this.endpoint}/fee/${feeId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fee not found');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching fee detail: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get fee summary statistics
   */
  async getFeeSummary(studentId: string): Promise<MonthlyFeeSummary> {
    try {
      const response = await fetch(`${this.endpoint}/summary/${studentId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch fee summary');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching fee summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get base fee for student
   */
  async getBaseFee(studentId: string): Promise<{ base_fee: number }> {
    try {
      const response = await fetch(`${this.endpoint}/base-fee/${studentId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch base fee');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching base fee: ${error.message}`);
      throw error;
    }
  }

  // ==================== M4: PAYMENTS ====================

  /**
   * Record a payment
   */
  async createPayment(
    studentId: string,
    monthlyFeeId: string,
    amount: number,
    paymentMethod: PaymentMethodType = 'CASH',
    transactionReference?: string,
    notes?: string
  ): Promise<StudentPayment> {
    try {
      logger.info('STUDENT_FEE', `Recording payment of ${amount} for ${studentId}`);
      
      const response = await fetch(`${this.endpoint}/payments/${studentId}`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          monthly_fee_id: monthlyFeeId,
          amount,
          payment_method: paymentMethod,
          transaction_reference: transactionReference,
          notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to record payment');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error recording payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get paginated payment records
   */
  async getPayments(
    studentId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedPayments> {
    try {
      const response = await fetch(
        `${this.endpoint}/payments/${studentId}?page=${page}&page_size=${pageSize}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch payments');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching payments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment summary
   */
  async getPaymentSummary(studentId: string): Promise<StudentPaymentSummary> {
    try {
      const response = await fetch(`${this.endpoint}/payments/${studentId}/summary`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment summary');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching payment summary: ${error.message}`);
      throw error;
    }
  }

  // ==================== OVERVIEW ====================

  /**
   * Get complete fee overview for student detail page
   */
  async getFeeOverview(studentId: string): Promise<StudentFeeOverview> {
    try {
      logger.info('STUDENT_FEE', `Fetching fee overview for ${studentId}`);
      
      const response = await fetch(`${this.endpoint}/overview/${studentId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch fee overview');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching fee overview: ${error.message}`);
      throw error;
    }
  }

  // ==================== ARREARS ====================

  /**
   * Run arrears carry forward (admin function)
   */
  async carryForwardArrears(): Promise<{
    updated_count: number;
    total_arrears: number;
  }> {
    try {
      const response = await fetch(`${this.endpoint}/carry-forward-arrears`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to carry forward arrears');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error carrying forward arrears: ${error.message}`);
      throw error;
    }
  }

  // ==================== M6: CHARTS ====================

  /**
   * Get chart data for visualizations
   */
  async getChartData(studentId: string, year?: number): Promise<ChartData> {
    try {
      let url = `${this.endpoint}/charts/${studentId}`;
      if (year) url += `?year=${year}`;
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('STUDENT_FEE', `Error fetching chart data: ${error.message}`);
      throw error;
    }
  }
}

export const studentFeeService = new StudentFeeService();
export default studentFeeService;
