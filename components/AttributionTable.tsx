import React from 'react';
import { MarketLog } from '../types';

interface AttributionTableProps {
  logs: MarketLog[];
  onAnalyze: (id: string) => void;
  onViewDetails: (log: MarketLog) => void;
}

export const AttributionTable: React.FC<AttributionTableProps> = ({ logs, onAnalyze, onViewDetails }) => {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-900/50 text-slate-400 uppercase text-[10px] font-black tracking-[0.2em]">
            <tr>
              <th className="px-6 py-5 border-b border-slate-800">Timestamp</th>
              <th className="px-6 py-5 border-b border-slate-800">Nifty Close</th>
              <th className="px-6 py-5 border-b border-slate-800">Change (Pts)</th>
              <th className="px-6 py-5 border-b border-slate-800">AI Attribution Summary</th>
              <th className="px-6 py-5 border-b border-slate-800 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {logs.map((log) => (
              <tr 
                key={log.id} 
                className={`group transition-colors ${log.thresholdMet && !log.attribution ? 'bg-indigo-500/5 hover:bg-indigo-500/10' : 'hover:bg-slate-700/30'}`}
              >
                <td className="px-6 py-5 font-mono text-xs text-slate-400 whitespace-nowrap">{log.date}</td>
                <td className="px-6 py-5 font-bold text-slate-100">{log.niftyClose.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={`px-6 py-5 font-black text-xs ${log.niftyChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <div className="flex items-center gap-1">
                    {log.niftyChange > 0 ? '▲' : '▼'}
                    {Math.abs(log.niftyChange).toFixed(2)}
                  </div>
                </td>
                <td className="px-6 py-5 max-w-lg cursor-pointer hover:bg-white/5 transition-all" onClick={() => log.attribution && onViewDetails(log)}>
                  {log.attribution ? (
                    <div className="animate-in fade-in duration-500">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          {log.attribution.category}
                        </span>
                        <span className={`text-[9px] font-black uppercase ${
                          log.attribution.sentiment === 'POSITIVE' ? 'text-emerald-500' : 
                          log.attribution.sentiment === 'NEGATIVE' ? 'text-rose-500' : 'text-slate-500'
                        }`}>
                          {log.attribution.sentiment}
                        </span>
                      </div>
                      <p className="text-slate-100 font-bold text-xs mb-1 leading-tight group-hover:text-indigo-400 transition-colors">
                        {log.attribution.headline}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {log.attribution.summary.substring(0, 150)}... 
                        <span className="text-indigo-400 font-bold ml-1">Read More</span>
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${log.thresholdMet ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'}`}></div>
                      <span className="text-[11px] text-slate-500 font-medium italic">
                        {log.thresholdMet ? "Volatility detected: Analysis available" : "Stable market: minimal delta"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-5 text-right">
                  {log.thresholdMet && !log.attribution && (
                    <button 
                      onClick={() => onAnalyze(log.id)}
                      disabled={log.isAnalyzing}
                      className="bg-slate-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all border border-slate-600 hover:border-indigo-500 active:scale-95 shadow-lg flex items-center gap-2 ml-auto"
                    >
                      {log.isAnalyzing ? (
                        <>
                          <div className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Syncing
                        </>
                      ) : 'Run AI'}
                    </button>
                  )}
                  {log.attribution && (
                    <button 
                      onClick={() => onViewDetails(log)}
                      className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM10 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[9px] font-black uppercase tracking-widest">Details</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};