/**
 * Payment Charts Component - M6 Implementation
 * Recharts visualizations for payment status and monthly trends
 */

import React, { useState, useEffect } from 'react';
import studentFeeService from '../../../services/studentFees';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface PaymentChartsProps {
  studentId: string;
  year: number;
}

interface ChartData {
  year: number;
  status_pie_chart: {
    labels: string[];
    data: number[];
  };
  monthly_bar_chart: {
    labels: string[];
    fees: number[];
    paid: number[];
    remaining: number[];
  };
}

const STATUS_COLORS = ['#22c55e', '#eab308', '#ef4444', '#b91c1c']; // Green, Yellow, Red, Dark Red

const PaymentCharts: React.FC<PaymentChartsProps> = ({ studentId, year }) => {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChartData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await studentFeeService.getChartData(studentId, year);
        setChartData(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    };

    loadChartData();
  }, [studentId, year]);

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString()}`;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-500">Loading charts...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No chart data available for this period.
      </div>
    );
  }

  if (!chartData || !chartData.status_pie_chart.data.some(d => d > 0)) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No fee data available to display charts.
      </div>
    );
  }

  // Transform pie chart data for recharts
  const pieData = chartData.status_pie_chart.labels.map((label, index) => ({
    name: label === 'PAID' ? 'Paid' : label === 'PARTIAL' ? 'Partial' : label === 'UNPAID' ? 'Unpaid' : 'Overdue',
    value: chartData.status_pie_chart.data[index],
  })).filter(item => item.value > 0);

  // Transform bar chart data for recharts
  const barData = chartData.monthly_bar_chart.labels.map((label, index) => ({
    month: label,
    'Total Fee': chartData.monthly_bar_chart.fees[index],
    'Paid': chartData.monthly_bar_chart.paid[index],
    'Remaining': chartData.monthly_bar_chart.remaining[index],
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-medium text-gray-800 mb-4">Payment Analytics - {year}</h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 text-center mb-2">Payment Status Distribution</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={56}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} months`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 text-center mb-2">Monthly Payment Trend</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(value) => `Rs. ${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Total Fee" fill="#3b82f6" />
                <Bar dataKey="Paid" fill="#22c55e" />
                <Bar dataKey="Remaining" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Stats below charts */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <p className="text-xl font-semibold text-green-600">{chartData.status_pie_chart.data[0] || 0}</p>
          <p className="text-sm text-gray-600">Paid Months</p>
        </div>
        <div className="text-center p-2 bg-yellow-50 rounded-lg">
          <p className="text-xl font-semibold text-yellow-600">{chartData.status_pie_chart.data[1] || 0}</p>
          <p className="text-sm text-gray-600">Partial Months</p>
        </div>
        <div className="text-center p-2 bg-red-50 rounded-lg">
          <p className="text-xl font-semibold text-red-600">{chartData.status_pie_chart.data[2] || 0}</p>
          <p className="text-sm text-gray-600">Unpaid Months</p>
        </div>
        <div className="text-center p-2 bg-red-100 rounded-lg">
          <p className="text-xl font-semibold text-red-700">{chartData.status_pie_chart.data[3] || 0}</p>
          <p className="text-sm text-gray-600">Overdue Months</p>
        </div>
      </div>
    </div>
  );
};

export default PaymentCharts;
