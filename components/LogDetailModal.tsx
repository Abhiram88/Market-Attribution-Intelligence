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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-8 border-b border-slate-800 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
              Day details — <span className="text-indigo-400">{log.date}</span>
            </h2>
            <p className="text-slate-400 text-sm">Market metrics and AI-attributed causal factors.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-10">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nifty close</p>
              <p className="text-2xl font-black text-white">{log.niftyClose.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nifty change</p>
              <p className={`text-2xl font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {log.niftyChange > 0 ? '+' : ''}{log.niftyChange}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">NASDAQ close</p>
              <p className="text-2xl font-black text-white">{log.nasdaqClose.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">GIFT Nifty</p>
              <p className="text-2xl font-black text-white">{log.giftNiftyClose.toLocaleString()}</p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Threshold:</span>
              <span className={`text-[10px] font-black uppercase ${log.thresholdMet ? 'text-amber-400' : 'text-slate-500'}`}>
                {log.thresholdMet ? 'YES' : 'NO'}
              </span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isPositive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
              <span className="text-[10px] font-black uppercase tracking-widest">Direction:</span>
              <span className="text-[10px] font-black uppercase">{isPositive ? 'Up' : 'Down'}</span>
            </div>
          </div>

          {/* AI Section */}
          <div className="space-y-6 pt-4 border-t border-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-tight">AI causal factors</h3>
              <button 
                onClick={() => onReAnalyze(log.id)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                Run Attribution
              </button>
            </div>

            {log.attribution ? (
              <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-800 space-y-6 animate-in slide-in-from-bottom-2 duration-500">
                <div className="flex flex-wrap gap-3">
                  <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase px-3 py-1 rounded-lg border border-indigo-500/30">
                    {log.attribution.category}
                  </span>
                  <span className={`${log.attribution.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'} text-[10px] font-black uppercase px-3 py-1 rounded-lg border`}>
                    {log.attribution.sentiment}
                  </span>
                  <span className="bg-slate-700 text-slate-300 text-[10px] font-black uppercase px-3 py-1 rounded-lg">
                    Score: {log.attribution.relevanceScore}
                  </span>
                </div>

                <div className="space-y-4">
                  <h4 className="text-2xl font-black text-white leading-tight">
                    {log.attribution.headline}
                  </h4>
                  <p className="text-slate-300 text-base leading-relaxed font-medium">
                    {log.attribution.summary}
                  </p>
                </div>

                {log.attribution.sources && log.attribution.sources.length > 0 && (
                  <div className="pt-6 border-t border-slate-700 space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Citations & Grounding</p>
                    <div className="flex flex-wrap gap-2">
                      {log.attribution.sources.map((source, i) => (
                        <a 
                          key={i} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/5 px-2 py-1 rounded border border-indigo-500/10"
                        >
                          {source.title.substring(0, 30)}...
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L13 7.113V9.25a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.137l-5.14 5.606a.75.75 0 0 0-.053 1.047Z" clipRule="evenodd" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800/20 p-12 rounded-3xl border border-dashed border-slate-700 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No detailed attribution yet</p>
                <p className="text-slate-500 text-[11px] mt-1">Run the attribution engine to correlate volatility with global events.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};