import React, { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Search...', className = '', ...props }) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
      <input
        type="text"
        className="w-full pl-10 pr-4 py-2.5 bg-white border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        placeholder={placeholder}
        {...props}
      />
    </div>
  );
};

export default SearchBar;
