
import React, { useState, useRef, useEffect } from 'react';
import { EventCandidate, Reg30Report, Sentiment } from '../types';
import { 
  parseNseCsv, 
  searchOrderPipeline, 
  runReg30Analysis, 
  fetchAnalyzedEvents, 
  clearReg30History 
} from '../services/reg30Service';

interface FileMetadata {
  name: string;
  headers: string[];
  rowCount: number;
}

export const Reg30Tab: React.FC = () => {
  const [reports, setReports] = useState<Reg30Report[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // File Staging
  const [xbrlFile, setXbrlFile] = useState<File | null>(null);
  const [corpFile, setCorpFile] = useState<File | null>(null);
  const [crdFile, setCrdFile] = useState<File | null>(null);

  const [xbrlMeta, setXbrlMeta] = useState<FileMetadata | null>(null);
  const [corpMeta, setCorpMeta] = useState<FileMetadata | null>(null);
  const [crdMeta, setCrdMeta] = useState<FileMetadata | null>(null);

  const [filterSymbol, setFilterSymbol] = useState('');
  const [minImpact, setMinImpact] = useState(0);

  const xbrlInputRef = useRef<HTMLInputElement>(null);
  const corpInputRef = useRef<HTMLInputElement>(null);
  const crdInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    const loadHistory = async () => {
      setStatus("Syncing historical ledger...");
      const history = await fetchAnalyzedEvents();
      setReports(history);
      setStatus("Sync complete.");
    };
    loadHistory();
  }, []);

  const handleFileUpload = (source: 'XBRL' | 'CorporateActions' | 'CreditRating') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (source === 'XBRL') setXbrlFile(file);
    if (source === 'CorporateActions') setCorpFile(file);
    if (source === 'CreditRating') setCrdFile(file);

    // Metadata extraction for debug
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const headers = lines.length > 0 ? lines[0].split(',').map(h => h.trim().replace(/^"+|"+$/g, "")) : [];
    
    const meta = {
      name: file.name,
      headers: headers,
      rowCount: lines.length - 1
    };

    if (source === 'XBRL') setXbrlMeta(meta);
    if (source === 'CorporateActions') setCorpMeta(meta);
    if (source === 'CreditRating') setCrdMeta(meta);
  };

  const removeFile = (source: 'XBRL' | 'CorporateActions' | 'CreditRating', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (source === 'XBRL') {
      setXbrlFile(null);
      setXbrlMeta(null);
      if (xbrlInputRef.current) xbrlInputRef.current.value = '';
    }
    if (source === 'CorporateActions') {
      setCorpFile(null);
      setCorpMeta(null);
      if (corpInputRef.current) corpInputRef.current.value = '';
    }
    if (source === 'CreditRating') {
      setCrdFile(null);
      setCrdMeta(null);
      if (crdInputRef.current) crdInputRef.current.value = '';
    }
  };

  const runAnalysis = async () => {
    const filesToProcess = [
      { file: xbrlFile, source: 'XBRL' },
      { file: corpFile, source: 'CorporateActions' },
      { file: crdFile, source: 'CreditRating' }
    ].filter(f => f.file !== null);

    if (filesToProcess.length === 0) return alert("Please upload at least one CSV file.");

    setIsProcessing(true);
    setStatus("Parsing staged files...");
    
    try {
      let allCandidates: EventCandidate[] = [];

      for (const f of filesToProcess) {
        const text = await f.file!.text();
        const parsed = parseNseCsv(text, f.source as any);
        allCandidates = [...allCandidates, ...parsed];
      }

      if (allCandidates.length === 0) {
        setStatus("No material events detected in files.");
        setIsProcessing(false);
        return;
      }

      const results = await runReg30Analysis(allCandidates, setStatus, 'CSV');
      
      // Refresh list from DB to get stable reports
      const updatedReports = await fetchAnalyzedEvents();
      setReports(updatedReports);
      
      // Clear files after successful run
      setXbrlFile(null);
      setCorpFile(null);
      setCrdFile(null);
      setXbrlMeta(null);
      setCorpMeta(null);
      setCrdMeta(null);
      if (xbrlInputRef.current) xbrlInputRef.current.value = '';
      if (corpInputRef.current) corpInputRef.current.value = '';
      if (crdInputRef.current) crdInputRef.current.value = '';
      
      setStatus("Analysis complete.");
    } catch (e) {
      console.error(e);
      setStatus("Analysis failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const runLiveSearch = async () => {
    setIsProcessing(true);
    setStatus("Searching feeds...");
    try {
      const liveItems = await searchOrderPipeline([]);
      setStatus(`Detected ${liveItems.length} potential pipeline events.`);
      await runReg30Analysis(liveItems, setStatus, 'LIVE_SEARCH');
      
      // Refresh list from DB
      const updatedReports = await fetchAnalyzedEvents();
      setReports(updatedReports);
      setStatus("Live search analysis complete.");
    } catch (e) {
      setStatus("Live search failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("ARE YOU SURE? This will wipe ALL analyzed reports and candidates from the persistent database.")) return;
    setStatus("Wiping historical data...");
    await clearReg30History();
    setReports([]);
    setStatus("History purged.");
  };

  const filtered = reports.filter(r => {
    const search = filterSymbol.toLowerCase();
    const symbol = (r.symbol || "").toLowerCase();
    const company = (r.company_name || "").toLowerCase();
    
    return (!filterSymbol || symbol.includes(search) || company.includes(search)) &&
           r.impact_score >= minImpact;
  });

  const getImpactColor = (score: number, dir: Sentiment) => {
    if (dir === 'NEGATIVE') return 'bg-rose-50 border-rose-200 text-rose-700';
    if (score >= 80) return 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold';
    if (score >= 60) return 'bg-indigo-50 border-indigo-200 text-indigo-700';
    if (score >= 40) return 'bg-slate-50 border-slate-200 text-slate-600';
    return 'bg-slate-50/50 text-slate-400';
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-700 pb-20">
      {/* IMPORTANT LINKS SECTION */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Important NSE Data Links</h3>
          <div className="flex flex-wrap gap-4">
            <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements-xbrl" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-xl transition-all group">
              <span className="text-[11px] font-black text-slate-600 group-hover:text-indigo-600 uppercase">Corporate Filings (XBRL)</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
            <a href="https://www.nseindia.com/companies-listing/corporate-filings-actions" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-xl transition-all group">
              <span className="text-[11px] font-black text-slate-600 group-hover:text-indigo-600 uppercase">Corporate Actions</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
            <a href="https://www.nseindia.com/companies-listing/debt-centralised-database/crd" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-xl transition-all group">
              <span className="text-[11px] font-black text-slate-600 group-hover:text-indigo-600 uppercase">Credit Reports (CRD)</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
          </div>
        </div>
        <button 
          onClick={handleClearHistory}
          className="px-6 py-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
        >
          Wipe Ledger
        </button>
      </div>

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl space-y-8">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Daily NSE CSV Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* XBRL UPLOAD */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Announcements XBRL</span>
              <label className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 hover:border-indigo-500 transition-colors cursor-pointer group flex flex-col items-center justify-center text-center h-28">
                {xbrlFile ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-indigo-600 uppercase truncate max-w-[100px]">{xbrlFile.name}</p>
                    <button onClick={(e) => removeFile('XBRL', e)} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline">Remove</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400">Upload CSV</span>
                )}
                <input type="file" ref={xbrlInputRef} onChange={handleFileUpload('XBRL')} className="hidden" accept=".csv" />
              </label>
            </div>
            {/* CORP ACTIONS UPLOAD */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Corporate Actions</span>
              <label className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 hover:border-indigo-500 transition-colors cursor-pointer group flex flex-col items-center justify-center text-center h-28">
                {corpFile ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-indigo-600 uppercase truncate max-w-[100px]">{corpFile.name}</p>
                    <button onClick={(e) => removeFile('CorporateActions', e)} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline">Remove</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400">Upload CSV</span>
                )}
                <input type="file" ref={corpInputRef} onChange={handleFileUpload('CorporateActions')} className="hidden" accept=".csv" />
              </label>
            </div>
            {/* CREDIT RATING UPLOAD */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Credit Rating (CRD)</span>
              <label className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 hover:border-indigo-500 transition-colors cursor-pointer group flex flex-col items-center justify-center text-center h-28">
                {crdFile ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-indigo-600 uppercase truncate max-w-[100px]">{crdFile.name}</p>
                    <button onClick={(e) => removeFile('CreditRating', e)} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:underline">Remove</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400">Upload CSV</span>
                )}
                <input type="file" ref={crdInputRef} onChange={handleFileUpload('CreditRating')} className="hidden" accept=".csv" />
              </label>
            </div>
          </div>
          
          {/* DEBUG METADATA PANELS */}
          {(xbrlMeta || corpMeta || crdMeta) && (
            <div className="grid grid-cols-1 gap-3 pt-4 animate-in slide-in-from-top-2">
              {[
                { source: 'XBRL', meta: xbrlMeta },
                { source: 'Corporate Actions', meta: corpMeta },
                { source: 'Credit Rating', meta: crdMeta }
              ].map(item => item.meta && (
                <div key={item.source} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{item.source} PREVIEW</span>
                    <span className="text-[9px] font-bold text-slate-400">{item.meta.rowCount} Rows Detected</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.meta.headers.map((h, idx) => (
                      <span key={idx} className="text-[7px] font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded uppercase text-slate-500">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={runAnalysis}
            disabled={isProcessing || (!xbrlFile && !corpFile && !crdFile)}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-600/20 disabled:opacity-30 hover:bg-indigo-700 transition-all"
          >
            {isProcessing ? "Processing Batch..." : `Run CSV Analysis`}
          </button>
        </div>

        <div className="bg-slate-900 p-10 rounded-[3rem] shadow-xl space-y-8 text-white">
          <div className="flex justify-between items-center">
             <h2 className="text-2xl font-black uppercase tracking-tighter">Order-Pipeline Live Search</h2>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500">Live Feeds</span>
             </div>
          </div>
          <p className="text-slate-400 text-sm font-medium">Detect LOA, NTP, L1, and WO events from verified news and RSS channels without manual CSV imports.</p>
          <button 
            onClick={runLiveSearch}
            disabled={isProcessing}
            className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-100 transition-all"
          >
            Search Order-Pipeline Events
          </button>
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 min-h-[1rem]">
            <span>Status: {status}</span>
            {isProcessing && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-wrap gap-8 items-end">
        <div className="flex-1 min-w-[200px] space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Symbol / Company</label>
          <input 
            type="text" 
            placeholder="Search symbols..." 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-indigo-500/10"
            value={filterSymbol}
            onChange={e => setFilterSymbol(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px] space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Impact: {minImpact}</label>
          <input 
            type="range" 
            min="0" max="100" 
            className="w-full accent-indigo-600"
            value={minImpact}
            onChange={e => setMinImpact(parseInt(e.target.value))}
          />
        </div>
      </div>

      {/* REPORT TABLE */}
      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[1200px]">
            <thead className="bg-slate-50/50 text-slate-400 uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-100">
              <tr>
                <th className="px-10 py-6">Date</th>
                <th className="px-10 py-6">Symbol</th>
                <th className="px-10 py-6">Event Family</th>
                <th className="px-10 py-6">Summary</th>
                <th className="px-10 py-6 text-center">Impact</th>
                <th className="px-10 py-6 text-center">Direction</th>
                <th className="px-10 py-6">Recommendation</th>
                <th className="px-10 py-6">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-10 py-32 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Awaiting Intelligence Synthesis...</td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-all">
                    <td className="px-10 py-8 font-mono text-[10px] text-slate-400">{r.event_date}</td>
                    <td className="px-10 py-8">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-900 tracking-tight">{r.symbol || 'N/A'}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[120px]">{r.company_name}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{r.event_family.replace('_', ' ')}</span>
                        {r.stage && <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded w-fit">{r.stage}</span>}
                      </div>
                    </td>
                    <td className="px-10 py-8 max-w-sm">
                      <p className="text-[11px] font-medium text-slate-600 leading-relaxed line-clamp-2">{r.summary}</p>
                    </td>
                    <td className="px-10 py-8 text-center">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full border shadow-sm text-xs font-black ${getImpactColor(r.impact_score, r.direction)}`}>
                        {r.impact_score}
                      </div>
                    </td>
                    <td className="px-10 py-8 text-center">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border ${
                        r.direction === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        r.direction === 'NEGATIVE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                        {r.direction}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex flex-col">
                         <span className={`text-[9px] font-black uppercase tracking-widest ${
                           r.recommendation.startsWith('ACTIONABLE') ? 'text-indigo-600' : 'text-slate-500'
                         }`}>
                           {r.recommendation.replace(/_/g, ' ')}
                         </span>
                         <span className="text-[8px] font-bold text-slate-300">Conf: {(r.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
