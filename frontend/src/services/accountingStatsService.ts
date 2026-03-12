/**
 * Accounting Statistics Service - MODULE 5
 * Frontend API service for advanced accounting statistics & visual reports
 */

import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

// ==================== TYPES ====================

export interface DailyTrendItem {
  date: string;
  amount: number;
  count: number;
}

export interface PaymentMethodStat {
  method_name: string;
  total_transactions: number;
  total_amount: number;
  percentage: number;
}

export interface ClassRevenueStat {
  class_name: string;
  total_revenue: number;
  student_count: number;
  transaction_count: number;
}

export interface AccountantPersonalStats {
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  total_collected_today: number;
  total_collected_month: number;
  total_transactions_today: number;
  total_sessions_opened: number;
  current_outstanding_balance: number;
  daily_collection_trend: DailyTrendItem[];
  payment_method_distribution: PaymentMethodStat[];
  collection_by_class: ClassRevenueStat[];
  current_session_status: string;
  current_session_id: string | null;
}

export interface AccountantSummary {
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  total_collected: number;
  transaction_count: number;
  sessions_opened: number;
  outstanding_balance: number;
  is_active_session: boolean;
}

export interface RevenueByAccountant {
  name: string;
  value: number;
}

export interface AdminGlobalStats {
  school_id: string;
  school_name: string;
  total_school_revenue: number;
  total_admin_payouts: number;
  total_outstanding: number;
  total_transactions: number;
  active_sessions_count: number;
  accountants_summary: AccountantSummary[];
  revenue_by_accountant: RevenueByAccountant[];
  sessions_by_accountant: RevenueByAccountant[];
  monthly_revenue_trend: DailyTrendItem[];
  payment_method_usage: PaymentMethodStat[];
  period_start: string;
  period_end: string;
}

export interface AccountantPerformanceRow {
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  total_collected: number;
  transaction_count: number;
  sessions_opened: number;
  outstanding_balance: number;
  avg_daily_collection: number;
  last_active: string | null;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ActivityTimelineItem {
  id: string;
  activity_type: 'payment' | 'admin_payout' | 'session_open' | 'session_close';
  description: string;
  amount: number | null;
  actor_name: string;
  actor_id: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface StatsFilters {
  date_from?: string;
  date_to?: string;
  accountant_id?: string;
  class_id?: string;
  payment_method?: string;
}

// ==================== ACCOUNTING STATS SERVICE ====================

class AccountingStatsService {
  
  /**
   * TASK 1: Get personal statistics for the logged-in accountant
   */
  async getMyStats(daysTrend: number = 30): Promise<AccountantPersonalStats> {
    logger.info('ACCT_STATS', '📊 Loading accountant statistics dashboard');
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/accounting/my-stats?days_trend=${daysTrend}`, 
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load personal statistics');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', '📊 Accountant stats loaded successfully');
      return result.data;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load stats: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * TASK 2: Get global statistics for admin dashboard
   */
  async getAdminGlobalStats(
    dateFrom?: string,
    dateTo?: string,
    monthsTrend: number = 12
  ): Promise<AdminGlobalStats> {
    logger.info('ACCT_STATS', '📊 Loading admin accounting statistics');
    
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      params.append('months_trend', monthsTrend.toString());
      
      const response = await fetch(
        `${API_BASE_URL}/accounting/admin/global-stats?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load admin statistics');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', '📊 Admin stats loaded successfully');
      return result.data;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load admin stats: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * TASK 3: Get accountant performance table with pagination
   */
  async getAccountantPerformance(
    page: number = 1,
    pageSize: number = 20,
    sortBy: string = 'total_collected',
    sortOrder: 'asc' | 'desc' = 'desc',
    filters?: StatsFilters
  ): Promise<PaginatedResponse<AccountantPerformanceRow>> {
    logger.info('ACCT_STATS', '⚡ Lazy loading statistics table');
    
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      
      if (filters?.date_from) params.append('date_from', filters.date_from);
      if (filters?.date_to) params.append('date_to', filters.date_to);
      if (filters?.accountant_id) params.append('accountant_id', filters.accountant_id);
      
      const response = await fetch(
        `${API_BASE_URL}/accounting/accountant-performance?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load performance table');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', `📑 Paginated results loaded: page ${page}/${result.total_pages}`);
      return result;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load performance: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * TASK 4: Get payment method analytics
   */
  async getPaymentMethodStats(filters?: StatsFilters): Promise<{
    data: PaymentMethodStat[];
    total_transactions: number;
    total_amount: number;
  }> {
    logger.info('ACCT_STATS', '💳 Loading payment method analytics');
    
    try {
      const params = new URLSearchParams();
      if (filters?.date_from) params.append('date_from', filters.date_from);
      if (filters?.date_to) params.append('date_to', filters.date_to);
      
      const response = await fetch(
        `${API_BASE_URL}/accounting/payment-method-stats?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load payment method stats');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', '💳 Payment method stats loaded');
      return result;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load payment methods: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * TASK 5: Get class revenue statistics
   */
  async getClassRevenueStats(filters?: StatsFilters): Promise<{
    data: ClassRevenueStat[];
    total_revenue: number;
    total_students: number;
  }> {
    logger.info('ACCT_STATS', '🏫 Loading class revenue statistics');
    
    try {
      const params = new URLSearchParams();
      if (filters?.date_from) params.append('date_from', filters.date_from);
      if (filters?.date_to) params.append('date_to', filters.date_to);
      if (filters?.class_id) params.append('class_id', filters.class_id);
      
      const response = await fetch(
        `${API_BASE_URL}/accounting/class-revenue-stats?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load class revenue stats');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', '🏫 Class revenue stats loaded');
      return result;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load class revenue: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * TASK 6: Get activity timeline with pagination
   */
  async getActivityTimeline(
    page: number = 1,
    pageSize: number = 20,
    activityTypes?: string[],
    filters?: StatsFilters
  ): Promise<PaginatedResponse<ActivityTimelineItem>> {
    logger.info('ACCT_STATS', '🕒 Loading activity timeline');
    
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      
      if (activityTypes && activityTypes.length > 0) {
        params.append('activity_types', activityTypes.join(','));
      }
      if (filters?.date_from) params.append('date_from', filters.date_from);
      if (filters?.date_to) params.append('date_to', filters.date_to);
      if (filters?.accountant_id) params.append('accountant_id', filters.accountant_id);
      
      const response = await fetch(
        `${API_BASE_URL}/accounting/activity-timeline?${params.toString()}`,
        {
          headers: authService.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load activity timeline');
      }
      
      const result = await response.json();
      logger.info('ACCT_STATS', `🕒 Timeline loaded: page ${page}/${result.total_pages}`);
      return result;
    } catch (error: any) {
      logger.error('ACCT_STATS', `❌ Failed to load timeline: ${error.message}`);
      throw error;
    }
  }
}

export const accountingStatsService = new AccountingStatsService();
export default accountingStatsService;
