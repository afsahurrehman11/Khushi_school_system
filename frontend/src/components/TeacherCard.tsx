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
  profileImageUrl?: string;
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
  profileImageUrl,
  onClick,
  onEdit,
  onDelete,
}) => {
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-gradient-to-br from-amber-50 via-white to-orange-50 rounded-xl p-6 shadow-sm cursor-pointer border-2 border-amber-100 hover:border-amber-300 transition-all"
    >
      {/* Action buttons */}
      {(onEdit || onDelete) && (
        <div className="flex gap-2 justify-end mb-3">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-lg hover:bg-amber-100 transition-colors"
              aria-label="Edit teacher"
            >
              <Edit2 className="w-4 h-4 text-amber-700" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 rounded-lg hover:bg-red-50 transition-colors"
              aria-label="Delete teacher"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        {profileImageUrl ? (
          <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border-2 border-amber-200">
            <img src={profileImageUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <GraduationCap className="w-7 h-7 text-amber-700" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-amber-900 truncate mb-1">
            {name}
          </h3>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded inline-block">ID: {teacherId}</p>
            {cnic && (
              <p className="text-xs text-gray-600 font-medium">CNIC: {cnic}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contact & Experience */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-amber-50">
          <Mail className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span className="text-sm truncate">{email}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-amber-50">
          <Phone className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span className="text-sm">{phone}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-amber-50">
          <Calendar className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span className="text-sm font-medium">{experience} experience</span>
        </div>
      </div>

      {/* Subjects */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-amber-600" />
          <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Subjects</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(subjects || []).slice(0, 3).map((subject, idx) => (
            <span
              key={idx}
              className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 px-3 py-1.5 rounded-lg font-semibold border border-amber-200"
            >
              {subject}
            </span>
          ))}
          {(subjects || []).length > 3 && (
            <span className="text-xs text-amber-600 font-semibold px-3 py-1.5">
              +{subjects.length - 3} more
            </span>
          )}
          {(subjects || []).length === 0 && (
            <span className="text-xs text-gray-500 italic">No subjects assigned</span>
          )}
        </div>
      </div>

      {/* Qualification */}
      <div className="pt-4 border-t-2 border-amber-100">
        <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-2">Qualification</p>
        <p className="text-sm font-bold text-gray-900 truncate">{qualification}</p>
      </div>
    </motion.div>
  );
};

export default TeacherCard;
