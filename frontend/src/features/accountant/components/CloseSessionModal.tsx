/**
 * Close Session Modal
 * Displays expected vs actual amounts for cash reconciliation on logout
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import { CashSession, CashSessionSummary, CloseSessionPayload, cashSessionService } from '../services/cashSessionService';

interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession | null;
  summary: CashSessionSummary | null;
  onSessionClosed: () => void;
}

const PAYMENT_METHODS = ['Cash', 'JazzCash', 'EasyPaisa', 'HBL Bank', 'UBL Bank', 'Online', 'Other'];

const CloseSessionModal: React.FC<CloseSessionModalProps> = ({
  isOpen,
  onClose,
  session,
  summary,
  onSessionClosed
}) => {
  const [actualAmounts, setActualAmounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize actual amounts from expected amounts
  useEffect(() => {
    if (session?.current_balance_by_method) {
      logger.info('CLOSE_SESSION', `Initializing amounts from session: ${JSON.stringify(session.current_balance_by_method)}`);
      setActualAmounts({ ...session.current_balance_by_method });
    }
  }, [session]);

  if (!isOpen || !session) return null;

  logger.info('CLOSE_SESSION', `Modal opened for session: ${session.id}`);

  const expectedAmounts = session.current_balance_by_method || {};
  const allMethods = [...new Set([...Object.keys(expectedAmounts), ...Object.keys(actualAmounts), ...PAYMENT_METHODS.filter(m => expectedAmounts[m] || actualAmounts[m])])];

  // Calculate discrepancies
  const discrepancies: Record<string, number> = {};
  let totalExpected = 0;
  let totalActual = 0;
  let hasDiscrepancy = false;

  allMethods.forEach(method => {
    const expected = expectedAmounts[method] || 0;
    const actual = actualAmounts[method] || 0;
    discrepancies[method] = actual - expected;
    totalExpected += expected;
    totalActual += actual;
    if (Math.abs(discrepancies[method]) > 0.01) {
      hasDiscrepancy = true;
    }
  });

  const totalDiscrepancy = totalActual - totalExpected;

  const handleSubmit = async () => {
    logger.info('CLOSE_SESSION', `Closing session - Expected: ${totalExpected}, Actual: ${totalActual}, Discrepancy: ${totalDiscrepancy}`);
    setLoading(true);
    setError('');

    try {
      const payload: CloseSessionPayload = {
        closing_balance: totalActual,
        closing_balance_by_method: actualAmounts,
        discrepancy_notes: hasDiscrepancy ? notes : undefined,
        verified_by: 'self'
      };
      
      logger.info('CLOSE_SESSION', `Submitting close request: ${JSON.stringify(payload)}`);

      await cashSessionService.closeSession(session.id, payload);
      logger.info('CLOSE_SESSION', '✅ Session closed successfully');
      onSessionClosed();
      onClose();
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to close session';
      logger.error('CLOSE_SESSION', `❌ Failed to close session: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getMethodColor = (index: number) => {
    const colors = ['emerald', 'blue', 'purple', 'amber', 'rose', 'cyan', 'indigo', 'pink'];
    return colors[index % colors.length];
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Close Today's Session</h2>
                  <p className="text-primary-100 text-sm">
                    {new Date(session.started_at).toLocaleDateString()} - Verify your closing balance
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-secondary-50 rounded-xl p-4 text-center">
                <p className="text-xs text-secondary-600 mb-1">Expected Total</p>
                <p className="text-2xl font-bold text-secondary-900">
                  PKR {totalExpected.toLocaleString()}
                </p>
              </div>
              <div className="bg-primary-50 rounded-xl p-4 text-center">
                <p className="text-xs text-primary-700 mb-1">Actual Total</p>
                <p className="text-2xl font-bold text-primary-700">
                  PKR {totalActual.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-xl p-4 text-center ${
                totalDiscrepancy === 0 
                  ? 'bg-success-50' 
                  : totalDiscrepancy > 0 
                    ? 'bg-amber-50' 
                    : 'bg-danger-50'
              }`}>
                <p className={`text-xs mb-1 ${
                  totalDiscrepancy === 0 
                    ? 'text-success-700' 
                    : totalDiscrepancy > 0 
                      ? 'text-amber-700' 
                      : 'text-danger-700'
                }`}>
                  {totalDiscrepancy === 0 ? 'Balanced' : 'Discrepancy'}
                </p>
                <p className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                  totalDiscrepancy === 0 
                    ? 'text-success-700' 
                    : totalDiscrepancy > 0 
                      ? 'text-amber-700' 
                      : 'text-danger-700'
                }`}>
                  {totalDiscrepancy === 0 ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : totalDiscrepancy > 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                  {totalDiscrepancy === 0 ? '✓' : `${totalDiscrepancy > 0 ? '+' : ''}PKR ${totalDiscrepancy.toLocaleString()}`}
                </p>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="mb-6">
              <h3 className="font-semibold text-secondary-900 mb-3">Enter Actual Amounts by Payment Method</h3>
              <div className="space-y-3">
                {allMethods.filter(m => expectedAmounts[m] || actualAmounts[m]).map((method, index) => {
                  const expected = expectedAmounts[method] || 0;
                  const actual = actualAmounts[method] || 0;
                  const disc = actual - expected;
                  const color = getMethodColor(index);

                  return (
                    <div
                      key={method}
                      className={`bg-gray-50 rounded-xl p-4 border-l-4 border-${color}-500`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full bg-${color}-500`}></div>
                          <span className="font-medium text-secondary-900">{method}</span>
                        </div>
                        {disc !== 0 && (
                          <span className={`text-sm font-medium ${disc > 0 ? 'text-amber-600' : 'text-danger-600'}`}>
                            {disc > 0 ? '+' : ''}{disc.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-secondary-500 block mb-1">Expected (System)</label>
                          <div className="bg-white px-3 py-2 rounded-lg text-secondary-700 font-medium border border-secondary-200">
                            PKR {expected.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-secondary-500 block mb-1">Actual (You Count)</label>
                          <input
                            type="number"
                            value={actual || ''}
                            onChange={(e) => setActualAmounts(prev => ({
                              ...prev,
                              [method]: parseFloat(e.target.value) || 0
                            }))}
                            className={`w-full px-3 py-2 rounded-lg border font-medium transition-colors ${
                              disc !== 0 
                                ? 'border-amber-300 bg-amber-50 text-amber-700' 
                                : 'border-secondary-200 bg-white'
                            } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Discrepancy Warning & Notes */}
            {hasDiscrepancy && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-amber-800 mb-1">Discrepancy Detected</h4>
                    <p className="text-sm text-amber-700 mb-3">
                      There's a difference between the expected and actual amounts. 
                      Please provide a brief explanation for the discrepancy.
                    </p>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Explain the discrepancy (e.g., 'Customer returned PKR 500 after system recorded payment')"
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-secondary-600">
              Transactions: <span className="font-semibold">{summary?.total_transactions || 0}</span>
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                className={hasDiscrepancy && !notes ? 'opacity-50' : ''}
                disabled={loading || (hasDiscrepancy && !notes)}
              >
                {loading ? 'Closing...' : hasDiscrepancy ? 'Close with Discrepancy' : 'Close Session'}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CloseSessionModal;
