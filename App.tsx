
import React, { useEffect, useState, useRef } from 'react';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { NiftyRealtimeCard } from './components/NiftyRealtimeCard';
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

  const fetchHistory = async () => {
    try {
      // Updated to match the market_logs schema in the screenshot: ltp, points_change, change_percent, day_high, day_low, volume, source
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
    try {
      const health = await checkProxyHealth();
      if (health.ok && !health.session_token_set) {
        setError({ message: "Breeze Session Required", type: 'token' });
        setShowTokenModal(true);
        return;
      }

      const latestLog = await fetchRealtimeMarketTelemetry();
      
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
      if (err.message === "BREEZE_SESSION_MISSING") {
        setError({ message: "Breeze Session Required", type: 'token' });
        setShowTokenModal(true);
      } else {
        setError({ message: `Telemetry Link Failure: ${err.message}`, type: 'generic' });
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

  const handleAuthComplete = () => {
    setShowTokenModal(false);
    setError(null);
    updateTelemetry();
  };

  const handleRunAnalysis = async () => {
    const currentLatest = logs[0];
    if (!currentLatest || isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const attribution = await analyzeMarketLog(currentLatest);
      setLogs(prev => prev.map(log => 
        log.id === currentLatest.id ? { ...log, attribution } : log
      ));
    } catch (err: any) {
      setError({ message: `Analysis failed: ${err.message}`, type: 'generic' });
    } finally {
      setIsAnalyzing(false);
    }
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
  const isBreezeConnected = !error && latest.dataSource === 'Breeze';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden w-full flex flex-col">
      
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
                Configure API Gateway
              </button>
            </div>
          </div>

          <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
            <button onClick={() => setActiveTab('live')} className={`px-6 sm:px-10 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>Monitor</button>
            <button onClick={() => setActiveTab('research')} className={`px-6 sm:px-10 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'research' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500'}`}>Research</button>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full px-4 sm:px-8 md:px-12 py-8 sm:py-12">
        {activeTab === 'live' ? (
          <div className="w-full space-y-12">
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

            {error && (
              <div className={`p-6 rounded-[2.5rem] border flex items-center justify-between gap-4 ${error.type === 'token' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-sm font-medium">{error.message}</p>
                {error.type === 'token' && (
                  <button onClick={() => setShowTokenModal(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Synchronize</button>
                )}
              </div>
            )}

            <div className="bg-white p-10 sm:p-14 rounded-[4rem] border border-slate-200 shadow-2xl relative overflow-hidden group">
              {todayAttr ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="flex items-center gap-5 mb-10">
                    <div className={`w-4 h-14 rounded-full ${latest.niftyChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <h2 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight uppercase">{todayAttr.headline}</h2>
                  </div>
                  <p className="text-slate-500 text-xl sm:text-2xl leading-relaxed font-medium mb-16">{todayAttr.summary}</p>
                </div>
              ) : (
                <div className="py-40 text-center">
                  <button onClick={handleRunAnalysis} disabled={isAnalyzing} className="bg-indigo-600 text-white px-14 py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-indigo-700 disabled:opacity-50">
                    {isAnalyzing ? "Synthesizing Dossier..." : "Generate Causal Reasoning"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ResearchTab />
        )}
      </main>

      {showTokenModal && (
        <BreezeTokenModal 
          onSave={handleAuthComplete} 
          onClose={() => setShowTokenModal(false)} 
        />
      )}

      {selectedLog && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={() => {}} 
        />
      )}
    </div>
  );
};

export default App;
