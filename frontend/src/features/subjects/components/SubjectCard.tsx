import React from 'react';
import { motion } from 'framer-motion';
import Button from '../../../components/Button';
import { Edit2, Trash2 } from 'lucide-react';

interface Props {
  id?: string;
  name?: string;
  code?: string;
  description?: string;
  assigned_classes?: any[];
  teacherMap?: Record<string,string>;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SubjectCard: React.FC<Props> = ({ id, name, code, description, assigned_classes, teacherMap = {}, onEdit, onDelete }) => {
  const title = name || code || id || 'Untitled Subject';
  const initials = (name || code || '').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
  
  // prepare teacher entries and unique list
  const entries: [string, string][] = (assigned_classes || []).map((a:any) => {
    const id = String(a.teacher_id || a.teacher || a.teacherId || '');
    const name = a.teacher_name || teacherMap[id] || a.teacher || id || 'Unknown';
    return [id, name] as [string, string];
  });
  const unique = Array.from(new Map(entries).values());
  
  // Count assigned classes
  const classCount = assigned_classes?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.01, y: -4 }}
      onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
      className="group bg-gradient-to-br from-green-50 via-white to-teal-50 rounded-xl p-6 shadow-sm border-2 border-green-100 hover:border-green-300 hover:shadow-lg cursor-pointer transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center shadow-sm">
            <span className="text-green-700 font-bold text-xl">{initials || 'S'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-xl text-green-900 truncate">{title}</h4>
            {code && <p className="text-sm text-green-600 font-medium">{code}</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(); }} className="!p-2">
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete?.(); }} className="!p-2">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4 p-3 bg-white/70 rounded-lg border border-green-100">
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold text-green-700">{classCount}</div>
          <div className="text-xs text-gray-600 font-medium">Classes</div>
        </div>
        <div className="w-px h-8 bg-green-200"></div>
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold text-green-700">{unique.length}</div>
          <div className="text-xs text-gray-600 font-medium">Teachers</div>
        </div>
      </div>

      {/* Teachers */}
      {assigned_classes && assigned_classes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-green-200 via-teal-200 to-transparent"></div>
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Assigned Teachers</span>
            <div className="h-px flex-1 bg-gradient-to-l from-green-200 via-teal-200 to-transparent"></div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {unique.slice(0, 4).map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-white/80 border border-green-100 rounded-lg px-3 py-2 hover:border-green-300 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-100 to-teal-200 text-teal-700 flex items-center justify-center text-xs font-bold">
                  {(t || '').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="text-sm text-gray-700 font-medium truncate max-w-[120px]">{t}</div>
              </div>
            ))}
            {unique.length > 4 && (
              <div className="text-xs text-green-600 font-semibold px-2 py-1">+{unique.length - 4} more</div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!assigned_classes || assigned_classes.length === 0) && (
        <div className="pt-2">
          <p className="text-sm text-gray-500 text-center italic">No teachers assigned yet</p>
        </div>
      )}
    </motion.div>
  );
};

export default SubjectCard;
