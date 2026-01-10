import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerEvent } from '../types';
import { ResearchTable } from './ResearchTable';
import { ResearchDetailModal } from './ResearchDetailModal';
import { runDeepResearch, stopDeepResearch } from '../services/researchService';

export const ResearchTab: React.FC = () => {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState({ status: 'idle', progress_message: 'Standby' });
  const [selectedEvent, setSelectedEvent] = useState<LedgerEvent | null>(null);

  // Advanced Filters
  const [macroFilter, setMacroFilter] = useState<string>("All");
  const [sentimentFilter, setSentimentFilter] = useState<string>("All");
  const [scoreFilter, setScoreFilter] = useState<string>("All");
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchEvents = async () => {
    try {
      const { data } = await supabase
        .from('ledger_events')
        .select('*, ledger_sources(*)')
        .order('event_date', { ascending: false });
      
      if (data) setEvents(data.map(d => ({ ...d, sources: d.ledger_sources })));
    } catch (e) {
      console.error("Fetch failed", e);
    }
  };

  const checkStatus = async () => {
    try {
      const { data } = await supabase
        .from('research_status')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      
      if (data) {
        setSyncStatus({ status: data.status, progress_message: data.progress_message });
        if (data.status === 'completed' || data.status === 'failed') {
          fetchEvents();
        }
      }
    } catch (e) {
      console.error("Status check failed", e);
    }
  };

  useEffect(() => {
    fetchEvents();
    checkStatus();
    const interval = setInterval(checkStatus, 3000); 
    return () => clearInterval(interval);
  }, []);

  const handleRun = async () => {
    if (syncStatus.status === 'running') return;
    runDeepResearch(); 
    setSyncStatus({ status: 'running', progress_message: 'Auditing Ledger Integrity...' });
  };

  const handleTerminate = async () => {
    stopDeepResearch();
    setSyncStatus({ status: 'idle', progress_message: 'Emergency Stop Signal Sent...' });
  };

  // Derive unique sectors for filtering
  const allSectors = useMemo(() => {
    const sectors = new Set<string>();
    events.forEach(e => {
      if (Array.isArray(e.affected_sectors)) {
        e.affected_sectors.forEach(s => sectors.add(s));
      }
    });
    return Array.from(sectors).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return events.filter(e => {
      const matchesMacro = macroFilter === "All" || e.macro_reason === macroFilter;
      const matchesSentiment = sentimentFilter === "All" || e.sentiment === sentimentFilter;
      
      let matchesScore = true;
      if (scoreFilter === "High") matchesScore = (e.score || 0) >= 70;
      else if (scoreFilter === "Med") matchesScore = (e.score || 0) >= 30 && (e.score || 0) < 70;
      else if (scoreFilter === "Low") matchesScore = (e.score || 0) < 30;

      const matchesSector = sectorFilter === "All" || (e.affected_sectors && e.affected_sectors.includes(sectorFilter));

      const reason = (e.reason || "").toLowerCase();
      const summary = (e.ai_attribution_summary || "").toLowerCase();
      const matchesSearch = reason.includes(q) || summary.includes(q);

      return matchesMacro && matchesSentiment && matchesScore && matchesSector && matchesSearch;
    });
  }, [events, macroFilter, sentimentFilter, scoreFilter, sectorFilter, searchQuery]);

  return (
    <div className="bg-white min-h-screen text-slate-900 rounded-t-[2.5rem] mt-4 p-8 md:p-12 shadow-2xl relative overflow-hidden animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-2 text-center md:text-left">
            <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Intelligence Ledger</h2>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <span className={`w-2.5 h-2.5 rounded-full ${
                syncStatus.status === 'running' ? 'bg-amber-500 animate-pulse' : 
                syncStatus.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'
              }`}></span>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                System Status
                <span className="text-slate-300">//</span>
                <span className="text-slate-900 font-bold tracking-tight">{syncStatus.progress_message}</span>
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            {syncStatus.status === 'running' && (
              <button 
                onClick={handleTerminate}
                className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl active:scale-95 flex items-center gap-4 animate-in slide-in-from-right"
              >
                Stop Engine
              </button>
            )}
            
            <button 
              onClick={handleRun}
              disabled={syncStatus.status === 'running'}
              className="group relative bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl active:scale-95 flex items-center gap-4"
            >
              {syncStatus.status === 'running' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Repairing Ledger
                </>
              ) : (
                "Run Verified Audit"
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Filter Engine */}
        <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Keywords</label>
              <input 
                type="text" 
                placeholder="Stocks, Reasons..." 
                className="w-full bg-white rounded-xl px-5 py-3.5 text-xs border-none shadow-sm focus:ring-2 ring-indigo-500/20 transition-all font-medium placeholder:text-slate-300"
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Macro Theme</label>
              <select 
                className="w-full bg-white rounded-xl px-5 py-3.5 text-xs border-none shadow-sm font-black uppercase tracking-wider cursor-pointer"
                onChange={e => setMacroFilter(e.target.value)}
              >
                <option value="All">All Macro Themes</option>
                {['Geopolitical', 'Monetary Policy', 'Inflation', 'Earnings', 'Commodities', 'Global Markets', 'Domestic Policy', 'Risk-off', 'Technical', 'Other'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Market Sentiment</label>
              <select 
                className="w-full bg-white rounded-xl px-5 py-3.5 text-xs border-none shadow-sm font-black uppercase tracking-wider cursor-pointer"
                onChange={e => setSentimentFilter(e.target.value)}
              >
                <option value="All">All Sentiment</option>
                <option value="POSITIVE">Positive</option>
                <option value="NEGATIVE">Negative</option>
                <option value="NEUTRAL">Neutral</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Impact Sector</label>
              <select 
                className="w-full bg-white rounded-xl px-5 py-3.5 text-xs border-none shadow-sm font-black uppercase tracking-wider cursor-pointer"
                onChange={e => setSectorFilter(e.target.value)}
              >
                <option value="All">All Sectors</option>
                {allSectors.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="flex gap-4">
              <button 
                onClick={() => setScoreFilter(scoreFilter === 'High' ? 'All' : 'High')}
                className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${scoreFilter === 'High' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-slate-900 border border-slate-200'}`}
              >
                High Impact Only
              </button>
              <button 
                onClick={() => setScoreFilter(scoreFilter === 'Med' ? 'All' : 'Med')}
                className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${scoreFilter === 'Med' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-slate-400 hover:text-slate-900 border border-slate-200'}`}
              >
                Medium Impact
              </button>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              Matches: <span className="text-slate-900 font-black">{filteredEvents.length} Records</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
          <ResearchTable events={filteredEvents} onViewDetails={setSelectedEvent} />
        </div>
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
