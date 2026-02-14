import React, { useState, useEffect } from 'react';
import Button from '../../../components/Button';
import FeeCategoryModal from '../components/FeeCategoryModal';
import { InAppNotificationService } from '../services';
import { api } from '../../../utils/api';

interface ClassData {
  id: string;
  class_name: string;
  section?: string;
  fee_category?: {
    id: string;
    name: string;
    total_amount: number;
    components?: { component_name: string; amount: number; }[];
  };
  student_count: number;
  fee_summary: {
    paid: number;
    partial: number;
    unpaid: number;
  };
}

interface StudentData {
  id: string;
  student_id: string;
  full_name: string;
  fee_status: 'paid' | 'partial' | 'unpaid';
  fee_category: string;
  total_fee: number;
  paid_amount: number;
  remaining_amount: number;
}

const FeePage: React.FC = () => {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<string[]>([]);
  const [transactionRef, setTransactionRef] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    setLoading(true);
    try {
      // Fetch classes with fee assignments and student counts
      const classesData = await api.get('/api/classes');

      // Enrich with fee categories and student counts
      const enrichedClasses = await Promise.all(
        classesData.map(async (cls: any) => {
          // Parallel fetch fee assignment and students
          const [feeData, studentsData] = await Promise.allSettled([
            api.get(`/api/class-fee-assignments/classes/${cls.id}/active`).catch(() => null),
            api.get(`/api/students?class_id=${cls.id}`).catch(() => []),
          ]);

          let feeCategory = null;
          if (feeData.status === 'fulfilled' && feeData.value?.category_id) {
            try {
                  const catData = await api.get(`/api/fee-categories/${feeData.value.category_id}`);
                    // compute total amount from components if not directly provided
                    let totalAmount = 0;
                    if (typeof catData.total_amount === 'number') totalAmount = catData.total_amount;
                    else if (Array.isArray(catData.components)) {
                      totalAmount = catData.components.reduce((s: number, c: any) => s + (c.amount || 0), 0);
                    }
                    feeCategory = {
                      id: catData.id,
                      name: catData.name,
                      total_amount: totalAmount,
                      components: catData.components || [],
                    };
            } catch (e) {
              // No active category
            }
          }

          let studentCount = 0;
          let feeSummary = { paid: 0, partial: 0, unpaid: 0 };
          if (studentsData.status === 'fulfilled') {
            const students = studentsData.value || [];
            studentCount = students.length;

            // Parallel fetch payment summaries for all students
            const summaryPromises = students.map((student: any) =>
              api.get(`/api/fee-payments/student/${student.id}/summary`).catch(() => ({ status: 'unpaid' }))
            );
            const summaries = await Promise.allSettled(summaryPromises);

            summaries.forEach(result => {
              if (result.status === 'fulfilled') {
                const summary = result.value;
                if (summary.status === 'paid') feeSummary.paid++;
                else if (summary.status === 'partial') feeSummary.partial++;
                else feeSummary.unpaid++;
              } else {
                feeSummary.unpaid++;
              }
            });
          }

          return {
            id: cls.id,
            class_name: cls.class_name,
            section: cls.section,
            fee_category: feeCategory,
            student_count: studentCount,
            fee_summary: feeSummary,
          };
        })
      );

      setClasses(enrichedClasses);
    } catch (error) {
      InAppNotificationService.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentsForClass = async (classData: ClassData) => {
    setLoading(true);
    try {
      const studentsData = await api.get(`/api/students?class_id=${classData.id}`);

      // Enrich with fee status
      const enrichedStudents = await Promise.all(
        studentsData.map(async (student: any) => {
          // Get fee summary for student
          let summary = {
            total_fee: classData.fee_category?.total_amount || 0,
            paid_amount: 0,
            remaining_amount: classData.fee_category?.total_amount || 0,
            status: 'unpaid' as const,
          };
          try {
            summary = await api.get(`/api/fee-payments/student/${student.id}/summary`);
          } catch (e) {
            // Keep default
          }

          return {
            id: student.id,
            student_id: student.student_id,
            full_name: student.full_name,
            fee_status: summary.status as 'paid' | 'partial' | 'unpaid',
            fee_category: classData.fee_category?.name || 'No Category',
            total_fee: summary.total_fee,
            paid_amount: summary.paid_amount,
            remaining_amount: summary.remaining_amount,
          };
        })
      );

      setStudents(enrichedStudents);
      setSelectedClass(classData);
      // Load saved payment method names for later use
      try {
        const methods = await api.get('/api/payment-methods');
        setSavedPaymentMethods(methods.map((m: any) => m.name));
      } catch (err) {
        // non-critical
      }
    } catch (error) {
      InAppNotificationService.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 border-green-300';
      case 'partial': return 'bg-yellow-100 border-yellow-300';
      case 'unpaid': return 'bg-red-100 border-red-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partial': return 'Partial';
      case 'unpaid': return 'Unpaid';
      default: return 'Unknown';
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedClass) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      InAppNotificationService.error('Please enter a valid payment amount');
      return;
    }

    // Validate payment amount doesn't exceed remaining due
    if (amount > selectedStudent.remaining_amount) {
      InAppNotificationService.error('Payment amount cannot exceed remaining due amount');
      return;
    }

    const finalPaymentMethod = paymentMethod === 'cash' ? 'cash' : customPaymentMethod;

    setSubmittingPayment(true);
    try {
      await api.post('/api/fee-payments', {
        student_id: selectedStudent.id,
        class_id: selectedClass.id,
        amount_paid: amount,
        payment_method: finalPaymentMethod,
        transaction_reference: transactionRef || undefined,
      });

      InAppNotificationService.success('Payment recorded successfully');

      // Reset form
      setPaymentAmount('');
      setCustomPaymentMethod('');
      setTransactionRef('');

      // Refresh student data
      if (selectedClass) {
        await loadStudentsForClass(selectedClass);
      }

      // Refresh current student data
      try {
        const summary = await api.get(`/api/fee-payments/student/${selectedStudent.id}/summary`);
        setSelectedStudent(prev => prev ? {
          ...prev,
          fee_status: summary.status as 'paid' | 'partial' | 'unpaid',
          paid_amount: summary.paid_amount,
          remaining_amount: summary.remaining_amount,
        } : null);
      } catch (e) {
        // Ignore
      }

    } catch (error) {
      InAppNotificationService.error('Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (selectedStudent) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-primary-900">
              Fee Management - {selectedStudent.full_name}
            </h1>
            <Button variant="ghost" onClick={() => setSelectedStudent(null)}>
              Back to Students
            </Button>
          </div>

          {/* Fee Management Modal Content */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Student Information</h3>
                <div className="space-y-2">
                  <p><strong>Name:</strong> {selectedStudent.full_name}</p>
                  <p><strong>Student ID:</strong> {selectedStudent.student_id}</p>
                  <p><strong>Class:</strong> {selectedClass?.class_name}</p>
                  <p><strong>Fee Category:</strong> {selectedStudent.fee_category}</p>
                  {selectedClass?.fee_category?.components && selectedClass.fee_category.components.length > 0 && (
                    <div className="mt-2">
                      <h4 className="font-medium">Category Components</h4>
                      <ul className="text-sm list-disc list-inside">
                        {selectedClass.fee_category.components.map((c: any, idx: number) => (
                          <li key={idx}>{c.name || 'Component'}: ${Number(c.amount || 0).toFixed(2)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Fee Summary</h3>
                <div className="space-y-2">
                  <p><strong>Total Fee:</strong> ${selectedStudent.total_fee}</p>
                  <p><strong>Paid Amount:</strong> ${selectedStudent.paid_amount}</p>
                  <p><strong>Remaining:</strong> ${selectedStudent.remaining_amount}</p>
                  <p><strong>Status:</strong> 
                    <span className={`ml-2 px-2 py-1 rounded text-sm ${getStatusColor(selectedStudent.fee_status)}`}>
                      {getStatusText(selectedStudent.fee_status)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Form */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter amount"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Method *</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                        setPaymentMethod(e.target.value);
                        if (e.target.value === 'cash') {
                          setCustomPaymentMethod('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="online">Online Payment</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {paymentMethod !== 'cash' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Specific Payment Method *</label>
                      <input
                        type="text"
                        value={customPaymentMethod}
                        onChange={(e) => setCustomPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., JazzCash, EasyPaisa, HBL Online"
                        required
                      />
                    </div>
                  )}
                </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Transaction Reference</label>
                    <input
                      type="text"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional transaction reference"
                    />
                  </div>

                  {/* When non-cash, show specific payment method name input with suggestions */}
                  {paymentMethod !== 'cash' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Specific Payment Method *</label>
                      <input
                        type="text"
                        list="savedPaymentMethods"
                        value={customPaymentMethod}
                        onChange={(e) => setCustomPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., JazzCash, EasyPaisa, HBL Online"
                        required
                      />
                      <datalist id="savedPaymentMethods">
                        {savedPaymentMethods.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={submittingPayment}
                    className="px-6 py-2"
                  >
                    {submittingPayment ? 'Recording...' : 'Record Payment'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedClass) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-primary-900">
              Students - {selectedClass.class_name} {selectedClass.section || ''}
            </h1>
            <Button variant="ghost" onClick={() => { setSelectedClass(null); setStudents([]); }}>
              Back to Classes
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading students...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className={`bg-white rounded-lg shadow-md p-4 border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${getStatusColor(student.fee_status)}`}
                  onClick={() => setSelectedStudent(student)}
                >
                  <h3 className="font-semibold text-lg mb-2">{student.full_name}</h3>
                  <p className="text-sm text-gray-600 mb-1">ID: {student.student_id}</p>
                  <p className="text-sm text-gray-600 mb-2">{student.fee_category}</p>
                  <div className="text-sm">
                    <p>Total: ${student.total_fee}</p>
                    <p>Paid: ${student.paid_amount}</p>
                    <p>Remaining: ${student.remaining_amount}</p>
                  </div>
                  <div className="mt-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(student.fee_status)}`}>
                      {getStatusText(student.fee_status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary-900">Fees Management</h1>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setShowCategoryModal(true)}>
              Manage Fee Categories
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading classes...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => loadStudentsForClass(cls)}
              >
                <h3 className="text-xl font-semibold mb-2">{cls.class_name} {cls.section || ''}</h3>
                <p className="text-gray-600 mb-2">
                  Fee Category: {cls.fee_category?.name || 'Not Assigned'}
                </p>
                <p className="text-gray-600 mb-4">Students: {cls.student_count}</p>
                
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Paid:</span>
                    <span className="text-green-600">{cls.fee_summary.paid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Partial:</span>
                    <span className="text-yellow-600">{cls.fee_summary.partial}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unpaid:</span>
                    <span className="text-red-600">{cls.fee_summary.unpaid}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <FeeCategoryModal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
      </div>
    </div>
  );
};

export default FeePage;
