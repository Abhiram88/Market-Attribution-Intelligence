import React from 'react';
import { MarketLog } from '../types';

interface AttributionTableProps {
  logs: MarketLog[];
  onAnalyze: (id: string) => void;
  onViewDetails: (log: MarketLog) => void;
}

export const AttributionTable: React.FC<AttributionTableProps> = ({ logs, onAnalyze, onViewDetails }) => {
  return (
    <div className="bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-[0.2em]">
            <tr>
              <th className="px-10 py-6 border-b border-slate-100">Timestamp</th>
              <th className="px-10 py-6 border-b border-slate-100">Nifty Close</th>
              <th className="px-10 py-6 border-b border-slate-100">Change</th>
              <th className="px-10 py-6 border-b border-slate-100">AI Intelligence</th>
              <th className="px-10 py-6 border-b border-slate-100 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.map((log) => (
              <tr 
                key={log.id} 
                className={`group transition-colors ${log.thresholdMet && !log.attribution ? 'bg-indigo-50/30 hover:bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
              >
                <td className="px-10 py-6">
                  <span className="font-mono text-[11px] text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">{log.date}</span>
                </td>
                <td className="px-10 py-6 font-black text-slate-900">{log.niftyClose?.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                <td className={`px-10 py-6 font-black text-xs ${(log.niftyChange || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <div className="flex items-center gap-1">
                    {(log.niftyChange || 0) > 0 ? '▲' : '▼'}
                    {Math.abs(log.niftyChange || 0).toFixed(1)}
                  </div>
                </td>
                <td className="px-10 py-6 max-w-lg cursor-pointer" onClick={() => log.attribution && onViewDetails(log)}>
                  {log.attribution ? (
                    <div className="animate-in fade-in duration-500">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-black uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-lg">
                          {log.attribution.category}
                        </span>
                        <span className={`text-[9px] font-black uppercase flex items-center gap-1 ${
                          log.attribution.sentiment === 'POSITIVE' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${log.attribution.sentiment === 'POSITIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                          {log.attribution.sentiment}
                        </span>
                      </div>
                      <p className="text-slate-900 font-black text-[13px] mb-1 leading-tight group-hover:text-indigo-600 transition-colors">
                        {log.attribution.headline}
                      </p>
                      <p className="text-[12px] text-slate-500 leading-relaxed font-medium line-clamp-1">
                        {log.attribution.summary.substring(0, 100)}...
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${log.thresholdMet ? 'bg-amber-500 animate-pulse' : 'bg-slate-200'}`}></div>
                      <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                        {log.thresholdMet ? "Volatility Alert: Analysis required" : "Nominal Variance"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-10 py-6 text-right">
                  {log.thresholdMet && !log.attribution && (
                    <button 
                      onClick={() => onAnalyze(log.id)}
                      disabled={log.isAnalyzing}
                      className="bg-slate-900 hover:bg-indigo-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2 ml-auto"
                    >
                      {log.isAnalyzing ? "Processing..." : "Run AI"}
                    </button>
                  )}
                  {log.attribution && (
                    <button 
                      onClick={() => onViewDetails(log)}
                      className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-900 hover:text-white px-5 py-2.5 rounded-xl text-slate-900 transition-all font-black text-[10px] uppercase tracking-widest border border-slate-200"
                    >
                      Report
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