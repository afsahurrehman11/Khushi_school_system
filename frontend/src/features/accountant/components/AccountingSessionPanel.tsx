/**
 * Accounting Session Panel
 * MODULE 2: Displays session status, balance, and actions  
 * Shows: session status, opening balance, collected, paid to principal, outstanding
 * Buttons: Open Session, Close Session, Pay To Principal
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ArrowUpRight, ArrowDownRight, Lock, Unlock, Send, RefreshCw, AlertCircle } from 'lucide-react';
import { accountingService, AccountingSession, AccountantBalance } from '../services/accountingService';
import { InAppNotificationService } from '../services/InAppNotificationService';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import SubmitCashToAdminModal from './SubmitCashToAdminModal';

interface AccountingSessionPanelProps {
  className?: string;
  onSessionChange?: () => void;
}

const AccountingSessionPanel: React.FC<AccountingSessionPanelProps> = ({ 
  className = '',
  onSessionChange 
}) => {
  const [session, setSession] = useState<AccountingSession | null>(null);
  const [balance, setBalance] = useState<AccountantBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  
  const loadData = async () => {
    logger.info('ACCOUNTING', '📊 Loading accounting dashboard...');
    setLoading(true);
    try {
      const [sessionData, balanceData] = await Promise.all([
        accountingService.getCurrentSession(),
        accountingService.getBalance()
      ]);
      setSession(sessionData);
      setBalance(balanceData);
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to load accounting data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, []);
  
  const handleOpenSession = async () => {
    logger.info('ACCOUNTING', '📂 Initiating session open...');
    setActionLoading(true);
    try {
      const newSession = await accountingService.openSession();
      setSession(newSession);
      await loadData(); // Refresh balance
      InAppNotificationService.success('Accounting session opened successfully');
      onSessionChange?.();
    } catch (error: any) {
      InAppNotificationService.error(error.message || 'Failed to open session');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleCloseSession = async () => {
    logger.info('ACCOUNTING', '🔒 Closing accounting session...');
    
    if (!session) {
      InAppNotificationService.error('No active session to close');
      return;
    }
    
    // Confirm outstanding balance is paid
    const outstanding = balance?.outstanding_balance || 0;
    if (outstanding > 0) {
      const confirm = window.confirm(
        `You have an outstanding balance of PKR ${outstanding.toLocaleString()}. ` +
        `Are you sure you want to close the session? This balance will carry forward.`
      );
      if (!confirm) return;
    }
    
    setActionLoading(true);
    try {
      const closedSession = await accountingService.closeSession();
      setSession(closedSession);
      await loadData();
      InAppNotificationService.success('Session closed successfully');
      onSessionChange?.();
    } catch (error: any) {
      InAppNotificationService.error(error.message || 'Failed to close session');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handlePayToPrincipal = () => {
    if (!session || session.status !== 'OPEN') {
      InAppNotificationService.error('You must have an open session to submit cash to admin');
      return;
    }
    
    if (!balance || balance.outstanding_balance <= 0) {
      InAppNotificationService.error('No outstanding balance to pay');
      return;
    }
    
    logger.info('ACCOUNTING', '\ud83d\udcb8 Initiating admin cash submission...');
    setShowPayModal(true);
  };
  
  const handlePaymentSuccess = async () => {
    setShowPayModal(false);
    await loadData();
    onSessionChange?.();
    InAppNotificationService.success('Cash submission submitted for admin approval');
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="flex gap-4">
            <div className="h-10 bg-gray-200 rounded flex-1"></div>
            <div className="h-10 bg-gray-200 rounded flex-1"></div>
          </div>
        </div>
      </div>
    );
  }
  
  const isOpen = session?.status === 'OPEN';
  const collected = balance?.collected_today || 0;
  const paidToAdmin = balance?.paid_to_admin || 0;
  const outstanding = balance?.outstanding_balance || 0;
  const opening = session?.opening_balance || 0;
  
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-lg border border-blue-100 overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Accounting Session</h3>
                <p className="text-blue-100 text-sm">
                  {session ? `Session Date: ${session.session_date}` : 'No active session'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isOpen 
                  ? 'bg-green-400/30 text-green-100' 
                  : session 
                    ? 'bg-red-400/30 text-red-100' 
                    : 'bg-gray-400/30 text-gray-100'
              }`}>
                {isOpen ? (
                  <><Unlock className="w-4 h-4 inline mr-1" /> OPEN</>
                ) : session ? (
                  <><Lock className="w-4 h-4 inline mr-1" /> CLOSED</>
                ) : (
                  'NOT STARTED'
                )}
              </span>
              <button 
                onClick={loadData} 
                className="p-2 hover:bg-white/10 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Balance Cards */}
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Opening Balance */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Opening</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(opening)}</p>
            </div>
            
            {/* Collected Today */}
            <div className="bg-emerald-50 rounded-lg p-4 shadow-sm border border-emerald-100">
              <p className="text-xs text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3" /> Collected
              </p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(collected)}</p>
            </div>
            
            {/* Paid to Admin */}
            <div className="bg-amber-50 rounded-lg p-4 shadow-sm border border-amber-100">
              <p className="text-xs text-amber-600 uppercase tracking-wide flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> To Admin
              </p>
              <p className="text-xl font-bold text-amber-700">{formatCurrency(paidToAdmin)}</p>
            </div>
            
            {/* Outstanding Balance */}
            <div className={`rounded-lg p-4 shadow-sm border ${
              outstanding > 0 
                ? 'bg-blue-50 border-blue-100' 
                : 'bg-gray-50 border-gray-100'
            }`}>
              <p className={`text-xs uppercase tracking-wide ${
                outstanding > 0 ? 'text-blue-600' : 'text-gray-500'
              }`}>Outstanding</p>
              <p className={`text-xl font-bold ${
                outstanding > 0 ? 'text-blue-700' : 'text-gray-700'
              }`}>{formatCurrency(outstanding)}</p>
            </div>
          </div>
          
          {/* Transaction Count */}
          {session && (
            <div className="mb-6 text-center">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">{session.transaction_count}</span> transactions recorded today
              </p>
            </div>
          )}
          
          {/* Warning for outstanding balance */}
          {isOpen && outstanding > 0 && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                You have an outstanding balance of <strong>{formatCurrency(outstanding)}</strong>. 
                Please submit cash to admin before closing your session.
              </p>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {!session || session.status !== 'OPEN' ? (
              <Button
                onClick={handleOpenSession}
                disabled={actionLoading}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
              >
                <Unlock className="w-4 h-4 mr-2" />
                {actionLoading ? 'Opening...' : 'Open Session'}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handlePayToPrincipal}
                  disabled={actionLoading || outstanding <= 0}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Submit Cash to Admin
                </Button>
                
                <Button
                  onClick={handleCloseSession}
                  disabled={actionLoading}
                  variant="outline"
                  className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {actionLoading ? 'Closing...' : 'Close Session'}
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
      
      {/* Submit Cash to Admin Modal */}
      {showPayModal && (
        <SubmitCashToAdminModal
          maxAmount={outstanding}
          sessionId={session?.id || ''}
          onClose={() => setShowPayModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
};

export default AccountingSessionPanel;
