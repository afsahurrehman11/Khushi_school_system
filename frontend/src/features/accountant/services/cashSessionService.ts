/**
 * Cash Session Service
 * Manages cash tracking, opening/closing balances, and reconciliation
 */

import api from '../../../utils/api';
import logger from '../../../utils/logger';

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
  status: 'active' | 'closed' | 'pending_reconciliation' | 'inactive';
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

export interface AccountantUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AccountantStat {
  user: AccountantUser;
  session_id: string;
  session_date: string;
  status: 'active' | 'closed' | 'pending_reconciliation' | 'inactive';
  opening_balance: number;
  current_balance: number;
  collected_today: number;
  total_transactions: number;
  breakdown_by_method: Record<string, { count: number; total: number }>;
  opening_balance_by_method: Record<string, number>;
  current_balance_by_method: Record<string, number>;
  discrepancy?: number;
  discrepancy_by_method?: Record<string, number>;
  discrepancy_notes?: string;
  started_at: string;
  closed_at?: string;
}

export interface SchoolDailySummary {
  date: string;
  school_id: string;
  total_accountants: number;
  active_sessions: number;
  closed_sessions: number;
  total_opening_balance: number;
  total_current_balance: number;
  total_collected: number;
  total_transactions: number;
  breakdown_by_method: Record<string, number>;
}

class CashSessionService {
  /**
   * Get or create current cash session for logged-in user
   */
  async getCurrentSession(): Promise<CashSession> {
    try {
      logger.info('CASH_SERVICE', 'Fetching current cash session...');
      const session = await api.get('/api/cash-sessions/current');
      logger.info('CASH_SERVICE', `✅ Current session: ${session.id}, Status: ${session.status}`);
      return session;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get current session: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Activate the current session
   */
  async activateSession(): Promise<CashSession> {
    try {
      logger.info('CASH_SERVICE', 'Activating current session...');
      const session = await api.post('/api/cash-sessions/current/activate', {});
      logger.info('CASH_SERVICE', `✅ Session activated: ${session.id}, Status: ${session.status}`);
      return session;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to activate session: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get specific session by ID
   */
  async getSession(sessionId: string): Promise<CashSession> {
    try {
      logger.info('CASH_SERVICE', `Fetching session: ${sessionId}`);
      const session = await api.get(`/api/cash-sessions/${sessionId}`);
      logger.info('CASH_SERVICE', `✅ Session fetched: ${session.id}`);
      return session;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get session ${sessionId}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get session summary with transaction breakdown
   */
  async getSessionSummary(sessionId: string): Promise<CashSessionSummary> {
    try {
      logger.info('CASH_SERVICE', `Fetching session summary: ${sessionId}`);
      const summary = await api.get(`/api/cash-sessions/${sessionId}/summary`);
      logger.info('CASH_SERVICE', `✅ Summary: ${summary.total_transactions} transactions`);
      return summary;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get summary for ${sessionId}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get all transactions for a session
   */
  async getSessionTransactions(sessionId: string): Promise<CashTransaction[]> {
    try {
      logger.info('CASH_SERVICE', `Fetching transactions for session: ${sessionId}`);
      const transactions = await api.get(`/api/cash-sessions/${sessionId}/transactions`);
      logger.info('CASH_SERVICE', `✅ Fetched ${transactions.length} transactions`);
      return transactions;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get transactions: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Close cash session with reconciliation
   */
  async closeSession(sessionId: string, payload: CloseSessionPayload): Promise<CashSession> {
    try {
      logger.info('CASH_SERVICE', `Closing session: ${sessionId}, Balance: ${payload.closing_balance}`);
      const session = await api.post(`/api/cash-sessions/${sessionId}/close`, payload);
      logger.info('CASH_SERVICE', `✅ Session ${sessionId} closed successfully`);
      return session;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to close session ${sessionId}: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get user's cash session history
   */
  async getUserHistory(limit: number = 10): Promise<CashSession[]> {
    try {
      logger.info('CASH_SERVICE', `Fetching user history (limit: ${limit})`);
      const sessions = await api.get(`/api/cash-sessions/user/history?limit=${limit}`);
      logger.info('CASH_SERVICE', `✅ Fetched ${sessions.length} historical sessions`);
      return sessions;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get user history: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get all active sessions for the school (admin oversight)
   */
  async getSchoolActiveSessions(): Promise<CashSession[]> {
    try {
      logger.info('CASH_SERVICE', 'Fetching school active sessions (admin)');
      const sessions = await api.get('/api/cash-sessions/school/active');
      logger.info('CASH_SERVICE', `✅ Found ${sessions.length} active sessions`);
      return sessions;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get active sessions: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get all accountants' stats for a specific date (admin oversight)
   */
  async getAccountantStats(date?: string): Promise<AccountantStat[]> {
    try {
      const params = date ? `?date=${date}` : '';
      logger.info('CASH_SERVICE', `Fetching accountant stats (admin), date: ${date || 'today'}`);
      const stats = await api.get(`/api/cash-sessions/school/accountant-stats${params}`);
      logger.info('CASH_SERVICE', `✅ Found stats for ${stats.length} accountants`);
      return stats;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get accountant stats: ${err?.message}`);
      throw err;
    }
  }

  /**
   * Get school-wide daily summary (admin oversight)
   */
  async getSchoolDailySummary(date?: string): Promise<SchoolDailySummary> {
    try {
      const params = date ? `?date=${date}` : '';
      logger.info('CASH_SERVICE', `Fetching school daily summary, date: ${date || 'today'}`);
      const summary = await api.get(`/api/cash-sessions/school/daily-summary${params}`);
      logger.info('CASH_SERVICE', `✅ Summary: ${summary.total_accountants} accountants, PKR ${summary.total_collected} collected`);
      return summary;
    } catch (err: any) {
      logger.error('CASH_SERVICE', `❌ Failed to get school summary: ${err?.message}`);
      throw err;
    }
  }
}

export const cashSessionService = new CashSessionService();
