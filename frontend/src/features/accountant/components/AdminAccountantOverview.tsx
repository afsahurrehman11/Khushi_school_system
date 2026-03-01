/**
 * Admin Accountant Overview
 * Shows all accountants' daily stats with payment method breakdown and charts
 * For Admin use only (oversight dashboard)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, Calendar, Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, PieChart, UserPlus } from 'lucide-react';
import logger from '../../../utils/logger';
import { cashSessionService, AccountantStat, SchoolDailySummary } from '../services/cashSessionService';

interface AdminAccountantOverviewProps {
  className?: string;
}

// Simple Pie Chart component
const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 180 }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;
  
  let cumulativePercent = 0;
  
  // Calculate segments
  const segments = data.map((item) => {
    const percent = (item.value / total) * 100;
    const startPercent = cumulativePercent;
    cumulativePercent += percent;
    return {
      ...item,
      percent,
      startPercent,
      endPercent: cumulativePercent
    };
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
          <p className="text-2xl font-bold text-secondary-800">PKR</p>
          <p className="text-xs text-secondary-500">{total.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

const AdminAccountantOverview: React.FC<AdminAccountantOverviewProps> = ({ className = '' }) => {
  const [accountantStats, setAccountantStats] = useState<AccountantStat[]>([]);
  const [schoolSummary, setSchoolSummary] = useState<SchoolDailySummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAccountant, setExpandedAccountant] = useState<string | null>(null);

  useEffect(() => {
    logger.info('ADMIN_OVERVIEW', `Date changed to: ${selectedDate} - loading data`);
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    logger.info('ADMIN_OVERVIEW', `Loading accountant stats for date: ${selectedDate}`);
    setLoading(true);
    setError('');
    try {
      const [stats, summary] = await Promise.all([
        cashSessionService.getAccountantStats(selectedDate),
        cashSessionService.getSchoolDailySummary(selectedDate)
      ]);
      setAccountantStats(stats);
      setSchoolSummary(summary);
      logger.info('ADMIN_OVERVIEW', `✅ Loaded ${stats.length} accountant stats, Total: PKR ${summary.total_collected}`);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load accountant data';
      logger.error('ADMIN_OVERVIEW', `❌ Failed to load data: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getMethodColor = (index: number) => {
    const colors = [
      { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
      { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
      { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
      { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
      { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
    ];
    return colors[index % colors.length];
  };

  // Chart colors for pie chart
  const chartColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

  // Prepare pie chart data for payment methods
  const pieChartData = useMemo(() => {
    if (!schoolSummary?.breakdown_by_method) return [];
    return Object.entries(schoolSummary.breakdown_by_method).map(([method, amount], idx) => ({
      label: method,
      value: amount as number,
      color: chartColors[idx % chartColors.length]
    }));
  }, [schoolSummary]);

  // Prepare accountant contribution pie chart
  const accountantContributionData = useMemo(() => {
    if (!accountantStats || accountantStats.length === 0) return [];
    return accountantStats.map((stat, idx) => ({
      label: stat.user.name,
      value: stat.collected_today,
      color: chartColors[idx % chartColors.length]
    }));
  }, [accountantStats]);

  if (loading) {
    logger.info('ADMIN_OVERVIEW', 'Showing loading state...');
    return (
      <div className={`bg-white rounded-xl shadow-soft p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    logger.warn('ADMIN_OVERVIEW', `Showing error state: ${error}`);
    return (
      <div className={`bg-white rounded-xl shadow-soft p-6 ${className}`}>
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-soft overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Accountant Overview</h3>
              <p className="text-indigo-100 text-sm">Real-time staff performance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-200" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white/20 text-white px-3 py-1.5 rounded-lg border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
            />
          </div>
        </div>
      </div>

      {/* School Summary */}
      {schoolSummary && (
        <div className="p-4 bg-indigo-50 border-b border-indigo-100">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-xs text-indigo-600 mb-1">Total Collected</p>
              <p className="text-xl font-bold text-indigo-700">
                PKR {schoolSummary.total_collected.toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-indigo-600 mb-1">Accountants</p>
              <p className="text-xl font-bold text-indigo-700">
                {schoolSummary.total_accountants}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-indigo-600 mb-1">Active Sessions</p>
              <p className="text-xl font-bold text-success-600">
                {schoolSummary.active_sessions}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-indigo-600 mb-1">Transactions</p>
              <p className="text-xl font-bold text-indigo-700">
                {schoolSummary.total_transactions}
              </p>
            </div>
          </div>

          {/* Pie Charts Section */}
          {(pieChartData.length > 0 || accountantContributionData.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 pt-4 border-t border-indigo-100">
              {/* Payment Methods Chart */}
              {pieChartData.length > 0 && (
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <PieChart className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-semibold text-secondary-700">Payment Methods</h4>
                  </div>
                  <div className="flex items-center gap-4">
                    <SimplePieChart data={pieChartData} size={120} />
                    <div className="flex-1 space-y-2">
                      {pieChartData.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                            <span className="text-secondary-600">{item.label}</span>
                          </div>
                          <span className="font-medium text-secondary-800">
                            PKR {item.value.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Accountant Contribution Chart */}
              {accountantContributionData.length > 0 && (
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-semibold text-secondary-700">Staff Contributions</h4>
                  </div>
                  <div className="flex items-center gap-4">
                    <SimplePieChart data={accountantContributionData} size={120} />
                    <div className="flex-1 space-y-2">
                      {accountantContributionData.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                            <span className="text-secondary-600 truncate max-w-[100px]">{item.label}</span>
                          </div>
                          <span className="font-medium text-secondary-800">
                            PKR {item.value.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accountant List */}
      <div className="p-4">
        <h3 className="font-semibold text-secondary-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          All Accountants
        </h3>
        {accountantStats.length === 0 ? (
          <div className="text-center py-12 bg-secondary-50 rounded-xl border border-dashed border-secondary-300">
            <div className="bg-secondary-100 w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-secondary-400" />
            </div>
            <h4 className="text-lg font-semibold text-secondary-700 mb-2">No Accountant Sessions Found</h4>
            <p className="text-secondary-500 max-w-sm mx-auto">
              {selectedDate === new Date().toISOString().split('T')[0] 
                ? "No accountants have started their session today. Once an accountant activates their session, they'll appear here."
                : `No accountant sessions were recorded on ${new Date(selectedDate).toLocaleDateString()}.`}
            </p>
            <p className="text-xs text-secondary-400 mt-4">
              To add new accountants, go to Staff Management and create a user with 'Accountant' role.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accountantStats.map((stat, idx) => (
              <motion.div
                key={stat.session_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border border-secondary-200 rounded-xl overflow-hidden"
              >
                {/* Accountant Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary-50 transition-colors"
                  onClick={() => setExpandedAccountant(expandedAccountant === stat.session_id ? null : stat.session_id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                      {stat.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-semibold text-secondary-900">{stat.user.name}</h4>
                      <p className="text-xs text-secondary-500">{stat.user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {/* Status Badge */}
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      stat.status === 'active' 
                        ? 'bg-success-100 text-success-700' 
                        : 'bg-secondary-100 text-secondary-700'
                    }`}>
                      {stat.status === 'active' ? (
                        <><Clock className="w-3 h-3" /> Active</>
                      ) : (
                        <><CheckCircle className="w-3 h-3" /> Closed</>
                      )}
                    </div>

                    {/* Quick Stats */}
                    <div className="text-right">
                      <p className="text-lg font-bold text-success-600">
                        PKR {stat.collected_today.toLocaleString()}
                      </p>
                      <p className="text-xs text-secondary-500">{stat.total_transactions} transactions</p>
                    </div>

                    {/* Discrepancy Indicator */}
                    {stat.discrepancy !== undefined && stat.discrepancy !== 0 && (
                      <div className={`flex items-center gap-1 ${
                        stat.discrepancy > 0 ? 'text-amber-600' : 'text-danger-600'
                      }`}>
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {stat.discrepancy > 0 ? '+' : ''}{stat.discrepancy.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {/* Expand Icon */}
                    {expandedAccountant === stat.session_id ? (
                      <ChevronUp className="w-5 h-5 text-secondary-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-secondary-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedAccountant === stat.session_id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-secondary-200 bg-secondary-50"
                  >
                    <div className="p-4">
                      {/* Balance Summary */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-white rounded-lg p-3 border border-secondary-200">
                          <p className="text-xs text-secondary-500 mb-1">Opening Balance</p>
                          <p className="text-lg font-semibold text-secondary-700">
                            PKR {stat.opening_balance.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-success-200">
                          <p className="text-xs text-success-600 mb-1">Current Balance</p>
                          <p className="text-lg font-semibold text-success-700">
                            PKR {stat.current_balance.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-primary-200">
                          <p className="text-xs text-primary-600 mb-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Collected Today
                          </p>
                          <p className="text-lg font-semibold text-primary-700">
                            PKR {stat.collected_today.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Payment Method Breakdown */}
                      {Object.keys(stat.breakdown_by_method || {}).length > 0 && (
                        <div>
                          <h5 className="text-sm font-semibold text-secondary-700 mb-2">Payment Method Breakdown</h5>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(stat.breakdown_by_method).map(([method, data], methodIdx) => {
                              const colors = getMethodColor(methodIdx);
                              return (
                                <div 
                                  key={method} 
                                  className={`${colors.bg} rounded-lg p-3 flex items-center justify-between`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${colors.dot}`}></div>
                                    <span className={`text-sm font-medium ${colors.text}`}>{method}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className={`font-semibold ${colors.text}`}>
                                      PKR {data.total.toLocaleString()}
                                    </p>
                                    <p className={`text-xs ${colors.text} opacity-70`}>{data.count} txn</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Session Times */}
                      <div className="mt-4 flex items-center justify-between text-xs text-secondary-500">
                        <span>Started: {new Date(stat.started_at).toLocaleTimeString()}</span>
                        {stat.closed_at && (
                          <span>Closed: {new Date(stat.closed_at).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAccountantOverview;
