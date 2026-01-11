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
}

export const NiftyRealtimeCard: React.FC<NiftyRealtimeCardProps> = ({
  price,
  change,
  changePercent,
  prevClose,
  dayHigh,
  dayLow,
  volume,
  isPaused = false
}) => {
  const isPositive = change >= 0;

  // Market Status Logic (IST)
  const sessionInfo = useMemo(() => {
    const now = new Date();
    // Convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    
    const day = istDate.getDay(); // 0 is Sunday, 6 is Saturday
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const currentTimeMinutes = hours * 60 + minutes;
    
    const isWeekend = day === 0 || day === 6;
    const marketOpen = 9 * 60 + 15; // 09:15
    const marketClose = 15 * 60 + 30; // 15:30
    
    const isOpen = !isWeekend && currentTimeMinutes >= marketOpen && currentTimeMinutes <= marketClose;
    
    if (isWeekend) return { status: 'Weekend', color: 'text-slate-500', bg: 'bg-slate-500' };
    if (isOpen) return { status: 'Live NSE', color: 'text-teal-400', bg: 'bg-teal-500', pulse: true };
    return { status: 'Market Closed', color: 'text-rose-500', bg: 'bg-rose-500' };
  }, []);

  return (
    <div className="relative bg-[#0a0f18] text-white p-6 sm:p-8 rounded-lg border border-[#1e293b] w-full max-w-2xl font-sans overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-[100px] pointer-events-none" />
      
      <div className="absolute top-0 left-0 w-4 h-[1px] bg-[#1e293b]" />
      <div className="absolute top-0 left-0 w-[1px] h-4 bg-[#1e293b]" />
      <div className="absolute bottom-0 right-0 w-8 h-[2px] bg-teal-500/40" />
      <div className="absolute bottom-0 right-0 w-[2px] h-8 bg-teal-500/40" />

      <div className="flex justify-between items-start mb-10">
        <div className="space-y-1">
          <p className="text-[10px] text-teal-400 font-bold uppercase tracking-[0.25em]">
            Market Index / Equity
          </p>
          <h2 className="text-4xl font-black tracking-tight">NIFTY 50</h2>
        </div>
        
        <div className="flex items-center gap-2">
          {isPaused ? (
            <>
              <div className="w-2 h-2 bg-amber-500 rounded-full" />
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">INGESTION PAUSED</span>
            </>
          ) : (
            <>
              <div className="relative">
                <div className={`w-2 h-2 ${sessionInfo.bg} rounded-full ${sessionInfo.pulse ? 'animate-pulse' : ''}`} />
                {sessionInfo.pulse && <div className="absolute inset-0 w-2 h-2 bg-teal-500 rounded-full animate-ping opacity-75" />}
              </div>
              <span className={`text-[10px] ${sessionInfo.color} font-bold uppercase tracking-widest`}>
                {sessionInfo.status}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
        <div className="text-6xl md:text-7xl font-light tracking-tighter tabular-nums">
          {price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:block">
            <svg width="100" height="40" className={isPositive ? "text-teal-500" : "text-rose-500"}>
              <path 
                d={isPositive ? "M0,35 L20,30 L40,32 L60,20 L80,15 L100,5" : "M0,5 L20,10 L40,8 L60,20 L80,25 L100,35"} 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
          
          <div className={`flex flex-col items-start ${isPositive ? 'text-teal-400' : 'text-rose-400'}`}>
            <span className="text-xl font-bold tracking-tight">
              {isPositive ? '+' : ''}{change.toFixed(2)}
            </span>
            <span className="text-sm font-medium opacity-80">
              {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
        <div className="space-y-1">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Prev Close</p>
          <p className="text-sm font-bold tracking-tight">{prevClose?.toLocaleString() || '--'}</p>
        </div>
        <div className="space-y-1 border-x border-white/5 px-4">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Day Range</p>
          <p className="text-sm font-bold tracking-tight">
            {dayLow?.toLocaleString() || '--'} — {dayHigh?.toLocaleString() || '--'}
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Volume (M)</p>
          <p className="text-sm font-bold tracking-tight">{volume ? `${volume.toFixed(2)}` : '--'}</p>
        </div>
      </div>
    </div>
  );
};