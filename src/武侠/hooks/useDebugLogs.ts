import { useCallback, useState } from 'react';

export interface DebugLogEntry {
  id: string;
  timestamp: Date;
  type: 'prompt' | 'assistant';
  content: string;
}

export function useDebugLogs() {
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);

  const addDebugLog = useCallback((type: 'prompt' | 'assistant', content: string) => {
    const newLog: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      content,
    };
    setDebugLogs(prev => [...prev, newLog]);
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  return { debugLogs, addDebugLog, clearDebugLogs };
}
