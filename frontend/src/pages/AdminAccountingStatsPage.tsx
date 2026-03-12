/**
 * Unified Accounting Dashboard - Refactored
 * Clean, organized layout with consistent spacing and typography
 * Route: /dashboard/admin/accounting-stats
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  Users,
  Send,
  Clock,
  RefreshCw,
  BarChart3,
  PieChart as PieChartIcon,
  Filter,
  ChevronLeft,
  ChevronRight,
  Activity,
  Building2,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { 
  accountingStatsService, 
  AdminGlobalStats, 
  AccountantPerformanceRow,
  ActivityTimelineItem,
  StatsFilters,
  PaginatedResponse 
} from '../services/accountingStatsService';
import logger from '../utils/logger';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658', '#ff7300'];

// Loading skeleton
const ChartSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg p-6 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
    <div className="bg-gray-100 rounded h-80"></div>
  </div>
);

// Lazy chart component
interface LazyChartProps {
  children: React.ReactNode;
  onVisible?: () => void;
}

const LazyChart: React.FC<LazyChartProps> = ({ children, onVisible }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible?.();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [onVisible]);
  
  return <div ref={ref}>{isVisible ? children : <ChartSkeleton />}</div>;
};

// Filters Panel
interface FiltersProps {
  filters: StatsFilters;
  onFilterChange: (filters: StatsFilters) => void;
  onApply: () => void;
}

const FiltersPanel: React.FC<FiltersProps> = ({ filters, onFilterChange, onApply }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-lg shadow-sm p-6 mb-8"
  >
    <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
      <Filter className="w-4 h-4" />
      Filter Results
    </h3>
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-2">Start Date</label>
        <input
          type="date"
          value={filters.date_from || ''}
          onChange={(e) => onFilterChange({ ...filters, date_from: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-2">End Date</label>
        <input
          type="date"
          value={filters.date_to || ''}
          onChange={(e) => onFilterChange({ ...filters, date_to: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <div className="flex items-end">
        <button
          onClick={onApply}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          Apply
        </button>
      </div>
    </div>
  </motion.div>
);

// Pagination
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange }) => (
  <div className="flex items-center justify-between px-6 py-3 bg-gray-50 rounded-b-lg border-t border-gray-200">
    <span className="text-xs text-gray-600 font-medium">
      Page {page} of {totalPages}
    </span>
    <div className="flex gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const AdminAccountingStatsPage: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [stats, setStats] = useState<AdminGlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<StatsFilters>({});
  const [perfData, setPerfData] = useState<PaginatedResponse<AccountantPerformanceRow> | null>(null);
  const [perfPage, setPerfPage] = useState(1);
  const [perfLoading, setPerfLoading] = useState(false);
  const [timeline, setTimeline] = useState<PaginatedResponse<ActivityTimelineItem> | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadStats = useCallback(async () => {
    logger.info('ADMIN_STATS', '📊 Loading accounting dashboard');
    try {
      const data = await accountingStatsService.getAdminGlobalStats(
        filters.date_from,
        filters.date_to,
        12
      );
      setStats(data);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load stats: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [filters.date_from, filters.date_to]);

  const loadPerformanceTable = useCallback(async (page: number) => {
    setPerfLoading(true);
    try {
      const data = await accountingStatsService.getAccountantPerformance(
        page,
        20,
        'total_collected',
        'desc',
        filters
      );
      setPerfData(data);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load performance: ${error.message}`);
    } finally {
      setPerfLoading(false);
    }
  }, [filters]);

  const loadTimeline = useCallback(async (page: number) => {
    setTimelineLoading(true);
    try {
      const data = await accountingStatsService.getActivityTimeline(
        page,
        20,
        undefined,
        filters
      );
      setTimeline(data);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load timeline: ${error.message}`);
    } finally {
      setTimelineLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadPerformanceTable(perfPage);
  }, [perfPage, loadPerformanceTable]);

  useEffect(() => {
    loadTimeline(timelinePage);
  }, [timelinePage, loadTimeline]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadPerformanceTable(1), loadTimeline(1)]);
    setPerfPage(1);
    setTimelinePage(1);
    setRefreshing(false);
  };

  const handleApplyFilters = () => {
    loadStats();
    loadPerformanceTable(1);
    loadTimeline(1);
    setPerfPage(1);
    setTimelinePage(1);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'payment': return <DollarSign className="w-4 h-4 text-green-600" />;
      case 'admin_payout': return <Send className="w-4 h-4 text-blue-600" />;
      case 'session_open': return <Clock className="w-4 h-4 text-amber-600" />;
      case 'session_close': return <Clock className="w-4 h-4 text-red-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className={`${compact ? 'p-4' : 'p-8'} bg-gray-50 ${compact ? '' : 'min-h-screen'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="h-10 bg-gray-200 rounded w-1/3 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-lg p-6 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'p-4' : 'p-8'} bg-gray-50 ${compact ? '' : 'min-h-screen'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        {!compact && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-indigo-600" />
                  Accounting Dashboard
                </h1>
                <p className="text-gray-600 text-sm">
                  {stats?.school_name} • {stats?.active_sessions_count || 0} active sessions
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Summary Cards - Clean Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
        >
          {[
            { label: 'School Revenue', value: stats?.total_school_revenue || 0, icon: DollarSign, color: 'from-green-500 to-emerald-600', darkColor: 'text-green-600' },
            { label: 'Admin Payouts', value: stats?.total_admin_payouts || 0, icon: Send, color: 'from-blue-500 to-indigo-600', darkColor: 'text-blue-600' },
            { label: 'Amount Due', value: stats?.total_outstanding || 0, icon: AlertCircle, color: 'from-amber-500 to-orange-600', darkColor: 'text-amber-600' },
            { label: 'Payments', value: stats?.total_transactions || 0, icon: Activity, color: 'from-purple-500 to-pink-600', darkColor: 'text-purple-600', isCount: true },
            { label: 'Accountants', value: stats?.accountants_summary?.length || 0, icon: Users, color: 'from-rose-500 to-red-600', darkColor: 'text-rose-600', isCount: true },
          ].map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                className={`bg-gradient-to-br ${card.color} rounded-lg p-6 text-white shadow-sm hover:shadow-md transition`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className="w-6 h-6 opacity-80" />
                  <span className="text-xs bg-white/20 px-2 py-1 rounded font-medium">
                    {card.label.split(' ')[0]}
                  </span>
                </div>
                <p className="text-2xl font-bold mb-1">
                  {card.isCount ? card.value : formatCurrency(card.value as number)}
                </p>
                <p className="text-sm opacity-90">{card.label}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Filters */}
        <FiltersPanel 
          filters={filters} 
          onFilterChange={setFilters} 
          onApply={handleApplyFilters}
        />

        {/* Charts Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Revenue by Accountant */}
          <LazyChart>
            <div className="bg-white rounded-lg shadow-sm p-6 h-full">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-600" />
                Revenue by Accountant
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.revenue_by_accountant || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" fontSize={11} tick={{ fill: '#6b7280' }} />
                  <YAxis tickFormatter={(val) => `${(val / 1000).toFixed(0)}K`} fontSize={11} tick={{ fill: '#6b7280' }} />
                  <Tooltip formatter={(val: any) => formatCurrency(val)} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </LazyChart>

          {/* Monthly Revenue Trend */}
          <LazyChart>
            <div className="bg-white rounded-lg shadow-sm p-6 h-full">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Monthly Trend
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats?.monthly_revenue_trend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" fontSize={11} tick={{ fill: '#6b7280' }} />
                  <YAxis tickFormatter={(val) => `${(val / 1000).toFixed(0)}K`} fontSize={11} tick={{ fill: '#6b7280' }} />
                  <Tooltip formatter={(val: any) => formatCurrency(val)} />
                  <Line type="monotone" dataKey="amount" stroke="#0088FE" strokeWidth={2} dot={{ r: 3, fill: '#0088FE' }} isAnimationActive animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </LazyChart>
        </motion.div>

        {/* Charts Row 2 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Payment Methods */}
          <LazyChart>
            <div className="bg-white rounded-lg shadow-sm p-6 h-full">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-purple-600" />
                Payment Methods
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats?.payment_method_usage || []}
                    dataKey="total_amount"
                    nameKey="method_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    isAnimationActive
                    animationDuration={700}
                  >
                    {(stats?.payment_method_usage || []).map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </LazyChart>

          {/* Sessions by Accountant */}
          <LazyChart>
            <div className="bg-white rounded-lg shadow-sm p-6 h-full">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Sessions Opened
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.sessions_by_accountant || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" fontSize={11} tick={{ fill: '#6b7280' }} />
                  <YAxis fontSize={11} tick={{ fill: '#6b7280' }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#FBBF24" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </LazyChart>
        </motion.div>

        {/* Accountant Performance Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm mb-8 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Accountant Performance
              {perfLoading && <RefreshCw className="w-3 h-3 animate-spin ml-auto text-gray-400" />}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Accountant</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Collected</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Transactions</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Sessions</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Outstanding</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Daily Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(perfData?.data || []).map((row) => (
                  <tr key={row.accountant_id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{row.accountant_name}</p>
                        <p className="text-xs text-gray-500">{row.accountant_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-green-600">
                      {formatCurrency(row.total_collected)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {row.transaction_count}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {row.sessions_opened}
                    </td>
                    <td className="px-6 py-4 text-right text-amber-600 font-medium">
                      {formatCurrency(row.outstanding_balance)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {formatCurrency(row.avg_daily_collection)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!perfData?.data || perfData?.data.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                No accountant data available
              </div>
            )}
          </div>
          {(perfData?.total_pages ?? 0) > 1 && (
            <Pagination page={perfPage} totalPages={perfData?.total_pages ?? 1} onPageChange={setPerfPage} />
          )}
        </motion.div>

        {/* Activity Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              Recent Activity
              {timelineLoading && <RefreshCw className="w-3 h-3 animate-spin ml-auto text-gray-400" />}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {(timeline?.data || []).map((item) => (
              <div key={item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition">
                <div className="flex-shrink-0">
                  {getActivityIcon(item.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.actor_name} • {new Date(item.timestamp).toLocaleString()}
                  </p>
                </div>
                {item.amount !== null && (
                  <div className="text-sm font-semibold text-green-600 flex-shrink-0">
                    {formatCurrency(item.amount)}
                  </div>
                )}
              </div>
            ))}
            {(!timeline?.data || timeline?.data.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                No recent activity
              </div>
            )}
          </div>
          {(timeline?.total_pages ?? 0) > 1 && (
            <Pagination page={timelinePage} totalPages={timeline?.total_pages ?? 1} onPageChange={setTimelinePage} />
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default AdminAccountingStatsPage;
