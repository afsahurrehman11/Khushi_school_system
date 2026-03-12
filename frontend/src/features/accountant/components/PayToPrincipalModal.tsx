/**
 * Pay To Principal Modal
 * MODULE 4: Enhanced modal with password verification  
 * Requires session to be closed before payment
 * Two-step process: Review → Verify with password
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, AlertCircle, Wallet, CreditCard, Banknote, Building2, Lock, Shield, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import dailyWorkflowService, { MonthCollectionDetails, PayPrincipalPayload } from '../services/dailyWorkflowService';
import { InAppNotificationService } from '../services/InAppNotificationService';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';

interface PayToPrincipalModalProps {
  maxAmount: number;
  sessionId?: string;
  sessionStatus?: string;  // Added for session checks
  onClose: () => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Cash', icon: <Banknote className="w-5 h-5" /> },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: <Building2 className="w-5 h-5" /> },
  { value: 'CHEQUE', label: 'Cheque', icon: <CreditCard className="w-5 h-5" /> },
  { value: 'ONLINE', label: 'Online', icon: <Wallet className="w-5 h-5" /> },
];

const PayToPrincipalModal: React.FC<PayToPrincipalModalProps> = ({
  maxAmount,
  sessionStatus = 'UNKNOWN',
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState(maxAmount.toString());
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // MODULE 4: Enhanced states
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [monthDetails, setMonthDetails] = useState<MonthCollectionDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Fetch month collection details on mount
  useEffect(() => {
    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const details = await dailyWorkflowService.getMonthCollection();
        setMonthDetails(details);
        // Pre-fill with outstanding balance
        if (details.outstanding_balance > 0) {
          setAmount(details.outstanding_balance.toString());
        }
        logger.info('💸 PAY_PRINCIPAL', `Month details loaded: outstanding=${details.outstanding_balance}`);
      } catch (err: any) {
        logger.error('💸 PAY_PRINCIPAL', `Failed to load month details: ${err.message}`);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, []);
  
  // Reset on close
  useEffect(() => {
    if (!step) {
      setPassword('');
      setShowPassword(false);
      setError('');
    }
  }, [step]);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setAmount(value);
    setError('');
  };
  
  const actualMaxAmount = monthDetails?.outstanding_balance || maxAmount;
  const numAmount = parseFloat(amount) || 0;
  const remainingAfter = actualMaxAmount - numAmount;
  
  const handleProceedToVerify = () => {
    // Validation
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (numAmount > actualMaxAmount) {
      setError(`Amount cannot exceed outstanding balance of ${formatCurrency(actualMaxAmount)}`);
      return;
    }
    
    setError('');
    setStep('verify');
    logger.info('💸 PAY_PRINCIPAL', 'Proceeding to verification step');
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Password is required');
      return;
    }
    
    logger.info('💸 PAY_PRINCIPAL', `Submitting principal payment with verification: ${formatCurrency(numAmount)} via ${method}`);
    setLoading(true);
    setError('');
    
    try {
      const payload: PayPrincipalPayload = {
        password,
        amount: numAmount,
        payment_method: method,
        notes: notes.trim() || undefined
      };
      
      await dailyWorkflowService.requestPrincipalPayment(payload);
      
      logger.info('💸 PAY_PRINCIPAL', '✅ Principal payment submitted successfully');
      InAppNotificationService.success('Payment request submitted for admin approval');
      onSuccess();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err.message || 'Failed to submit payment';
      logger.error('💸 PAY_PRINCIPAL', `❌ Failed to submit principal payment: ${errorMsg}`);
      setError(errorMsg);
      
      // If session is not closed, show specific error
      if (errorMsg.includes('session still open') || errorMsg.includes('close your session')) {
        InAppNotificationService.warning('Please close your session first before making principal payment');
      } else {
        InAppNotificationService.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Check if session is open (warning to close first)
  const isSessionOpen = sessionStatus === 'active' || sessionStatus === 'OPEN';
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  {step === 'verify' ? <Shield className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {step === 'verify' ? '🔐 Verify Payment' : '💸 Pay To Principal'}
                  </h3>
                  <p className="text-blue-100 text-sm">
                    {step === 'verify' ? 'Enter password to confirm' : 'Submit payment for approval'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Step Progress */}
          <div className="px-6 py-3 bg-gray-50 border-b">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${step === 'details' ? 'text-blue-600' : 'text-success-600'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                  step === 'details' ? 'bg-blue-100 text-blue-600' : 'bg-success-100 text-success-600'
                }`}>
                  {step === 'verify' ? <CheckCircle className="w-4 h-4" /> : '1'}
                </div>
                <span className="text-sm font-medium">Details</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200">
                <motion.div 
                  className="h-full bg-blue-600"
                  initial={{ width: '0%' }}
                  animate={{ width: step === 'verify' ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className={`flex items-center gap-2 ${step === 'verify' ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  step === 'verify' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-medium">Verify</span>
              </div>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <AnimatePresence mode="wait">
              {step === 'details' ? (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  {/* Session Warning */}
                  {isSessionOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                    >
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        <strong>⚠️ Session Still Open!</strong> You must close your session first before making principal payment.
                      </p>
                    </motion.div>
                  )}
                  
                  {/* Month Summary */}
                  {monthDetails && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-800 mb-2">📅 {monthDetails.month} Summary</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-blue-600">Total Collected:</span>
                          <span className="font-bold ml-1">{formatCurrency(monthDetails.total_collected)}</span>
                        </div>
                        <div>
                          <span className="text-blue-600">Paid to Principal:</span>
                          <span className="font-bold ml-1">{formatCurrency(monthDetails.total_paid_to_principal)}</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <span className="text-blue-700 font-medium">Outstanding Balance:</span>
                        <span className="font-bold text-blue-800 ml-2">{formatCurrency(monthDetails.outstanding_balance)}</span>
                      </div>
                    </div>
                  )}
                  
                  {loadingDetails && (
                    <div className="text-center py-4">
                      <span className="text-gray-500">Loading month details...</span>
                    </div>
                  )}
            
                  {/* Amount Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💰 Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                        PKR
                      </span>
                      <input
                        type="text"
                        value={amount}
                        onChange={handleAmountChange}
                        className="w-full pl-14 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-semibold"
                        placeholder="Enter amount"
                        disabled={loading}
                      />
                    </div>
                    {numAmount > 0 && numAmount <= actualMaxAmount && (
                      <p className="mt-1 text-sm text-gray-500">
                        Remaining after payment: {formatCurrency(remainingAfter)}
                      </p>
                    )}
                  </div>
            
                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💳 Payment Method <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMethod(m.value)}
                          disabled={loading}
                          className={`flex items-center gap-2 p-3 rounded-lg border-2 transition ${
                            method === m.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-600'
                          }`}
                        >
                          {m.icon}
                          <span className="font-medium">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
            
                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Notes <span className="text-gray-400">(Optional)</span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      placeholder="Add any notes about this payment..."
                      disabled={loading}
                    />
                  </div>
            
                  {/* Info about approval */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800">
                      This payment requires <strong>admin approval</strong> and <strong>your password verification</strong>.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-5"
                >
                  {/* Payment Summary */}
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-3">
                      <Shield className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">🔐 Verify Your Identity</h3>
                    <p className="text-gray-600 text-sm">Enter your password to confirm payment</p>
                  </div>
                  
                  {/* Payment Review */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-bold text-blue-600">{formatCurrency(numAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Method:</span>
                      <span className="font-medium">{PAYMENT_METHODS.find(m => m.value === method)?.label}</span>
                    </div>
                    {notes && (
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-gray-600 text-sm">Notes:</span>
                        <p className="text-sm mt-1">{notes}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Password Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🔑 Enter Your Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                        placeholder="Enter your account password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">❌ {error}</p>
              </motion.div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {step === 'details' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleProceedToVerify}
                    disabled={loading || numAmount <= 0 || numAmount > actualMaxAmount || isSessionOpen}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                  >
                    Continue to Verify →
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('details')}
                    disabled={loading}
                    className="flex-1"
                  >
                    ← Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !password}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span> Verifying...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4" /> 🔒 Confirm Payment
                      </span>
                    )}
                  </Button>
                </>
              )}
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PayToPrincipalModal;
