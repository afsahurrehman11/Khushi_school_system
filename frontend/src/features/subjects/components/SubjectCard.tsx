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
  // prepare teacher entries and unique list so they are available to whole component
  const entries: [string, string][] = (assigned_classes || []).map((a:any) => {
    const id = String(a.teacher_id || a.teacher || a.teacherId || '');
    const name = a.teacher_name || teacherMap[id] || a.teacher || id || 'Unknown';
    return [id, name] as [string, string];
  });
  const unique = Array.from(new Map(entries).values());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      whileHover={{ scale: 1.02, y: -4 }}
      onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
      className="group bg-gradient-to-br from-white to-secondary-50 rounded-lg p-4 shadow-lg border border-transparent hover:border-secondary-200"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary-50 text-primary-700 font-semibold shadow-sm">{initials || 'S'}</div>
          <div>
            <h4 className="font-semibold text-primary-800">{title}</h4>
            {code ? <p className="text-sm text-secondary-500">{code}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete?.(); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {description && <p className="text-sm text-secondary-600 mt-3 line-clamp-2">{description}</p>}
      {assigned_classes && assigned_classes.length > 0 && (
        <div className="mt-3">
          <h5 className="text-sm font-medium text-secondary-700">Teachers</h5>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {unique.slice(0,5).map((t:any, i:number) => (
              <div key={i} className="flex items-center gap-2 bg-white/60 border border-secondary-100 rounded px-3 py-1 text-sm">
                <div className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-semibold">{(t||'').split(' ').map((s:string)=>s[0]).slice(0,2).join('').toUpperCase()}</div>
                <div className="text-secondary-700">{t}</div>
              </div>
            ))}
            {(entries && entries.length > 5) && (
              <div className="text-sm text-secondary-500">+ more</div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default SubjectCard;
