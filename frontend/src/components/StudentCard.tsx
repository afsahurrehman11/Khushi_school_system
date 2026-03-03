import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, User, Calendar } from 'lucide-react';

interface StudentCardProps {
  id: string | number;
  name: string;
  rollNo: string;
  class: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  guardianName: string;
  parentCnic?: string;
  profileImageUrl?: string;
  onClick: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelect?: (id: string | number) => void;
  onAdmissionClick?: () => void;
}

const StudentCard: React.FC<StudentCardProps> = ({
  id,
  name,
  rollNo,
  class: classLabel,
  email,
  phone,
  dateOfBirth,
  guardianName,
  parentCnic,
  profileImageUrl,
  onClick,
  selectable = false,
  checked = false,
  onToggleSelect,
  onAdmissionClick,
}) => {
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-gradient-to-br from-indigo-50 via-white to-blue-50 rounded-xl p-6 shadow-sm cursor-pointer border-2 border-indigo-100 hover:border-indigo-300 transition-all relative ${selectable ? 'pl-12' : ''}`}
    >
      {selectable && (
        <div className="absolute left-5 top-5 flex items-center gap-2">
          <div>
            <input
              type="checkbox"
              checked={checked}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.(id); }}
              className="w-5 h-5 rounded border-2 border-indigo-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Single admission action icon (top-right) */}
      <div className="absolute right-5 top-5">
        <button
          onClick={(e) => { e.stopPropagation(); onAdmissionClick?.(); }}
          title="Admission Options"
          className="w-8 h-8 bg-white/95 rounded flex items-center justify-center border border-indigo-100 hover:bg-white"
        >
          <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
      
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        {profileImageUrl ? (
          <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border-2 border-indigo-200">
            <img src={profileImageUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <User className="w-7 h-7 text-indigo-700" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-indigo-900 truncate mb-1">
            {name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Roll: {rollNo}</span>
            {classLabel && (
              <span className="text-sm text-indigo-600 truncate ml-2">{classLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-indigo-50">
          <Mail className="w-4 h-4 flex-shrink-0 text-indigo-600" />
          <span className="text-sm truncate">{email}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-indigo-50">
          <Phone className="w-4 h-4 flex-shrink-0 text-indigo-600" />
          <span className="text-sm">{phone}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-700 p-2 bg-white/60 rounded-lg border border-indigo-50">
          <Calendar className="w-4 h-4 flex-shrink-0 text-indigo-600" />
          <span className="text-sm">{new Date(dateOfBirth).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Guardian Info */}
      <div className="pt-4 border-t-2 border-indigo-100">
        <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-2">Guardian Information</p>
        <p className="text-sm font-bold text-gray-900 truncate mb-1">{guardianName}</p>
        {parentCnic && (
          <p className="text-xs text-gray-600 font-medium">CNIC: {parentCnic}</p>
        )}
      </div>
    </motion.div>
  );
};

export default StudentCard;
