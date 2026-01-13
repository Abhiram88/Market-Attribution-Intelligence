import React, { useEffect, useState, useRef } from 'react';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { NiftyRealtimeCard } from './components/NiftyRealtimeCard';
import { BreezeTokenModal } from './components/BreezeTokenModal';
import { MarketLog, Sentiment, AppTab } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog } from './services/geminiService';
import { fetchRealtimeMarketTelemetry, getMarketSessionStatus } from './services/marketService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('live');
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MarketLog | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<{ message: string; type?: 'token' | 'generic' } | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [breezeToken, setBreezeToken] = useState<string>(localStorage.getItem('breeze_token') || '');
  
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = async () => {
    try {
      const { data, error: sbError } = await supabase
        .from('market_logs')
        .select('*, news_attribution(*)')
        .order('log_date', { ascending: false });

      if (sbError) throw sbError;

      if (data) {
        setLogs(data.map((item: any) => {
          const attr = Array.isArray(item.news_attribution) ? item.news_attribution[0] : item.news_attribution;
          return {
            id: item.id,
            date: item.log_date,
            niftyClose: item.nifty_close,
            niftyChange: item.nifty_change,
            niftyChangePercent: item.nifty_change_percent || 0,
            nasdaqClose: item.nasdaq_close || 0,
            nasdaqChangePercent: item.nasdaq_change_percent || 0,
            giftNiftyClose: item.gift_nifty_close,
            thresholdMet: item.threshold_met,
            isAnalyzing: false,
            prevClose: item.meta?.prev_close,
            dayHigh: item.meta?.day_high,
            dayLow: item.meta?.day_low,
            volume: item.meta?.volume,
            dataSource: item.meta?.source === 'BREEZE_DIRECT_V1' ? 'Breeze Direct' : 
                        item.meta?.source === 'GEMINI_AI_FALLBACK' ? 'Gemini Logic' : 'Cached',
            attribution: attr ? {
              headline: attr.headline,
              summary: attr.summary,
              category: attr.category,
              sentiment: attr.sentiment as Sentiment,
              relevanceScore: attr.relevance_score,
              sources: [],
              affected_stocks: attr.meta?.stocks || [],
              affected_sectors: attr.meta?.sectors || []
            } : undefined
          };
        }));
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const updateTelemetry = async () => {
    const token = localStorage.getItem('breeze_token');
    if (!token) {
      setError({ message: "Breeze Token Required", type: 'token' });
      setShowTokenModal(true);
      return;
    }

    try {
      const latestLog = await fetchRealtimeMarketTelemetry(token);
      
      // Update error state and logs atomically to prevent UI mismatches
      if (latestLog.errorMessage) {
        setError({ message: latestLog.errorMessage, type: 'generic' });
      } else {
        setError(null);
      }
      
      setLogs(prev => {
        const otherLogs = prev.filter(l => l.date !== latestLog.date);
        return [latestLog, ...otherLogs];
      });
    } catch (err: any) {
      if (err.message === "BREEZE_TOKEN_INVALID" || err.message === "BREEZE_TOKEN_MISSING") {
        setError({ message: "Breeze Session Expired", type: 'token' });
        localStorage.removeItem('breeze_token'); 
        setShowTokenModal(true);
      } else {
        setError({ message: `Telemetry Connection Lost: ${err.message}`, type: 'generic' });
      }
    }
  };

  const startPolling = () => {
    if (pollIntervalRef.current) return;
    const session = getMarketSessionStatus();
    updateTelemetry();
    if (session.isOpen) {
      pollIntervalRef.current = setInterval(updateTelemetry, 60000); 
    }
  };

  const handleRunAnalysis = async () => {
    if (!logs[0]) return;
    setIsAnalyzing(true);
    try {
      await analyzeMarketLog(logs[0]);
      await fetchHistory();
    } catch (e: any) {
      setError({ message: e.message || "AI Causal Synthesis Failed", type: 'generic' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToken = (token: string) => {
    localStorage.setItem('breeze_token', token);
    setBreezeToken(token);
    setShowTokenModal(false);
    setError(null);
    updateTelemetry();
  };

  useEffect(() => { 
    fetchHistory();
    const token = localStorage.getItem('breeze_token');
    if (token) {
      startPolling();
    } else {
      setShowTokenModal(true);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const latest: MarketLog = logs[0] || { 
    id: '', 
    date: new Date().toISOString().split('T')[0],
    niftyClose: 0, 
    niftyChange: 0, 
    niftyChangePercent: 0,
    nasdaqClose: 0,
    nasdaqChangePercent: 0,
    giftNiftyClose: 0,
    thresholdMet: false,
    isAnalyzing: false,
    prevClose: 0,
    dayHigh: 0,
    dayLow: 0,
    volume: 0,
    attribution: undefined,
    dataSource: 'Awaiting...'
  };
  
  const todayAttr = latest.attribution;
  const sessionStatus = getMarketSessionStatus();
  const isBreezeConnected = !error && latest.dataSource === 'Breeze Direct';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden w-full flex flex-col">
      
      {/* GLOBAL NAVIGATION */}
      <nav className="w-full px-4 sm:px-8 md:px-12 pt-8 pb-6 border-b border-slate-200/60 bg-white sticky top-0 z-[60]">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center lg:items-start group cursor-default">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter flex items-center gap-3 md:gap-4 group-hover:scale-[1.01] transition-transform">
                <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-indigo-600 rounded-lg sm:rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-indigo-600/30 border border-white/10 text-white float-animation text-lg sm:text-xl md:text-2xl">
                  IQ
                </div>
                <span className="whitespace-nowrap">Market Intelligence</span>
              </h1>
              {isBreezeConnected && (
                <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full animate-in fade-in zoom-in duration-500 shadow-sm">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">BREEZE ACTIVE</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-[10px] font-mono tracking-[0.3em] uppercase font-black flex items-center gap-2 ${sessionStatus.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sessionStatus.isOpen ? 'bg-teal-400 animate-pulse' : 'bg-slate-300'}`}></span>
                {sessionStatus.label}
              </span>
              <div className="w-[1px] h-3 bg-slate-200" />
              <button onClick={() => setShowTokenModal(true)} className="text-[10px] text-indigo-500 font-black uppercase tracking-widest hover:underline">
                Update Breeze Token
              </button>
            </div>
          </div>

          <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
            <button 
              onClick={() => setActiveTab('live')}
              className={`px-6 sm:px-10 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all ${activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Monitor
            </button>
            <button 
              onClick={() => setActiveTab('research')}
              className={`px-6 sm:px-10 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all ${activeTab === 'research' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Research
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full px-4 sm:px-8 md:px-12 py-8 sm:py-12">
        {activeTab === 'live' ? (
          <div className="w-full space-y-12 animate-in slide-in-from-bottom-2 duration-700">
            
            {/* REAL-TIME DASHBOARD HEADER */}
            <div className="w-full">
              <NiftyRealtimeCard 
                price={latest.niftyClose} 
                change={latest.niftyChange} 
                changePercent={latest.niftyChangePercent}
                prevClose={latest.prevClose}
                dayHigh={latest.dayHigh}
                dayLow={latest.dayLow}
                volume={latest.volume}
                isPaused={!!error}
                dataSource={latest.dataSource}
                errorType={error?.type}
                errorMessage={error?.message}
              />
            </div>

            {/* STATUS & ALERTS */}
            <div className="space-y-4">
              {error && (
                <div className={`p-6 rounded-[2.5rem] border animate-in slide-in-from-top-4 duration-500 flex items-center justify-between gap-4 ${
                  error.type === 'token' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-[10px] uppercase tracking-widest mb-1">System Diagnostic Alert</p>
                      <p className="text-sm font-medium leading-relaxed">{error.message}</p>
                    </div>
                  </div>
                  {error.type === 'token' && (
                    <button onClick={() => setShowTokenModal(true)} className="bg-amber-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md">Reconnect Breeze</button>
                  )}
                </div>
              )}
            </div>

            {/* INTELLIGENCE PULSE SECTION */}
            <div className="bg-white p-10 sm:p-14 rounded-[4rem] border border-slate-200 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-50/40 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />
              
              <div className="flex justify-between items-center mb-10 relative z-10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Integrated Intelligence Pulse // {latest.date}</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="bg-slate-900 text-white px-8 py-4 rounded-2xl hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center gap-3 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-slate-900/10"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <span>Causal Synthesis Running...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        <span>{todayAttr ? 'Re-Sync Intelligence' : 'Sync Intelligence Engine'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {todayAttr ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
                  <div className="flex items-center gap-5 mb-10">
                    <div className={`w-4 h-14 rounded-full ${latest.niftyChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <h2 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight uppercase">
                      {todayAttr.headline}
                    </h2>
                  </div>
                  
                  <div className="prose prose-slate max-w-none mb-16">
                    <p className="text-slate-500 text-xl sm:text-2xl leading-relaxed font-medium pl-8 border-l-8 border-slate-100">
                      {todayAttr.summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 pt-12 border-t border-slate-50">
                    <div className="space-y-6">
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full" /> Volume Moving Sectors
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(todayAttr as any).affected_sectors?.map((s: string) => (
                          <span key={s} className="px-6 py-3 bg-slate-50 text-slate-600 text-[11px] font-black rounded-2xl border border-slate-200 uppercase tracking-tight">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <span className="w-2.5 h-2.5 bg-slate-900 rounded-full" /> Performance Symbols
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(todayAttr as any).affected_stocks?.map((s: string) => (
                          <span key={s} className="px-6 py-3 bg-slate-900 text-white text-[11px] font-black rounded-2xl shadow-lg uppercase tracking-widest">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <span className="w-2.5 h-2.5 bg-teal-500 rounded-full" /> Causal Logic
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="bg-indigo-50 text-indigo-600 px-6 py-3 rounded-2xl border border-indigo-100 text-[11px] font-black uppercase tracking-[0.2em]">{todayAttr.category}</span>
                        <span className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] border ${todayAttr.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                          {todayAttr.sentiment}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-40 text-center relative z-10">
                  <div className="w-28 h-28 bg-indigo-50 rounded-[3rem] mx-auto flex items-center justify-center text-indigo-300 mb-10 border border-indigo-100">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12"><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699-2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg>
                  </div>
                  <p className="text-slate-400 font-black uppercase tracking-[0.5em] text-sm mb-12">Breeze Brokerage Link Active // Awaiting Deep Synthesis</p>
                  <button 
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="bg-indigo-600 text-white px-14 py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-5 mx-auto"
                  >
                    {isAnalyzing ? "Synthesizing Dossier..." : "Generate Causal Reasoning"}
                  </button>
                </div>
              )}
            </div>

            {/* RECENT HISTORICAL FEED */}
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10">Historical Context Log</h4>
              <div className="space-y-2">
                {logs.slice(1, 6).map((l) => (
                  <div key={l.id} className="flex justify-between items-center p-6 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{l.date}</p>
                    <div className="flex items-center gap-8">
                      <p className="text-[12px] font-black text-slate-900 tabular-nums">{l.niftyClose?.toLocaleString()}</p>
                      <span className={`text-[12px] font-black w-20 text-right ${(l.niftyChange || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(l.niftyChange || 0) >= 0 ? '+' : ''}{(l.niftyChangePercent || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ResearchTab />
        )}
      </main>

      {showTokenModal && (
        <BreezeTokenModal 
          onSave={handleSaveToken} 
          onClose={() => setShowTokenModal(false)} 
        />
      )}

      {selectedLog && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={handleRunAnalysis} 
        />
      )}

      <footer className="py-16 text-center border-t border-slate-200 bg-white w-full mt-auto">
        <p className="text-[10px] uppercase font-black tracking-[0.7em] text-slate-300 px-6">
          ICICI BREEZE DIRECT // GEMINI 3 PRO // PROPRIETARY CAUSAL ANALYTICS ENGINE
        </p>
      </footer>
    </div>
  );
};

export default App;