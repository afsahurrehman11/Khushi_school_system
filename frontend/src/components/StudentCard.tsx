import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, User, Calendar } from 'lucide-react';

interface StudentCardProps {
  id: string | number;
  name: string;
  rollNo: string;
  class: string;
  registrationNumber?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  guardianName: string;
  parentCnic?: string;
  profileImageUrl?: string;
  profileImageBlob?: string | null;
  profileImageType?: string | null;
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
  profileImageBlob,
  profileImageType,
  registrationNumber,
  onClick,
  selectable = false,
  checked = false,
  onToggleSelect,
  onAdmissionClick,
}) => {
  const imageSrc = profileImageBlob ? `data:${profileImageType || 'image/jpeg'};base64,${profileImageBlob}` : profileImageUrl;

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-gradient-to-br from-indigo-50 to-white rounded-xl p-4 shadow-sm cursor-pointer border border-indigo-100 hover:border-indigo-200 transition-all relative`}
    >
      {/* Header: checkbox + avatar + name on left, action button on right */}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={checked}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.(id); }}
              className="w-5 h-5 rounded border-2 border-indigo-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
            />
          )}

          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/60 border border-indigo-50 shadow-sm">
            {imageSrc ? (
              <img src={imageSrc} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-100">
                <User className="w-6 h-6 text-indigo-700" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-indigo-900">{name}</h3>
            </div>
            <div className="mt-1 text-sm text-indigo-600 whitespace-normal break-words">{classLabel}</div>
            <div className="mt-1 text-xs text-gray-500">Roll: {rollNo}{registrationNumber ? ` · Reg: ${registrationNumber}` : ''}</div>
          </div>
        </div>

        {onAdmissionClick && (
          <div className="flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onAdmissionClick?.(); }}
              title="Admission Options"
              className="w-8 h-8 bg-white/95 rounded flex items-center justify-center border border-indigo-100 hover:bg-white"
            >
              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" /><polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm text-gray-700">
        <div className="flex items-center gap-2 bg-white/60 rounded px-2 py-1 border border-indigo-50">
          <Mail className="w-4 h-4 text-indigo-500" />
          <span className="whitespace-normal break-words">{email || '—'}</span>
        </div>
        <div className="flex items-center gap-2 bg-white/60 rounded px-2 py-1 border border-indigo-50">
          <Phone className="w-4 h-4 text-indigo-500" />
          <span className="whitespace-normal break-words">{phone || '—'}</span>
        </div>
        <div className="flex items-center gap-2 bg-white/60 rounded px-2 py-1 border border-indigo-50">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span className="whitespace-normal break-words">{dateOfBirth ? new Date(dateOfBirth).toLocaleDateString() : '—'}</span>
        </div>
        <div className="flex items-center gap-2 bg-white/60 rounded px-2 py-1 border border-indigo-50">
          <span className="text-xs text-indigo-600 font-medium">Class</span>
          <span className="truncate">{classLabel || 'Unassigned'}</span>
        </div>
      </div>

      {/* Guardian Info */}
      <div className="pt-3 border-t border-indigo-100 text-sm">
        <div className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-1">Guardian</div>
        <div className="font-medium text-gray-900 whitespace-normal break-words">{guardianName || '—'}</div>
        {parentCnic && <div className="text-xs text-gray-600">CNIC: {parentCnic}</div>}
      </div>
    </motion.div>
  );
};

export default StudentCard;
