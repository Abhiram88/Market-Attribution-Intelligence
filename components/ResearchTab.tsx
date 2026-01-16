
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerEvent } from '../types';
import { ResearchTable } from './ResearchTable';
import { ResearchDetailModal } from './ResearchDetailModal';
import { runDeepResearch, stopDeepResearch, seedVolatileQueue, clearVolatileQueue } from '../services/researchService';

export const ResearchTab: React.FC = () => {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState({ 
    status: 'idle', 
    progress_message: 'Standby',
    active_date: null as string | null 
  });
  const [localProcessing, setLocalProcessing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<LedgerEvent | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [macroFilter, setMacroFilter] = useState<string>("All");
  const [sentimentFilter, setSentimentFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // PAGINATION
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const fetchEvents = async () => {
    try {
      const { data } = await supabase
        .from('ledger_events')
        .select('*, ledger_sources(*)')
        .order('event_date', { ascending: false });
      
      if (data) {
        setEvents(data.map(d => ({ 
          ...d, 
          sources: d.ledger_sources.map((s: any) => ({ ...s, event_id: s.event_id })) 
        })));
      }

      const { count, error } = await supabase
        .from('volatile_queue')
        .select('*', { count: 'exact', head: true })
        .or('status.eq.pending,status.eq.failed');
      
      if (!error) {
        setQueueCount(count || 0);
      }
    } catch (e) {
      console.error("Ledger Sync Error:", e);
    }
  };

  const checkStatus = async () => {
    try {
      const { data } = await supabase.from('research_status').select('*').eq('id', 1).maybeSingle();
      if (data) {
        setSyncStatus({ 
          status: data.status_text || 'idle', 
          progress_message: data.stage || 'Ready',
          active_date: data.active_date || null
        });
        
        if (localProcessing && (data.status_text === 'idle' || data.status_text === 'failed')) {
          setLocalProcessing(false);
          setStopping(false);
          fetchEvents();
        }
        
        if (data.status_text === 'running' && !localProcessing) {
          setLocalProcessing(true);
        }
      }
    } catch (e) { console.error("Poller Error:", e); }
  };

  useEffect(() => {
    fetchEvents();
    checkStatus();
    const interval = setInterval(() => {
      checkStatus();
      if (localProcessing || syncStatus.status === 'running') fetchEvents();
    }, 1500); 
    return () => clearInterval(interval);
  }, [localProcessing, syncStatus.status]);

  const handleRun = async () => {
    if (localProcessing || syncStatus.status === 'running') return;
    if (queueCount === 0) {
      alert("Audit Queue Empty. Import dates first.");
      return;
    }
    
    setLocalProcessing(true);
    setStopping(false);
    setSyncStatus(prev => ({ ...prev, status: 'running', progress_message: 'Engaging Engine...' }));
    
    runDeepResearch().catch(err => {
      console.error("Background Engine Failed to Start:", err);
      setTimeout(() => {
        setLocalProcessing(false);
        setStopping(false);
      }, 3000); 
    });
  };

  const handleStop = async () => {
    setStopping(true);
    setSyncStatus(prev => ({ ...prev, progress_message: 'Terminating...' }));
    try {
      await stopDeepResearch();
    } catch (e) {
      setStopping(false);
    }
  };

  const handleClearQueue = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!window.confirm("PERMANENT: Flush research queue?")) return;
    
    setIsClearing(true);
    try {
      await clearVolatileQueue();
      setQueueCount(0);
      await fetchEvents();
    } catch (err: any) {
      alert(`Ledger Error: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/);
        const dates = lines
          .map(line => line.trim().split(',')[0].replace(/"/g, ''))
          .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
        if (dates.length > 0) {
          await seedVolatileQueue(dates);
          await fetchEvents(); 
        }
      } catch (err) {
        alert("Import Failure.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesMacro = macroFilter === "All" || e.macro_reason === macroFilter;
      const matchesSentiment = sentimentFilter === "All" || e.sentiment === sentimentFilter;
      const matchesSearch = !searchQuery || 
        (e.reason || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
        (e.ai_attribution_summary || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMacro && matchesSentiment && matchesSearch;
    });
  }, [events, macroFilter, sentimentFilter, searchQuery]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage]);

  const totalPages = Math.ceil(filteredEvents.length / pageSize);

  const isActuallyRunning = localProcessing || syncStatus.status === 'running';

  return (
    <div className="w-full space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Research Ledger</h2>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isUploading || isActuallyRunning} 
                className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg disabled:opacity-30"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>}
                <span className="text-[10px] font-black uppercase tracking-widest">Import CSV</span>
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${isActuallyRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <p className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isActuallyRunning ? 'text-amber-500' : 'text-emerald-500'}`}>
                {isActuallyRunning ? 'PROCESSING' : 'READY'}
              </p>
            </div>
            
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-500 ${isActuallyRunning ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-xl ring-4 ring-amber-500/10' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80 whitespace-nowrap">
                {isActuallyRunning ? 'AUDIT LOG:' : 'QUEUE STATUS:'}
              </span>
              <span className="text-[10px] font-mono font-black uppercase tracking-tight">
                {isActuallyRunning ? (syncStatus.progress_message || 'Initializing...') : `${queueCount} Pending`}
              </span>
              {!isActuallyRunning && queueCount > 0 && (
                <button 
                  type="button"
                  onClick={handleClearQueue} 
                  disabled={isClearing}
                  className="ml-4 px-2.5 py-1.5 bg-white border border-slate-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-all shadow-sm flex items-center gap-2 group cursor-pointer active:scale-95"
                >
                  <span className="text-[9px] font-black uppercase tracking-tighter hidden group-hover:inline transition-all">Clear All</span>
                  {isClearing ? <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>}
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 min-w-[200px] justify-end">
          {isActuallyRunning ? (
            <button 
              key="stop-btn"
              onClick={handleStop} 
              disabled={stopping}
              className={`w-full px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl transition-all active:scale-95 border-b-4 ${stopping ? 'bg-slate-400 border-slate-600 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 border-rose-900 animate-in slide-in-from-top-2'}`}
            >
              {stopping ? 'STOPPING...' : 'STOP AUDIT'}
            </button>
          ) : (
             <button 
               key="run-btn"
               onClick={handleRun} 
               disabled={queueCount === 0 || isActuallyRunning} 
               className={`w-full px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 transition-all active:scale-95 ${queueCount === 0 ? 'bg-slate-50 text-slate-200 border-slate-100' : 'bg-slate-900 text-white hover:bg-indigo-600 border-slate-950'}`}
             >
               {queueCount === 0 ? 'Audit Target Empty' : 'Verified Audit'}
             </button>
          )}
        </div>
      </div>
      
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Context</label><input type="text" placeholder="Filter data..." className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 outline-none focus:ring-2 ring-indigo-500/10" onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} /></div>
        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Macro Driver</label><select className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 font-bold uppercase tracking-wider outline-none" onChange={e => { setMacroFilter(e.target.value); setCurrentPage(1); }}><option value="All">All Drivers</option>{['Geopolitical', 'Monetary Policy', 'Inflation', 'Earnings', 'Commodities', 'Global Markets', 'Domestic Policy', 'Technical'].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Market Sentiment</label><select className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 font-bold uppercase tracking-wider outline-none" onChange={e => { setSentimentFilter(e.target.value); setCurrentPage(1); }}><option value="All">All Sentiment</option><option value="POSITIVE">Positive</option><option value="NEGATIVE">Negative</option><option value="NEUTRAL">Neutral</option></select></div>
      </div>
      
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        <ResearchTable events={paginatedEvents} onViewDetails={setSelectedEvent} />
        
        {totalPages > 1 && (
          <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Showing {Math.min(filteredEvents.length, (currentPage - 1) * pageSize + 1)} - {Math.min(currentPage * pageSize, filteredEvents.length)} of {filteredEvents.length} records
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-slate-50 transition-colors shadow-sm"
              >
                Prev
              </button>
              <div className="flex items-center px-4">
                <span className="text-[10px] font-black text-indigo-600">Page {currentPage} of {totalPages}</span>
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-slate-50 transition-colors shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      
      {selectedEvent && <ResearchDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onUpdate={fetchEvents} />}
    </div>
  );
};
