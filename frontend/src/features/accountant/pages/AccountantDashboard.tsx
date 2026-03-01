/**
 * Accountant Dashboard - Comprehensive Redesign
 * 
 * Features:
 * - Session activation toggle (single button in header)
 * - Clear money owed indication
 * - Detailed accountant stats with charts and graphs
 * - Role-based views (Accountant sees own data only, Admin sees all)
 * - Session history with discrepancy reasons
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  DollarSign, Users, TrendingUp, Wallet, 
  RefreshCw, PieChart, Activity, Power, 
  AlertTriangle, Clock, History, ChevronDown, ChevronUp,
  CheckCircle, Calendar, BarChart3
} from 'lucide-react';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import { useCashSession } from '../hooks/useCashSession';
import { cashSessionService, SchoolDailySummary, AccountantStat } from '../services/cashSessionService';
import CloseSessionModal from '../components/CloseSessionModal';

// Helper to get current user role and info from localStorage
const getCurrentUser = (): { role: string; email: string; name: string } => {
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        role: payload.role || 'Accountant',
        email: payload.email || '',
        name: payload.name || payload.email || 'User'
      };
    }
  } catch (err) {
    logger.error('ACCOUNTANT_DASH', `Error parsing token: ${err}`);
  }
  return { role: 'Accountant', email: '', name: 'User' };
};

interface QuickStat {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

// Simple Pie Chart component
const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 160 }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;
  
  let cumulativePercent = 0;
  const segments = data.map((item) => {
    const percent = (item.value / total) * 100;
    const startPercent = cumulativePercent;
    cumulativePercent += percent;
    return { ...item, percent, startPercent, endPercent: cumulativePercent };
  });
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="w-full h-full">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e5e7eb" strokeWidth="4" />
        {segments.map((segment, idx) => {
          const circumference = 2 * Math.PI * 15.91549430918954;
          const strokeDasharray = `${(segment.percent / 100) * circumference} ${circumference}`;
          const strokeDashoffset = -((segment.startPercent / 100) * circumference);
          return (
            <circle
              key={idx}
              cx="21"
              cy="21"
              r="15.91549430918954"
              fill="transparent"
              stroke={segment.color}
              strokeWidth="4"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 21 21)"
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl font-bold text-secondary-800">PKR</p>
          <p className="text-sm text-secondary-500">{total.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

// Chart colors
const CHART_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const AccountantDashboard: React.FC = () => {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Root';
  
  const { session, summary, loading: sessionLoading, error: sessionError, refreshSession } = useCashSession();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activatingSession, setActivatingSession] = useState(false);
  
  // Admin-specific state
  const [schoolSummary, setSchoolSummary] = useState<SchoolDailySummary | null>(null);
  const [accountantStats, setAccountantStats] = useState<AccountantStat[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedAccountant, setExpandedAccountant] = useState<string | null>(null);

  // Check if session is active
  const isSessionActive = session?.status === 'active';
  
  // Calculate money owed to school
  const moneyOwedToSchool = useMemo(() => {
    if (!session) return 0;
    const discrepancy = session.discrepancy || 0;
    return discrepancy < 0 ? Math.abs(discrepancy) : 0;
  }, [session]);

  // Load admin data when date changes
  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin, selectedDate]);

  // Handle errors
  useEffect(() => {
    if (sessionError) setError(sessionError);
  }, [sessionError]);

  // Debug logging
  useEffect(() => {
    logger.debug('ACCOUNTANT_DASH', `sessionLoading: ${sessionLoading}, adminLoading: ${adminLoading}`);
  }, [sessionLoading, adminLoading]);

  const loadAdminData = async () => {
    setAdminLoading(true);
    setError(null);
    try {
      const [summaryData, statsData] = await Promise.all([
        cashSessionService.getSchoolDailySummary(selectedDate),
        cashSessionService.getAccountantStats(selectedDate)
      ]);
      setSchoolSummary(summaryData);
      setAccountantStats(statsData);
      logger.info('ACCOUNTANT_DASH', `✅ Loaded admin data for ${selectedDate}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin data');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    logger.info('ACCOUNTANT_DASH', 'Refreshing dashboard...');
    setRefreshing(true);
    setError(null);
    try {
      await refreshSession();
      if (isAdmin) await loadAdminData();
      logger.info('ACCOUNTANT_DASH', '✅ Dashboard refreshed');
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin, refreshSession, selectedDate]);

  const handleActivateSession = async () => {
    logger.info('ACCOUNTANT_DASH', 'Activating session...');
    setActivatingSession(true);
    setError(null);
    try {
      await cashSessionService.activateSession();
      await refreshSession();
      logger.info('ACCOUNTANT_DASH', '✅ Session activated');
    } catch (err: any) {
      setError(err?.message || 'Failed to activate session');
    } finally {
      setActivatingSession(false);
    }
  };

  const handleSessionClosed = async () => {
    setShowCloseModal(false);
    await refreshSession();
    if (isAdmin) await loadAdminData();
  };

  // Today's stats for accountant
  const todayStats = useMemo(() => {
    if (!session || !isSessionActive) return null;
    const opening = session.opening_balance || 0;
    const current = session.current_balance || 0;
    const collected = current - opening;
    const transactions = summary?.total_transactions || 0;
    return { opening, current, collected, transactions };
  }, [session, summary, isSessionActive]);

  // Quick stats
  const quickStats: QuickStat[] = useMemo(() => {
    if (isAdmin && schoolSummary) {
      return [
        {
          label: 'School Total Today',
          value: `PKR ${schoolSummary.total_collected.toLocaleString()}`,
          icon: <DollarSign className="w-6 h-6" />,
          color: 'success',
          subtext: 'All accountants combined'
        },
        {
          label: 'Active Sessions',
          value: schoolSummary.active_sessions,
          icon: <Users className="w-6 h-6" />,
          color: 'primary',
          subtext: `${schoolSummary.total_accountants} total`
        },
        {
          label: 'Total Payments',
          value: schoolSummary.total_transactions,
          icon: <Activity className="w-6 h-6" />,
          color: 'info',
          subtext: 'Recorded today'
        },
        {
          label: 'Cash in Hand',
          value: `PKR ${schoolSummary.total_current_balance.toLocaleString()}`,
          icon: <Wallet className="w-6 h-6" />,
          color: 'warning',
          subtext: 'School-wide'
        }
      ];
    }
    
    if (todayStats && isSessionActive) {
      return [
        {
          label: 'Collected Today',
          value: `PKR ${todayStats.collected.toLocaleString()}`,
          icon: <TrendingUp className="w-6 h-6" />,
          color: 'success',
          subtext: 'Fee payments received'
        },
        {
          label: 'Cash in Hand',
          value: `PKR ${todayStats.current.toLocaleString()}`,
          icon: <Wallet className="w-6 h-6" />,
          color: 'primary',
          subtext: 'Current total'
        },
        {
          label: 'Payments Today',
          value: todayStats.transactions,
          icon: <Activity className="w-6 h-6" />,
          color: 'info',
          subtext: 'Number of payments'
        },
        {
          label: 'Opening Balance',
          value: `PKR ${todayStats.opening.toLocaleString()}`,
          icon: <DollarSign className="w-6 h-6" />,
          color: 'warning',
          subtext: 'Starting cash'
        }
      ];
    }
    
    return [];
  }, [isAdmin, schoolSummary, todayStats, isSessionActive]);

  // Color mapping
  const colorMap = {
    primary: { bg: 'bg-primary-100', text: 'text-primary-600', border: 'border-primary-500' },
    success: { bg: 'bg-success-100', text: 'text-success-600', border: 'border-success-500' },
    warning: { bg: 'bg-warning-100', text: 'text-warning-600', border: 'border-warning-500' },
    danger: { bg: 'bg-danger-100', text: 'text-danger-600', border: 'border-danger-500' },
    info: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-500' }
  };

  // Payment breakdown (for accountant's own session)
  type PaymentItem = { method: string; amount: number; percentage: number; count?: number };
  const paymentBreakdown = useMemo<PaymentItem[]>(() => {
    if (isAdmin && schoolSummary?.breakdown_by_method) {
      return Object.entries(schoolSummary.breakdown_by_method).map(([method, amount]) => ({
        method,
        amount: amount as number,
        percentage: schoolSummary.total_collected > 0 
          ? ((amount as number) / schoolSummary.total_collected) * 100 : 0
      }));
    }
    
    if (isSessionActive && summary?.breakdown_by_method) {
      const total = Object.values(summary.breakdown_by_method).reduce((sum, b) => sum + b.total, 0);
      return Object.entries(summary.breakdown_by_method).map(([method, data]) => ({
        method,
        amount: data.total,
        count: data.count,
        percentage: total > 0 ? (data.total / total) * 100 : 0
      }));
    }
    
    return [];
  }, [isAdmin, schoolSummary, summary, isSessionActive]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    return paymentBreakdown.map((item, idx) => ({
      label: item.method,
      value: item.amount,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [paymentBreakdown]);

  // Accountant contributions for admin view
  const accountantContributions = useMemo(() => {
    if (!isAdmin || !accountantStats.length) return [];
    return accountantStats.map((stat, idx) => ({
      label: stat.user.name,
      value: stat.collected_today,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [isAdmin, accountantStats]);

  // RENDER: Loading State
  if (sessionLoading && !session) {
    return (
      <div className="min-h-screen bg-secondary-50 p-6 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-secondary-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // RENDER: Main Dashboard
  return (
    <div className="min-h-screen bg-secondary-50 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Session Toggle Button */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">
              {isAdmin ? 'Finance Dashboard' : 'My Accounting Session'}
            </h1>
            <p className="text-secondary-600 text-sm">
              {isAdmin 
                ? 'Monitor all accountants and daily collections' 
                : isSessionActive 
                  ? 'Your session is active - you can record fee payments'
                  : 'Activate your session to start recording payments'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Date Picker for Admin */}
            {isAdmin && (
              <div className="flex items-center gap-2 bg-white rounded-lg border border-secondary-200 px-3 py-2">
                <Calendar className="w-4 h-4 text-secondary-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm text-secondary-700 focus:outline-none"
                />
              </div>
            )}
            
            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              loading={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            
            {/* Session Toggle Button - Only for Accountants */}
            {!isAdmin && (
              isSessionActive ? (
                <Button
                  onClick={() => setShowCloseModal(true)}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                >
                  <Power className="w-4 h-4 mr-2" />
                  Close Session
                </Button>
              ) : (
                <Button
                  onClick={handleActivateSession}
                  loading={activatingSession}
                  className="bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-success-700"
                >
                  <Power className="w-4 h-4 mr-2" />
                  Start Session
                </Button>
              )
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-danger-500 hover:text-danger-700 text-xl">&times;</button>
          </motion.div>
        )}

        {/* Session Inactive Notice (for Accountants only) */}
        {!isAdmin && !isSessionActive && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-full">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800">Session Not Active</h3>
                <p className="text-amber-700 text-sm">
                  Click "Start Session" above to begin recording fee payments for today.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Money Owed Warning */}
        {!isAdmin && moneyOwedToSchool > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-danger-50 border-2 border-danger-300 rounded-xl p-4"
          >
            <div className="flex items-center gap-4">
              <div className="bg-danger-100 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-danger-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-danger-800">Outstanding Amount</h3>
                <p className="text-danger-700">
                  You owe <span className="font-bold text-xl">PKR {moneyOwedToSchool.toLocaleString()}</span> to the school from previous session discrepancy.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Stats Grid */}
        {quickStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {quickStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${colorMap[stat.color].border}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-secondary-600 text-sm font-medium">{stat.label}</p>
                    <p className={`text-xl font-bold ${colorMap[stat.color].text}`}>{stat.value}</p>
                    {stat.subtext && <p className="text-xs text-secondary-500 mt-1">{stat.subtext}</p>}
                  </div>
                  <div className={`${colorMap[stat.color].bg} p-2 rounded-lg`}>
                    <span className={colorMap[stat.color].text}>{stat.icon}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payment Methods Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-secondary-900">Payment Methods</h3>
            </div>
            
            {pieChartData.length === 0 ? (
              <div className="text-center py-12 text-secondary-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No payments recorded yet</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <SimplePieChart data={pieChartData} size={140} />
                <div className="mt-4 w-full space-y-2">
                  {paymentBreakdown.map((item, idx) => (
                    <div key={item.method} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                        <span className="text-secondary-700">{item.method}</span>
                      </div>
                      <span className="font-medium text-secondary-900">PKR {item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Right Column - Accountant Stats or Session Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Admin: Staff Contributions Chart */}
            {isAdmin && accountantContributions.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-primary-600" />
                  <h3 className="font-semibold text-secondary-900">Staff Contributions</h3>
                </div>
                <div className="flex items-center gap-6">
                  <SimplePieChart data={accountantContributions} size={140} />
                  <div className="flex-1 space-y-2">
                    {accountantContributions.map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                          <span className="text-secondary-700 truncate max-w-[150px]">{item.label}</span>
                        </div>
                        <span className="font-medium text-secondary-900">PKR {item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Accountant Details - Admin sees all, Accountant sees only own */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <History className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {isAdmin ? 'All Accountants' : 'Session Details'}
                      </h3>
                      <p className="text-indigo-100 text-sm">
                        {isAdmin ? 'Detailed view of all staff sessions' : 'Your session information'}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <span className="text-indigo-100 text-sm">{accountantStats.length} accountant(s)</span>
                  )}
                </div>
              </div>

              <div className="p-4">
                {/* Admin View: All Accountants */}
                {isAdmin ? (
                  accountantStats.length === 0 ? (
                    <div className="text-center py-12 text-secondary-500">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No Sessions Found</p>
                      <p className="text-sm">No accountant sessions for {selectedDate}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {accountantStats.map((stat) => (
                        <div key={stat.session_id} className="border border-secondary-200 rounded-xl overflow-hidden">
                          {/* Accountant Header */}
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary-50 transition-colors"
                            onClick={() => setExpandedAccountant(expandedAccountant === stat.session_id ? null : stat.session_id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                {stat.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-semibold text-secondary-900">{stat.user.name}</h4>
                                <p className="text-xs text-secondary-500">{stat.user.email}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                stat.status === 'active' 
                                  ? 'bg-success-100 text-success-700' 
                                  : 'bg-secondary-100 text-secondary-700'
                              }`}>
                                {stat.status === 'active' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                                {stat.status === 'active' ? 'Active' : 'Closed'}
                              </div>

                              <div className="text-right">
                                <p className="text-lg font-bold text-success-600">
                                  PKR {stat.collected_today.toLocaleString()}
                                </p>
                                <p className="text-xs text-secondary-500">{stat.total_transactions} payments</p>
                              </div>

                              {((stat.discrepancy ?? 0) !== 0) && (
                                (() => {
                                  const disc = stat.discrepancy ?? 0;
                                  return (
                                    <div className={`flex items-center gap-1 ${disc > 0 ? 'text-warning-600' : 'text-danger-600'}`}>
                                      <AlertTriangle className="w-4 h-4" />
                                      <span className="text-sm font-medium">
                                        {disc > 0 ? '+' : ''}{disc.toLocaleString()}
                                      </span>
                                    </div>
                                  );
                                })()
                              )}

                              {expandedAccountant === stat.session_id ? <ChevronUp className="w-5 h-5 text-secondary-400" /> : <ChevronDown className="w-5 h-5 text-secondary-400" />}
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {expandedAccountant === stat.session_id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              className="border-t border-secondary-200 bg-secondary-50"
                            >
                              <div className="p-4 space-y-4">
                                {/* Balance Summary */}
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="bg-white rounded-lg p-3 border border-secondary-200">
                                    <p className="text-xs text-secondary-500 mb-1">Opening Balance</p>
                                    <p className="text-lg font-semibold text-secondary-700">
                                      PKR {stat.opening_balance.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-success-200">
                                    <p className="text-xs text-success-600 mb-1">Collected Today</p>
                                    <p className="text-lg font-semibold text-success-700">
                                      PKR {stat.collected_today.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-primary-200">
                                    <p className="text-xs text-primary-600 mb-1">Current Balance</p>
                                    <p className="text-lg font-semibold text-primary-700">
                                      PKR {stat.current_balance.toLocaleString()}
                                    </p>
                                  </div>
                                </div>

                                {/* Payment Method Breakdown */}
                                {Object.keys(stat.breakdown_by_method || {}).length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-semibold text-secondary-700 mb-2">Payment Breakdown</h5>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {Object.entries(stat.breakdown_by_method).map(([method, data], methodIdx) => (
                                        <div key={method} className="bg-white rounded-lg p-3 flex items-center justify-between border border-secondary-200">
                                          <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[methodIdx % CHART_COLORS.length] }}></div>
                                            <span className="text-sm text-secondary-700">{method}</span>
                                          </div>
                                          <div className="text-right">
                                            <p className="font-semibold text-secondary-800">PKR {data.total.toLocaleString()}</p>
                                            <p className="text-xs text-secondary-500">{data.count} txn</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Discrepancy Reason */}
                                {((stat.discrepancy ?? 0) !== 0) && stat.discrepancy_notes && (
                                  (() => {
                                    const disc = stat.discrepancy ?? 0;
                                    return (
                                      <div className={`rounded-lg p-3 ${disc < 0 ? 'bg-danger-50 border border-danger-200' : 'bg-warning-50 border border-warning-200'}`}>
                                        <div className="flex items-start gap-2">
                                          <AlertTriangle className={`w-4 h-4 mt-0.5 ${disc < 0 ? 'text-danger-600' : 'text-warning-600'}`} />
                                          <div>
                                            <p className={`text-sm font-medium ${disc < 0 ? 'text-danger-800' : 'text-warning-800'}`}>
                                              Discrepancy: PKR {Math.abs(disc).toLocaleString()} {disc < 0 ? '(Short)' : '(Excess)'}
                                            </p>
                                            <p className={`text-sm ${disc < 0 ? 'text-danger-700' : 'text-warning-700'}`}>
                                              Reason: {stat.discrepancy_notes}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()
                                )}

                                {/* Session Times */}
                                <div className="flex items-center justify-between text-xs text-secondary-500 pt-2 border-t border-secondary-200">
                                  <span>Started: {new Date(stat.started_at).toLocaleTimeString()}</span>
                                  {stat.closed_at && <span>Closed: {new Date(stat.closed_at).toLocaleTimeString()}</span>}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* Accountant View: Own Session Info */
                  <div className="space-y-4">
                    {!isSessionActive ? (
                      <div className="text-center py-8 text-secondary-500">
                        <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">No Active Session</p>
                        <p className="text-sm">Start your session to see details here</p>
                      </div>
                    ) : (
                      <>
                        {/* Today's Summary */}
                        {todayStats && (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-secondary-50 rounded-lg p-4 text-center">
                              <p className="text-xs text-secondary-500 mb-1">Opening Balance</p>
                              <p className="text-xl font-bold text-secondary-800">
                                PKR {todayStats.opening.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-success-50 rounded-lg p-4 text-center">
                              <p className="text-xs text-success-600 mb-1">Collected Today</p>
                              <p className="text-xl font-bold text-success-700">
                                PKR {todayStats.collected.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-primary-50 rounded-lg p-4 text-center">
                              <p className="text-xs text-primary-600 mb-1">Current Balance</p>
                              <p className="text-xl font-bold text-primary-700">
                                PKR {todayStats.current.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Recent Payments */}
                        {summary?.breakdown_by_method && Object.keys(summary.breakdown_by_method).length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-secondary-700 mb-3">Today's Breakdown</h4>
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(summary.breakdown_by_method).map(([method, data], idx) => (
                                <div key={method} className="bg-secondary-50 rounded-lg p-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                                    <span className="text-sm font-medium text-secondary-700">{method}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-secondary-900">PKR {data.total.toLocaleString()}</p>
                                    <p className="text-xs text-secondary-500">{data.count} payments</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Previous Session Info */}
                        {session?.discrepancy !== undefined && session.discrepancy !== 0 && (
                          <div className={`rounded-lg p-4 ${session.discrepancy < 0 ? 'bg-danger-50 border border-danger-200' : 'bg-warning-50 border border-warning-200'}`}>
                            <div className="flex items-start gap-3">
                              <AlertTriangle className={`w-5 h-5 ${session.discrepancy < 0 ? 'text-danger-600' : 'text-warning-600'}`} />
                              <div>
                                <p className={`font-medium ${session.discrepancy < 0 ? 'text-danger-800' : 'text-warning-800'}`}>
                                  Previous Session Discrepancy
                                </p>
                                <p className={`text-sm ${session.discrepancy < 0 ? 'text-danger-700' : 'text-warning-700'}`}>
                                  PKR {Math.abs(session.discrepancy).toLocaleString()} {session.discrepancy < 0 ? '(You were short)' : '(You had excess)'}
                                </p>
                                {session.discrepancy_notes && (
                                  <p className={`text-sm mt-1 ${session.discrepancy < 0 ? 'text-danger-600' : 'text-warning-600'}`}>
                                    Reason: {session.discrepancy_notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Close Session Modal */}
        <CloseSessionModal
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          session={session}
          summary={summary}
          onSessionClosed={handleSessionClosed}
        />
      </div>
    </div>
  );
};

export default AccountantDashboard;
