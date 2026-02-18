/**
 * Cash Session Service
 * Manages cash tracking, opening/closing balances, and reconciliation
 */

import api from '../../../utils/api';

export interface CashSession {
  id: string;
  user_id: string;
  school_id: string;
  session_date: string;
  opening_balance: number;
  opening_balance_by_method: Record<string, number>;
  current_balance: number;
  current_balance_by_method: Record<string, number>;
  closing_balance?: number;
  closing_balance_by_method?: Record<string, number>;
  discrepancy?: number;
  discrepancy_by_method?: Record<string, number>;
  discrepancy_notes?: string;
  status: 'active' | 'closed' | 'pending_reconciliation';
  started_at: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  session_id: string;
  user_id: string;
  school_id: string;
  payment_id: string;
  student_id: string;
  amount: number;
  payment_method: string;
  transaction_reference?: string;
  timestamp: string;
  created_at: string;
}

export interface CashSessionSummary {
  session: CashSession;
  total_transactions: number;
  breakdown_by_method: Record<string, { count: number; total: number }>;
}

export interface CloseSessionPayload {
  closing_balance: number;
  closing_balance_by_method: Record<string, number>;
  discrepancy_notes?: string;
  verified_by: string;
}

class CashSessionService {
  /**
   * Get or create current cash session for logged-in user
   */
  async getCurrentSession(): Promise<CashSession> {
    return await api.get('/api/cash-sessions/current');
  }

  /**
   * Get specific session by ID
   */
  async getSession(sessionId: string): Promise<CashSession> {
    return await api.get(`/api/cash-sessions/${sessionId}`);
  }

  /**
   * Get session summary with transaction breakdown
   */
  async getSessionSummary(sessionId: string): Promise<CashSessionSummary> {
    return await api.get(`/api/cash-sessions/${sessionId}/summary`);
  }

  /**
   * Get all transactions for a session
   */
  async getSessionTransactions(sessionId: string): Promise<CashTransaction[]> {
    return await api.get(`/api/cash-sessions/${sessionId}/transactions`);
  }

  /**
   * Close cash session with reconciliation
   */
  async closeSession(sessionId: string, payload: CloseSessionPayload): Promise<CashSession> {
    return await api.post(`/api/cash-sessions/${sessionId}/close`, payload);
  }

  /**
   * Get user's cash session history
   */
  async getUserHistory(limit: number = 10): Promise<CashSession[]> {
    return await api.get(`/api/cash-sessions/user/history?limit=${limit}`);
  }

  /**
   * Get all active sessions for the school (admin oversight)
   */
  async getSchoolActiveSessions(): Promise<CashSession[]> {
    return await api.get('/api/cash-sessions/school/active');
  }
}

export const cashSessionService = new CashSessionService();
