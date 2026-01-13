
import React, { useMemo } from 'react';

interface NiftyRealtimeCardProps {
  price: number;
  change: number;
  changePercent: number;
  prevClose?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  isPaused?: boolean;
  dataSource?: string;
  errorType?: 'token' | 'generic' | null;
  errorMessage?: string;
}

export const NiftyRealtimeCard: React.FC<NiftyRealtimeCardProps> = ({
  price,
  change,
  changePercent,
  dayHigh,
  dayLow,
  volume,
  dataSource = 'Awaiting...',
  errorType = null,
  errorMessage
}) => {
  const isPositive = (change || 0) >= 0;

  const connectionStatus = useMemo(() => {
    if (errorType === 'token') {
      return { 
        label: 'Auth Required', 
        color: 'text-amber-400', 
        bg: 'bg-amber-400/10', 
        dot: 'bg-amber-400'
      };
    }

    if (errorMessage?.includes('Network Blocked') || errorMessage?.includes('Unreachable')) {
      return { 
        label: 'Link Offline', 
        color: 'text-rose-400', 
        bg: 'bg-rose-400/10', 
        dot: 'bg-rose-400'
      };
    }

    if (dataSource === 'Breeze Direct' || dataSource === 'Breeze') {
      return { 
        label: 'Live', 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-400/10', 
        dot: 'bg-emerald-400'
      };
    }

    return { 
      label: 'Syncing', 
      color: 'text-slate-400', 
      bg: 'bg-slate-400/5', 
      dot: 'bg-slate-400'
    };
  }, [dataSource, errorType, errorMessage]);

  return (
    <div className="relative bg-[#0a0f18] text-white p-8 rounded-[2.5rem] border border-[#1e293b] w-full font-sans overflow-hidden shadow-2xl h-full flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] pointer-events-none" />
      
      <div className="relative z-10 flex justify-between items-start">
        <div className="space-y-1">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/5 ${connectionStatus.bg}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus.dot} animate-pulse`} />
            <span className={`text-[9px] font-black uppercase tracking-widest ${connectionStatus.color}`}>
              {connectionStatus.label}
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-400 uppercase">Nifty 50</h2>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Source</p>
           <p className="text-xs font-bold text-indigo-400">{dataSource}</p>
        </div>
      </div>

      <div className="relative z-10 my-6">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-light tracking-tighter tabular-nums">
            {price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '00,000.00'}
          </span>
        </div>
        <div className={`inline-flex items-center gap-2 mt-2 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          <span className="text-lg tabular-nums">{isPositive ? '+' : ''}{(change || 0).toFixed(2)}</span>
          <span className="text-sm opacity-80">({(changePercent || 0).toFixed(2)}%)</span>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Session High/Low</p>
          <p className="text-sm font-bold tabular-nums text-slate-300">
            {dayHigh?.toLocaleString() || '--'} / {dayLow?.toLocaleString() || '--'}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Volume (M)</p>
          <p className="text-sm font-bold tabular-nums text-teal-400">{volume ? (volume / 1000000).toFixed(2) : '--'}</p>
        </div>
      </div>
    </div>
  );
};
