import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  ChevronRight, 
  Download, 
  Calendar, 
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  FileText
} from 'lucide-react';
import { feeVouchersService, ClassWithFees, StudentForVoucher } from '../services/feeVouchers';
import { authService } from '../services/auth';

type ViewMode = 'classes' | 'students';

const FeeVoucherPrintPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('classes');
  const [classes, setClasses] = useState<ClassWithFees[]>([]);
  const [students, setStudents] = useState<StudentForVoucher[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassWithFees | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Voucher options
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getCurrentMonth()]);
  const [includeArrears, setIncludeArrears] = useState(true);
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadClasses();
  }, []);

  function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getDefaultDueDate(): string {
    const now = new Date();
    now.setDate(now.getDate() + 15);
    return now.toISOString().split('T')[0];
  }

  function getMonthOptions(): Array<{ value: string; label: string }> {
    const options: Array<{ value: string; label: string }> = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    
    return options;
  }

  async function loadClasses() {
    setLoading(true);
    setError(null);
    try {
      const data = await feeVouchersService.getClasses();
      setClasses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents(classData: ClassWithFees) {
    setLoading(true);
    setError(null);
    setSelectedClass(classData);
    setViewMode('students');
    try {
      const data = await feeVouchersService.getStudentsByClass(classData.class_id);
      setStudents(data);
      setSelectedStudents(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  function goBackToClasses() {
    setViewMode('classes');
    setSelectedClass(null);
    setStudents([]);
    setSelectedStudents(new Set());
  }

  function toggleStudentSelection(studentId: string) {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  }

  function selectAllStudents() {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.student_id)));
    }
  }

  function toggleMonth(month: string) {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        return prev.filter(m => m !== month);
      }
      return [...prev, month];
    });
  }

  async function generateClassVouchers() {
    if (!selectedClass) return;
    
    setGenerating(true);
    setError(null);
    setSuccess(null);
    
    try {
      const blob = await feeVouchersService.generateClassVouchers({
        class_id: selectedClass.class_id,
        selected_months: selectedMonths,
        include_arrears: includeArrears,
        due_date: dueDate,
        notes: notes
      });
      
      const filename = `${selectedClass.class_name}_${selectedClass.section}_vouchers_${new Date().toISOString().split('T')[0]}.pdf`;
      feeVouchersService.downloadPdf(blob, filename);
      setSuccess(`Vouchers generated for ${selectedClass.class_name} - ${selectedClass.section}`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate vouchers');
    } finally {
      setGenerating(false);
    }
  }

  async function generateSelectedStudentVouchers() {
    if (selectedStudents.size === 0) {
      setError('Please select at least one student');
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      // Generate vouchers for each selected student
      for (const studentId of selectedStudents) {
        const blob = await feeVouchersService.generateStudentVoucher({
          student_id: studentId,
          selected_months: selectedMonths,
          include_arrears: includeArrears,
          due_date: dueDate,
          notes: notes
        });
        
        const student = students.find(s => s.student_id === studentId);
        const filename = `${student?.roll_number || studentId}_voucher_${new Date().toISOString().split('T')[0]}.pdf`;
        feeVouchersService.downloadPdf(blob, filename);
      }
      
      setSuccess(`Generated vouchers for ${selectedStudents.size} student(s)`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate vouchers');
    } finally {
      setGenerating(false);
    }
  }

  async function printClassVouchers() {
    if (!selectedClass) return;
    
    setGenerating(true);
    setError(null);
    
    try {
      const blob = await feeVouchersService.generateClassVouchers({
        class_id: selectedClass.class_id,
        selected_months: selectedMonths,
        include_arrears: includeArrears,
        due_date: dueDate,
        notes: notes
      });
      
      feeVouchersService.openPdfForPrint(blob);
    } catch (err: any) {
      setError(err.message || 'Failed to generate vouchers');
    } finally {
      setGenerating(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            {viewMode === 'students' && (
              <button
                onClick={goBackToClasses}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <FileText className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Fee Voucher Printing</h1>
          </div>
          <p className="text-gray-600">
            {viewMode === 'classes' 
              ? 'Select a class to view students and generate fee vouchers'
              : `${selectedClass?.class_name} - ${selectedClass?.section} (${students.length} students)`
            }
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-700">{success}</span>
          </div>
        )}

        {/* Voucher Options Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Voucher Options</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Month Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Months
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                {getMonthOptions().map(month => (
                  <label key={month.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMonths.includes(month.value)}
                      onChange={() => toggleMonth(month.value)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm">{month.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Include Arrears */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Include Arrears
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg">
                <input
                  type="checkbox"
                  checked={includeArrears}
                  onChange={(e) => setIncludeArrears(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm">Include previous balance</span>
              </label>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Pay before 15th"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : viewMode === 'classes' ? (
          /* Classes Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.class_id}
                onClick={() => loadStudents(cls)}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {cls.class_name} - {cls.section}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {cls.student_count} students
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Fees:</span>
                    <span className="font-medium">{formatCurrency(cls.total_fees)}</span>
                  </div>
                  
                  {cls.fee_categories.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500 mb-1">Fee Categories:</p>
                      <div className="flex flex-wrap gap-1">
                        {cls.fee_categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat.category_id}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {cat.category_name}
                          </span>
                        ))}
                        {cls.fee_categories.length > 3 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            +{cls.fee_categories.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {classes.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                No classes found
              </div>
            )}
          </div>
        ) : (
          /* Students List */
          <div>
            {/* Action Bar */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStudents.size === students.length && students.length > 0}
                    onChange={selectAllStudents}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">
                    {selectedStudents.size === students.length ? 'Deselect All' : 'Select All'}
                  </span>
                </label>
                
                {selectedStudents.size > 0 && (
                  <span className="text-sm text-gray-500">
                    {selectedStudents.size} student(s) selected
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={generateSelectedStudentVouchers}
                  disabled={selectedStudents.size === 0 || generating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download Selected
                </button>
                
                <button
                  onClick={generateClassVouchers}
                  disabled={generating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download All Class
                </button>
                
                <button
                  onClick={printClassVouchers}
                  disabled={generating}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Print All Class
                </button>
              </div>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Roll No</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Student Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Father Name</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Pending</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Paid</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr 
                      key={student.student_id}
                      className={`hover:bg-gray-50 ${selectedStudents.has(student.student_id) ? 'bg-indigo-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.student_id)}
                          onChange={() => toggleStudentSelection(student.student_id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {student.roll_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {student.first_name} {student.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.father_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className={`font-medium ${student.pending_fees > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(student.pending_fees)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-600">
                        {formatCurrency(student.paid_fees)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setGenerating(true);
                            try {
                              const blob = await feeVouchersService.generateStudentVoucher({
                                student_id: student.student_id,
                                selected_months: selectedMonths,
                                include_arrears: includeArrears,
                                due_date: dueDate,
                                notes: notes
                              });
                              const filename = `${student.roll_number}_voucher_${new Date().toISOString().split('T')[0]}.pdf`;
                              feeVouchersService.downloadPdf(blob, filename);
                            } catch (err: any) {
                              setError(err.message);
                            } finally {
                              setGenerating(false);
                            }
                          }}
                          disabled={generating}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Download Voucher"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {students.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No students found in this class
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeeVoucherPrintPage;
