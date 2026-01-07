import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  changePercent: number;
  isCurrency?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, change, changePercent, isCurrency }) => {
  const isPositive = change >= 0;
  const colorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';
  const bgClass = isPositive ? 'bg-emerald-400/10' : 'bg-rose-400/10';
  const borderClass = isPositive ? 'border-emerald-400/20' : 'border-rose-400/20';

  return (
    <div className={`p-6 rounded-xl border bg-slate-800/50 backdrop-blur-sm ${borderClass} shadow-lg transition-all hover:shadow-xl`}>
      <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-slate-100">
          {isCurrency ? '$' : ''}{value}
        </div>
        <div className={`flex flex-col items-end ${colorClass}`}>
          <span className="text-lg font-bold flex items-center gap-1">
            {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(2)}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full ${bgClass} font-semibold`}>
            {changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};