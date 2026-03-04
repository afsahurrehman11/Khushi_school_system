import React from 'react';
import { motion } from 'framer-motion';
import { Users, Layers } from 'lucide-react';

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
  onClick,
}) => {
  return (
    <motion.div
      layout
      whileHover={{ y: -4, boxShadow: '0 12px 25px rgba(2,6,23,0.08)', scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 shadow-sm cursor-pointer border border-emerald-100 hover:border-emerald-200 hover:shadow-md transition-all duration-200 w-full sm:w-64 md:w-72 min-h-[120px]"
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
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between h-full">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-white/80 text-emerald-700 shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{studentCount}</div>
            <div className="text-xs text-gray-500">Students</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-400">&nbsp;</div>
        </div>
      </div>
    </motion.div>
  );
};

export default ClassCard;
