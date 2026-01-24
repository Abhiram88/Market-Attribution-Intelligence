
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
  dataSource = 'Syncing...',
  errorType = null,
  errorMessage
}) => {
  const isPositive = (change || 0) >= 0;

  const connectionStatus = useMemo(() => {
    if (errorType === 'token') {
      return { 
        label: 'GATEWAY ERROR', 
        color: 'text-amber-400', 
        bg: 'bg-amber-400/10', 
        dot: 'bg-amber-400'
      };
    }

    if (dataSource === 'Breeze Direct' || dataSource === 'Breeze') {
      return { 
        label: 'REAL-TIME FEED', 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-400/10', 
        dot: 'bg-emerald-500'
      };
    }

    return { 
      label: 'ESTABLISHING LINK', 
      color: 'text-slate-500', 
      bg: 'bg-slate-500/10', 
      dot: 'bg-slate-400'
    };
  }, [dataSource, errorType]);

  return (
    <div className="relative bg-[#020617] text-white p-6 rounded-[2rem] border border-[#1e293b] w-full font-sans overflow-hidden shadow-2xl h-full flex flex-col justify-between group">
      {/* Dynamic Glow Effect */}
      <div className={`absolute top-0 right-0 w-80 h-80 blur-[100px] pointer-events-none transition-all duration-1000 ${isPositive ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />
      
      <div className="relative z-10 flex justify-between items-start">
        <div className="space-y-1">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/5 ${connectionStatus.bg}`}>
            <div className={`w-1 h-1 rounded-full ${connectionStatus.dot} animate-[pulse_0.5s_ease-in-out_infinite]`} />
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${connectionStatus.color}`}>
              {connectionStatus.label}
            </span>
          </div>
          <h2 className="text-lg font-black tracking-tighter text-white uppercase mt-1">Nifty 50</h2>
        </div>
        <div className="text-right">
           <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Source</p>
           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-tight">{dataSource}</p>
        </div>
      </div>

      <div className="relative z-10 my-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-light tracking-tighter tabular-nums text-white">
            {price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '00,000.00'}
          </span>
        </div>
        <div className={`flex items-center gap-2 mt-2 font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5">
            <span className="text-lg tabular-nums">{isPositive ? '+' : ''}{(change || 0).toFixed(2)}</span>
          </div>
          <span className="text-xs opacity-80 bg-white/5 px-2 py-0.5 rounded border border-white/5 tabular-nums">
            {(changePercent || 0).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3 pt-6 border-t border-white/5">
        <div className="bg-white/2 px-3 py-2 rounded-xl border border-white/5">
          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Session H/L</p>
          <p className="text-[10px] font-black tabular-nums text-slate-200">
            {dayHigh?.toLocaleString() || '--'} / {dayLow?.toLocaleString() || '--'}
          </p>
        </div>
        <div className="bg-white/2 px-3 py-2 rounded-xl border border-white/5">
          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Vol (M)</p>
          <p className="text-[10px] font-black tabular-nums text-indigo-400">{volume ? (volume / 1000000).toFixed(2) + 'M' : '--'}</p>
        </div>
      </div>
    </div>
  );
};
