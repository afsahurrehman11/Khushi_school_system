import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle, BarChart3 } from 'lucide-react';
import { Student, Teacher, Class, Fee, FeePayment } from '../types';
import { studentsService } from '../services/students';
import { teachersService } from '../services/teachers';
import { classesService } from '../services/classes';
import { feesService } from '../services/fees';
import { paymentsService } from '../services/payments';
import { authService } from '../services/auth';
import logger from '../utils/logger';
import { entitySync } from '../utils/entitySync';

type TabType = 'students' | 'teachers' | 'classes' | 'fees' | 'payments';

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Form states
  const [newStudent, setNewStudent] = useState({ rollNumber: '', firstName: '', lastName: '', email: '', class_id: '', phone: '' });
  const [newTeacher, setNewTeacher] = useState({ firstName: '', lastName: '', email: '', phone: '', subject: '' });
  const [newClass, setNewClass] = useState({ name: '', section: '', classTeacher: '' });
  const [newFee, setNewFee] = useState({ name: '', amount: '', class_id: '', category: '' });

  const user = authService.getUser();
  const schoolId = authService.getSchoolId();

  // Load students
  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await studentsService.getStudents();
      setStudents(response.items || []);
      logger.info('ADMIN', `[SCHOOL:${schoolId}] [ADMIN:${user?.email}] ✅ Loaded ${response.items?.length || 0} students`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} students` });
    } catch (error: any) {
      logger.error('ADMIN', `[SCHOOL:${schoolId}] [ADMIN] ❌ Error loading students: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading students: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Load teachers
  const loadTeachers = async () => {
    setLoading(true);
    try {
      const response = await teachersService.getTeachers();
      setTeachers(response.items || []);
      logger.info('ADMIN', `[SCHOOL:${schoolId}] [ADMIN:${user?.email}] ✅ Loaded ${response.items?.length || 0} teachers`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} teachers` });
    } catch (error: any) {
      logger.error('ADMIN', `[SCHOOL:${schoolId}] [ADMIN] ❌ Error loading teachers: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading teachers: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Load classes
  const loadClasses = async () => {
    setLoading(true);
    try {
      const response = await classesService.getClasses();
      setClasses(response.items || []);
      logger.info('ADMIN', `[SCHOOL:${schoolId}] [ADMIN:${user?.email}] ✅ Loaded ${response.items?.length || 0} classes`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} classes` });
    } catch (error: any) {
      logger.error('ADMIN', `[SCHOOL:${schoolId}] [ADMIN] ❌ Error loading classes: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading classes: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Load fees
  const loadFees = async () => {
    setLoading(true);
    try {
      const response = await feesService.getFees();
      setFees(response.items || []);
      logger.info('ADMIN', `[SCHOOL:${schoolId}] [ADMIN:${user?.email}] ✅ Loaded ${response.items?.length || 0} fees`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} fees` });
    } catch (error: any) {
      logger.error('ADMIN', `[SCHOOL:${schoolId}] [ADMIN] ❌ Error loading fees: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading fees: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Load payments
  const loadPayments = async () => {
    setLoading(true);
    try {
      const response = await paymentsService.getFeePayments();
      setPayments(response.items || []);
      logger.info('ADMIN', `[SCHOOL:${schoolId}] [ADMIN:${user?.email}] ✅ Loaded ${response.items?.length || 0} payments`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} payments` });
    } catch (error: any) {
      logger.error('ADMIN', `[SCHOOL:${schoolId}] [ADMIN] ❌ Error loading payments: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading payments: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Create student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await studentsService.createStudent({
        ...newStudent,
      });
      setNewStudent({ rollNumber: '', firstName: '', lastName: '', email: '', class_id: '', phone: '' });
      setFormOpen(false);
      loadStudents();
      setMessage({ type: 'success', text: `Student "${newStudent.firstName}" created successfully` });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating student: ${error.message}` });
    }
  };

  // Create teacher
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Transform frontend format to backend format
      const teacherData = {
        name: `${newTeacher.firstName} ${newTeacher.lastName}`.trim(),
        email: newTeacher.email,
        phone: newTeacher.phone,
        assigned_subjects: newTeacher.subject ? [newTeacher.subject] : []
      };
      
      await teachersService.createTeacher(teacherData);
      setNewTeacher({ firstName: '', lastName: '', email: '', phone: '', subject: '' });
      setFormOpen(false);
      loadTeachers();
      setMessage({ type: 'success', text: `Teacher "${teacherData.name}" created successfully` });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating teacher: ${error.message}` });
    }
  };

  // Create class
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await classesService.createClass(newClass);
      setNewClass({ name: '', section: '', classTeacher: '' });
      setFormOpen(false);
      loadClasses();
      setMessage({ type: 'success', text: `Class "${newClass.name}" created successfully` });
      // Emit synchronization event
      entitySync.emitClassCreated(newClass.id, newClass);    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating class: ${error.message}` });
    }
  };

  // Create fee
  const handleCreateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await feesService.createFee({
        ...newFee,
        amount: parseFloat(newFee.amount),
      });
      setNewFee({ name: '', amount: '', class_id: '', category: '' });
      setFormOpen(false);
      loadFees();
      setMessage({ type: 'success', text: `Fee "${newFee.name}" created successfully` });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating fee: ${error.message}` });
    }
  };

  // Delete functions
  const handleDeleteStudent = async (id: string) => {
    if (window.confirm('Delete this student?')) {
      try {
        await studentsService.deleteStudent(id);
        loadStudents();
        setMessage({ type: 'success', text: 'Student deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting student: ${error.message}` });
      }
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (window.confirm('Delete this teacher?')) {
      try {
        await teachersService.deleteTeacher(id);
        loadTeachers();
        setMessage({ type: 'success', text: 'Teacher deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting teacher: ${error.message}` });
      }
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (window.confirm('Delete this class?')) {
      try {
        await classesService.deleteClass(id);
        loadClasses();
        setMessage({ type: 'success', text: 'Class deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting class: ${error.message}` });
      }
    }
  };

  const handleDeleteFee = async (id: string) => {
    if (window.confirm('Delete this fee?')) {
      try {
        await feesService.deleteFee(id);
        loadFees();
        setMessage({ type: 'success', text: 'Fee deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting fee: ${error.message}` });
      }
    }
  };

  useEffect(() => {
    switch (activeTab) {
      case 'students':
        loadStudents();
        break;
      case 'teachers':
        loadTeachers();
        break;
      case 'classes':
        loadClasses();
        break;
      case 'fees':
        loadFees();
        break;
      case 'payments':
        loadPayments();
        break;
    }
    setFormOpen(false);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">📊 School Admin Dashboard</h1>
          <p className="text-slate-400">Manage students, teachers, classes, fees, and payments</p>
          {user && <p className="text-sm text-slate-400 mt-2">Logged in as: <span className="text-blue-400">{user.email}</span></p>}
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center ${
            message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 mr-3" /> : <AlertCircle className="w-5 h-5 mr-3" />}
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {(['students', 'teachers', 'classes', 'fees', 'payments'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {tab === 'students' && '👨‍🎓'} {tab === 'teachers' && '👩‍🏫'} {tab === 'classes' && '🏛️'} {tab === 'fees' && '💵'} {tab === 'payments' && '💳'}
              {' '} {tab.charAt(0).toUpperCase() + tab.slice(1)} ({
                tab === 'students' ? students.length :
                tab === 'teachers' ? teachers.length :
                tab === 'classes' ? classes.length :
                tab === 'fees' ? fees.length :
                payments.length
              })
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-slate-300">Loading...</div>
        ) : activeTab === 'students' ? (
          <div>
            <button
              onClick={() => setFormOpen(!formOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Add Student
            </button>

            {formOpen && (
              <form onSubmit={handleCreateStudent} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Roll Number"
                    value={newStudent.rollNumber}
                    onChange={(e) => setNewStudent({ ...newStudent, rollNumber: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="First Name"
                    value={newStudent.firstName}
                    onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={newStudent.lastName}
                    onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newStudent.email}
                    onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select
                    value={newStudent.class_id}
                    onChange={(e) => setNewStudent({ ...newStudent, class_id: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  >
                    <option value="">Select Class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.section}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newStudent.phone}
                    onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                  <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {students.map((student) => (
                <div key={student.id} className="p-4 bg-slate-700 rounded-lg flex justify-between items-center hover:bg-slate-600 transition">
                  <div>
                    <h3 className="font-semibold text-white">{student.firstName} {student.lastName}</h3>
                    <p className="text-sm text-slate-400">Roll: {student.rollNumber} | Email: {student.email}</p>
                    <p className="text-sm text-slate-400">Class: {classes.find(c => c.id === student.classId)?.name}</p>
                  </div>
                  <button onClick={() => handleDeleteStudent(student.id)} className="p-2 bg-red-600 text-white rounded hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'teachers' ? (
          <div>
            <button
              onClick={() => setFormOpen(!formOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Add Teacher
            </button>

            {formOpen && (
              <form onSubmit={handleCreateTeacher} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={newTeacher.firstName}
                    onChange={(e) => setNewTeacher({ ...newTeacher, firstName: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={newTeacher.lastName}
                    onChange={(e) => setNewTeacher({ ...newTeacher, lastName: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={newTeacher.email}
                    onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newTeacher.phone}
                    onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Subject"
                  value={newTeacher.subject}
                  onChange={(e) => setNewTeacher({ ...newTeacher, subject: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                  <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {teachers.map((teacher) => (
                <div key={teacher.id} className="p-4 bg-slate-700 rounded-lg flex justify-between items-center hover:bg-slate-600 transition">
                  <div>
                    <h3 className="font-semibold text-white">{teacher.firstName} {teacher.lastName}</h3>
                    <p className="text-sm text-slate-400">Email: {teacher.email}</p>
                    <p className="text-sm text-slate-400">Phone: {teacher.phone}</p>
                  </div>
                  <button onClick={() => handleDeleteTeacher(teacher.id)} className="p-2 bg-red-600 text-white rounded hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'classes' ? (
          <div>
            <button
              onClick={() => setFormOpen(!formOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Add Class
            </button>

            {formOpen && (
              <form onSubmit={handleCreateClass} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Class Name"
                    value={newClass.name}
                    onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Section (A/B/C)"
                    value={newClass.section}
                    onChange={(e) => setNewClass({ ...newClass, section: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Class Teacher"
                    value={newClass.classTeacher}
                    onChange={(e) => setNewClass({ ...newClass, classTeacher: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                  <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {classes.map((cls) => (
                <div key={cls.id} className="p-4 bg-slate-700 rounded-lg flex justify-between items-center hover:bg-slate-600 transition">
                  <div>
                    <h3 className="font-semibold text-white">{cls.name} {cls.section && `- Section ${cls.section}`}</h3>
                    <p className="text-sm text-slate-400">Class Teacher: {cls.classTeacherId || 'Not assigned'}</p>
                    <p className="text-sm text-slate-400">Students: {students.filter(s => s.classId === cls.id).length}</p>
                  </div>
                  <button onClick={() => handleDeleteClass(cls.id)} className="p-2 bg-red-600 text-white rounded hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'fees' ? (
          <div>
            <button
              onClick={() => setFormOpen(!formOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Add Fee
            </button>

            {formOpen && (
              <form onSubmit={handleCreateFee} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Fee Name"
                    value={newFee.name}
                    onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newFee.amount}
                    onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Category"
                    value={newFee.category}
                    onChange={(e) => setNewFee({ ...newFee, category: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  />
                  <select
                    value={newFee.class_id}
                    onChange={(e) => setNewFee({ ...newFee, class_id: e.target.value })}
                    className="p-2 bg-slate-600 text-white rounded border border-slate-500"
                  >
                    <option value="">Apply to All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
                  <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">Cancel</button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {fees.map((fee) => (
                <div key={fee.id} className="p-4 bg-slate-700 rounded-lg flex justify-between items-center hover:bg-slate-600 transition">
                  <div>
                    <h3 className="font-semibold text-white">{fee.name}</h3>
                    <p className="text-sm text-slate-400">Amount: ₹{fee.amount}</p>
                    <p className="text-sm text-slate-400">Category: {fee.categoryId || 'General'}</p>
                  </div>
                  <button onClick={() => handleDeleteFee(fee.id)} className="p-2 bg-red-600 text-white rounded hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="p-4 bg-slate-700 rounded-lg mb-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Payments Overview</h3>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="p-3 bg-slate-600 rounded">
                  <p className="text-slate-400 text-sm">Total Payments</p>
                  <p className="text-2xl font-bold text-white">{payments.length}</p>
                </div>
                <div className="p-3 bg-slate-600 rounded">
                  <p className="text-slate-400 text-sm">Total Amount</p>
                  <p className="text-2xl font-bold text-green-400">₹{payments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-600 rounded">
                  <p className="text-slate-400 text-sm">Pending</p>
                  <p className="text-2xl font-bold text-yellow-400">{payments.filter(p => p.remainingAmount > 0).length}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white">₹{payment.amount}</h3>
                      <p className="text-sm text-slate-400">Student: {students.find(s => s.id === payment.studentId)?.firstName}</p>
                      <p className="text-sm text-slate-400">Payment Date: {new Date(payment.paymentDate || '').toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
