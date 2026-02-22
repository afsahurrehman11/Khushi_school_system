/**
 * Billing Dashboard Page
 * Complete billing management for root users including:
 * - Billing configuration
 * - Invoice management with editing
 * - Analytics with charts
 * - PDF generation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  FileText,
  Download,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Settings,
  Receipt,
  Database,
  Search,
  X,
  Save,
  FileDown,
} from 'lucide-react';
import type {
  Invoice,
  InvoiceUpdate,
  InvoiceStatus,
  BillingPeriod,
  BillingConfig,
  BillingConfigCreate,
  BillingAnalytics,
  BulkInvoiceGenerate,
} from '../types';
import billingService from '../services/billing';

// ================= Utility Functions =================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getStatusColor = (status: InvoiceStatus): string => {
  switch (status) {
    case 'paid':
      return 'bg-success-100 text-success-700';
    case 'pending':
      return 'bg-warning-100 text-warning-700';
    case 'overdue':
      return 'bg-danger-100 text-danger-700';
    case 'draft':
      return 'bg-secondary-100 text-secondary-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getStatusIcon = (status: InvoiceStatus) => {
  switch (status) {
    case 'paid':
      return <CheckCircle className="w-4 h-4" />;
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'overdue':
      return <AlertTriangle className="w-4 h-4" />;
    case 'draft':
      return <Edit2 className="w-4 h-4" />;
    case 'cancelled':
      return <XCircle className="w-4 h-4" />;
    default:
      return null;
  }
};

// ================= Loading Spinner =================

const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; text?: string }> = ({
  size = 'md',
  text,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-primary-200 border-t-primary-600`}
      />
      {text && <span className="text-sm text-secondary-600">{text}</span>}
    </div>
  );
};

// ================= Stats Card =================

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color?: 'primary' | 'success' | 'warning' | 'danger';
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'primary',
}) => {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-soft border border-secondary-100 hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-secondary-500">{title}</p>
          <p className="text-2xl font-bold text-secondary-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-secondary-400 mt-1">{subtitle}</p>}
          {trend && (
            <div
              className={`flex items-center gap-1 mt-2 text-xs ${
                trend.isPositive ? 'text-success-600' : 'text-danger-600'
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingUp className="w-3 h-3 transform rotate-180" />
              )}
              <span>{trend.value}%</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
};

// ================= Simple Bar Chart =================

interface SimpleBarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  title?: string;
  valueFormatter?: (v: number) => string;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  maxValue,
  title,
  valueFormatter = (v) => v.toString(),
}) => {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {title && <h4 className="text-sm font-medium text-secondary-700">{title}</h4>}
      {data.map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between text-xs text-secondary-600">
            <span>{item.label}</span>
            <span className="font-medium">{valueFormatter(item.value)}</span>
          </div>
          <div className="h-2 bg-secondary-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                item.color || 'bg-primary-500'
              }`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ================= Simple Pie Chart =================

interface SimplePieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  title?: string;
  totalLabel?: string;
}

const SimplePieChart: React.FC<SimplePieChartProps> = ({ data, title, totalLabel }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;

  const segments = data.map((item) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const startAngle = accumulated * 3.6; // Convert percentage to degrees
    accumulated += percentage;
    return { ...item, percentage, startAngle };
  });

  // Create conic gradient
  let gradientStops = '';
  let currentAngle = 0;
  segments.forEach((seg) => {
    const endAngle = currentAngle + seg.percentage * 3.6;
    gradientStops += `${seg.color} ${currentAngle}deg ${endAngle}deg, `;
    currentAngle = endAngle;
  });
  gradientStops = gradientStops.slice(0, -2); // Remove trailing comma

  return (
    <div className="space-y-4">
      {title && <h4 className="text-sm font-medium text-secondary-700">{title}</h4>}
      <div className="flex items-center gap-6">
        <div
          className="w-32 h-32 rounded-full relative"
          style={{
            background: `conic-gradient(${gradientStops})`,
          }}
        >
          <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-secondary-500">{totalLabel || 'Total'}</p>
              <p className="text-sm font-bold text-secondary-900">{total}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {segments.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-secondary-600">{item.label}</span>
              <span className="ml-auto font-medium text-secondary-900">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ================= Billing Config Modal =================

interface BillingConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingConfig: BillingConfig | null;
  onSave: (config: BillingConfigCreate) => Promise<void>;
}

const BillingConfigModal: React.FC<BillingConfigModalProps> = ({
  isOpen,
  onClose,
  existingConfig,
  onSave,
}) => {
  const [formData, setFormData] = useState<BillingConfigCreate>({
    total_mongo_cost: existingConfig?.total_mongo_cost || 0,
    billing_period: existingConfig?.billing_period || 'monthly',
    period_start: existingConfig?.period_start?.split('T')[0] || new Date().toISOString().split('T')[0],
    period_end: existingConfig?.period_end?.split('T')[0] || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fixed_cpu_ram_cost: existingConfig?.fixed_cpu_ram_cost || 0,
    dynamic_storage_cost: existingConfig?.dynamic_storage_cost || 0,
    markup_percentage: existingConfig?.markup_percentage || 20,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingConfig) {
      setFormData({
        total_mongo_cost: existingConfig.total_mongo_cost,
        billing_period: existingConfig.billing_period,
        period_start: existingConfig.period_start?.split('T')[0] || '',
        period_end: existingConfig.period_end?.split('T')[0] || '',
        fixed_cpu_ram_cost: existingConfig.fixed_cpu_ram_cost,
        dynamic_storage_cost: existingConfig.dynamic_storage_cost,
        markup_percentage: existingConfig.markup_percentage,
      });
    }
  }, [existingConfig]);

  // Auto-calculate split when total changes
  const handleTotalChange = (total: number) => {
    const fixed = total * 0.4; // 40% fixed
    const dynamic = total * 0.6; // 60% storage-based
    setFormData((prev) => ({
      ...prev,
      total_mongo_cost: total,
      fixed_cpu_ram_cost: Number(fixed.toFixed(2)),
      dynamic_storage_cost: Number(dynamic.toFixed(2)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-lg mx-4 animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-secondary-100">
          <h3 className="text-lg font-semibold text-secondary-900">Billing Configuration</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary-100 rounded-lg">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Total MongoDB Cost ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.total_mongo_cost}
              onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-secondary-500 mt-1">
              Enter your MongoDB Atlas bill for this period
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Period Start
              </label>
              <input
                type="date"
                value={formData.period_start}
                onChange={(e) => setFormData((prev) => ({ ...prev, period_start: e.target.value }))}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Period End
              </label>
              <input
                type="date"
                value={formData.period_end}
                onChange={(e) => setFormData((prev) => ({ ...prev, period_end: e.target.value }))}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Fixed Cost (CPU/RAM)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.fixed_cpu_ram_cost}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    fixed_cpu_ram_cost: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Dynamic Cost (Storage)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.dynamic_storage_cost}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    dynamic_storage_cost: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Markup Percentage (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.markup_percentage}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  markup_percentage: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-secondary-200 text-secondary-700 rounded-lg hover:bg-secondary-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= Invoice Editor Modal =================

interface InvoiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onSave: (invoiceId: string, updates: InvoiceUpdate) => Promise<void>;
  onDownloadPDF: (invoiceId: string, invoiceNumber: string) => Promise<void>;
}

const InvoiceEditorModal: React.FC<InvoiceEditorModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSave,
  onDownloadPDF,
}) => {
  const [formData, setFormData] = useState<InvoiceUpdate>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      setFormData({
        misc_charges: invoice.cost_breakdown.misc_charges || 0,
        misc_charges_description: invoice.cost_breakdown.misc_charges_description || '',
        crash_recovery_charges: invoice.cost_breakdown.crash_recovery_charges || 0,
        urgent_recovery_charges: invoice.cost_breakdown.urgent_recovery_charges || 0,
        discount: invoice.cost_breakdown.discount || 0,
        discount_description: invoice.cost_breakdown.discount_description || '',
        status: invoice.status,
        notes: invoice.notes || '',
        internal_notes: invoice.internal_notes || '',
        due_date: invoice.due_date?.split('T')[0] || '',
      });
    }
  }, [invoice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;

    setError(null);
    setSaving(true);

    try {
      await onSave(invoice.id, formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      await onDownloadPDF(invoice.id, invoice.invoice_number);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Calculate preview total
  const calculateTotal = (): number => {
    if (!invoice) return 0;
    let total = invoice.cost_breakdown.subtotal;
    total += formData.misc_charges || 0;
    total += formData.crash_recovery_charges || 0;
    total += formData.urgent_recovery_charges || 0;
    total -= formData.discount || 0;
    return Math.max(0, total);
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-3xl mx-4 my-8 animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-secondary-100">
          <div>
            <h3 className="text-lg font-semibold text-secondary-900">
              Edit Invoice: {invoice.invoice_number}
            </h3>
            <p className="text-sm text-secondary-500">{invoice.school_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 disabled:opacity-50"
            >
              {downloading ? <LoadingSpinner size="sm" /> : <Download className="w-4 h-4" />}
              Download PDF
            </button>
            <button onClick={onClose} className="p-1 hover:bg-secondary-100 rounded-lg">
              <X className="w-5 h-5 text-secondary-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{error}</div>
          )}

          {/* Invoice Summary */}
          <div className="bg-secondary-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-secondary-700 mb-3">Base Costs</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-secondary-500">Fixed Cost</span>
                <p className="font-medium">{formatCurrency(invoice.cost_breakdown.fixed_cost)}</p>
              </div>
              <div>
                <span className="text-secondary-500">Storage Cost</span>
                <p className="font-medium">{formatCurrency(invoice.cost_breakdown.storage_cost)}</p>
              </div>
              <div>
                <span className="text-secondary-500">Markup</span>
                <p className="font-medium">{formatCurrency(invoice.cost_breakdown.markup_amount)}</p>
              </div>
              <div>
                <span className="text-secondary-500">Subtotal</span>
                <p className="font-medium text-primary-600">
                  {formatCurrency(invoice.cost_breakdown.subtotal)}
                </p>
              </div>
            </div>
          </div>

          {/* Manual Adjustments */}
          <div>
            <h4 className="text-sm font-medium text-secondary-700 mb-3">Manual Adjustments</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Misc Charges ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.misc_charges || 0}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, misc_charges: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Misc Description</label>
                <input
                  type="text"
                  value={formData.misc_charges_description || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, misc_charges_description: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Custom integration"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">
                  Crash Recovery Charges ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.crash_recovery_charges || 0}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      crash_recovery_charges: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">
                  Urgent Recovery Charges ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.urgent_recovery_charges || 0}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      urgent_recovery_charges: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Discount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.discount || 0}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Discount Reason</label>
                <input
                  type="text"
                  value={formData.discount_description || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, discount_description: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Early payment"
                />
              </div>
            </div>
          </div>

          {/* Status and Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Status</label>
              <select
                value={formData.status || invoice.status}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, status: e.target.value as InvoiceStatus }))
                }
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Due Date</label>
              <input
                type="date"
                value={formData.due_date || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Notes (visible on invoice)
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Notes to appear on the invoice..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Internal Notes (root only)
              </label>
              <textarea
                value={formData.internal_notes || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, internal_notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Internal notes not shown on invoice..."
              />
            </div>
          </div>

          {/* Total Preview */}
          <div className="bg-primary-50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-primary-700">Calculated Total</span>
            <span className="text-2xl font-bold text-primary-800">
              {formatCurrency(calculateTotal())}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-secondary-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-secondary-200 text-secondary-700 rounded-lg hover:bg-secondary-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= Generate Invoices Modal =================

interface GenerateInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: BulkInvoiceGenerate) => Promise<Invoice[]>;
}

const GenerateInvoicesModal: React.FC<GenerateInvoicesModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [formData, setFormData] = useState<BulkInvoiceGenerate>({
    billing_period: 'monthly',
    period_start: new Date().toISOString().split('T')[0],
    period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    due_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGenerating(true);

    try {
      const invoices = await onGenerate(formData);
      setResult(invoices);
    } catch (err: any) {
      setError(err.message || 'Failed to generate invoices');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-lg mx-4 animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-secondary-100">
          <h3 className="text-lg font-semibold text-secondary-900">Generate Invoices</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary-100 rounded-lg">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        {result ? (
          <div className="p-5">
            <div className="flex items-center gap-3 text-success-700 mb-4">
              <CheckCircle className="w-6 h-6" />
              <span className="font-medium">Generated {result.length} invoices successfully!</span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {result.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg text-sm"
                >
                  <span>{inv.school_name}</span>
                  <span className="font-medium">{formatCurrency(inv.total_amount)}</span>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Billing Period
              </label>
              <select
                value={formData.billing_period}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    billing_period: e.target.value as BillingPeriod,
                  }))
                }
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Period Start
                </label>
                <input
                  type="date"
                  value={formData.period_start}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, period_start: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Period End
                </label>
                <input
                  type="date"
                  value={formData.period_end}
                  onChange={(e) => setFormData((prev) => ({ ...prev, period_end: e.target.value }))}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Due Date</label>
              <input
                type="date"
                value={formData.due_date || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-secondary-200 text-secondary-700 rounded-lg hover:bg-secondary-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generating}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Receipt className="w-4 h-4" />
                )}
                Generate All Invoices
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ================= Invoice Table =================

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoiceId: string) => void;
  onDownloadPDF: (invoiceId: string, invoiceNumber: string) => void;
}

const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices,
  loading,
  onEdit,
  onDelete,
  onDownloadPDF,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [sortField, setSortField] = useState<'created_at' | 'total_amount' | 'school_name'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredInvoices = invoices
    .filter((inv) => {
      const matchesSearch =
        inv.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = !statusFilter || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'created_at') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'total_amount') {
        cmp = a.total_amount - b.total_amount;
      } else if (sortField === 'school_name') {
        cmp = a.school_name.localeCompare(b.school_name);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" text="Loading invoices..." />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-soft border border-secondary-100">
      {/* Filters */}
      <div className="p-4 border-b border-secondary-100 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-10 pr-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | '')}
          className="px-3 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary-50 text-left text-xs text-secondary-600 uppercase">
              <th
                className="px-4 py-3 cursor-pointer hover:bg-secondary-100"
                onClick={() => toggleSort('school_name')}
              >
                <div className="flex items-center gap-1">
                  School
                  {sortField === 'school_name' &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    ))}
                </div>
              </th>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th
                className="px-4 py-3 cursor-pointer hover:bg-secondary-100"
                onClick={() => toggleSort('total_amount')}
              >
                <div className="flex items-center gap-1">
                  Amount
                  {sortField === 'total_amount' &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    ))}
                </div>
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:bg-secondary-100"
                onClick={() => toggleSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  Created
                  {sortField === 'created_at' &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    ))}
                </div>
              </th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-100">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-secondary-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-secondary-900">{invoice.school_name}</p>
                      <p className="text-xs text-secondary-500">
                        {formatBytes(invoice.storage_bytes)}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 text-sm text-secondary-600">
                    {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        invoice.status
                      )}`}
                    >
                      {getStatusIcon(invoice.status)}
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-secondary-900">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary-600">
                    {formatDate(invoice.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(invoice)}
                        className="p-1.5 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDownloadPDF(invoice.id, invoice.invoice_number)}
                        className="p-1.5 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {invoice.status === 'draft' && (
                        <button
                          onClick={() => onDelete(invoice.id)}
                          className="p-1.5 text-secondary-500 hover:text-danger-600 hover:bg-danger-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ================= Main Billing Dashboard =================

const BillingDashboard: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'config'>('overview');
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await billingService.getBillingAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const data = await billingService.getInvoices();
      setInvoices(data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  // Fetch billing config
  const fetchBillingConfig = useCallback(async () => {
    try {
      const config = await billingService.getBillingConfig();
      setBillingConfig(config);
    } catch (error) {
      console.error('Error fetching billing config:', error);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchInvoices();
    fetchBillingConfig();
  }, [fetchAnalytics, fetchInvoices, fetchBillingConfig]);

  // Handlers
  const handleSaveConfig = async (config: BillingConfigCreate) => {
    await billingService.createBillingConfig(config);
    await fetchBillingConfig();
    await fetchAnalytics();
  };

  const handleGenerateInvoices = async (data: BulkInvoiceGenerate): Promise<Invoice[]> => {
    const newInvoices = await billingService.generateBulkInvoices(data);
    await fetchInvoices();
    await fetchAnalytics();
    return newInvoices;
  };

  const handleUpdateInvoice = async (invoiceId: string, updates: InvoiceUpdate) => {
    await billingService.updateInvoice(invoiceId, updates);
    await fetchInvoices();
    await fetchAnalytics();
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    await billingService.deleteInvoice(invoiceId);
    await fetchInvoices();
    await fetchAnalytics();
  };

  const handleDownloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    await billingService.downloadInvoicePDF(invoiceId, invoiceNumber);
  };

  const handleExportCSV = async () => {
    await billingService.exportInvoicesCSV();
  };

  const handleDownloadReport = async () => {
    await billingService.downloadBillingReportPDF();
  };

  // Prepare chart data
  const revenueByPlanData = analytics?.revenue.revenue_by_plan
    ? Object.entries(analytics.revenue.revenue_by_plan).map(([plan, revenue], index) => ({
        label: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: revenue,
        color: ['bg-primary-500', 'bg-success-500', 'bg-warning-500', 'bg-danger-500', 'bg-purple-500'][
          index % 5
        ],
      }))
    : [];

  const invoiceStatusData = analytics
    ? [
        { label: 'Paid', value: analytics.paid_invoices, color: '#16a34a' },
        { label: 'Pending', value: analytics.pending_invoices, color: '#d97706' },
        { label: 'Draft', value: analytics.draft_invoices, color: '#64748b' },
        { label: 'Overdue', value: analytics.overdue_invoices, color: '#dc2626' },
      ]
    : [];

  const storageDistributionData =
    analytics?.storage.top_schools.map((school, index) => ({
      label: school.school_name,
      value: school.storage_bytes / (1024 * 1024), // Convert to MB
      color: ['bg-primary-500', 'bg-success-500', 'bg-warning-500', 'bg-danger-500', 'bg-purple-500'][
        index % 5
      ],
    })) || [];

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Billing & Invoices</h1>
            <p className="text-secondary-500">Manage billing, generate invoices, and view analytics</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-secondary-200 rounded-lg hover:bg-secondary-50 text-sm"
            >
              <Settings className="w-4 h-4" />
              Configure Billing
            </button>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              Generate Invoices
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-secondary-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invoices'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoices ({invoices.length})
            </div>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" text="Loading analytics..." />
              </div>
            ) : analytics ? (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    title="Predicted Revenue"
                    value={formatCurrency(analytics.revenue.total_predicted_revenue)}
                    icon={<DollarSign className="w-5 h-5" />}
                    color="success"
                  />
                  <StatsCard
                    title="MongoDB Cost"
                    value={formatCurrency(analytics.revenue.total_mongo_cost)}
                    icon={<Database className="w-5 h-5" />}
                    color="warning"
                  />
                  <StatsCard
                    title="Total Profit"
                    value={formatCurrency(analytics.revenue.total_profit)}
                    subtitle={`${analytics.revenue.profit_margin_percentage.toFixed(1)}% margin`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    color="primary"
                  />
                  <StatsCard
                    title="Total Invoices"
                    value={analytics.total_invoices.toString()}
                    subtitle={`${analytics.paid_invoices} paid`}
                    icon={<FileText className="w-5 h-5" />}
                  />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Revenue by Plan */}
                  <div className="bg-white rounded-xl p-5 shadow-soft border border-secondary-100">
                    <h3 className="text-sm font-semibold text-secondary-900 mb-4">Revenue by Plan</h3>
                    <SimpleBarChart
                      data={revenueByPlanData}
                      valueFormatter={formatCurrency}
                    />
                  </div>

                  {/* Invoice Status Distribution */}
                  <div className="bg-white rounded-xl p-5 shadow-soft border border-secondary-100">
                    <SimplePieChart
                      data={invoiceStatusData}
                      title="Invoice Status Distribution"
                      totalLabel="Total"
                    />
                  </div>
                </div>

                {/* Storage Distribution */}
                <div className="bg-white rounded-xl p-5 shadow-soft border border-secondary-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-secondary-900">
                      Top Schools by Storage
                    </h3>
                    <span className="text-xs text-secondary-500">
                      Total: {formatBytes(analytics.storage.total_storage_bytes)}
                    </span>
                  </div>
                  <SimpleBarChart
                    data={storageDistributionData}
                    valueFormatter={(v) => `${v.toFixed(2)} MB`}
                  />
                </div>

                {/* Alerts */}
                {(analytics.schools_exceeding_storage.length > 0 ||
                  analytics.overdue_invoices > 0) && (
                  <div className="bg-warning-50 border border-warning-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-warning-800">Attention Required</h4>
                        <ul className="mt-2 space-y-1 text-sm text-warning-700">
                          {analytics.overdue_invoices > 0 && (
                            <li>{analytics.overdue_invoices} overdue invoice(s)</li>
                          )}
                          {analytics.schools_exceeding_storage.length > 0 && (
                            <li>
                              {analytics.schools_exceeding_storage.length} school(s) exceeding
                              storage limits
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Export Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-secondary-200 rounded-lg hover:bg-secondary-50 text-sm"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Invoices CSV
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-secondary-200 rounded-lg hover:bg-secondary-50 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download Report PDF
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-secondary-500">
                No analytics data available. Generate invoices to see analytics.
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="animate-fade-in">
            <InvoiceTable
              invoices={invoices}
              loading={invoicesLoading}
              onEdit={setSelectedInvoice}
              onDelete={handleDeleteInvoice}
              onDownloadPDF={handleDownloadPDF}
            />
          </div>
        )}

        {activeTab === 'config' && (
          <div className="animate-fade-in">
            <div className="bg-white rounded-xl shadow-soft border border-secondary-100 p-6">
              <h3 className="text-lg font-semibold text-secondary-900 mb-4">Current Configuration</h3>
              {billingConfig ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-secondary-500">Total MongoDB Cost</p>
                    <p className="text-xl font-bold text-secondary-900">
                      {formatCurrency(billingConfig.total_mongo_cost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Fixed Cost (CPU/RAM)</p>
                    <p className="text-xl font-medium text-secondary-700">
                      {formatCurrency(billingConfig.fixed_cpu_ram_cost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Dynamic Cost (Storage)</p>
                    <p className="text-xl font-medium text-secondary-700">
                      {formatCurrency(billingConfig.dynamic_storage_cost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Markup Percentage</p>
                    <p className="text-xl font-medium text-secondary-700">
                      {billingConfig.markup_percentage}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Period</p>
                    <p className="text-sm font-medium text-secondary-700">
                      {formatDate(billingConfig.period_start)} - {formatDate(billingConfig.period_end)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Billing Period</p>
                    <p className="text-sm font-medium text-secondary-700 capitalize">
                      {billingConfig.billing_period}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-secondary-500">
                  <p>No billing configuration set.</p>
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Configure Now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <BillingConfigModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          existingConfig={billingConfig}
          onSave={handleSaveConfig}
        />

        <GenerateInvoicesModal
          isOpen={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          onGenerate={handleGenerateInvoices}
        />

        <InvoiceEditorModal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          invoice={selectedInvoice}
          onSave={handleUpdateInvoice}
          onDownloadPDF={handleDownloadPDF}
        />
      </div>
    </div>
  );
};

export default BillingDashboard;
