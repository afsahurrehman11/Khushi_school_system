/**
 * Finance Analytics Service
 * MODULE 3: Frontend API service for financial analytics & reporting
 */

import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

// ==================== TYPES ====================

export interface FinanceSummary {
  total_collected_today: number;
  total_collected_month: number;
  outstanding_fees: number;
  principal_payouts_total: number;
  active_sessions: number;
}

export interface MonthlyCollectionData {
  month: string;
  year: number;
  total: number;
}

export interface MonthlyCollectionResponse {
  data: MonthlyCollectionData[];
  total: number;
}

export interface ClassRevenueData {
  class_name: string;
  revenue: number;
  student_count: number;
}

export interface ClassRevenueResponse {
  data: ClassRevenueData[];
  total: number;
}

export interface StudentOutstandingFee {
  student_id: string;
  student_name: string;
  class_name: string;
  outstanding_amount: number;
  last_payment_date?: string;
}

export interface OutstandingFeesResponse {
  total_outstanding: number;
  students_with_dues: number;
  top_10_students: StudentOutstandingFee[];
}

export interface AccountantPerformanceData {
  accountant_id: string;
  accountant_name: string;
  total_collected: number;
  transaction_count: number;
  sessions_count: number;
}

export interface AccountantPerformanceResponse {
  data: AccountantPerformanceData[];
  total_collected: number;
}

export interface PrincipalPayoutData {
  id: string;
  amount: number;
  payment_method: string;
  accountant_name: string;
  created_at: string;
  approved_at?: string;
  approved_by_name?: string;
  status: string;
}

export interface PrincipalPayoutSummaryResponse {
  total_payouts: number;
  payouts_this_month: number;
  last_10_payouts: PrincipalPayoutData[];
}

export interface OutstandingFeesDistribution {
  range_label: string;
  student_count: number;
  total_amount: number;
}

export interface StudentPaymentReportRecord {
  payment_id: string;
  student_name: string;
  class_name: string;
  amount: number;
  payment_method: string;
  accountant_name: string;
  created_at: string;
}

export interface StudentPaymentReportResponse {
  payments: StudentPaymentReportRecord[];
  total_amount: number;
  total_count: number;
  date_range: string;
}

export interface ReportFilters {
  start_date?: string;
  end_date?: string;
  class_name?: string;
  accountant_id?: string;
}

// ==================== FINANCE ANALYTICS SERVICE ====================

class FinanceService {
  
  /**
   * Get financial summary for dashboard cards
   */
  async getSummary(): Promise<FinanceSummary> {
    logger.info('FINANCE', '📊 Loading financial dashboard');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/summary`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load financial summary');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `❌ Failed to load summary: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get monthly collection trend
   */
  async getMonthlyCollection(months: number = 12): Promise<MonthlyCollectionResponse> {
    logger.info('FINANCE', '📈 Loading monthly collection trend');
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/finance/monthly-collection?months=${months}`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to load monthly collection');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Chart data load failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get class-wise revenue
   */
  async getClassRevenue(): Promise<ClassRevenueResponse> {
    logger.info('FINANCE', '🏫 Loading class revenue analytics');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/class-revenue`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to load class revenue');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Chart data load failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get outstanding fees analytics
   */
  async getOutstandingFees(): Promise<OutstandingFeesResponse> {
    logger.info('FINANCE', '🧾 Loading outstanding fees');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/outstanding-fees`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to load outstanding fees');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Failed to load outstanding fees: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get accountant performance analytics
   */
  async getAccountantPerformance(): Promise<AccountantPerformanceResponse> {
    logger.info('FINANCE', '👤 Loading accountant performance');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/accountant-performance`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to load accountant performance');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Chart data load failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get admin cash submission summary
   */
  async getPrincipalPayouts(): Promise<PrincipalPayoutSummaryResponse> {
    logger.info('FINANCE', '💸 Loading admin cash submissions');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/principal-payouts`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to load admin cash submissions');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Failed to load payouts: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get outstanding fees distribution for pie chart
   */
  async getOutstandingDistribution(): Promise<OutstandingFeesDistribution[]> {
    logger.info('FINANCE', '📊 Rendering analytics charts');
    
    try {
      const response = await fetch(`${API_BASE_URL}/finance/outstanding-distribution`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to load distribution');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Chart data load failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get student payment report
   */
  async getStudentPaymentReport(filters: ReportFilters): Promise<StudentPaymentReportResponse> {
    logger.info('FINANCE', '📑 Loading financial reports');
    
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.class_name) params.append('class_name', filters.class_name);
      if (filters.accountant_id) params.append('accountant_id', filters.accountant_id);
      
      const response = await fetch(
        `${API_BASE_URL}/finance/reports/student-payments?${params}`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to load payment report');
      }
      
      return await response.json();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Failed to load report: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Export student payments as CSV
   */
  async exportStudentPayments(filters: ReportFilters): Promise<Blob> {
    logger.info('FINANCE', '📤 Financial report exported');
    
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.class_name) params.append('class_name', filters.class_name);
      if (filters.accountant_id) params.append('accountant_id', filters.accountant_id);
      
      const response = await fetch(
        `${API_BASE_URL}/finance/export/student-payments?${params}`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export report');
      }
      
      return await response.blob();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Export failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Export monthly collections as CSV
   */
  async exportMonthlyCollections(start_date?: string, end_date?: string): Promise<Blob> {
    logger.info('FINANCE', '📤 Financial report exported');
    
    try {
      const params = new URLSearchParams();
      if (start_date) params.append('start_date', start_date);
      if (end_date) params.append('end_date', end_date);
      
      const response = await fetch(
        `${API_BASE_URL}/finance/export/monthly-collections?${params}`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export report');
      }
      
      return await response.blob();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Export failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Export admin cash submissions as CSV
   */
  async exportPrincipalPayouts(): Promise<Blob> {
    logger.info('FINANCE', '📤 Financial report exported');
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/finance/export/principal-payouts`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export report');
      }
      
      return await response.blob();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Export failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Export accountant collections as CSV
   */
  async exportAccountantCollections(filters: ReportFilters): Promise<Blob> {
    logger.info('FINANCE', '📤 Financial report exported');
    
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.accountant_id) params.append('accountant_id', filters.accountant_id);
      
      const response = await fetch(
        `${API_BASE_URL}/finance/export/accountant-collections?${params}`,
        { headers: authService.getAuthHeaders() }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export report');
      }
      
      return await response.blob();
    } catch (error: any) {
      logger.error('FINANCE', `⚠️ Export failed: ${error.message}`);
      throw error;
    }
  }
}

export const financeService = new FinanceService();
