import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, GraduationCap, Trash2 } from 'lucide-react';

interface TeacherCardProps {
  id?: string | number;
  name: string;
  teacherId?: string;
  teacher_id?: string;
  cnic?: string;
  subjects?: string[];
  assigned_classes?: string[];
  assignedClasses?: string[];
  email?: string;
  phone?: string;
  qualification?: string;
  experience?: string;
  dateOfJoining?: string;
  profileImageUrl?: string;
  profile_image_blob?: string;
  profile_image_type?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}
const TeacherCard: React.FC<TeacherCardProps> = ({
  id,
  name,
  teacherId,
  teacher_id,
  cnic: _cnic,
  subjects = [],
  assigned_classes,
  assignedClasses,
  email,
  phone,
  dateOfJoining: _dateOfJoining,
  profileImageUrl,
  profile_image_blob,
  profile_image_type,
  onClick,
  onDelete,
}) => {
  const resolvedId = teacherId || teacher_id || String(id || '');
  const classes = assigned_classes || assignedClasses || [];
  
  // Build image URL
  const imageUrl = profileImageUrl || (profile_image_blob 
    ? `data:${profile_image_type || 'image/jpeg'};base64,${profile_image_blob}` 
    : null);

  // Pastel color palette and simple hash to pick a base color per teacher
  const pastelPalette = [
    '#FFF7ED', // soft peach
    '#F0F9FF', // soft sky
    '#F5F7FF', // soft lavender
    '#F0FFF4', // soft mint
    '#FFF8FB', // soft rose
    '#FEFCE8', // soft lemon
  ];

  const pickPastel = (key?: string | number) => {
    if (!key) return pastelPalette[1];
    const s = String(key);
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n << 5) - n + s.charCodeAt(i);
    const idx = Math.abs(n) % pastelPalette.length;
    return pastelPalette[idx];
  };

  const accentBg = pickPastel(resolvedId || name);

  // Parse class and section from assigned classes (e.g., "Class 1-A" or "1-A")
  const primaryClass = classes[0] ? classes[0] : null;
  const [classNum, section] = primaryClass ? primaryClass.split('-') : [null, null];

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 10px 22px rgba(16,24,40,0.08)' }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      className="rounded-lg shadow-sm border cursor-pointer transition-all duration-200 p-5 relative overflow-hidden"
      style={{ background: accentBg, borderColor: '#EEF2FF' }}
    >
      {/* soft overlay to keep content readable */}
      <div className="absolute inset-0 bg-white/75" aria-hidden />
      <div className="relative">
      {/* Header: Profile + Name + Delete Button */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Profile Picture */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border" style={{ borderColor: 'rgba(15, 23, 42, 0.04)'}}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: accentBg, boxShadow: 'inset 0 -6px 12px rgba(0,0,0,0.02)' }}
            >
              <GraduationCap className="w-8 h-8 text-slate-600" />
            </div>
          )}

          {/* Name & ID */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{name}</h3>
            <p className="text-xs text-slate-600 mt-0.5">ID: {resolvedId || 'N/A'}</p>
          </div>
        </div>

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
            aria-label="Delete teacher"
            style={{ background: 'transparent' }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Class + Section + Subject Grid */}
      <div className="space-y-3 mb-4">
        {/* Class & Section */}
        {primaryClass && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Class</p>
              <p className="text-sm font-medium text-slate-800">{classNum}</p>
            </div>
            {section && (
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Section</p>
                <p className="text-sm font-medium text-slate-800">{section}</p>
              </div>
            )}
            <div className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: accentBg, border: '1px solid rgba(15,23,42,0.04)' }}>{primaryClass}</div>
          </div>
        )}

        {/* Subject */}
        {subjects.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Subject</p>
            <p className="text-sm font-medium text-slate-800">{subjects.join(', ')}</p>
          </div>
        )}
      </div>

      {/* Contact Info */}
      {(email || phone) && (
        <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'rgba(15,23,42,0.04)' }}>
          {email && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <a href={`mailto:${email}`} className="text-xs text-sky-600 hover:underline truncate">
                {email}
              </a>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <a href={`tel:${phone}`} className="text-xs text-sky-600 hover:underline">
                {phone}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  </motion.div>
);
};

export default TeacherCard;
