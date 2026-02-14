import React from 'react';
import { motion } from 'framer-motion';
import { Users, BookOpen } from 'lucide-react';

interface ClassCardProps {
  className: string;
  section: string;
  studentCount: number;
  classTeacher?: string;
  subjects?: string[];
  onClick: () => void;
}

const ClassCard: React.FC<ClassCardProps> = ({
  className,
  section,
  studentCount,
  classTeacher,
  subjects,
  onClick,
}) => {
  return (
    <motion.div
      layout
      whileHover={{ y: -4, boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)', scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="bg-white rounded-xl p-6 shadow-soft cursor-pointer border border-secondary-200 hover:border-primary-300 transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-2xl font-bold text-secondary-900 truncate max-w-[14rem] md:max-w-[20rem]">
            Class {className}
          </h3>
          <p className="text-sm text-secondary-500 truncate">Section {section}</p>
        </div>
        <div className="w-12 h-12 ml-4 bg-primary-100 rounded-lg flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary-600" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-secondary-600">
          <Users className="w-4 h-4" />
          <span className="text-sm">
            {studentCount} {studentCount === 1 ? 'Student' : 'Students'}
          </span>
        </div>

        {classTeacher && (
          <div className="pt-3 border-t border-secondary-100">
            <p className="text-xs text-secondary-500">Class Teacher</p>
            <p className="text-sm font-medium text-secondary-900">{classTeacher}</p>
          </div>
        )}

        {subjects && subjects.length > 0 && (
          <div className="pt-3 border-t border-secondary-100">
            <p className="text-xs text-secondary-500 mb-2">Subjects</p>
            <div className="flex flex-wrap gap-1">
              {subjects.slice(0, 3).map((subject, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-secondary-100 text-secondary-700 px-2 py-1 rounded"
                >
                  {subject}
                </span>
              ))}
              {subjects.length > 3 && (
                <span className="text-xs text-secondary-500 px-2 py-1">
                  +{subjects.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ClassCard;
