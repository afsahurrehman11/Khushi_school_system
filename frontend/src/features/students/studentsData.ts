export interface Student {
  id: string;
  name: string;
  rollNo: string;
  registrationNumber?: string;
  schoolName?: string;
  class: string | null; // null for unassigned students
  assignedClasses: string[];
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  guardianName: string;
  guardianPhone: string;
  parentCnic?: string;
  profileImageBlob?: string | null;
  profileImageType?: string;
  arrears?: number; // Per-student arrears amount
}

export const studentsData: Student[] = [];

// Helper function to get students by class
export const getStudentsByClass = (className: string) => {
  return studentsData.filter((student) => student.class === className);
};

// Helper function to get unassigned students
export const getUnassignedStudents = () => {
  return studentsData.filter((student) => student.class === null);
};

// Helper function to get all classes
export const getAllClasses = () => {
  const classes = studentsData
    .map((student) => student.class)
    .filter((cls): cls is string => cls !== null);
  return Array.from(new Set(classes)).sort();
};
