import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  User, 
  Image, 
  Phone, 
  Mail, 
  Edit2, 
  Save, 
  X,
  Search,
  Filter,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  Camera
} from 'lucide-react';
import { analyticsService, MissingDataStudent } from '../services/analytics';
import { studentsService } from '../services/students';
import { authService } from '../services/auth';

interface EditingState {
  [studentId: string]: {
    [field: string]: string;
  };
}

const MissingDataPage: React.FC = () => {
  const [students, setStudents] = useState<MissingDataStudent[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<MissingDataStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterField, setFilterField] = useState<string>('all');
  
  // Editing
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditingState>({});

  const missingFieldLabels: { [key: string]: string } = {
    'phone': 'Phone Number',
    'email': 'Email',
    'guardian_phone': 'Guardian Phone',
    'father_name': 'Father Name',
    'mother_name': 'Mother Name',
    'address': 'Address',
    'date_of_birth': 'Date of Birth',
    'blood_group': 'Blood Group',
    'cnic': 'CNIC/B-Form',
    'profile_image': 'Profile Photo',
    'cnic_image': 'CNIC/B-Form Photo',
    'emergency_contact': 'Emergency Contact'
  };

  useEffect(() => {
    loadMissingData();
  }, []);

  useEffect(() => {
    filterStudents();
  }, [students, searchTerm, filterField]);

  async function loadMissingData() {
    setLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getMissingData();
      setStudents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load missing data');
    } finally {
      setLoading(false);
    }
  }

  function filterStudents() {
    let filtered = [...students];
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.first_name.toLowerCase().includes(term) ||
        s.last_name.toLowerCase().includes(term) ||
        s.roll_number.toLowerCase().includes(term) ||
        s.class_name.toLowerCase().includes(term)
      );
    }
    
    // Field filter
    if (filterField !== 'all') {
      filtered = filtered.filter(s => s.missing_fields.includes(filterField));
    }
    
    setFilteredStudents(filtered);
  }

  function getAllMissingFields(): string[] {
    const fields = new Set<string>();
    students.forEach(s => s.missing_fields.forEach(f => fields.add(f)));
    return Array.from(fields);
  }

  function startEditing(studentId: string) {
    const student = students.find(s => s.student_id === studentId);
    if (!student) return;
    
    // Initialize edit values with empty strings for missing fields
    const initialValues: { [field: string]: string } = {};
    student.missing_fields.forEach(field => {
      if (!['profile_image', 'cnic_image'].includes(field)) {
        initialValues[field] = '';
      }
    });
    
    setEditValues(prev => ({
      ...prev,
      [studentId]: initialValues
    }));
    setEditingStudent(studentId);
  }

  function cancelEditing() {
    setEditingStudent(null);
    setEditValues({});
  }

  function updateEditValue(studentId: string, field: string, value: string) {
    setEditValues(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  }

  async function saveStudentData(studentId: string) {
    const values = editValues[studentId];
    if (!values || Object.keys(values).length === 0) {
      cancelEditing();
      return;
    }

    // Filter out empty values
    const updates: { [key: string]: string } = {};
    Object.entries(values).forEach(([key, value]) => {
      if (value.trim()) {
        updates[key] = value.trim();
      }
    });

    if (Object.keys(updates).length === 0) {
      cancelEditing();
      return;
    }

    setSaving(studentId);
    setError(null);
    
    try {
      await studentsService.updateStudent(studentId, updates);
      setSuccess('Student data updated successfully');
      
      // Refresh the list
      await loadMissingData();
      cancelEditing();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update student');
    } finally {
      setSaving(null);
    }
  }

  function getMissingFieldIcon(field: string) {
    switch (field) {
      case 'phone':
      case 'guardian_phone':
      case 'emergency_contact':
        return <Phone className="w-3 h-3" />;
      case 'email':
        return <Mail className="w-3 h-3" />;
      case 'profile_image':
      case 'cnic_image':
        return <Camera className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  }

  function getFieldInputType(field: string): string {
    switch (field) {
      case 'email':
        return 'email';
      case 'phone':
      case 'guardian_phone':
      case 'emergency_contact':
        return 'tel';
      case 'date_of_birth':
        return 'date';
      default:
        return 'text';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <h1 className="text-2xl font-bold text-gray-900">Missing Student Data</h1>
          </div>
          <p className="text-gray-600">
            Review and complete missing information for students. Click on a student row to edit.
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-700">{success}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{students.length}</p>
                <p className="text-sm text-gray-500">Students with missing data</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Camera className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {students.filter(s => !s.has_profile_image).length}
                </p>
                <p className="text-sm text-gray-500">Missing profile photos</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {students.filter(s => !s.has_cnic_image).length}
                </p>
                <p className="text-sm text-gray-500">Missing CNIC photos</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Phone className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {students.filter(s => s.missing_fields.includes('phone') || s.missing_fields.includes('guardian_phone')).length}
                </p>
                <p className="text-sm text-gray-500">Missing phone numbers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, roll number, or class..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            
            {/* Field Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">All Missing Fields</option>
                {getAllMissingFields().map(field => (
                  <option key={field} value={field}>
                    {missingFieldLabels[field] || field}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Refresh */}
            <button
              onClick={loadMissingData}
              disabled={loading}
              className="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {students.length === 0 ? 'All Data Complete!' : 'No Results Found'}
            </h3>
            <p className="text-gray-600">
              {students.length === 0 
                ? 'All students have complete information.'
                : 'Try adjusting your search or filter criteria.'
              }
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Student</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Class</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Missing Fields</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Photos</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStudents.map((student) => (
                  <React.Fragment key={student.student_id}>
                    <tr 
                      className={`hover:bg-gray-50 ${editingStudent === student.student_id ? 'bg-indigo-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${student.has_profile_image ? 'bg-green-100' : 'bg-gray-200'}`}>
                            {student.has_profile_image 
                              ? <CheckCircle className="w-5 h-5 text-green-600" />
                              : <User className="w-5 h-5 text-gray-400" />
                            }
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-sm text-gray-500">Roll: {student.roll_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {student.class_name} - {student.section}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {student.missing_fields.slice(0, 4).map((field) => (
                            <span
                              key={field}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full"
                            >
                              {getMissingFieldIcon(field)}
                              {missingFieldLabels[field] || field}
                            </span>
                          ))}
                          {student.missing_fields.length > 4 && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                              +{student.missing_fields.length - 4} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${student.has_profile_image ? 'bg-green-100' : 'bg-red-100'}`}>
                            <Camera className={`w-4 h-4 ${student.has_profile_image ? 'text-green-600' : 'text-red-600'}`} />
                          </div>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${student.has_cnic_image ? 'bg-green-100' : 'bg-red-100'}`}>
                            <Image className={`w-4 h-4 ${student.has_cnic_image ? 'text-green-600' : 'text-red-600'}`} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingStudent === student.student_id ? (
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => saveStudentData(student.student_id)}
                              disabled={saving === student.student_id}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Save"
                            >
                              {saving === student.student_id 
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Save className="w-4 h-4" />
                              }
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(student.student_id)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    
                    {/* Inline Edit Row */}
                    {editingStudent === student.student_id && (
                      <tr className="bg-indigo-50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {student.missing_fields
                              .filter(f => !['profile_image', 'cnic_image'].includes(f))
                              .map((field) => (
                                <div key={field}>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {missingFieldLabels[field] || field}
                                  </label>
                                  <input
                                    type={getFieldInputType(field)}
                                    value={editValues[student.student_id]?.[field] || ''}
                                    onChange={(e) => updateEditValue(student.student_id, field, e.target.value)}
                                    placeholder={`Enter ${missingFieldLabels[field] || field}`}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  />
                                </div>
                              ))
                            }
                          </div>
                          
                          {/* Image Upload Note */}
                          {(student.missing_fields.includes('profile_image') || student.missing_fields.includes('cnic_image')) && (
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-sm text-amber-700">
                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                To upload photos, please go to the student's detail page or use the face recognition module.
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissingDataPage;
