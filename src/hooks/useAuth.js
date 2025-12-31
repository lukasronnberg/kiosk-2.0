import { useState } from 'react';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const verifyPin = () => {
    setIsAuthenticated(true);
  };

  return { isAuthenticated, verifyPin };
};