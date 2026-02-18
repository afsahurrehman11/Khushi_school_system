/**
 * Auth Hook
 * Provides authentication state and user information
 */

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  role: { name: string; permissions: string[] } | string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Load user from localStorage
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson);
        
        // Normalize role shape
        if (parsed.role && typeof parsed.role === 'string') {
          parsed.role = { name: parsed.role, permissions: [] };
        }
        setUser(parsed);
      } catch (err) {
        setUser(null);
      }
    }
  }, []);

  return { user };
};
