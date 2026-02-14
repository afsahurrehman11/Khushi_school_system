import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, GraduationCap, Calendar, BookOpen, Edit2, Trash2 } from 'lucide-react';

interface TeacherCardProps {
  id?: string | number;
  name: string;
  teacherId?: string;
  cnic?: string;
  subjects?: string[];
  email?: string;
  phone?: string;
  qualification?: string;
  experience?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const TeacherCard: React.FC<TeacherCardProps> = ({
  name,
  teacherId,
  cnic,
  subjects = [],
  email,
  phone,
  qualification,
  experience,
  onClick,
  onEdit,
  onDelete,
}) => {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-lg p-5 shadow-soft cursor-pointer border border-secondary-200 hover:border-primary-300 transition-all"
    >
      {/* Action buttons */}
      {(onEdit || onDelete) && (
        <div className="flex gap-2 justify-end mb-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-md hover:bg-secondary-100"
              aria-label="Edit teacher"
            >
              <Edit2 className="w-4 h-4 text-secondary-600" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 rounded-md hover:bg-secondary-100"
              aria-label="Delete teacher"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-6 h-6 text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-secondary-900 truncate">
            {name}
          </h3>
          <p className="text-sm text-secondary-500">ID: {teacherId}</p>
          {cnic && (
            <p className="text-sm text-secondary-500">CNIC: {cnic}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-secondary-600">
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm truncate">{email}</span>
        </div>
        <div className="flex items-center gap-2 text-secondary-600">
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{phone}</span>
        </div>
        <div className="flex items-center gap-2 text-secondary-600">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{experience} experience</span>
        </div>
      </div>

      <div className="pt-4 border-t border-secondary-100">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4 text-secondary-500" />
          <p className="text-xs text-secondary-500 font-medium">Subjects</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(subjects || []).slice(0, 2).map((subject, idx) => (
            <span
              key={idx}
              className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded font-medium"
            >
              {subject}
            </span>
          ))}
          {(subjects || []).length > 2 && (
            <span className="text-xs text-secondary-500 px-2 py-1">
              +{subjects.length - 2} more
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-secondary-100">
        <p className="text-xs text-secondary-500">Qualification</p>
        <p className="text-sm font-medium text-secondary-900 truncate">{qualification}</p>
      </div>
    </motion.div>
  );
};

export default TeacherCard;
