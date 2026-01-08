import React from 'react';

// 1. Define the Props interface
interface StatCardProps {
  title: string;
  value: number | string; // Supports numbers or formatted strings
  change?: number;        // Optional: The absolute point change
  changePercent?: number; // Optional: The percentage change
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  changePercent 
}) => {
  // 2. Logic to determine if the move is positive or negative
  const isPositive = (change ?? 0) >= 0;
  const isZero = change === 0 || change === undefined;
  
  // 3. Dynamic color classes for financial trends
  const trendColorClass = isZero 
    ? "text-slate-400" 
    : isPositive ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 shadow-xl backdrop-blur-sm transition-all hover:bg-slate-800/80">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
        {title}
      </h4>
      
      <div className="flex items-baseline justify-between">
        <h3 className="text-3xl font-black text-white tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </h3>
        
        {/* 4. Only show trend indicators if change data exists */}
        {(change !== undefined || changePercent !== undefined) && (
          <div className={`flex items-center gap-1 text-sm font-bold ${trendColorClass}`}>
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
              {change !== undefined && Math.abs(change).toFixed(2)}
              {changePercent !== undefined && ` (${Math.abs(changePercent).toFixed(2)}%)`}
            </span>
          </div>
        )}
      </div>
      
      {/* 5. Visual "mini-chart" indicator bar */}
      <div className="mt-4 w-full h-1 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: isZero ? '0%' : '100%' }}
        />
      </div>
    </div>
  );
};