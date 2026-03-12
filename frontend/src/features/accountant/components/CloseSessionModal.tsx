/**
 * Close Session Modal
 * MODULE 4: Session closing with password verification
 * Enhanced with password verification for security
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, DollarSign, TrendingDown, TrendingUp, Lock, Shield, Eye, EyeOff } from 'lucide-react';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import { CashSession, CashSessionSummary } from '../services/cashSessionService';
import dailyWorkflowService, { CloseSessionWithVerificationPayload } from '../services/dailyWorkflowService';

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
  
  // MODULE 4: Password verification state
  const [step, setStep] = useState<'amounts' | 'verify'>('amounts');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Initialize actual amounts from expected amounts
  useEffect(() => {
    if (session?.current_balance_by_method) {
      logger.info('🔒 CLOSE_SESSION', `Initializing amounts from session: ${JSON.stringify(session.current_balance_by_method)}`);
      setActualAmounts({ ...session.current_balance_by_method });
    }
  }, [session]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('amounts');
      setPassword('');
      setShowPassword(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !session) return null;

  logger.info('🔒 CLOSE_SESSION', `Modal opened for session: ${session.id}`);

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

  const handleProceedToVerify = () => {
    if (hasDiscrepancy && !notes) {
      setError('Please provide a note explaining the discrepancy');
      return;
    }
    setError('');
    setStep('verify');
    logger.info('🔒 CLOSE_SESSION', 'Proceeding to password verification step');
  };

  const handleSubmit = async () => {
    if (!password) {
      setError('Password is required to close session');
      return;
    }

    logger.info('🔒 CLOSE_SESSION', `Closing session with verification - Expected: ${totalExpected}, Actual: ${totalActual}, Discrepancy: ${totalDiscrepancy}`);
    setLoading(true);
    setError('');

    try {
      const payload: CloseSessionWithVerificationPayload = {
        password,
        closing_balance: totalActual,
        closing_balance_by_method: actualAmounts,
        discrepancy_notes: hasDiscrepancy ? notes : undefined
      };
      
      logger.info('🔒 CLOSE_SESSION', `Submitting close request with verification`);

      await dailyWorkflowService.closeSessionWithVerification(payload);
      logger.info('🔒 CLOSE_SESSION', '✅ Session closed successfully with verification');
      onSessionClosed();
      onClose();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err?.message || 'Failed to close session';
      logger.error('🔒 CLOSE_SESSION', `❌ Failed to close session: ${errorMsg}`);
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
                  {step === 'verify' ? <Shield className="w-6 h-6" /> : <DollarSign className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {step === 'verify' ? '🔐 Verify & Close Session' : '💰 Close Today\'s Session'}
                  </h2>
                  <p className="text-primary-100 text-sm">
                    {step === 'verify' 
                      ? 'Enter your password to confirm closing' 
                      : `${new Date(session.started_at).toLocaleDateString()} - Verify your closing balance`
                    }
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

          {/* Step Progress Indicator */}
          <div className="px-6 py-3 bg-gray-50 border-b">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${step === 'amounts' ? 'text-primary-600' : 'text-success-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === 'amounts' ? 'bg-primary-100 text-primary-600' : 'bg-success-100 text-success-600'
                }`}>
                  {step === 'verify' ? <CheckCircle className="w-5 h-5" /> : '1'}
                </div>
                <span className="text-sm font-medium">Enter Amounts</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200">
                <motion.div 
                  className="h-full bg-primary-600"
                  initial={{ width: '0%' }}
                  animate={{ width: step === 'verify' ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className={`flex items-center gap-2 ${step === 'verify' ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === 'verify' ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Lock className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Verify</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            <AnimatePresence mode="wait">
              {step === 'amounts' ? (
                <motion.div
                  key="amounts"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
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
                        {totalDiscrepancy === 0 ? '✅ Balanced' : '⚠️ Discrepancy'}
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
                    <h3 className="font-semibold text-secondary-900 mb-3">📝 Enter Actual Amounts by Payment Method</h3>
                    <div className="space-y-3">
                      {allMethods.filter(m => expectedAmounts[m] || actualAmounts[m]).map((method, index) => {
                        const expected = expectedAmounts[method] || 0;
                        const actual = actualAmounts[method] || 0;
                        const disc = actual - expected;
                        const color = getMethodColor(index);

                        return (
                          <motion.div
                            key={method}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
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
                          </motion.div>
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
                          <h4 className="font-semibold text-amber-800 mb-1">⚠️ Discrepancy Detected</h4>
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
                </motion.div>
              ) : (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Verification Step */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 rounded-full mb-4">
                      <Shield className="w-10 h-10 text-primary-600" />
                    </div>
                    <h3 className="text-xl font-bold text-secondary-900 mb-2">🔐 Verify Your Identity</h3>
                    <p className="text-secondary-600">
                      For security, please enter your password to confirm closing this session.
                    </p>
                  </div>

                  {/* Session Summary Review */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <h4 className="font-semibold text-secondary-900 mb-3">📋 Session Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-secondary-600">Expected Total:</span>
                        <span className="font-semibold ml-2">PKR {totalExpected.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-secondary-600">Actual Total:</span>
                        <span className="font-semibold ml-2">PKR {totalActual.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-secondary-600">Discrepancy:</span>
                        <span className={`font-semibold ml-2 ${
                          totalDiscrepancy === 0 ? 'text-success-600' : totalDiscrepancy > 0 ? 'text-amber-600' : 'text-danger-600'
                        }`}>
                          {totalDiscrepancy === 0 ? '✓ None' : `PKR ${totalDiscrepancy.toLocaleString()}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary-600">Transactions:</span>
                        <span className="font-semibold ml-2">{summary?.total_transactions || 0}</span>
                      </div>
                    </div>
                    {hasDiscrepancy && notes && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-secondary-600 text-sm">Note:</span>
                        <p className="text-sm text-secondary-700 mt-1">{notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Password Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-secondary-700 mb-2">
                      🔑 Enter Your Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-secondary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12"
                        placeholder="Enter your account password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      <p>This action will be logged for audit purposes.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mt-4"
              >
                ❌ {error}
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-secondary-600">
              Transactions: <span className="font-semibold">{summary?.total_transactions || 0}</span>
            </p>
            <div className="flex gap-3">
              {step === 'amounts' ? (
                <>
                  <Button variant="secondary" onClick={onClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleProceedToVerify}
                    className={hasDiscrepancy && !notes ? 'opacity-50' : ''}
                    disabled={hasDiscrepancy && !notes}
                  >
                    Continue to Verify →
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setStep('amounts')} disabled={loading}>
                    ← Back
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    className={!password ? 'opacity-50' : ''}
                    disabled={loading || !password}
                  >
                    {loading ? '🔄 Verifying...' : '🔒 Confirm & Close Session'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CloseSessionModal;
