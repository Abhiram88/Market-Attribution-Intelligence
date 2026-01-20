
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { EventCandidate, Reg30Report, Sentiment } from '../types';
import { 
  parseNseCsv, 
  runReg30Analysis, 
  fetchAnalyzedEvents, 
  clearReg30History,
  reAnalyzeSingleEvent,
  regenerateNarrativeOnly
} from '../services/reg30Service';
import { supabase } from '../lib/supabase';
import { SimulationModal } from './SimulationModal';

interface RowStatus {
  id: string;
  name: string;
  step: 'PENDING' | 'FETCHING' | 'AI_ANALYZING' | 'SAVING' | 'COMPLETED' | 'FAILED';
}

export const Reg30Tab: React.FC = () => {
  const [reports, setReports] = useState<Reg30Report[]>([]);
  const [status, setStatus] = useState<string>('SYNC COMPLETE.');
  const [isProcessing, setIsProcessing] = useState(false);
  const [auditLog, setAuditLog] = useState<RowStatus[]>([]);
  const [showSimulation, setShowSimulation] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reAnalyzingId, setReAnalyzingId] = useState<string | null>(null);
  const [generatingNarrativeId, setGeneratingNarrativeId] = useState<string | null>(null);
  const [trackingSymbols, setTrackingSymbols] = useState<Set<string>>(new Set());
  
  // Pagination State
  const [visibleCount, setVisibleCount] = useState(30);
  
  const [xbrlFile, setXbrlFile] = useState<{file: File, count: number} | null>(null);
  const [corpFile, setCorpFile] = useState<{file: File, count: number} | null>(null);
  const [crdFile, setCrdFile] = useState<{file: File, count: number} | null>(null);

  const [filterSymbol, setFilterSymbol] = useState('');
  const [minImpact, setMinImpact] = useState(0);

  const totalCount = (xbrlFile?.count || 0) + (corpFile?.count || 0) + (crdFile?.count || 0);

  // Fix: Added calculation for progressPercentage based on the auditLog status steps
  const progressPercentage = useMemo(() => {
    if (auditLog.length === 0) return 0;
    const completedCount = auditLog.filter(item => item.step === 'COMPLETED' || item.step === 'FAILED').length;
    return Math.round((completedCount / auditLog.length) * 100);
  }, [auditLog]);

  const loadHistory = async () => {
    const history = await fetchAnalyzedEvents();
    setReports(history);
    
    // Also load tracked symbols
    const { data: tracked } = await supabase.from('priority_stocks').select('symbol');
    if (tracked) {
      setTrackingSymbols(new Set(tracked.map(s => s.symbol)));
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleFileUpload = (source: 'XBRL' | 'CorporateActions' | 'CreditRating') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    try {
      const text = await file.text();
      const candidates = parseNseCsv(text, source);
      const data = { file, count: candidates.length };

      if (source === 'XBRL') setXbrlFile(data);
      if (source === 'CorporateActions') setCorpFile(data);
      if (source === 'CreditRating') setCrdFile(data);
    } catch (err) {
      console.error("CSV Parse Failure:", err);
      alert("Failed to parse CSV file.");
    }

    e.target.value = '';
  };

  const clearFile = (source: 'XBRL' | 'CorporateActions' | 'CreditRating') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (source === 'XBRL') setXbrlFile(null);
    if (source === 'CorporateActions') setCorpFile(null);
    if (source === 'CreditRating') setCrdFile(null);
  };

  const handleTrackStock = async (symbol: string, company: string) => {
    if (!symbol) return;
    
    const isAlreadyTracked = trackingSymbols.has(symbol);
    
    if (isAlreadyTracked) {
      const { error } = await supabase.from('priority_stocks').delete().eq('symbol', symbol);
      if (!error) {
        setTrackingSymbols(prev => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
      }
    } else {
      const { error } = await supabase.from('priority_stocks').upsert({ symbol, company_name: company });
      if (!error) {
        setTrackingSymbols(prev => new Set([...prev, symbol]));
      }
    }
  };

  const handleReAnalyze = async (report: Reg30Report) => {
    setReAnalyzingId(report.id);
    try {
      const updated = await reAnalyzeSingleEvent(report);
      if (updated) {
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, ...updated } : r));
      }
    } catch (e) {
      console.error("Re-analysis failed:", e);
    } finally {
      setReAnalyzingId(null);
    }
  };

  const handleRegenerateNarrative = async (report: Reg30Report) => {
    setGeneratingNarrativeId(report.id);
    try {
      const updated = await regenerateNarrativeOnly(report);
      if (updated) {
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, ...updated } : r));
      } else {
        alert("Failed to generate tactical narrative. Check Gemini quota or document size.");
      }
    } catch (e) {
      console.error("Narrative generation failed:", e);
    } finally {
      setGeneratingNarrativeId(null);
    }
  };

  const runAnalysis = async () => {
    const filesToProcess = [
      { data: xbrlFile, source: 'XBRL' },
      { data: corpFile, source: 'CorporateActions' },
      { data: crdFile, source: 'CreditRating' }
    ].filter(f => f.data !== null);

    if (filesToProcess.length === 0) return;

    setIsProcessing(true);
    setStatus("BATCHING RECORDS...");
    
    try {
      let allCandidates: EventCandidate[] = [];
      for (const f of filesToProcess) {
        const text = await f.data!.file.text();
        const parsed = parseNseCsv(text, f.source as any);
        allCandidates = [...allCandidates, ...parsed];
      }

      if (allCandidates.length === 0) {
        alert("No valid Reg30 candidates extracted.");
        setIsProcessing(false);
        setStatus("IDLE");
        return;
      }

      setAuditLog(allCandidates.map(c => ({ id: c.id, name: c.company_name, step: 'PENDING' })));

      await runReg30Analysis(allCandidates, (id, step) => {
        setAuditLog(prev => prev.map(item => item.id === id ? { ...item, step } : item));
      });

      await loadHistory();
      setXbrlFile(null); setCorpFile(null); setCrdFile(null);
      setStatus("ANALYSIS COMPLETE.");
    } catch (e) {
      console.error(e);
      setStatus("PROCESSING FAILED.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Wipe ledger records?")) return;
    await clearReg30History();
    setReports([]);
  };

  const filtered = useMemo(() => {
    return reports.filter(r => {
      const search = filterSymbol.toLowerCase();
      const symbol = (r.symbol || "").toLowerCase();
      const company = (r.company_name || "").toLowerCase();
      return (!filterSymbol || symbol.includes(search) || company.includes(search)) && r.impact_score >= minImpact;
    });
  }, [reports, filterSymbol, minImpact]);

  const displayedReports = filtered.slice(0, visibleCount);

  return (
    <div className="w-full space-y-8 pb-20 animate-in fade-in duration-700">
      {/* NSE LINKS SECTION */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Important NSE Data Links</h3>
          <div className="flex flex-wrap gap-4">
            <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements-xbrl" target="_blank" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[9px] font-black text-indigo-600 uppercase hover:bg-indigo-50 transition-all">
              XBRL Announcements
            </a>
            <a href="https://www.nseindia.com/companies-listing/corporate-filings-actions" target="_blank" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[9px] font-black text-indigo-600 uppercase hover:bg-indigo-50 transition-all">
              Corporate Actions
            </a>
            <a href="https://www.nseindia.com/companies-listing/debt-centralised-database/crd" target="_blank" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[9px] font-black text-indigo-600 uppercase hover:bg-indigo-50 transition-all">
              Credit Reports
            </a>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowSimulation(true)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">
            SIMULATION TOOL
          </button>
          <button onClick={handleClearHistory} className="px-6 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">
            WIPE LEDGER
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl space-y-8">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">DAILY NSE CSV ANALYSIS</h2>
          {isProcessing && (
            <div className="p-6 bg-slate-900 rounded-2xl space-y-4 animate-in slide-in-from-top-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Analysis Command Center</p>
                <span className="text-xs font-black text-white">{progressPercentage}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPercentage}%` }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['XBRL', 'CorporateActions', 'CreditRating'] as const).map((src) => {
              const info = src === 'XBRL' ? { label: 'XBRL', file: xbrlFile } : src === 'CorporateActions' ? { label: 'Corp Actions', file: corpFile } : { label: 'Credit', file: crdFile };
              return (
                <label key={src} className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl h-32 p-4 cursor-pointer transition-all text-center group ${info.file ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-500'}`}>
                   {info.file ? (
                     <div className="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-indigo-600 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                       <span className="text-[9px] font-black text-indigo-600 uppercase line-clamp-2 max-w-full px-2">{info.file.file.name}</span>
                       <span className="text-[8px] font-black text-slate-500 uppercase mt-1">{info.file.count} Records Found</span>
                       <button onClick={clearFile(src)} className="mt-2 text-[8px] font-black text-rose-500 uppercase hover:underline">Remove</button>
                     </div>
                   ) : (
                     <>
                       <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400">Upload {info.label}</span>
                       <p className="text-[8px] font-black text-slate-300 uppercase mt-1 tracking-widest">CSV Only</p>
                     </>
                   )}
                   <input type="file" onChange={handleFileUpload(src)} className="hidden" accept=".csv" />
                </label>
              );
            })}
          </div>
          <button 
            onClick={runAnalysis} 
            disabled={isProcessing || totalCount === 0} 
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl disabled:opacity-20 hover:bg-indigo-700 transition-all active:scale-[0.98]"
          >
            {isProcessing ? "PROCESSING FORENSIC DATA..." : totalCount > 0 ? `RUN ANALYSIS (${totalCount} RECORDS)` : "RUN CSV ANALYSIS"}
          </button>
        </div>

        <div className="bg-[#0a0f18] p-10 rounded-[3rem] shadow-xl text-white flex flex-col justify-between">
          <h2 className="text-xl font-black uppercase tracking-tighter">ORDER-PIPELINE LIVE SEARCH</h2>
          <p className="text-slate-400 text-[11px] font-medium leading-relaxed max-w-md mt-4">
            Detect LOA, NTP, L1, and WO events from verified news and RSS channels without manual CSV imports.
          </p>
          <button className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black uppercase text-[10px] tracking-widest mt-8 hover:bg-indigo-50 transition-all shadow-xl">
            SEARCH ORDER-PIPELINE EVENTS
          </button>
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">STATUS: {status}</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-wrap gap-8 items-end">
        <div className="flex-1 min-w-[300px] space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SYMBOL / COMPANY</label>
          <input type="text" placeholder="Search symbols..." className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 ring-indigo-500/10" value={filterSymbol} onChange={e => { setFilterSymbol(e.target.value); setVisibleCount(30); }} />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MIN IMPACT: {minImpact}</label>
          <input type="range" min="0" max="100" className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" value={minImpact} onChange={e => { setMinImpact(parseInt(e.target.value)); setVisibleCount(30); }} />
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[1200px]">
            <thead className="bg-slate-50/50 text-slate-400 uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-100">
              <tr>
                <th className="px-10 py-6">DATE</th>
                <th className="px-10 py-6">SYMBOL</th>
                <th className="px-10 py-6">EVENT FAMILY</th>
                <th className="px-10 py-6">SUMMARY & AUDIT TRAIL</th>
                <th className="px-10 py-6 text-center">IMPACT</th>
                <th className="px-10 py-6 text-center">DIRECTION</th>
                <th className="px-10 py-6 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayedReports.length === 0 ? (
                <tr><td colSpan={7} className="px-10 py-24 text-center text-slate-300 font-black uppercase text-xs tracking-[0.3em]">No records found.</td></tr>
              ) : (
                displayedReports.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className={`hover:bg-slate-50/50 transition-all group ${expandedId === r.id ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-10 py-8 font-mono text-[10px] text-slate-400">{r.event_date}</td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{r.symbol || 'N/A'}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[150px]">{r.company_name}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{r.event_family.replace('_', ' ')}</span>
                          {r.stage && <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded w-fit">{r.stage}</span>}
                        </div>
                      </td>
                      <td className="px-10 py-8 max-w-sm">
                        <div className="space-y-2">
                          <p className="text-[11px] font-medium text-slate-600 leading-relaxed line-clamp-2">{r.summary}</p>
                          <button 
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            className="text-[8px] font-black text-indigo-600 uppercase tracking-[0.2em] hover:underline flex items-center gap-1"
                          >
                            {expandedId === r.id ? 'HIDE AUDIT TRAIL' : 'VIEW SCORING FACTORS'}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`}>
                              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-slate-100 bg-white text-[11px] font-black text-slate-900 shadow-sm">
                          {r.impact_score}
                        </div>
                      </td>
                      <td className="px-10 py-8 text-center">
                         <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                           r.direction === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                           r.direction === 'NEGATIVE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-400'
                         }`}>
                           {r.direction}
                         </span>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex justify-end items-center gap-3">
                          <button 
                            onClick={() => handleTrackStock(r.symbol || '', r.company_name)}
                            className={`p-2 rounded-lg transition-all ${
                              trackingSymbols.has(r.symbol || '') 
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                              : 'text-slate-300 hover:text-indigo-600 hover:bg-slate-100'
                            }`}
                            title={trackingSymbols.has(r.symbol || '') ? "Un-Track Stock" : "Track for Priority Watchlist"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill={trackingSymbols.has(r.symbol || '') ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                          </button>
                          <button 
                            onClick={() => handleReAnalyze(r)}
                            disabled={reAnalyzingId === r.id}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-indigo-600 transition-all disabled:opacity-20"
                          >
                             {reAnalyzingId === r.id ? (
                               <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                             ) : (
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                             )}
                          </button>
                          <a href={r.attachment_link} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-indigo-600 transition-all">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                          </a>
                        </div>
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr className="bg-slate-50/50 animate-in slide-in-from-top-2">
                        <td colSpan={7} className="px-10 py-10 border-l-4 border-indigo-600">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                            {/* Left Column: Scoring & Evidence */}
                            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-10">
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scoring Factors</h4>
                                <div className="space-y-2">
                                  {r.scoring_factors?.map((f, i) => (
                                    <div key={i} className="flex gap-3 text-[11px] font-bold">
                                      <span className={f.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'}>{f.split(':')[0]}</span>
                                      <span className="text-slate-600">{f.split(':')[1]}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evidence Extraction</h4>
                                <div className="space-y-3">
                                  {r.evidence_spans?.map((span, i) => (
                                    <div key={i} className="p-3 bg-white border border-slate-100 rounded-xl text-[10px] italic text-slate-500 font-medium">"{span}"</div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Right Column: EVENT ANALYSIS PANEL */}
                            <div className="lg:col-span-4 space-y-6">
                              <div className="flex flex-col gap-2">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Action Recommendation</h4>
                                <p className="text-[12px] font-black text-indigo-600 uppercase tracking-widest">{r.recommendation.replace(/_/g, ' ')}</p>
                              </div>

                              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-5 flex flex-col min-h-[300px]">
                                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Event Analysis</h4>
                                </div>
                                
                                {r.impact_score >= 50 ? (
                                  <div className="space-y-6 animate-in fade-in duration-700 flex flex-col flex-1">
                                    <div className="space-y-3 flex-1">
                                      {r.event_analysis_text ? (
                                        <div className="space-y-4">
                                          <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic border-l-2 border-indigo-100 pl-4 py-1">
                                            {r.event_analysis_text}
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="py-12 flex flex-col items-center gap-4 text-center">
                                          <p className="text-[10px] font-black text-slate-300 uppercase leading-relaxed px-4">Tactical narrative missing.</p>
                                          <button 
                                            onClick={() => handleRegenerateNarrative(r)}
                                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                                          >
                                            Generate Analysis
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                                      <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Institutional Risk</p>
                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase inline-block border ${
                                          r.institutional_risk === 'HIGH' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                          r.institutional_risk === 'MED' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        }`}>{r.institutional_risk || 'LOW'}</span>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Policy Bias</p>
                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase inline-block border ${
                                          r.policy_bias === 'TAILWIND' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                          r.policy_bias === 'HEADWIND' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                                        }`}>{r.policy_bias || 'NEUTRAL'}</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex-1 flex flex-col items-center justify-center py-8 text-center space-y-4 opacity-50 grayscale">
                                    <p className="text-[9px] font-black text-slate-400 uppercase leading-relaxed max-w-[180px]">
                                      Tactical analysis disabled for events with impact score &lt; 50.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showSimulation && <SimulationModal onClose={() => setShowSimulation(false)} />}
    </div>
  );
};
