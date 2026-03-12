/**
 * Daily Workflow Service
 * MODULE 4: Session closing with verification, admin cash submissions, and admin approvals
 */

import api from '../../../utils/api';
import logger from '../../../utils/logger';

// ==================== TYPES ====================

export interface PaymentSnapshot {
  payment_id: string;
  student_id: string;
  student_name: string;
  student_class: string;
  amount: number;
  payment_method: string;
  payment_method_id?: string;
  timestamp: string;
  collector_id: string;
  collector_name: string;
}

export interface DailySummaryPayment {
  payment_id: string;
  student_id: string;
  student_name: string;
  student_class: string;
  amount: number;
  payment_method: string;
  timestamp: string;
  fee_type: string;
}

export interface DailySummaryResponse {
  date: string;
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  
  session_status: string;
  session_id: string | null;
  
  opening_balance: number;
  current_balance: number;
  
  total_collected_today: number;
  total_paid_to_admin_today: number;
  outstanding_balance: number;
  
  collection_by_method: Record<string, number>;
  collection_by_class: Record<string, number>;
  
  payment_count: number;
  payments: DailySummaryPayment[];
  
  admin_cash_submissions_today: PrincipalPaymentItem[];
}

export interface PrincipalPaymentItem {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  approved_at?: string;
}

export interface ClosedSessionSummary {
  session_id: string;
  session_date: string;
  accountant_id: string;
  accountant_name: string;
  
  opening_balance: number;
  closing_balance: number;
  
  total_collected: number;
  total_paid_to_admin: number;
  outstanding_balance: number;
  
  collection_by_method: Record<string, number>;
  
  payment_count: number;
  payments: PaymentSnapshot[];
  
  discrepancy: number;
  discrepancy_notes?: string;
  close_status: 'SUCCESS' | 'DISCREPANCY';
  
  closed_at: string;
  verified_by: string;
}

export interface PendingPrincipalPayment {
  id: string;
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  
  amount: number;
  payment_method: string;
  notes?: string;
  
  total_collected_month: number;
  outstanding_at_request: number;
  
  created_at: string;
  status: string;
}

export interface AccountantOverview {
  accountant_id: string;
  accountant_name: string;
  accountant_email: string;
  
  session_id: string | null;
  session_status: string;
  
  opening_balance: number;
  current_balance: number;
  closing_balance: number | null;
  
  total_collected: number;
  total_paid_to_admin: number;
  outstanding_balance: number;
  
  payment_count: number;
  
  has_pending_admin_cash_submission: boolean;
  pending_payment_amount: number;
}

export interface AllAccountantsOverview {
  date: string;
  school_id: string;
  
  total_collected_school: number;
  total_paid_to_admin_school: number;
  total_outstanding_school: number;
  
  accountants: AccountantOverview[];
}

export interface MonthCollectionDetails {
  month: string;
  accountant_id: string;
  
  total_collected: number;
  total_paid_to_admin: number;
  outstanding_balance: number;
  
  payment_count: number;
  
  daily_breakdown: Array<{
    date: string;
    total: number;
    count: number;
    payments: DailySummaryPayment[];
  }>;
  
  admin_cash_submissions: PrincipalPaymentItem[];
}

// ==================== REQUEST PAYLOADS ====================

export interface CloseSessionWithVerificationPayload {
  password: string;
  closing_balance: number;
  closing_balance_by_method?: Record<string, number>;
  discrepancy_notes?: string;
}

export interface PayPrincipalPayload {
  password: string;
  amount: number;
  payment_method?: string;
  notes?: string;
  proof_attachment?: string;
}

export interface ApprovePaymentPayload {
  password: string;
}

export interface RejectPaymentPayload {
  password: string;
  rejection_reason: string;
}

// ==================== SERVICE FUNCTIONS ====================

const LOG_TAG = 'DAILY_WORKFLOW';

const dailyWorkflowService = {
  /**
   * Get daily summary for current accountant
   */
  async getDailySummary(targetDate?: string): Promise<DailySummaryResponse> {
    logger.info(LOG_TAG, `📊 Fetching daily summary for: ${targetDate || 'today'}`);
    
    try {
      const endpoint = targetDate 
        ? `/daily-workflow/summary?target_date=${encodeURIComponent(targetDate)}`
        : '/daily-workflow/summary';
      const response = await api.get<{ data: DailySummaryResponse }>(endpoint);
      
      logger.info(LOG_TAG, `📊 Summary fetched: ${response.data?.payment_count || 0} payments`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to fetch daily summary: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get month collection details for Submit Cash to Admin modal
   */
  async getMonthCollection(): Promise<MonthCollectionDetails> {
    logger.info(LOG_TAG, '📅 Fetching month collection details');
    
    try {
      const response = await api.get<{ data: MonthCollectionDetails }>('/daily-workflow/month-collection');
      
      logger.info(LOG_TAG, `📅 Month collection: PKR ${response.data?.total_collected || 0}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to fetch month collection: ${error.message}`);
      throw error;
    }
  },

  /**
   * Close session with password verification
   */
  async closeSessionWithVerification(payload: CloseSessionWithVerificationPayload): Promise<ClosedSessionSummary> {
    logger.info(LOG_TAG, `🔒 Closing session with balance: PKR ${payload.closing_balance}`);
    
    try {
      const response = await api.post<{ data: ClosedSessionSummary }>('/daily-workflow/close-session', payload);
      
      logger.info(LOG_TAG, `🔒 Session closed: ${response.data?.session_id}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to close session: ${error.message}`);
      throw error;
    }
  },

  /**
   * Request admin cash submission with password verification
   */
  async requestPrincipalPayment(payload: PayPrincipalPayload): Promise<any> {
    logger.info(LOG_TAG, `💸 Requesting admin cash submission: PKR ${payload.amount}`);
    
    try {
      const response = await api.post<{ data: any }>('/daily-workflow/submit-cash-to-admin', payload);
      
      logger.info(LOG_TAG, `💸 Cash submission request created: ${response.data?.status}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to request admin cash submission: ${error.message}`);
      throw error;
    }
  },

  // ==================== ADMIN FUNCTIONS ====================

  /**
   * Get all pending admin cash submissions (Admin only)
   */
  async getPendingPrincipalPayments(): Promise<PendingPrincipalPayment[]> {
    logger.info(LOG_TAG, '📋 Fetching pending admin cash submissions');
    
    try {
      const response = await api.get<{ data: PendingPrincipalPayment[] }>('/daily-workflow/admin/pending-cash-submissions');
      
      logger.info(LOG_TAG, `📋 Pending payments: ${response.data?.length || 0}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to fetch pending payments: ${error.message}`);
      throw error;
    }
  },

  /**
   * Approve admin cash submission (Admin only)
   */
  async approvePrincipalPayment(paymentId: string, payload: ApprovePaymentPayload): Promise<any> {
    logger.info(LOG_TAG, `✅ Approving cash submission: ${paymentId}`);
    
    try {
      const response = await api.post<{ data: any }>(`/daily-workflow/admin/approve-cash-submission/${paymentId}`, payload);
      
      logger.info(LOG_TAG, `✅ Cash submission approved: ${paymentId}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to approve cash submission: ${error.message}`);
      throw error;
    }
  },

  /**
   * Reject admin cash submission (Admin only)
   */
  async rejectPrincipalPayment(paymentId: string, payload: RejectPaymentPayload): Promise<any> {
    logger.info(LOG_TAG, `❌ Rejecting cash submission: ${paymentId}`);
    
    try {
      const response = await api.post<{ data: any }>(`/daily-workflow/admin/reject-cash-submission/${paymentId}`, payload);
      
      logger.info(LOG_TAG, `❌ Cash submission rejected: ${paymentId}`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to reject payment: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get all accountants daily overview (Admin only)
   */
  async getAllAccountantsOverview(targetDate?: string): Promise<AllAccountantsOverview> {
    logger.info(LOG_TAG, `👥 Fetching accountants overview for: ${targetDate || 'today'}`);
    
    try {
      const endpoint = targetDate 
        ? `/daily-workflow/admin/all-accountants?target_date=${encodeURIComponent(targetDate)}`
        : '/daily-workflow/admin/all-accountants';
      const response = await api.get<{ data: AllAccountantsOverview }>(endpoint);
      
      logger.info(LOG_TAG, `👥 Overview: ${response.data?.accountants?.length || 0} accountants`);
      
      return response.data;
    } catch (error: any) {
      logger.error(LOG_TAG, `❌ Failed to fetch overview: ${error.message}`);
      throw error;
    }
  },
};

export default dailyWorkflowService;
