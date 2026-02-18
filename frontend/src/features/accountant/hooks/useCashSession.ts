/**
 * Cash Session Hook
 * React hook for managing cash session state
 */

import { useState, useEffect, useCallback } from 'react';
import { cashSessionService, CashSession, CashSessionSummary } from '../services/cashSessionService';

export const useCashSession = () => {
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentSession = await cashSessionService.getCurrentSession();
      setSession(currentSession);
      return currentSession;
    } catch (err: any) {
      setError(err.message || 'Failed to load cash session');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionSummary = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const summaryData = await cashSessionService.getSessionSummary(sessionId);
      setSummary(summaryData);
      return summaryData;
    } catch (err: any) {
      setError(err.message || 'Failed to load session summary');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (session?.id) {
      await loadSessionSummary(session.id);
    } else {
      await loadCurrentSession();
    }
  }, [session?.id, loadSessionSummary, loadCurrentSession]);

  // Auto-load current session on mount
  useEffect(() => {
    loadCurrentSession();
  }, [loadCurrentSession]);

  // Auto-load summary when session changes
  useEffect(() => {
    if (session?.id) {
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
