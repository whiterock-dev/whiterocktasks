/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import type { User } from '../../types';

interface SearchableUserSelectProps {
  users: User[];
  value: string; // user id
  onChange: (userId: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  excludeUserId?: string;
}

export const SearchableUserSelect: React.FC<SearchableUserSelectProps> = ({
  users,
  value,
  onChange,
  placeholder = 'Search member...',
  required = false,
  id,
  excludeUserId,
}) => {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedUser = users.find((u) => u.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filteredUsers = users
    .filter((u) => excludeUserId ? u.id !== excludeUserId : true)
    .filter((u) => (u.name || '').toLowerCase().includes(searchText.toLowerCase().trim()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const handleSelect = (userId: string) => {
    onChange(userId);
    setSearchText('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setSearchText('');
  };

  // Use a hidden input for form validation when required
  return (
    <div ref={containerRef} className="relative" id={id}>
      {/* Hidden input for native form validation */}
      {required && (
        <input
          type="text"
          value={value}
          required
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0 pointer-events-none"
          onChange={() => {}}
        />
      )}
      {!isOpen && selectedUser ? (
        <div className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm flex items-center justify-between bg-white">
          <span className="text-slate-800 truncate">{selectedUser.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 p-0.5"
              tabIndex={-1}
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-slate-400 hover:text-slate-600 p-0.5"
              tabIndex={-1}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full h-10 rounded-lg border border-slate-300 pl-9 pr-9 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
        </div>
      )}
      {isOpen && (
        <ul className="absolute z-[70] mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {filteredUsers.length === 0 ? (
            <li className="py-2 px-3 text-sm text-slate-500">No member found</li>
          ) : (
            filteredUsers.map((u) => (
              <li
                key={u.id}
                onClick={() => handleSelect(u.id)}
                className={`cursor-pointer py-2.5 px-3 text-sm hover:bg-teal-50 text-slate-700 ${
                  u.id === value ? 'bg-teal-50 font-medium text-teal-800' : ''
                }`}
              >
                {u.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
