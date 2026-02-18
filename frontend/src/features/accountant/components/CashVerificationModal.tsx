/**
 * Cash Verification Modal
 * Displayed on logout to verify cash holdings by payment method
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import Button from '../../../components/Button';
import { cashSessionService, CashSession } from '../services/cashSessionService';
import { useAuth } from '../../../hooks/useAuth';

interface CashVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  session: CashSession;
}

const CashVerificationModal: React.FC<CashVerificationModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  session
}) => {
  const { user } = useAuth();
  const [verifiedAmounts, setVerifiedAmounts] = useState<Record<string, string>>({});
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const expectedAmounts = session.current_balance_by_method || {};
  const paymentMethods = Object.keys(expectedAmounts).sort();

  // Initialize verified amounts with expected values
  useEffect(() => {
    const initial: Record<string, string> = {};
    paymentMethods.forEach(method => {
      initial[method] = expectedAmounts[method].toString();
    });
    setVerifiedAmounts(initial);
  }, [session.id]);

  const handleAmountChange = (method: string, value: string) => {
    setVerifiedAmounts(prev => ({ ...prev, [method]: value }));
  };

  const calculateDiscrepancy = (method: string): number => {
    const expected = expectedAmounts[method] || 0;
    const actual = parseFloat(verifiedAmounts[method]) || 0;
    return actual - expected;
  };

  const getTotalDiscrepancy = (): number => {
    return paymentMethods.reduce((sum, method) => sum + calculateDiscrepancy(method), 0);
  };

  const hasDiscrepancy = (): boolean => {
    return paymentMethods.some(method => Math.abs(calculateDiscrepancy(method)) > 0.01);
  };

  const handleSubmit = async () => {
    setError('');

    // Validate all amounts are entered
    const allEntered = paymentMethods.every(method => {
      const val = verifiedAmounts[method];
      return val !== '' && !isNaN(parseFloat(val));
    });

    if (!allEntered) {
      setError('Please enter all amounts');
      return;
    }

    // Check if discrepancy notes are required
    if (hasDiscrepancy() && !discrepancyNotes.trim()) {
      setError('Please provide notes explaining the discrepancy');
      return;
    }

    setSubmitting(true);

    try {
      const closingBalanceByMethod: Record<string, number> = {};
      paymentMethods.forEach(method => {
        closingBalanceByMethod[method] = parseFloat(verifiedAmounts[method]) || 0;
      });

      await cashSessionService.closeSession(session.id, {
        closing_balance: Object.values(closingBalanceByMethod).reduce((a, b) => a + b, 0),
        closing_balance_by_method: closingBalanceByMethod,
        discrepancy_notes: discrepancyNotes || undefined,
        verified_by: user?.email || 'Unknown'
      });

      onVerified();
    } catch (err: any) {
      setError(err.message || 'Failed to verify cash session');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalDiscrepancy = getTotalDiscrepancy();
  const showDiscrepancyWarning = hasDiscrepancy();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
              <div className="flex items-center gap-3">
                <div className="bg-primary-600 p-2 rounded-full">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-secondary-900">Verify Cash Holdings</h2>
                  <p className="text-sm text-secondary-600">Please verify your cash before logging out</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-secondary-400 hover:text-secondary-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Session Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-secondary-900 mb-2">Session Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-secondary-600">Opening Balance</p>
                    <p className="font-bold text-secondary-900">PKR {session.opening_balance.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-secondary-600">Collected Today</p>
                    <p className="font-bold text-success-600">PKR {(session.current_balance - session.opening_balance).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-secondary-600">Expected Balance</p>
                    <p className="font-bold text-primary-600">PKR {session.current_balance.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Verification Form */}
              <div className="space-y-4">
                <h3 className="font-semibold text-secondary-900">Verify Amounts by Payment Method</h3>
                
                {paymentMethods.map((method) => {
                  const expected = expectedAmounts[method];
                  const discrepancy = calculateDiscrepancy(method);
                  const hasMethodDiscrepancy = Math.abs(discrepancy) > 0.01;

                  return (
                    <div
                      key={method}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        hasMethodDiscrepancy 
                          ? 'border-warning-300 bg-warning-50' 
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <label className="font-medium text-secondary-900 block mb-1">
                            {method}
                          </label>
                          <p className="text-sm text-secondary-600">
                            Expected: PKR {expected.toLocaleString()}
                          </p>
                        </div>
                        {hasMethodDiscrepancy && (
                          <div className={`flex items-center gap-1 text-sm font-medium ${
                            discrepancy > 0 ? 'text-success-600' : 'text-danger-600'
                          }`}>
                            {discrepancy > 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {discrepancy > 0 ? '+' : ''}{discrepancy.toFixed(2)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-secondary-700">PKR</span>
                        <input
                          type="number"
                          step="0.01"
                          value={verifiedAmounts[method] || ''}
                          onChange={(e) => handleAmountChange(method, e.target.value)}
                          className={`flex-1 px-4 py-3 border-2 rounded-lg font-mono text-lg focus:outline-none focus:ring-2 transition-all ${
                            hasMethodDiscrepancy
                              ? 'border-warning-400 focus:border-warning-500 focus:ring-warning-200'
                              : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'
                          }`}
                          placeholder="Enter actual amount"
                          required
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Discrepancy Warning */}
              {showDiscrepancyWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-lg border-2 ${
                    totalDiscrepancy > 0
                      ? 'bg-success-50 border-success-300'
                      : 'bg-danger-50 border-danger-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`w-5 h-5 ${
                      totalDiscrepancy > 0 ? 'text-success-600' : 'text-danger-600'
                    }`} />
                    <h4 className={`font-bold ${
                      totalDiscrepancy > 0 ? 'text-success-900' : 'text-danger-900'
                    }`}>
                      Discrepancy Detected
                    </h4>
                  </div>
                  <p className={`text-sm mb-3 ${
                    totalDiscrepancy > 0 ? 'text-success-700' : 'text-danger-700'
                  }`}>
                    Total discrepancy: PKR {totalDiscrepancy > 0 ? '+' : ''}{totalDiscrepancy.toFixed(2)}
                  </p>
                  <textarea
                    value={discrepancyNotes}
                    onChange={(e) => setDiscrepancyNotes(e.target.value)}
                    placeholder="Please explain the discrepancy..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    rows={3}
                    required
                  />
                </motion.div>
              )}

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700"
                >
                  {error}
                </motion.div>
              )}

              {/* Success Indicator */}
              {!showDiscrepancyWarning && (
                <div className="flex items-center gap-2 text-success-600 bg-success-50 p-3 rounded-lg">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">All amounts match! Ready to close session.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Verifying...' : 'Verify & Close Session'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CashVerificationModal;
