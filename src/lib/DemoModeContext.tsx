import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  maskCustomerName: (name: string | null | undefined) => string;
  maskCustomerAddress: (address: string | null | undefined) => string;
  maskJobTitle: (title: string | null | undefined) => string;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export const DemoModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem('demoMode');
    return saved === 'true';
  });

  useEffect(() => {
    // Save to localStorage whenever demo mode changes
    localStorage.setItem('demoMode', isDemoMode.toString());
  }, [isDemoMode]);

  const toggleDemoMode = () => {
    setIsDemoMode(prev => !prev);
  };

  const maskCustomerName = (name: string | null | undefined): string => {
    if (!isDemoMode) {
      return name || '';
    }
    return 'Electric Pun company name';
  };

  const maskCustomerAddress = (address: string | null | undefined): string => {
    if (!isDemoMode) {
      return address || '';
    }
    return 'Most likely the electrical grid';
  };

  const maskJobTitle = (title: string | null | undefined): string => {
    if (!isDemoMode) {
      return title || '';
    }
    return 'Generic Job Title Here';
  };

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        toggleDemoMode,
        maskCustomerName,
        maskCustomerAddress,
        maskJobTitle,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
};

export const useDemoMode = (): DemoModeContextType => {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return context;
};
