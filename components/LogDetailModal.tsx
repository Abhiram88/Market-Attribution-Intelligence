import React from 'react';
import { MarketLog } from '../types';

interface LogDetailModalProps {
  log: MarketLog;
  onClose: () => void;
  onReAnalyze: (id: string) => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose, onReAnalyze }) => {
  const isPositive = (log.niftyChange || 0) >= 0;
  
  // Calculate relative position within day's range (Momentum)
  const range = (log.dayHigh || 0) - (log.dayLow || 0);
  const positionPercent = range > 0 
    ? ((log.niftyClose - (log.dayLow || 0)) / range) * 100 
    : 50;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="fixed inset-0 cursor-pointer" 
        onClick={onClose}
      />
      
      <div className="bg-white w-full max-w-3xl h-full shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto flex flex-col relative z-10 border-l border-slate-100">
        
        {/* MODAL HEADER */}
        <div className="p-10 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Causal Synthesis Dossier</p>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
              {log.date}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-4 bg-white hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-900 border border-slate-200 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-10 space-y-12 flex-1">
          
          {/* TECHNICAL SNAPSHOT */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nifty Close</p>
              <p className="text-3xl font-black text-slate-900 tracking-tighter">{(log.niftyClose || 0).toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
            </div>
            <div className={`p-8 rounded-[2.5rem] border space-y-2 ${isPositive ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Session Variance</p>
              <p className="text-3xl font-black tracking-tighter">{isPositive ? '+' : ''}{(log.niftyChange || 0).toFixed(1)}</p>
            </div>
            <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white space-y-4 flex flex-col justify-center">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Day Range Position</p>
              <div className="w-full h-1.5 bg-white/10 rounded-full relative">
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-400 rounded-full shadow-[0_0_12px_rgba(129,140,248,1)]" 
                  style={{ left: `${positionPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-black opacity-40 uppercase tracking-[0.2em]">
                <span>L: {log.dayLow?.toLocaleString()}</span>
                <span>H: {log.dayHigh?.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* AI CONTENT SECTION */}
          <div className="space-y-10 pt-8 border-t border-slate-100">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-4">
                <div className="w-2 h-10 bg-indigo-600 rounded-full"></div>
                Integrated Intelligence
              </h3>
              <button 
                onClick={() => onReAnalyze(log.id)}
                disabled={log.isAnalyzing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-[0.2em] px-10 py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-4"
              >
                {log.isAnalyzing ? "Synthesizing..." : "Regenerate Analysis"}
              </button>
            </div>

            {log.attribution ? (
              <div className="space-y-10 animate-in slide-in-from-bottom-2 duration-500">
                <div className="flex flex-wrap gap-4 items-center">
                  <span className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2.5 rounded-xl">
                    {log.attribution.category}
                  </span>
                  <span className={`${log.attribution.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'} text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2.5 rounded-xl border`}>
                    {log.attribution.sentiment}
                  </span>
                  <div className="bg-slate-50 px-6 py-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-3">System Confidence:</span>
                    <span className="text-[10px] font-black text-slate-900 uppercase">{log.attribution.relevanceScore}%</span>
                  </div>
                </div>

                <div className="space-y-8">
                  <h4 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.05] tracking-tight uppercase">
                    {log.attribution.headline}
                  </h4>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 text-xl md:text-2xl leading-relaxed font-medium whitespace-pre-wrap pl-10 border-l-8 border-slate-100">
                      {log.attribution.summary}
                    </p>
                  </div>
                </div>

                {log.attribution.sources && log.attribution.sources.length > 0 && (
                  <div className="pt-12 border-t border-slate-100 space-y-6">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Historical News Anchors</p>
                    <div className="grid grid-cols-1 gap-4">
                      {log.attribution.sources.map((source, i) => (
                        <a 
                          key={i} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-slate-50 hover:bg-indigo-50 rounded-[2rem] border border-slate-200 hover:border-indigo-200 transition-all group shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-6">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-indigo-600 shadow-sm transition-colors border border-slate-100">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span className="text-sm font-black text-slate-700 group-hover:text-indigo-900 transition-colors uppercase tracking-tight">
                              {source.title}
                            </span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors">
                            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 0 1 0-1.08l-4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-24 rounded-[4rem] border-4 border-dashed border-slate-100 flex flex-col items-center text-center space-y-6">
                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-900 font-black uppercase text-lg tracking-[0.3em]">Telemetry Received</p>
                  <p className="text-slate-400 text-sm max-w-sm font-medium">Breeze technical indicators are live. Run the Intelligence Engine to synchronize with causal market narratives.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};