/**
 * Admin Cash Submission Approvals
 * MODULE 2: Admin view for approving/rejecting cash submissions
 * Shows pending payments with approve/reject actions
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, User, Calendar, Wallet, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { accountingService, PrincipalPayment } from '../../accountant/services/accountingService';
import { InAppNotificationService } from '../../accountant/services/InAppNotificationService';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

interface PrincipalPaymentApprovalsProps {
  className?: string;
}

const PrincipalPaymentApprovals: React.FC<PrincipalPaymentApprovalsProps> = ({ className = '' }) => {
  const [payments, setPayments] = useState<PrincipalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  
  const loadPayments = async () => {
    logger.info('ADMIN', '📋 Loading admin cash submissions for review...');
    setLoading(true);
    try {
      const response = await accountingService.getPrincipalPayments(
        filter === 'PENDING' ? { status: 'PENDING' } : undefined
      );
      const data = response.items;
      setPayments(data);
    } catch (error: any) {
      logger.error('ADMIN', `❌ Failed to load payments: ${error.message}`);
      InAppNotificationService.error('Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadPayments();
  }, [filter]);
  
  const handleApprove = async (payment: PrincipalPayment) => {
    if (!confirm(`Approve payment of PKR ${payment.amount.toLocaleString()} from ${payment.accountant_name}?`)) {
      return;
    }
    
    logger.info('ADMIN', `✅ Approving payment ${payment.id}...`);
    setProcessingId(payment.id);
    try {
      await accountingService.approvePrincipalPayment(payment.id);
      InAppNotificationService.success('Payment approved successfully');
      await loadPayments();
    } catch (error: any) {
      InAppNotificationService.error(error.message || 'Failed to approve payment');
    } finally {
      setProcessingId(null);
    }
  };
  
  const handleReject = async (payment: PrincipalPayment) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return; // Cancelled
    
    logger.info('ADMIN', `❌ Rejecting payment ${payment.id}...`);
    setProcessingId(payment.id);
    try {
      await accountingService.rejectPrincipalPayment(payment.id, reason || '');
      InAppNotificationService.success('Payment rejected');
      await loadPayments();
    } catch (error: any) {
      InAppNotificationService.error(error.message || 'Failed to reject payment');
    } finally {
      setProcessingId(null);
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
      APPROVED: 'bg-green-100 text-green-800 border-green-200',
      REJECTED: 'bg-red-100 text-red-800 border-red-200',
    };
    return styles[status as keyof typeof styles] || styles.PENDING;
  };
  
  const pendingCount = payments.filter(p => p.status === 'PENDING').length;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Admin Cash Submission Requests
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 bg-amber-400 text-amber-900 text-xs font-bold rounded-full">
                    {pendingCount} pending
                  </span>
                )}
              </h3>
              <p className="text-indigo-100 text-sm">Review and approve accountant cash submissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); loadPayments(); }} 
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Filter Tabs */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('PENDING')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === 'PENDING'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Pending Only
                </button>
                <button
                  onClick={() => setFilter('ALL')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === 'ALL'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  All Payments
                </button>
              </div>
            </div>
            
            {/* Payments List */}
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-100 h-24 rounded-lg"></div>
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500">
                    {filter === 'PENDING' 
                      ? 'No pending payment requests' 
                      : 'No payment requests found'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <motion.div
                      key={payment.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`border rounded-lg p-4 ${
                        payment.status === 'PENDING' 
                          ? 'bg-amber-50 border-amber-200' 
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-800">
                              {payment.accountant_name || 'Unknown Accountant'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusBadge(payment.status)}`}>
                              {payment.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="font-bold text-lg text-indigo-600">
                              {formatCurrency(payment.amount)}
                            </span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                              {payment.payment_method}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {formatDate(payment.created_at)}
                          </div>
                          
                          {payment.notes && (
                            <p className="mt-2 text-sm text-gray-600 italic">
                              "{payment.notes}"
                            </p>
                          )}
                          
                          {payment.rejection_reason && (
                            <div className="mt-2 flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded">
                              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-red-700">
                                Rejected: {payment.rejection_reason}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {payment.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(payment)}
                              disabled={processingId === payment.id}
                              className="bg-green-500 hover:bg-green-600 text-white"
                            >
                              {processingId === payment.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(payment)}
                              disabled={processingId === payment.id}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PrincipalPaymentApprovals;
