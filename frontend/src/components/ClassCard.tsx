import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

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
      whileHover={{ y: -4, boxShadow: '0 12px 25px rgba(2,6,23,0.08)', scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      className="bg-white rounded-xl p-6 shadow-md cursor-pointer border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 min-h-[160px]"
    >
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 leading-tight break-words mb-1">
            {className}
          </h3>
          <p className="text-sm text-gray-600">
            Section {section}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-700 shadow-sm">
            <div className="text-sm font-medium">{studentCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Students</div>
            <div className="text-sm font-medium text-gray-900">{studentCount} enrolled</div>
          </div>
        </div>

        <div className="text-right">
          {classTeacher ? (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Teacher</div>
              <div className="text-sm font-medium text-gray-900 max-w-[120px] truncate" title={classTeacher}>
                {classTeacher}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Subjects</div>
              <div className="text-sm font-medium text-gray-900 max-w-[120px] truncate" title={(subjects || []).slice(0,2).join(', ') || '—'}>
                {(subjects || []).slice(0,2).join(', ') || '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ClassCard;
