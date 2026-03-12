/**
 * Accounting Engine Service
 * MODULE 2: Session Lifecycle, Ledger System, Admin Cash Submissions
 */

import { authService } from '../../../services/auth';
import logger from '../../../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : 'https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api');

// ==================== TYPES ====================

export interface AccountingSession {
  id: string;
  school_id: string;
  user_id: string;
  user_name: string;
  role: string;
  session_date: string;
  opening_balance: number;
  closing_balance: number | null;
  total_collected: number;
  total_paid_to_admin: number;
  outstanding_balance: number;
  transaction_count: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

export interface LedgerEntry {
  id: string;
  school_id: string;
  session_id: string;
  user_id: string;
  transaction_type: 'STUDENT_PAYMENT' | 'PAY_TO_PRINCIPAL' | 'ADJUSTMENT';
  reference_id: string;
  debit: number;
  credit: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface PrincipalPayment {
  id: string;
  school_id: string;
  session_id: string;
  accountant_id: string;
  accountant_name: string;
  amount: number;
  payment_method: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

export interface AccountantBalance {
  collected_today: number;
  paid_to_admin: number;
  outstanding_balance: number;
  session_id: string | null;
  session_status: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
  page: number;
  page_size: number;
  total_debits: number;
  total_credits: number;
  current_balance: number;
}

// ==================== ACCOUNTING SESSION API ====================

class AccountingService {
  
  /**
   * Open a new accounting session for today
   */
  async openSession(openingBalance: number = 0, notes?: string): Promise<AccountingSession> {
    logger.info('ACCOUNTING', '📂 Opening accounting session...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/accounting/session/open`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opening_balance: openingBalance,
          notes,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to open session');
      }
      
      const session = await response.json();
      logger.info('ACCOUNTING', `📂 Accounting session opened: ${session.id}`);
      return session;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to open session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the current active accounting session
   */
  async getCurrentSession(): Promise<AccountingSession | null> {
    logger.info('ACCOUNTING', '📂 Getting current accounting session...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/accounting/session/current`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get session');
      }
      
      const result = await response.json();
      
      // API returns { message, session: null } when no session
      if (result.message === 'No active session') {
        logger.info('ACCOUNTING', '📂 No active session found');
        return null;
      }
      
      logger.info('ACCOUNTING', `📂 Current session: ${result.id}`);
      return result;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to get current session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Close the current accounting session
   */
  async closeSession(closingBalance?: number, notes?: string): Promise<AccountingSession> {
    logger.info('ACCOUNTING', '🔒 Closing accounting session...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/accounting/session/close`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          closing_balance: closingBalance,
          notes,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to close session');
      }
      
      const session = await response.json();
      logger.info('ACCOUNTING', `🔒 Session closed successfully: ${session.id}`);
      return session;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to close session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get list of accounting sessions
   */
  async getSessions(params?: {
    status?: string;
    user_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<AccountingSession>> {
    logger.info('ACCOUNTING', '📂 Getting accounting sessions...');
    
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      if (params?.user_id) queryParams.append('user_id', params.user_id);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
      
      const response = await fetch(`${API_BASE_URL}/accounting/sessions?${queryParams}`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get sessions');
      }
      
      const result = await response.json();
      logger.info('ACCOUNTING', `📂 Found ${result.items?.length || 0} sessions`);
      return result;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to get sessions: ${error.message}`);
      throw error;
    }
  }
  
  // ==================== ACCOUNTANT BALANCE ====================
  
  /**
   * Get accountant's current balance
   */
  async getBalance(): Promise<AccountantBalance> {
    logger.info('ACCOUNTING', '💰 Getting accountant balance...');
    
    try {
      const response = await fetch(`${API_BASE_URL}/accounting/accountant-balance`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get balance');
      }
      
      const balance = await response.json();
      logger.info('ACCOUNTING', `💰 Balance: collected=${balance.collected_today}, outstanding=${balance.outstanding_balance}`);
      return balance;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to get balance: ${error.message}`);
      throw error;
    }
  }
  
  // ==================== LEDGER ====================
  
  /**
   * Get ledger entries
   */
  async getLedger(params?: {
    session_id?: string;
    transaction_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<LedgerResponse> {
    logger.info('ACCOUNTING', '📒 Getting ledger entries...');
    
    try {
      const queryParams = new URLSearchParams();
      if (params?.session_id) queryParams.append('session_id', params.session_id);
      if (params?.transaction_type) queryParams.append('transaction_type', params.transaction_type);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
      
      const response = await fetch(`${API_BASE_URL}/accounting/ledger?${queryParams}`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get ledger');
      }
      
      const result = await response.json();
      logger.info('ACCOUNTING', `📒 Found ${result.entries?.length || 0} ledger entries`);
      return result;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to get ledger: ${error.message}`);
      throw error;
    }
  }
  
  // ==================== ADMIN CASH SUBMISSIONS ====================
  
  /**
   * Create an admin cash submission request
   */
  async createPrincipalPayment(
    amount: number,
    paymentMethod: string = 'CASH',
    notes?: string
  ): Promise<PrincipalPayment> {
    logger.info('ACCOUNTING', `💸 Creating admin cash submission: ${amount}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/principal-payments`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          notes,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create payment');
      }
      
      const payment = await response.json();
      logger.info('ACCOUNTING', `💸 Admin cash submission created: ${payment.id}`);
      return payment;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to create admin cash submission: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get admin cash submissions
   */
  async getPrincipalPayments(params?: {
    session_id?: string;
    accountant_id?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<PrincipalPayment>> {
    logger.info('ACCOUNTING', '💸 Getting admin cash submissions...');
    
    try {
      const queryParams = new URLSearchParams();
      if (params?.session_id) queryParams.append('session_id', params.session_id);
      if (params?.accountant_id) queryParams.append('accountant_id', params.accountant_id);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
      
      const response = await fetch(`${API_BASE_URL}/principal-payments?${queryParams}`, {
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get payments');
      }
      
      const result = await response.json();
      logger.info('ACCOUNTING', `💸 Found ${result.items?.length || 0} admin cash submissions`);
      return result;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to get admin cash submissions: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Approve an admin cash submission (admin only)
   */
  async approvePrincipalPayment(paymentId: string): Promise<PrincipalPayment> {
    logger.info('ACCOUNTING', `✅ Approving admin cash submission: ${paymentId}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/principal-payments/${paymentId}/approve`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to approve payment');
      }
      
      const payment = await response.json();
      logger.info('ACCOUNTING', `✅ Admin cash submission approved: ${paymentId}`);
      return payment;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to approve payment: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Reject an admin cash submission (admin only)
   */
  async rejectPrincipalPayment(paymentId: string, rejectionReason: string): Promise<PrincipalPayment> {
    logger.info('ACCOUNTING', `❌ Rejecting principal payment: ${paymentId}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/principal-payments/${paymentId}/reject`, {
        method: 'POST',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rejection_reason: rejectionReason,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reject payment');
      }
      
      const payment = await response.json();
      logger.info('ACCOUNTING', `❌ Principal payment rejected: ${paymentId}`);
      return payment;
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to reject payment: ${error.message}`);
      throw error;
    }
  }
}

export const accountingService = new AccountingService();
export default accountingService;
