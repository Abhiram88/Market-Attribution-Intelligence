
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerEvent } from '../types';
import { ResearchTable } from './ResearchTable';
import { ResearchDetailModal } from './ResearchDetailModal';
import { runDeepResearch, stopDeepResearch, seedVolatileQueue } from '../services/researchService';

export const ResearchTab: React.FC = () => {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState({ 
    status: 'idle', 
    progress_message: 'Standby',
    active_date: null as string | null 
  });
  const [selectedEvent, setSelectedEvent] = useState<LedgerEvent | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [macroFilter, setMacroFilter] = useState<string>("All");
  const [sentimentFilter, setSentimentFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchEvents = async () => {
    try {
      const { data } = await supabase
        .from('ledger_events')
        .select('*, ledger_sources(*)')
        .order('log_date', { ascending: false });
      
      if (data) setEvents(data.map(d => ({ ...d, sources: d.ledger_sources })));
    } catch (e) {
      console.error("Fetch failed", e);
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
        if (data.status_text === 'completed' || data.status_text === 'failed') fetchEvents();
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEvents();
    checkStatus();
    const interval = setInterval(checkStatus, 3000); 
    return () => clearInterval(interval);
  }, []);

  const handleRun = () => {
    if (syncStatus.status === 'running') return;
    runDeepResearch();
    setSyncStatus({ 
      status: 'running', 
      progress_message: 'Initiating queue audit...',
      active_date: null
    });
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
          try {
            await seedVolatileQueue(dates);
            alert(`Success: ${dates.length} dates added to volatile queue.`);
          } catch (err: any) {
             alert(`Error: ${err.message}`);
          }
        } else {
          alert("No valid YYYY-MM-DD dates found in the file.");
        }
      } catch (err) {
        alert("File parsing failed.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const tech = e.technical_json || {};
      const matchesMacro = macroFilter === "All" || tech.macro_reason === macroFilter;
      const matchesSentiment = sentimentFilter === "All" || tech.sentiment === sentimentFilter;
      const matchesSearch = !searchQuery || 
        (tech.headline || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
        (e.intelligence_summary || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMacro && matchesSentiment && matchesSearch;
    });
  }, [events, macroFilter, sentimentFilter, searchQuery]);

  const isRunning = syncStatus.status === 'running';

  return (
    <div className="w-full space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-black uppercase tracking-tighter">Research Ledger</h2>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRunning}
                className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg disabled:opacity-30"
                title="Import Date Queue"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                }
                <span className="text-[10px] font-black uppercase tracking-widest">Import CSV</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {isRunning ? syncStatus.progress_message : 'READY'}
              </p>
            </div>
            {isRunning && syncStatus.active_date && (
              <div className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-xl animate-in slide-in-from-left duration-500 ring-4 ring-indigo-500/10">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Auditing Record:</span>
                <span className="text-[10px] font-mono font-black">{syncStatus.active_date}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          {isRunning && (
            <button 
              onClick={stopDeepResearch} 
              className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-600/20 active:scale-95 border-b-4 border-rose-800"
            >
              Stop
            </button>
          )}
          <button 
            onClick={handleRun}
            disabled={isRunning}
            className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-xl border-b-4 border-slate-950"
          >
            {isRunning ? 'Auditing Batch...' : 'Verified Audit'}
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Context</label>
          <input 
            type="text" 
            placeholder="Filter data..." 
            className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 focus:ring-2 ring-indigo-500/10 outline-none"
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Macro Driver</label>
          <select 
            className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 font-bold uppercase tracking-wider outline-none"
            onChange={e => setMacroFilter(e.target.value)}
          >
            <option value="All">All Drivers</option>
            {['Geopolitical', 'Monetary Policy', 'Inflation', 'Earnings', 'Commodities', 'Global Markets', 'Domestic Policy', 'Technical'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Market Sentiment</label>
          <select 
            className="w-full bg-slate-50 rounded-xl px-5 py-3.5 text-xs border border-slate-200 font-bold uppercase tracking-wider outline-none"
            onChange={e => setSentimentFilter(e.target.value)}
          >
            <option value="All">All Sentiment</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="NEUTRAL">Neutral</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
        <ResearchTable events={filteredEvents} onViewDetails={setSelectedEvent} />
      </div>

      {selectedEvent && (
        <ResearchDetailModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)} 
          onUpdate={fetchEvents}
        />
      )}
    </div>
  );
};
