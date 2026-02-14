import React from 'react';
import { motion } from 'framer-motion';
import { Users, School } from 'lucide-react';

interface GroupByToggleProps {
  groupBy: 'teachers' | 'classrooms';
  onGroupByChange: (groupBy: 'teachers' | 'classrooms') => void;
}

const GroupByToggle: React.FC<GroupByToggleProps> = ({ groupBy, onGroupByChange }) => {
  return (
    <div className="inline-flex bg-secondary-100 rounded-lg p-1">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onGroupByChange('teachers')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
          groupBy === 'teachers'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-secondary-600 hover:text-secondary-900'
        }`}
      >
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">Group by Teachers</span>
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onGroupByChange('classrooms')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
          groupBy === 'classrooms'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-secondary-600 hover:text-secondary-900'
        }`}
      >
        <School className="w-4 h-4" />
        <span className="text-sm font-medium">Group by Classrooms</span>
      </motion.button>
    </div>
  );
};

export default GroupByToggle;
