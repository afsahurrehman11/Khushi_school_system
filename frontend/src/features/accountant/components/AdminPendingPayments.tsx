/**
 * Admin Pending Cash Submissions Component
 * MODULE 4: Admin interface for approving/rejecting cash submissions from accountants
 * Shows all pending cash submissions with password verification for actions
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Clock, DollarSign, User, Lock, Eye, EyeOff, RefreshCw, Banknote, Building2, CreditCard, Wallet } from 'lucide-react';
import dailyWorkflowService, { PendingPrincipalPayment } from '../services/dailyWorkflowService';
import { InAppNotificationService } from '../services/InAppNotificationService';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

interface AdminPendingPaymentsProps {
  onRefresh?: () => void;
}

const AdminPendingPayments: React.FC<AdminPendingPaymentsProps> = ({ onRefresh }) => {
  const [payments, setPayments] = useState<PendingPrincipalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Action modal state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject';
    payment: PendingPrincipalPayment | null;
  }>({ isOpen: false, type: 'approve', payment: null });
  
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    
    try {
      const data = await dailyWorkflowService.getPendingPrincipalPayments();
      setPayments(data);
      logger.info('📋 ADMIN_PAYMENTS', `Loaded ${data.length} pending payments`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Failed to load pending payments';
      setError(msg);
      logger.error('📋 ADMIN_PAYMENTS', `Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-PK', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH': return <Banknote className="w-4 h-4" />;
      case 'BANK_TRANSFER': return <Building2 className="w-4 h-4" />;
      case 'CHEQUE': return <CreditCard className="w-4 h-4" />;
      case 'ONLINE': return <Wallet className="w-4 h-4" />;
      default: return <DollarSign className="w-4 h-4" />;
    }
  };

  const openApproveModal = (payment: PendingPrincipalPayment) => {
    setActionModal({ isOpen: true, type: 'approve', payment });
    setPassword('');
    setShowPassword(false);
    setActionError('');
  };

  const openRejectModal = (payment: PendingPrincipalPayment) => {
    setActionModal({ isOpen: true, type: 'reject', payment });
    setPassword('');
    setShowPassword(false);
    setRejectionReason('');
    setActionError('');
  };

  const closeModal = () => {
    setActionModal({ isOpen: false, type: 'approve', payment: null });
  };

  const handleApprove = async () => {
    if (!password) {
      setActionError('Password is required');
      return;
    }
    
    if (!actionModal.payment) return;
    
    setActionLoading(true);
    setActionError('');
    
    try {
      await dailyWorkflowService.approvePrincipalPayment(
        actionModal.payment.id,
        { password }
      );
      
      logger.info('✅ ADMIN_PAYMENTS', `Approved payment ${actionModal.payment.id}`);
      InAppNotificationService.success(`Payment of ${formatCurrency(actionModal.payment.amount)} approved!`);
      
      closeModal();
      fetchPayments();
      onRefresh?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Failed to approve payment';
      setActionError(msg);
      logger.error('✅ ADMIN_PAYMENTS', `Approval failed: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!password) {
      setActionError('Password is required');
      return;
    }
    
    if (!rejectionReason.trim()) {
      setActionError('Rejection reason is required');
      return;
    }
    
    if (!actionModal.payment) return;
    
    setActionLoading(true);
    setActionError('');
    
    try {
      await dailyWorkflowService.rejectPrincipalPayment(
        actionModal.payment.id,
        { password, rejection_reason: rejectionReason.trim() }
      );
      
      logger.info('❌ ADMIN_PAYMENTS', `Rejected payment ${actionModal.payment.id}`);
      InAppNotificationService.warning(`Payment rejected`);
      
      closeModal();
      fetchPayments();
      onRefresh?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Failed to reject payment';
      setActionError(msg);
      logger.error('❌ ADMIN_PAYMENTS', `Rejection failed: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">📋 Pending Cash Submissions</h3>
              <p className="text-amber-100 text-sm">
                {payments.length} submission{payments.length !== 1 ? 's' : ''} awaiting approval
              </p>
            </div>
          </div>
          <button
            onClick={fetchPayments}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && payments.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-500">Loading pending payments...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            ❌ {error}
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-success-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No pending payments</p>
            <p className="text-gray-400 text-sm">All caught up! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment, index) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-amber-300 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-amber-100 rounded-full">
                        <User className="w-4 h-4 text-amber-600" />
                      </div>
                      <span className="font-semibold text-gray-900">{payment.accountant_name}</span>
                      <span className="text-gray-400 text-sm">({payment.accountant_email})</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Amount:</span>
                        <span className="font-bold text-amber-600 ml-2">{formatCurrency(payment.amount)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Method:</span>
                        {getMethodIcon(payment.payment_method)}
                        <span className="font-medium ml-1">{payment.payment_method}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Outstanding at request:</span>
                        <span className="font-medium ml-2">{formatCurrency(payment.outstanding_at_request)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Requested:</span>
                        <span className="font-medium ml-2">{formatDate(payment.created_at)}</span>
                      </div>
                    </div>
                    
                    {payment.notes && (
                      <div className="bg-white rounded p-2 text-sm text-gray-600 border border-gray-100">
                        📝 {payment.notes}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openApproveModal(payment)}
                      className="p-2 bg-success-100 text-success-600 rounded-lg hover:bg-success-200 transition"
                      title="Approve"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => openRejectModal(payment)}
                      className="p-2 bg-danger-100 text-danger-600 rounded-lg hover:bg-danger-200 transition"
                      title="Reject"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      <AnimatePresence>
        {actionModal.isOpen && actionModal.payment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className={`px-6 py-4 text-white ${
                actionModal.type === 'approve' 
                  ? 'bg-gradient-to-r from-success-500 to-emerald-500' 
                  : 'bg-gradient-to-r from-danger-500 to-rose-500'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    {actionModal.type === 'approve' ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <XCircle className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {actionModal.type === 'approve' ? '✅ Approve Payment' : '❌ Reject Payment'}
                    </h3>
                    <p className="text-sm opacity-90">
                      {actionModal.type === 'approve' 
                        ? 'Confirm with your password' 
                        : 'Provide reason and confirm'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Payment Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{actionModal.payment.accountant_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Amount:</span>
                    <span className={`font-bold text-lg ${
                      actionModal.type === 'approve' ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      {formatCurrency(actionModal.payment.amount)}
                    </span>
                  </div>
                </div>

                {/* Rejection Reason (only for reject) */}
                {actionModal.type === 'reject' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Rejection Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-danger-500 resize-none"
                      placeholder="Explain why this payment is being rejected..."
                    />
                  </div>
                )}

                {/* Password Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔑 Enter Your Admin Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12"
                      placeholder="Enter your password"
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

                {/* Warning */}
                <div className={`rounded-lg p-3 text-sm ${
                  actionModal.type === 'approve' 
                    ? 'bg-success-50 text-success-700' 
                    : 'bg-danger-50 text-danger-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <p>This action will be logged for audit purposes.</p>
                  </div>
                </div>

                {/* Error */}
                {actionError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                    ❌ {actionError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={closeModal}
                    disabled={actionLoading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={actionModal.type === 'approve' ? handleApprove : handleReject}
                    disabled={actionLoading || !password || (actionModal.type === 'reject' && !rejectionReason.trim())}
                    className={`flex-1 ${
                      actionModal.type === 'approve'
                        ? 'bg-gradient-to-r from-success-500 to-emerald-500 hover:from-success-600 hover:to-emerald-600'
                        : 'bg-gradient-to-r from-danger-500 to-rose-500 hover:from-danger-600 hover:to-rose-600'
                    } text-white`}
                  >
                    {actionLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span> Processing...
                      </span>
                    ) : actionModal.type === 'approve' ? (
                      <span className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Approve Payment
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <XCircle className="w-4 h-4" /> Reject Payment
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPendingPayments;
