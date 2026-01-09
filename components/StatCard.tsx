
import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  change?: number;
  changePercent?: number;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  changePercent 
}) => {
  const isPositive = (change ?? 0) >= 0;
  const isZero = change === 0 || change === undefined;
  
  const trendColorClass = isZero 
    ? "text-slate-400" 
    : isPositive ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:-translate-y-1 duration-300">
      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
        {title}
      </h4>
      
      <div className="flex items-baseline justify-between">
        <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </h3>
        
        {(change !== undefined || changePercent !== undefined) && (
          <div className={`flex items-center gap-1.5 text-xs font-black ${trendColorClass}`}>
            {!isZero && (
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className={`w-4 h-4 ${!isPositive ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.57a.75.75 0 0 1-1.08-1.04l5.25-5.25a.75.75 0 0 1 1.08 0l5.25 5.25a.75.75 0 1 1-1.08 1.04l-3.96-3.958V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
              </svg>
            )}
            <span>
              {change !== undefined && Math.abs(change).toFixed(1)}
              {changePercent !== undefined && ` (${Math.abs(changePercent).toFixed(2)}%)`}
            </span>
          </div>
        )}
      </div>
      
      <div className="mt-6 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: isZero ? '0%' : '100%' }}
        />
      </div>
    </div>
  );
};
