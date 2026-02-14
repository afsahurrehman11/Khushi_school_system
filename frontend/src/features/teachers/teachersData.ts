export interface Teacher {
  id: number;
  name: string;
  teacherId: string;
  subjects: string[];
  assignedClasses: string[] | null; // null for unassigned teachers
  email: string;
  phone: string;
  qualification: string;
  experience: string;
  dateOfJoining: string;
}

export const teachersData: Teacher[] = [];

// Helper function to get teachers by subject
export const getTeachersBySubject = (subject: string) => {
  return teachersData.filter((teacher) => 
    teacher.subjects.includes(subject)
  );
};

// Helper function to get unassigned teachers
export const getUnassignedTeachers = () => {
  return teachersData.filter((teacher) => 
    teacher.assignedClasses === null || teacher.assignedClasses.length === 0
  );
};

// Helper function to get all unique subjects
export const getAllSubjects = () => {
  const subjects = teachersData.flatMap((teacher) => teacher.subjects);
  return Array.from(new Set(subjects)).sort();
};

// Helper function to get teachers by class
export const getTeachersByClass = (className: string) => {
  return teachersData.filter((teacher) => 
    teacher.assignedClasses && teacher.assignedClasses.includes(className)
  );
};

// Helper function to get all classes with teacher counts
export const getAllClassesForTeachers = () => {
  const classes = teachersData
    .filter((teacher) => teacher.assignedClasses !== null)
    .flatMap((teacher) => teacher.assignedClasses as string[]);
  const uniqueClasses = Array.from(new Set(classes)).sort();
  
  return uniqueClasses.map((className) => ({
    className,
    teacherCount: getTeachersByClass(className).length,
  }));
};
