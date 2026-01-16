
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { Reg30Tab } from './components/Reg30Tab';
import { NiftyRealtimeCard } from './components/NiftyRealtimeCard';
import { HistoricalCloseCard } from './components/HistoricalCloseCard';
import { BreezeTokenModal } from './components/BreezeTokenModal';
import { MarketLog, Sentiment, AppTab } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog } from './services/geminiService';
import { fetchRealtimeMarketTelemetry, getMarketSessionStatus } from './services/marketService';
import { checkProxyHealth } from './services/breezeService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('live');
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MarketLog | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<{ message: string; type?: 'token' | 'generic' } | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUpdatingRef = useRef(false);
  const hasAttemptedAutoAnalysis = useRef<Set<string>>(new Set());

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
            niftyClose: item.ltp,
            niftyChange: item.points_change,
            niftyChangePercent: item.change_percent || 0,
            thresholdMet: Math.abs(item.change_percent || 0) > 0.4,
            isAnalyzing: false,
            dayHigh: item.day_high,
            dayLow: item.day_low,
            volume: item.volume,
            dataSource: item.source || 'Cached',
            attribution: attr ? {
              headline: attr.headline,
              narrative: attr.narrative,
              category: attr.impact_json?.category,
              sentiment: (attr.impact_json?.sentiment || 'NEUTRAL') as Sentiment,
              impact_score: attr.impact_score,
              sources: [],
              affected_stocks: attr.impact_json?.stocks || [],
              affected_sectors: attr.impact_json?.sectors || []
            } : undefined
          };
        }));
      }
    } catch (err: any) {
      console.error("History fetch failed:", err);
    }
  };

  const handleRunAnalysis = useCallback(async (targetLog: MarketLog) => {
    if (!targetLog || isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const attribution = await analyzeMarketLog(targetLog);
      setLogs(prev => prev.map(log => 
        log.id === targetLog.id ? { ...log, attribution } : log
      ));
      hasAttemptedAutoAnalysis.current.add(targetLog.date);
    } catch (err: any) {
      console.warn("Analysis failed:", err.message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  const updateTelemetry = async () => {
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    
    try {
      const health = await checkProxyHealth();
      if (health.ok && !health.session_token_set) {
        setError({ message: "Breeze Session Required", type: 'token' });
        setShowTokenModal(true);
        isUpdatingRef.current = false;
        return;
      }

      const latestLog = await fetchRealtimeMarketTelemetry();
      
      if (latestLog.errorMessage && !latestLog.errorMessage.includes("Connectivity Issue")) {
        setError({ message: latestLog.errorMessage, type: 'generic' });
      } else {
        setError(null);
      }
      
      setLogs(prev => {
        const existingLog = prev.find(l => l.date === latestLog.date);
        
        // Instant Merging: Always prioritize the newest non-zero data
        const mergedLog = {
          ...latestLog,
          niftyChange: (latestLog.niftyChange !== 0 || !existingLog) ? latestLog.niftyChange : (existingLog.niftyChange || 0),
          volume: (latestLog.volume !== 0 || !existingLog) ? latestLog.volume : (existingLog.volume || 0),
          attribution: latestLog.attribution || existingLog?.attribution
        };

        const otherLogs = prev.filter(l => l.date !== latestLog.date);
        return [mergedLog, ...otherLogs];
      });

      setLogs(currentLogs => {
        const latest = currentLogs[0];
        if (latest && !latest.attribution && !isAnalyzing && latest.thresholdMet && !hasAttemptedAutoAnalysis.current.has(latest.date)) {
           handleRunAnalysis(latest);
        }
        return currentLogs;
      });

    } catch (err: any) {
      if (err.message === "BREEZE_SESSION_MISSING") {
        setError({ message: "Breeze Session Required", type: 'token' });
        setShowTokenModal(true);
      } else if (!err.message.includes("Unexpected token '<'")) {
        setError({ message: `Telemetry Link Failure: ${err.message}`, type: 'generic' });
      }
    } finally {
      isUpdatingRef.current = false;
    }
  };

  const startPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    updateTelemetry();
    // 2 second high-frequency poll for a "Real-time" feel
    pollIntervalRef.current = setInterval(updateTelemetry, 2000); 
  };

  const handleAuthComplete = () => {
    setShowTokenModal(false);
    setError(null);
    updateTelemetry();
  };

  useEffect(() => { 
    fetchHistory();
    startPolling();
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
  const isBreezeConnected = !error && (latest.dataSource === 'Breeze' || latest.dataSource === 'Breeze Direct');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden w-full flex flex-col">
      <nav className="w-full px-4 sm:px-8 md:px-12 pt-8 pb-6 border-b border-slate-200/60 bg-white sticky top-0 z-[60]">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6 w-full">
          <div className="flex flex-col items-center lg:items-start group cursor-default">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter flex items-center gap-3 group-hover:scale-[1.01] transition-transform">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-2xl shadow-indigo-600/30 border border-white/10 text-white float-animation text-lg">
                  IQ
                </div>
                <span className="whitespace-nowrap">Intelligence Monitor</span>
              </h1>
              {isBreezeConnected && (
                <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full animate-in fade-in zoom-in duration-500">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">REAL-TIME LINK</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-[9px] font-mono tracking-[0.2em] uppercase font-black flex items-center gap-2 ${sessionStatus.color}`}>
                {sessionStatus.label}
              </span>
              <div className="w-[1px] h-3 bg-slate-200" />
              <button onClick={() => setShowTokenModal(true)} className="text-[9px] text-indigo-500 font-black uppercase tracking-widest hover:underline">
                API GATEWAY
              </button>
            </div>
          </div>

          <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
            <button onClick={() => setActiveTab('live')} className={`px-6 sm:px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>Monitor</button>
            <button onClick={() => setActiveTab('research')} className={`px-6 sm:px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'research' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>Research</button>
            <button onClick={() => setActiveTab('reg30')} className={`px-6 sm:px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'reg30' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>Reg30</button>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full px-4 sm:px-8 md:px-12 py-8 sm:py-12 flex flex-col items-center">
        <div className="w-full max-w-[100%] mx-auto">
          {activeTab === 'live' ? (
            <div className="w-full space-y-12 animate-in fade-in duration-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                <div className="min-h-[320px]">
                  <NiftyRealtimeCard 
                    price={latest.niftyClose} 
                    change={latest.niftyChange} 
                    changePercent={latest.niftyChangePercent}
                    dayHigh={latest.dayHigh}
                    dayLow={latest.dayLow}
                    volume={latest.volume}
                    isPaused={!!error}
                    dataSource={latest.dataSource}
                    errorType={error?.type}
                    errorMessage={error?.message}
                  />
                </div>
                <div className="min-h-[320px]">
                  <HistoricalCloseCard logs={logs} />
                </div>
              </div>

              {error && (
                <div className={`p-6 rounded-[2rem] border flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 w-full ${error.type === 'token' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  <p className="text-xs font-bold uppercase tracking-wide">{error.message}</p>
                  {error.type === 'token' && (
                    <button onClick={() => setShowTokenModal(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20">Re-Sync Gateway</button>
                  )}
                </div>
              )}

              <div className="bg-white p-10 sm:p-14 rounded-[3.5rem] border border-slate-200 shadow-2xl relative overflow-hidden group w-full">
                {todayAttr ? (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className={`w-3 h-10 rounded-full ${latest.niftyChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase max-w-4xl">{todayAttr.headline}</h2>
                      </div>
                      <button 
                        onClick={() => handleRunAnalysis(latest)} 
                        disabled={isAnalyzing}
                        className="p-4 bg-slate-50 hover:bg-indigo-50 text-indigo-600 rounded-2xl border border-slate-200 transition-all shadow-sm group/sync"
                        title="Sync Today's News Intelligence"
                      >
                         {isAnalyzing ? (
                           <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                         ) : (
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 group-hover/sync:rotate-180 transition-transform duration-500">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                           </svg>
                         )}
                      </button>
                    </div>
                    <div className="prose prose-slate max-w-none">
                       <p className="text-slate-600 text-lg sm:text-xl leading-relaxed font-medium whitespace-pre-wrap">{todayAttr.narrative}</p>
                    </div>
                    
                    <div className="mt-12 pt-10 border-t border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Sentiment Alignment</p>
                          <div className={`inline-flex items-center justify-center px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] border shadow-sm ${
                            todayAttr.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                            {todayAttr.sentiment}
                          </div>
                       </div>
                       <div className="space-y-4 text-left md:text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Equities</p>
                          <div className="flex flex-wrap md:justify-end gap-2">
                             {todayAttr.affected_stocks?.map(s => (
                               <span key={s} className="px-4 py-2 bg-[#4F46E5] text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-indigo-700 transition-colors cursor-default">{s}</span>
                             ))}
                          </div>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-24 text-center space-y-6">
                    {isAnalyzing ? (
                      <div className="inline-flex flex-col items-center animate-in fade-in duration-500">
                        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6" />
                        <p className="text-slate-900 font-black uppercase text-xs tracking-[0.3em]">Synthesizing Intelligence Dossier...</p>
                        <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-widest">Grounded Google Search Contextualization in Progress</p>
                      </div>
                    ) : (
                      <div className="inline-flex flex-col items-center animate-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-6">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                        </div>
                        <p className="text-slate-900 font-black uppercase text-xs tracking-[0.3em]">No Intelligence Logged for Today</p>
                        <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-widest">Run the engine to fetch historical session drivers</p>
                        <button 
                          onClick={() => handleRunAnalysis(latest)} 
                          className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-105 transition-transform"
                        >
                          Run AI Analysis
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'research' ? (
            <ResearchTab />
          ) : (
            <Reg30Tab />
          )}
        </div>
      </main>

      {showTokenModal && (
        <BreezeTokenModal onSave={handleAuthComplete} onClose={() => setShowTokenModal(false)} />
      )}

      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} onReAnalyze={() => {}} />
      )}
    </div>
  );
};

export default App;
