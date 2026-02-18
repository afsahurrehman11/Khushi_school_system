import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Users, TrendingUp, Filter, Check, Calendar } from 'lucide-react';
import Button from '../../../components/Button';
import api from '../../../utils/api';
import logger from '../../../utils/logger';
import CashDashboardWidget from '../components/CashDashboardWidget';

interface Student {
  id: string;
  student_id: string;
  full_name: string;
  class_id: string;
  section: string;
  status: string;
}

interface Fee {
  id: string;
  student_id: string;
  class_id: string;
  fee_type: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  paid_at?: string;
  payment_method?: string;
  remarks?: string;
}

interface Class {
  id: string;
  class_name: string;
  section: string;
}

const AccountantDashboard: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'fees'>('students');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  

  useEffect(() => {
     // If URL provides ?tab=fees, honor it; else use initialTab
     try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'fees') setActiveTab('fees');
     } catch (e) {}

     fetchClasses();
     fetchStudents();
     fetchFees();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchClasses = async () => {
    try {
      const data = await api.get('/api/classes');
      setClasses(data);
    } catch (err) {
      logger.error('ACCOUNTANT', `Failed to fetch classes: ${String(err)}`);
    }
  };

  const fetchStudents = async () => {
    logger.info('ACCOUNTANT', `📋 Accountant fetching students with filter: class_id=${filterClass}`);
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterClass !== 'all') params.append('class_id', filterClass);
      
      const data = await api.get(`/api/students?${params}`);
      logger.info('ACCOUNTANT', `✅ Accountant fetched ${data.length} students`);
      setStudents(data);
    } catch (err) {
      logger.error('ACCOUNTANT', `❌ Accountant failed to fetch students: ${String(err)}`);
      setError('Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  const fetchFees = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const data = await api.get(`/api/fees?${params}`);
      // API returns {count, page, page_size, fees}, we need the fees array
      setFees(Array.isArray(data) ? data : (data.fees || []));
    } catch (err) {
      setError('Failed to fetch fees');
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (feeId: string) => {
    try {
      await api.put(`/api/fees/${feeId}`, {
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: 'Cash',
      });

      setSuccess('Fee marked as paid ✓');
      fetchFees();
    } catch (err) {
      setError('Failed to update fee');
    }
  };

  const totalPending = fees.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0);
  const totalPaid = fees.filter(f => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0);
  const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-secondary-900 mb-2">Accountant Dashboard</h1>
          <p className="text-secondary-600">Manage student fees and payments</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            whileHover={{ y: -4 }}
            className="bg-white rounded-xl shadow-soft p-6 border-l-4 border-warning-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-secondary-600 text-sm font-medium mb-1">Total Pending</p>
                <p className="text-3xl font-bold text-warning-600">PKR {totalPending.toLocaleString()}</p>
              </div>
              <div className="bg-warning-100 p-4 rounded-full">
                <DollarSign className="w-8 h-8 text-warning-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="bg-white rounded-xl shadow-soft p-6 border-l-4 border-success-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-secondary-600 text-sm font-medium mb-1">Total Collected</p>
                <p className="text-3xl font-bold text-success-600">PKR {totalPaid.toLocaleString()}</p>
              </div>
              <div className="bg-success-100 p-4 rounded-full">
                <Check className="w-8 h-8 text-success-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="bg-white rounded-xl shadow-soft p-6 border-l-4 border-primary-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-secondary-600 text-sm font-medium mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-primary-600">PKR {totalFees.toLocaleString()}</p>
              </div>
              <div className="bg-primary-100 p-4 rounded-full">
                <TrendingUp className="w-8 h-8 text-primary-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Cash Dashboard Widget */}
        <div className="mb-8">
          <CashDashboardWidget />
        </div>

        {/* Error & Success Messages */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-6"
          >
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg mb-6"
          >
            {success}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'students'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'bg-white text-secondary-600 hover:bg-secondary-50 border border-secondary-200'
            }`}
          >
            <Users className="w-5 h-5" />
            Students
          </button>
          <button
            onClick={() => setActiveTab('fees')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'fees'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'bg-white text-secondary-600 hover:bg-secondary-50 border border-secondary-200'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            Fees Management
          </button>
        </div>

        {/* Students Tab */}
        {activeTab === 'students' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-secondary-900">All Students</h2>
              <div className="flex gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-secondary-500" />
                  <select
                    value={filterClass}
                    onChange={(e) => {
                      setFilterClass(e.target.value);
                      fetchStudents();
                    }}
                    className="px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500"
                  >
                    <option value="all">All Classes</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.class_name} - {cls.section}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-secondary-200">
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Student ID</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Name</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Section</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <motion.tr
                        key={student.id}
                        whileHover={{ backgroundColor: '#f8fafc' }}
                        className="border-b border-secondary-100"
                      >
                        <td className="py-4 px-4 text-secondary-900 font-medium">{student.student_id}</td>
                        <td className="py-4 px-4 text-secondary-700">{student.full_name}</td>
                        <td className="py-4 px-4 text-secondary-700">{student.section}</td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            student.status === 'active'
                              ? 'bg-success-100 text-success-700'
                              : 'bg-secondary-100 text-secondary-700'
                          }`}>
                            {student.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Fees Tab */}
        {activeTab === 'fees' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-secondary-900">Fee Records</h2>
              <div className="flex gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-secondary-500" />
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      fetchFees();
                    }}
                    className="px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-secondary-200">
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Student ID</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Fee Type</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Amount</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Due Date</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Status</th>
                      <th className="text-right py-4 px-4 font-bold text-secondary-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <motion.tr
                        key={fee.id}
                        whileHover={{ backgroundColor: '#f8fafc' }}
                        className="border-b border-secondary-100"
                      >
                        <td className="py-4 px-4 text-secondary-900 font-medium">{fee.student_id}</td>
                        <td className="py-4 px-4 text-secondary-700">{fee.fee_type}</td>
                        <td className="py-4 px-4 text-secondary-900 font-bold">PKR {fee.amount.toLocaleString()}</td>
                        <td className="py-4 px-4 text-secondary-700">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-secondary-500" />
                            {new Date(fee.due_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            fee.status === 'paid'
                              ? 'bg-success-100 text-success-700'
                              : 'bg-warning-100 text-warning-700'
                          }`}>
                            {fee.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          {fee.status === 'pending' && (
                            <Button
                              onClick={() => markAsPaid(fee.id)}
                              className="bg-success-600 hover:bg-success-700 text-white text-sm px-4 py-2"
                            >
                              Mark Paid
                            </Button>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AccountantDashboard;
