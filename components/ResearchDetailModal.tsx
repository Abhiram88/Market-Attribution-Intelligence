
import React, { useState } from 'react';
import { LedgerEvent } from '../types';
import { fetchCombinedIntelligence, commitIntelligenceToLedger } from '../services/researchService';

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
      // Fix: Use log_date instead of event_date
      const intelligence = await fetchCombinedIntelligence(event.log_date);
      if (intelligence) {
        if (intelligence.is_holiday) {
          throw new Error("Market was closed on this date (Holiday/Weekend).");
        }
        
        setDraftIntelligence(intelligence);
        // Fix: Update internal state to match LedgerEvent schema
        setEvent(prev => ({
          ...prev,
          intelligence_summary: intelligence.intelligence_summary || prev.intelligence_summary,
          impact_score: intelligence.impact_score || prev.impact_score,
          technical_json: {
            ...prev.technical_json,
            nifty_close: intelligence.close || prev.technical_json?.nifty_close,
            change_pts: intelligence.change || prev.technical_json?.change_pts,
            headline: intelligence.reason_headline || prev.technical_json?.headline,
            macro_reason: intelligence.macro_reason || prev.technical_json?.macro_reason,
            sentiment: intelligence.sentiment || prev.technical_json?.sentiment,
            affected_stocks: intelligence.affected_stocks || prev.technical_json?.affected_stocks || [],
            affected_sectors: intelligence.affected_sectors || prev.technical_json?.affected_sectors || [],
          },
          sources: intelligence.sources_used?.map((s: any) => ({
            ...s,
            ledger_event_id: prev.id,
            url: s.url
          }))
        }));
      } else {
        throw new Error("Causal intelligence engine failed to return data.");
      }
    } catch (err: any) {
      setError(`Engine Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitUpdate = async () => {
    if (!draftIntelligence) return;
    setIsProcessing(true);
    try {
      // Fix: Use log_date instead of event_date
      const updated = await commitIntelligenceToLedger(event.log_date, draftIntelligence);
      setEvent(updated);
      setDraftIntelligence(null);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(`Ledger Fault: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Fix: Access technical_json for metrics
  const isPositive = (event.technical_json?.change_pts || 0) >= 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-end bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />
      
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto flex flex-col relative z-10">
        
        {/* EVENT SNAPSHOT HEADER */}
        <div className="p-10 flex justify-between items-start bg-white sticky top-0 z-20 border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Event Snapshot</p>
            {/* Fix: use log_date */}
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">{event.log_date}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900 border border-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-10 pb-10 space-y-12">
          
          {/* PROMINENT METRICS */}
          <div className="grid grid-cols-2 gap-6">
            <div className="p-8 bg-slate-50 rounded-[2.5rem] space-y-2 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nifty Close</p>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">
                {/* Fix: use technical_json */}
                {(event.technical_json?.nifty_close || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`p-8 rounded-[2.5rem] space-y-2 border ${isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'} shadow-sm`}>
              <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Volatility</p>
              <p className="text-4xl font-black tracking-tighter">
                {/* Fix: use technical_json */}
                {isPositive ? '+' : '-'}{Math.abs(event.technical_json?.change_pts || 0).toFixed(1)}
              </p>
            </div>
          </div>

          {/* CLASSIFICATION BADGES */}
          <div className="flex flex-wrap gap-3">
            {/* Fix: use impact_score */}
            <div className="px-6 py-3 bg-slate-900 rounded-xl text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-slate-900/10">
              Impact Score: {event.impact_score || 0}
            </div>
            <div className="px-6 py-3 bg-slate-100 rounded-xl text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border border-slate-200">
              {/* Fix: use technical_json */}
              {event.technical_json?.macro_reason || 'MACRO'}
            </div>
            <div className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border ${
              event.technical_json?.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              {/* Fix: use technical_json */}
              {event.technical_json?.sentiment || 'NEUTRAL'}
            </div>
          </div>

          {/* CAUSAL ANALYSIS BODY */}
          <div className="space-y-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Causal Analysis</h3>
              <button 
                onClick={handleDeepAnalyze} 
                disabled={isProcessing} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all border border-slate-200"
              >
                {isProcessing ? "Auditing..." : "Re-Analyze"}
              </button>
            </div>

            {error && <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold">{error}</div>}

            <div className={`space-y-8 ${isProcessing ? 'opacity-30' : ''} transition-opacity duration-500`}>
              <div className="space-y-4">
                <h1 className="text-3xl font-black leading-tight text-slate-900 uppercase tracking-tight">
                  {/* Fix: use technical_json headline */}
                  {event.technical_json?.headline || "Shortlist verified. Awaiting deep intelligence run."}
                </h1>
                <div className="prose prose-slate max-w-none">
                  <p className="text-lg leading-relaxed font-medium text-slate-600 whitespace-pre-wrap">
                    {/* Fix: use intelligence_summary */}
                    {event.intelligence_summary || "Audit results pending. Use the Re-Analyze tool above to trigger the 250+ word deep causal attribution engine for this volatility event."}
                  </p>
                </div>
              </div>
              
              {draftIntelligence && (
                <button 
                  onClick={handleCommitUpdate} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all active:scale-95"
                >
                  Commit Deep Analysis to Ledger
                </button>
              )}
            </div>
          </div>

          {/* IMPACT GRIDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-10 border-t border-slate-100">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Sectors</p>
              <div className="flex flex-wrap gap-2">
                {/* Fix: use technical_json */}
                {event.technical_json?.affected_sectors?.length ? event.technical_json.affected_sectors.map((s: string) => (
                  <span key={s} className="px-4 py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-xl border border-slate-200 uppercase tracking-tight">{s}</span>
                )) : <span className="text-[10px] text-slate-300 font-bold italic">N/A</span>}
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Stocks</p>
              <div className="flex flex-wrap gap-2">
                {/* Fix: use technical_json */}
                {event.technical_json?.affected_stocks?.length ? event.technical_json.affected_stocks.map((s: string) => (
                  <span key={s} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg shadow-slate-900/10">{s}</span>
                )) : <span className="text-[10px] text-slate-300 font-bold italic">N/A</span>}
              </div>
            </div>
          </div>

          {/* CITATIONS */}
          {event.sources?.length ? (
            <div className="space-y-4 pt-10 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Verified Citations</p>
              <div className="grid grid-cols-1 gap-3">
                {event.sources.map((s: any, i: number) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:bg-white hover:border-indigo-200 hover:shadow-xl transition-all group">
                    <div className="space-y-0.5">
                      <p className="text-xs font-black text-slate-900 line-clamp-1">{s.title}</p>
                      <p className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 uppercase tracking-widest">{s.source_name || 'Verified Source'}</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
