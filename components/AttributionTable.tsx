import React from 'react';
import { MarketLog, Sentiment } from '../types';

interface AttributionTableProps {
  logs: MarketLog[];
  onAnalyze: (id: string) => void;
}

export const AttributionTable: React.FC<AttributionTableProps> = ({ logs, onAnalyze }) => {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-200">Volatility Attribution Log</h3>
        <span className="text-xs text-slate-400">Threshold: >90 pts Abs Change</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Nifty Price</th>
              <th className="p-4 font-medium">Change (Pts)</th>
              <th className="p-4 font-medium">Correlated Asset (NASDAQ)</th>
              <th className="p-4 font-medium">Causal Attribution</th>
              <th className="p-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {logs.map((log) => (
              <tr 
                key={log.id} 
                className={`hover:bg-slate-700/50 transition-colors ${log.thresholdMet ? 'bg-slate-800/30' : ''}`}
              >
                <td className="p-4 text-slate-300 font-medium whitespace-nowrap">{log.date}</td>
                <td className="p-4 text-slate-300">{log.niftyClose.toLocaleString()}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${log.niftyChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {log.niftyChange > 0 ? '+' : ''}{log.niftyChange}
                  </span>
                </td>
                <td className="p-4 text-slate-400">
                  {log.nasdaqChangePercent > 0 ? '+' : ''}{log.nasdaqChangePercent}%
                </td>
                <td className="p-4 max-w-md">
                  {log.attribution ? (
                    <div className="animate-fade-in">
                       <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                            log.attribution.category === 'Macro' ? 'border-blue-500 text-blue-400' :
                            log.attribution.category === 'Global' ? 'border-purple-500 text-purple-400' :
                            'border-amber-500 text-amber-400'
                          }`}>
                            {log.attribution.category}
                          </span>
                          <span className={`text-[10px] font-bold ${
                              log.attribution.sentiment === Sentiment.POSITIVE ? 'text-emerald-400' : 
                              log.attribution.sentiment === Sentiment.NEGATIVE ? 'text-rose-400' : 'text-slate-400'
                          }`}>
                              {log.attribution.sentiment}
                          </span>
                       </div>
                       <p className="text-sm text-slate-200 font-medium leading-tight mb-1">{log.attribution.headline}</p>
                       <p className="text-xs text-slate-400 line-clamp-2">{log.attribution.summary}</p>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic text-sm">
                      {log.thresholdMet ? 'Pending Analysis...' : 'Below Threshold'}
                    </span>
                  )}
                </td>
                <td className="p-4 text-right">
                  {log.thresholdMet && !log.attribution && (
                    <button 
                      onClick={() => onAnalyze(log.id)}
                      disabled={log.isAnalyzing}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs px-3 py-1.5 rounded transition-all shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2 ml-auto"
                    >
                      {log.isAnalyzing ? (
                        <>
                          <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing
                        </>
                      ) : (
                        'Run AI Attribution'
                      )}
                    </button>
                  )}
                  {log.attribution && (
                    <span className="text-emerald-500 text-xs font-bold flex items-center justify-end gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Analyzed
                    </span>
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