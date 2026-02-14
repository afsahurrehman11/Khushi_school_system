import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface LogEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: Date;
}

const DebugConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Override console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args) => {
      originalLog(...args);
      // Only log errors and warnings to reduce noise
    };

    console.error = (...args) => {
      originalError(...args);
      setLogs(prev => [...prev.slice(-49), {
        level: 'error',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
        timestamp: new Date()
      }]);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      setLogs(prev => [...prev.slice(-49), {
        level: 'warn',
        message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
        timestamp: new Date()
      }]);
    };

    console.info = (...args) => {
      originalInfo(...args);
      // Only log errors and warnings
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs max-w-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-gray-900 text-white px-4 py-2 rounded-t-lg flex items-center justify-between hover:bg-gray-800 transition-colors"
      >
        <span>Debug Console ({logs.length})</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="bg-gray-100 border border-gray-300 rounded-b-lg overflow-hidden">
          <div className="h-64 overflow-y-auto bg-white border-b border-gray-300">
            {logs.length === 0 ? (
              <div className="p-3 text-gray-500">No logs yet...</div>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-1 border-b border-gray-200 ${getLevelColor(log.level)}`}
                >
                  <span className="text-gray-500">[{log.timestamp.toLocaleTimeString()}]</span>
                  {' '}
                  <span className="font-semibold">[{log.level.toUpperCase()}]</span>
                  {' '}
                  <span className="break-words">{log.message}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-gray-200 px-3 py-2 flex gap-2">
            <button
              onClick={() => setLogs([])}
              className="flex-1 bg-gray-400 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                autoScroll ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'
              }`}
            >
              Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugConsole;
