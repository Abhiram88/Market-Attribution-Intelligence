import React, { useState } from 'react';
import { LedgerEvent } from '../types';
import { generateVerifiedIntelligence, commitIntelligenceToLedger } from '../services/researchService';

interface ResearchDetailModalProps {
  event: LedgerEvent;
  onClose: () => void;
  onUpdate?: () => void;
}

export const ResearchDetailModal: React.FC<ResearchDetailModalProps> = ({ event: initialEvent, onClose, onUpdate }) => {
  const [event, setEvent] = useState(initialEvent);
  const [draftIntelligence, setDraftIntelligence] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeepAnalyze = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const intelligence = await generateVerifiedIntelligence(event.event_date, event.change_pts);
      if (intelligence) {
        setDraftIntelligence(intelligence);
        // Temporarily update UI preview
        setEvent(prev => ({
          ...prev,
          reason: intelligence.reason,
          macro_reason: intelligence.macro_reason,
          sentiment: intelligence.sentiment,
          score: intelligence.score,
          ai_attribution_summary: intelligence.ai_attribution_summary,
          affected_stocks: intelligence.affected_stocks || [],
          affected_sectors: intelligence.affected_sectors || [],
          sources: intelligence.sources_used,
          llm_raw_json: intelligence
        }));
      }
    } catch (err: any) {
      setError(err.message === "QUOTA_EXCEEDED" ? "Daily search quota reached." : "Analysis verification failed. Try once more?");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitUpdate = async () => {
    if (!draftIntelligence) return;
    setIsProcessing(true);
    setError(null);
    try {
      const updatedEvent = await commitIntelligenceToLedger(
        event.event_date, 
        event.nifty_close, 
        event.change_pts, 
        draftIntelligence
      );
      if (updatedEvent) {
        setEvent(updatedEvent);
        setDraftIntelligence(null); // Clear draft state after commit
        if (onUpdate) onUpdate();
      }
    } catch (err: any) {
      setError(`Database Update Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const reasonText = event.reason || "";
  const summaryText = event.ai_attribution_summary || "";

  const isPlaceholder = !draftIntelligence && (
                        reasonText.includes("Market") || 
                        summaryText.includes("pending") || 
                        summaryText.includes("Partial recovery") ||
                        summaryText.length < 100);

  const isPositive = event.change_pts >= 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-end bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="fixed inset-0 cursor-pointer" 
        onClick={onClose}
      />
      
      <div className="bg-white w-full max-w-xl h-full shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto flex flex-col relative z-10">
        
        {/* Header Navigation */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Event Snapshot</p>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{event.event_date}</h2>
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

        <div className="p-8 space-y-10 flex-1">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nifty Close</p>
              <p className="text-2xl font-black text-slate-900">{event.nifty_close?.toLocaleString(undefined, { minimumFractionDigits: 1 }) || '0.0'}</p>
            </div>
            <div className={`p-6 rounded-[2rem] border space-y-1 ${isPositive ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <p className="text-[9px] font-black opacity-60 uppercase tracking-widest">Volatility</p>
              <p className="text-2xl font-black">{isPositive ? '+' : ''}{(event.change_pts || 0).toFixed(1)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
             <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-xl text-white text-[10px] font-black uppercase tracking-widest">
               Impact Score: {event.score || 0}
             </div>
             <div className="px-4 py-2 bg-slate-100 rounded-xl text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-200">
               {event.macro_reason || 'OTHER'}
             </div>
          </div>

          {/* Main Attribution Section */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Causal Analysis</h3>
              
              {!draftIntelligence ? (
                <button 
                  onClick={handleDeepAnalyze}
                  disabled={isProcessing}
                  className={`flex items-center justify-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 border ${
                    isProcessing 
                      ? 'bg-indigo-100 text-indigo-500 animate-pulse border-indigo-200' 
                      : isPlaceholder 
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-500' 
                        : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Synthesizing...
                    </>
                  ) : isPlaceholder ? "Deep Analyze" : "Re-Analyze"}
                </button>
              ) : (
                <button 
                  onClick={handleCommitUpdate}
                  disabled={isProcessing}
                  className={`flex items-center justify-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 border bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-500 animate-in zoom-in-95 duration-200`}
                >
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Updating...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                      Update Intelligence Table
                    </>
                  )}
                </button>
              )}
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <div className={`space-y-6 transition-opacity duration-300 ${isProcessing ? 'opacity-40' : 'opacity-100'}`}>
              <h1 className={`text-3xl font-black leading-tight tracking-tight ${isPlaceholder ? 'text-slate-300' : 'text-slate-900'} ${draftIntelligence ? 'text-indigo-600' : ''}`}>
                {reasonText || "Analysis Required"}
              </h1>
              
              <div className="prose prose-slate max-w-none">
                <p className={`text-base leading-relaxed font-medium whitespace-pre-wrap ${isPlaceholder ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                  {summaryText || "Intelligence layer not yet populated for this date."}
                </p>
              </div>
            </div>
          </div>

          {/* Sector & Stock Impacts */}
          {(event.affected_sectors?.length > 0 || event.affected_stocks?.length > 0) && (
             <div className="grid grid-cols-2 gap-8 py-10 border-t border-slate-100">
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Sectors</p>
                  <div className="flex flex-wrap gap-2">
                    {event.affected_sectors.map(s => (
                      <span key={s} className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Stocks</p>
                  <div className="flex flex-wrap gap-2">
                    {event.affected_stocks.map(s => (
                      <span key={s} className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg">{s}</span>
                    ))}
                  </div>
                </div>
             </div>
          )}

          {/* Sources / Grounding */}
          {event.sources && event.sources.length > 0 && (
            <div className="space-y-4 pt-10 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grounding Citations</p>
              <div className="grid grid-cols-1 gap-3">
                {event.sources.map((s, i) => (
                  <a 
                    key={i} 
                    href={s.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:border-indigo-200 hover:shadow-md transition-all group"
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-black text-slate-900 line-clamp-1">{s.title}</p>
                      <p className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 uppercase tracking-tighter transition-colors">{s.source_name || 'Primary Source'}</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Internal Traceability */}
          <div className="pt-10 border-t border-slate-100 space-y-4">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Traceability (Raw LLM Output)</p>
             <pre className="bg-slate-900 text-indigo-300 text-[10px] p-6 rounded-2xl overflow-x-auto border border-slate-800 font-mono leading-relaxed">
               {JSON.stringify(event.llm_raw_json || {}, null, 2)}
             </pre>
          </div>
        </div>
      </div>
    </div>
  );
};