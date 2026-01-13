
import React from 'react';
import { MarketLog } from '../types';

interface HistoricalCloseCardProps {
  logs: MarketLog[];
}

export const HistoricalCloseCard: React.FC<HistoricalCloseCardProps> = ({ logs }) => {
  // We want Today, Yesterday, Day Before Yesterday
  // logs are already sorted by date descending in App.tsx
  const topThree = logs.slice(0, 3);

  const getDayLabel = (index: number) => {
    if (index === 0) return "Today";
    if (index === 1) return "Yesterday";
    if (index === 2) return "Prior Session";
    return "";
  };

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl h-full flex flex-col justify-between">
      <div>
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6">Historical Closures</h2>
        <div className="space-y-6">
          {topThree.length > 0 ? topThree.map((log, idx) => (
            <div key={log.id || log.date} className="flex items-center justify-between group">
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{getDayLabel(idx)}</p>
                <p className="text-[11px] font-bold text-slate-400 font-mono">{log.date}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-slate-900 tracking-tighter">
                  {log.niftyClose?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className={`text-[10px] font-black uppercase ${log.niftyChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {log.niftyChange >= 0 ? '+' : ''}{log.niftyChange.toFixed(1)} pts
                </p>
              </div>
            </div>
          )) : (
            <div className="py-10 text-center">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Awaiting Ledger...</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 pt-6 border-t border-slate-100">
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-tight">
          System automatically synchronizes with Supabase Ledger every 60 seconds.
        </p>
      </div>
    </div>
  );
};
