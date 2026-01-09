
import React from 'react';
import { MarketLog } from '../types';

interface LogDetailModalProps {
  log: MarketLog;
  onClose: () => void;
  onReAnalyze: (id: string) => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose, onReAnalyze }) => {
  const isPositive = log.niftyChange >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="fixed inset-0 cursor-pointer" 
        onClick={onClose}
      />
      
      <div className="bg-white w-full max-w-3xl h-full shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto flex flex-col relative z-10 border-l border-slate-100">
        
        {/* Header Section */}
        <div className="p-10 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Daily Intelligence Report</p>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
              {log.date}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-white hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-900 border border-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-10 space-y-12 flex-1">
          
          {/* Key Indicators Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nifty Close</p>
              <p className="text-2xl font-black text-slate-900">{log.niftyClose.toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
            </div>
            <div className={`p-6 rounded-[2rem] border space-y-1 ${isPositive ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <p className="text-[9px] font-black opacity-60 uppercase tracking-widest">Daily Variance</p>
              <p className="text-2xl font-black">{isPositive ? '+' : ''}{log.niftyChange.toFixed(1)}</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">NASDAQ Proxy</p>
              <p className="text-2xl font-black text-slate-900">{log.nasdaqClose.toLocaleString()}</p>
            </div>
          </div>

          {/* Analysis Engine Section */}
          <div className="space-y-8 pt-6 border-t border-slate-100">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div>
                Causal Factors
              </h3>
              <button 
                onClick={() => onReAnalyze(log.id)}
                disabled={log.isAnalyzing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-[0.2em] px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
              >
                {log.isAnalyzing ? "Processing..." : "Regenerate Intelligence"}
              </button>
            </div>

            {log.attribution ? (
              <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500">
                <div className="flex flex-wrap gap-3 items-center">
                  <span className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg">
                    {log.attribution.category}
                  </span>
                  <span className={`${log.attribution.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'} text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg border`}>
                    {log.attribution.sentiment}
                  </span>
                  <div className="bg-slate-50 px-4 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2">Relevance:</span>
                    <span className="text-[9px] font-black text-slate-900 uppercase">{log.attribution.relevanceScore}%</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-3xl md:text-4xl font-black text-slate-900 leading-[1.1] tracking-tight">
                    {log.attribution.headline}
                  </h4>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 text-lg md:text-xl leading-relaxed font-medium whitespace-pre-wrap">
                      {log.attribution.summary}
                    </p>
                  </div>
                </div>

                {log.attribution.sources && log.attribution.sources.length > 0 && (
                  <div className="pt-10 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Audited Citations</p>
                    <div className="grid grid-cols-1 gap-3">
                      {log.attribution.sources.map((source, i) => (
                        <a 
                          key={i} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-300 group-hover:text-indigo-600 shadow-sm transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span className="text-xs font-black text-slate-600 group-hover:text-indigo-900 transition-colors">
                              {source.title}
                            </span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors">
                            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-20 rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-900 font-black uppercase text-sm tracking-widest">Awaiting Analysis</p>
                  <p className="text-slate-400 text-xs max-w-sm">Use the engine to populate causality for this specific volatility event.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
