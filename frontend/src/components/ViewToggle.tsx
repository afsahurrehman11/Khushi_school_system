import React from 'react';
import { motion } from 'framer-motion';
import { Grid3x3, List } from 'lucide-react';

interface ViewToggleProps {
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ view, onViewChange }) => {
  return (
    <div className="inline-flex bg-secondary-100 rounded-lg p-1">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onViewChange('grid')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
          view === 'grid'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-secondary-600 hover:text-secondary-900'
        }`}
      >
        <Grid3x3 className="w-4 h-4" />
        <span className="text-sm font-medium">Grid</span>
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onViewChange('list')}
        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
          view === 'list'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-secondary-600 hover:text-secondary-900'
        }`}
      >
        <List className="w-4 h-4" />
        <span className="text-sm font-medium">List</span>
      </motion.button>
    </div>
  );
};

export default ViewToggle;
