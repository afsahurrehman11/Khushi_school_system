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
  onClick: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelect?: (id: string | number) => void;
}

const StudentCard: React.FC<StudentCardProps> = ({
  id,
  name,
  rollNo,
  email,
  phone,
  dateOfBirth,
  guardianName,
  parentCnic,
  onClick,
  selectable = false,
  checked = false,
  onToggleSelect,
}) => {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-white rounded-lg p-5 shadow-soft cursor-pointer border border-secondary-200 hover:border-primary-300 transition-all relative ${selectable ? 'pl-10' : ''}`}
    >
      {selectable && (
        <div className="absolute left-4 top-4">
          <input
            type="checkbox"
            checked={checked}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(id); }}
          />
        </div>
      )}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-6 h-6 text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-secondary-900 truncate">
            {name}
          </h3>
          <p className="text-sm text-secondary-500">Roll No: {rollNo}</p>
        </div>
      </div>

      <div className="space-y-2">
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
          <span className="text-sm">{new Date(dateOfBirth).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-secondary-100">
        <p className="text-xs text-secondary-500">Guardian</p>
        <p className="text-sm font-medium text-secondary-900 truncate">{guardianName}</p>
        {parentCnic && (
          <p className="text-xs text-secondary-500 mt-1">CNIC: {parentCnic}</p>
        )}
      </div>
    </motion.div>
  );
};

export default StudentCard;
