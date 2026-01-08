
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-slate-900 w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col">
        
        {/* Header Section */}
        <div className="p-8 md:p-12 border-b border-slate-800 flex justify-between items-start bg-slate-900/50">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-white tracking-tighter uppercase">
              Day details — <span className="text-indigo-400">{log.date}</span>
            </h2>
            <p className="text-slate-500 font-medium tracking-wide">Market metrics and AI-attributed causal factors.</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all text-slate-400 hover:text-white border border-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12">
          
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-1 group">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">Nifty close</p>
              <p className="text-3xl font-black text-white tracking-tight">{log.niftyClose.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-1 group">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">Nifty change</p>
              <p className={`text-3xl font-black tracking-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {log.niftyChange > 0 ? '+' : ''}{log.niftyChange.toFixed(1)}
              </p>
            </div>
            <div className="space-y-1 group">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">NASDAQ close</p>
              <p className="text-3xl font-black text-white tracking-tight">{log.nasdaqClose.toLocaleString()}</p>
            </div>
            <div className="space-y-1 group">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">GIFT Nifty</p>
              <p className="text-3xl font-black text-white tracking-tight">{log.giftNiftyClose.toLocaleString()}</p>
            </div>
          </div>

          {/* Indicators Row */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-800 rounded-full border border-slate-700 shadow-sm">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Threshold:</span>
              <span className={`text-[11px] font-black uppercase ${log.thresholdMet ? 'text-amber-400' : 'text-slate-500'}`}>
                {log.thresholdMet ? 'YES' : 'NO'}
              </span>
            </div>
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full border shadow-sm ${isPositive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
              <span className="text-[11px] font-black uppercase tracking-widest">Direction:</span>
              <span className="text-[11px] font-black uppercase">{isPositive ? 'Up' : 'Down'}</span>
            </div>
          </div>

          {/* AI Attribution Engine Section */}
          <div className="space-y-8 pt-10 border-t border-slate-800">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
                <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                AI causal factors
              </h3>
              <button 
                onClick={() => onReAnalyze(log.id)}
                disabled={log.isAnalyzing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-[0.2em] px-8 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-3"
              >
                {log.isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Regenerating...
                  </>
                ) : 'Run Attribution'}
              </button>
            </div>

            {log.attribution ? (
              <div className="bg-slate-800/20 p-8 md:p-12 rounded-[2rem] border border-slate-800 space-y-8 animate-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-wrap gap-4 items-center">
                  <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border border-indigo-500/30">
                    {log.attribution.category}
                  </span>
                  <span className={`${log.attribution.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'} text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border`}>
                    {log.attribution.sentiment}
                  </span>
                  <div className="flex items-center gap-2 bg-slate-800 px-4 py-1.5 rounded-xl border border-slate-700">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Score:</span>
                    <span className="text-[10px] font-black text-white uppercase">{log.attribution.relevanceScore}</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-3xl md:text-4xl font-black text-white leading-[1.15] tracking-tight">
                    {log.attribution.headline}
                  </h4>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-slate-300 text-lg md:text-xl leading-relaxed font-medium whitespace-pre-wrap">
                      {log.attribution.summary}
                    </p>
                  </div>
                </div>

                {log.attribution.sources && log.attribution.sources.length > 0 && (
                  <div className="pt-10 border-t border-slate-800 space-y-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Verified Grounding Sources</p>
                    <div className="flex flex-wrap gap-3">
                      {log.attribution.sources.map((source, i) => (
                        <a 
                          key={i} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 bg-slate-900/50 hover:bg-indigo-500/10 px-4 py-2.5 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all"
                        >
                          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L13 7.113V9.25a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.137l-5.14 5.606a.75.75 0 0 0-.053 1.047Z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors truncate max-w-[200px]">
                            {source.title}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800/10 p-20 rounded-[2rem] border-2 border-dashed border-slate-800 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-black uppercase text-sm tracking-widest">No Analysis Found</p>
                  <p className="text-slate-500 text-xs mt-2 max-w-sm">Trigger the attribution engine to cross-reference this volatility with global financial events.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
