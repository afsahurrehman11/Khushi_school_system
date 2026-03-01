/**
 * Cash Session Hook
 * React hook for managing cash session state
 */

import { useState, useEffect, useCallback } from 'react';
import { cashSessionService, CashSession, CashSessionSummary } from '../services/cashSessionService';
import logger from '../../../utils/logger';

export const useCashSession = () => {
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentSession = useCallback(async () => {
    logger.info('CASH_SESSION', 'Loading current cash session...');
    setLoading(true);
    setError(null);
    try {
      const currentSession = await cashSessionService.getCurrentSession();
      setSession(currentSession);
      logger.info('CASH_SESSION', `✅ Session loaded: ${currentSession.id}, Status: ${currentSession.status}, Balance: ${currentSession.current_balance}`);
      return currentSession;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load cash session';
      logger.error('CASH_SESSION', `❌ Failed to load session: ${errorMsg}`);
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionSummary = useCallback(async (sessionId: string) => {
    logger.info('CASH_SESSION', `Loading session summary for: ${sessionId}`);
    setLoading(true);
    setError(null);
    try {
      const summaryData = await cashSessionService.getSessionSummary(sessionId);
      setSummary(summaryData);
      logger.info('CASH_SESSION', `✅ Summary loaded: ${summaryData.total_transactions} transactions`);
      return summaryData;
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load session summary';
      logger.error('CASH_SESSION', `❌ Failed to load summary: ${errorMsg}`);
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    logger.info('CASH_SESSION', 'Refreshing session data...');
    try {
      const newSession = await loadCurrentSession();
      if (newSession?.id) {
        await loadSessionSummary(newSession.id);
      }
      logger.info('CASH_SESSION', '✅ Session refreshed successfully');
    } catch (err: any) {
      logger.error('CASH_SESSION', `❌ Refresh failed: ${err?.message}`);
    }
  }, [loadCurrentSession, loadSessionSummary]);

  // Auto-load current session on mount
  useEffect(() => {
    logger.info('CASH_SESSION', 'Hook mounted - loading initial session');
    loadCurrentSession();
  }, [loadCurrentSession]);

  // Auto-load summary when session changes
  useEffect(() => {
    if (session?.id) {
      logger.info('CASH_SESSION', `Session changed - loading summary for: ${session.id}`);
      loadSessionSummary(session.id);
    }
  }, [session?.id, loadSessionSummary]);

  return {
    session,
    summary,
    loading,
    error,
    loadCurrentSession,
    loadSessionSummary,
    refreshSession
  };
};
