
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
  prevClose,
  dayHigh,
  dayLow,
  volume,
  isPaused = false,
  dataSource = 'Awaiting...',
  errorType = null,
  errorMessage
}) => {
  const isPositive = change >= 0;

  const connectionStatus = useMemo(() => {
    if (errorType === 'token') {
      return { 
        label: 'Auth Required', 
        detail: 'Breeze Session Expired',
        color: 'text-amber-400', 
        border: 'border-amber-400/40', 
        bg: 'bg-amber-400/10', 
        dot: 'bg-amber-400'
      };
    }

    if (errorMessage?.includes('Network Blocked') || errorMessage?.includes('Unreachable')) {
      return { 
        label: 'Link Offline', 
        detail: 'Cloud Run Unreachable',
        color: 'text-rose-400', 
        border: 'border-rose-400/40', 
        bg: 'bg-rose-400/10', 
        dot: 'bg-rose-400'
      };
    }

    if (dataSource === 'Breeze Direct') {
      return { 
        label: 'Breeze Direct', 
        detail: 'Live Telemetry Active',
        color: 'text-emerald-400', 
        border: 'border-emerald-400/40', 
        bg: 'bg-emerald-400/10', 
        dot: 'bg-emerald-400'
      };
    }

    return { 
      label: 'Connecting...', 
      detail: 'Scanning Network...',
      color: 'text-slate-400', 
      border: 'border-slate-400/20', 
      bg: 'bg-slate-400/5', 
      dot: 'bg-slate-400'
    };
  }, [dataSource, errorType, errorMessage]);

  return (
    <div className="relative bg-[#0a0f18] text-white p-10 sm:p-14 rounded-[3.5rem] border border-[#1e293b] w-full font-sans overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-16 relative z-10">
        <div className="flex flex-col gap-5">
          <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border ${connectionStatus.border} ${connectionStatus.bg}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus.dot} animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.3)]`} />
            <div className="flex flex-col -space-y-0.5">
              <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${connectionStatus.color}`}>
                {connectionStatus.label}
              </span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                {connectionStatus.detail}
              </span>
            </div>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase leading-none">NIFTY 50 INDEX</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-end relative z-10">
        <div className="space-y-8">
          <div className="flex items-baseline gap-4">
            <span className="text-8xl sm:text-[10rem] font-extralight tracking-tighter tabular-nums leading-none">
              {price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '00,000.00'}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
             <div className={`flex items-center gap-3 px-8 py-4 rounded-2xl ${isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                <span className="text-4xl font-black tracking-tight tabular-nums">
                  {isPositive ? '+' : ''}{change.toFixed(2)}
                </span>
                <span className="text-xl font-bold opacity-80 tabular-nums">
                  ({changePercent.toFixed(2)}%)
                </span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-12 border-l border-white/5 pl-0 lg:pl-16">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">High / Low</p>
            <p className="text-2xl font-black tracking-tight text-white tabular-nums">
              {dayHigh?.toLocaleString() || '--'} / {dayLow?.toLocaleString() || '--'}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Volume (M)</p>
            <p className="text-2xl font-black tracking-tight text-teal-400 tabular-nums">{volume?.toFixed(2) || '--'}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Source</p>
            <p className="text-xl font-black uppercase text-indigo-400">{dataSource}</p>
          </div>
        </div>
      </div>

      <div className="mt-20 w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-[2s] ${isPositive ? 'bg-teal-400' : 'bg-rose-500'}`}
          style={{ width: price > 0 ? '100%' : '0%' }}
        />
      </div>
    </div>
  );
};
