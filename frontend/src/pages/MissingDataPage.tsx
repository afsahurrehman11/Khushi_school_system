import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  User, 
  Phone, 
  Mail, 
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  Camera
} from 'lucide-react';
import { analyticsService, MissingDataStudent } from '../services/analytics';
import { studentsService } from '../services/students';
import ImageUpload from '../features/students/components/ImageUpload';

const missingFieldLabels: Record<string, string> = {
  phone: 'Phone Number',
  guardian_phone: 'Guardian Phone',
  emergency_contact: 'Emergency Contact',
  email: 'Email Address',
  profile_image: 'Profile Photo',
  cnic_image: 'CNIC Image',
  date_of_birth: 'Date of Birth',
  address: 'Address',
  father_name: 'Father Name',
  father_cnic: 'Father CNIC',
  parent_contact: 'Parent Contact',
};

const MissingDataPage: React.FC = () => {
  const [students, setStudents] = useState<MissingDataStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassCard, setSelectedClassCard] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load missing data on component mount
  useEffect(() => {
    loadMissingData();
  }, []);

  const loadMissingData = async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getMissingData();
      setStudents(data);
    } catch (err) {
      console.error('Failed to load missing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const classesGrouped = students.reduce((acc, student) => {
    const key = `${student.class_name}||${student.section || ''}`;
    const existing = acc.find(c => c.key === key);
    if (existing) {
      existing.count++;
    } else {
      acc.push({
        key,
        class_name: student.class_name,
        section: student.section,
        count: 1
      });
    }
    return acc;
  }, [] as Array<{key: string, class_name: string, section?: string, count: number}>);

  const filteredStudents = students.filter(student => {
    if (searchTerm.trim() === '') {
      return selectedClassCard ? `${student.class_name}||${student.section || ''}` === selectedClassCard : true;
    }
    const fullName = `${student.first_name} ${student.last_name}`.trim();
    return fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           student.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
           student.class_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const startEditing = (studentId: string) => {
    setEditingStudent(studentId);
    setEditValues(prev => ({
      ...prev,
      [studentId]: {}
    }));
  };

  const cancelEditing = () => {
    setEditingStudent(null);
    setEditValues(prev => {
      const newValues = { ...prev };
      delete newValues[editingStudent!];
      return newValues;
    });
  };

  const updateEditValue = (studentId: string, field: string, value: string) => {
    setEditValues(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  };

  const saveStudentData = async (studentId: string) => {
    const values = editValues[studentId] || {};
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
  };

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
            Complete missing information for {students.length} student{students.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search students by name, ID, or class..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <button
              onClick={() => setSelectedClassCard(null)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-green-800">{success}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : searchTerm.trim() === '' ? (
          // Show class-card view when search is empty
          students.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">All Data Complete!</h3>
              <p className="text-gray-600">All students have complete information.</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-6">
                {classesGrouped.map((cls) => (
                  <button
                    key={cls.key}
                    onClick={() => setSelectedClassCard(cls.key === selectedClassCard ? null : cls.key)}
                    className={`text-left bg-white rounded-2xl p-6 shadow-sm border transition transform hover:-translate-y-1 hover:shadow-md ${selectedClassCard === cls.key ? 'ring-2 ring-indigo-200 border-indigo-200' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-secondary-900 break-words">{cls.class_name}</h3>
                        <p className="text-sm text-secondary-500 mt-1">Section {cls.section || 'â€”'}</p>
                      </div>
                      <div className="w-14 h-14 bg-gradient-to-br from-rose-400 to-yellow-400 text-white rounded-lg flex items-center justify-center shadow-md ml-4">
                        <div className="text-lg font-bold">{cls.count}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          // Show table view when searching
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Search Results ({filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Missing Fields</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <React.Fragment key={student.student_id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {student.has_profile_image ? (
                                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                                  <Camera className="w-5 h-5 text-green-600" />
                                </div>
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <User className="w-5 h-5 text-gray-600" />
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{`${student.first_name} ${student.last_name}`}</div>
                              <div className="text-sm text-gray-500">{student.student_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{student.class_name}</div>
                          <div className="text-sm text-gray-500">Section {student.section || 'â€”'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {student.missing_fields.map((field) => (
                              <span key={field} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">
                                {getMissingFieldIcon(field)}
                                <span className="ml-1 capitalize">{field.replace('_', ' ')}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {editingStudent === student.student_id ? (
                              <>
                                <button onClick={() => saveStudentData(student.student_id)} disabled={!!saving} className="px-4 py-2 bg-indigo-600 text-white rounded">{saving === student.student_id ? 'Saving...' : 'Save'}</button>
                                <button onClick={cancelEditing} className="px-4 py-2 bg-gray-300 text-gray-700 rounded">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditing(student.student_id)}
                                  className="px-3 py-1 text-indigo-600 border border-indigo-100 rounded-lg text-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingStudent(null);
                                  }}
                                  className="px-3 py-1 text-gray-600 border border-gray-100 rounded-lg text-sm"
                                >
                                  Details
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editingStudent === student.student_id && (
                        <tr className="bg-indigo-50">
                          <td colSpan={4} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {student.missing_fields.filter(f => !['profile_image','cnic_image'].includes(f)).map((field) => (
                                <div key={field}>
                                  <label className="text-xs text-secondary-700 font-medium">{missingFieldLabels[field] || field}</label>
                                  <input
                                    type={getFieldInputType(field)}
                                    value={(editValues[student.student_id] || {})[field] || ''}
                                    onChange={(e) => updateEditValue(student.student_id, field, e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg mt-1"
                                  />
                                </div>
                              ))}
                              {(student.missing_fields.includes('profile_image') || student.missing_fields.includes('cnic_image')) && (
                                <div>
                                  <label className="text-xs text-secondary-700 font-medium">Photos</label>
                                  <ImageUpload studentId={student.student_id} onImageUploaded={() => { loadMissingData(); }} />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissingDataPage;
