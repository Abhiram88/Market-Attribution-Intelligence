
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { Reg30Tab } from './components/Reg30Tab';
import { NiftyRealtimeCard } from './components/NiftyRealtimeCard';
import { PriorityStocksCard } from './components/PriorityStocksCard';
import { BreezeTokenModal } from './components/BreezeTokenModal';
import { MarketLog, Sentiment, AppTab, NewsAttribution } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog, analyzeStockIntelligence } from './services/geminiService';
import { fetchRealtimeMarketTelemetry, getMarketSessionStatus } from './services/marketService';
import { checkProxyHealth } from './services/breezeService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('live');
  const [intelTab, setIntelTab] = useState<'market' | 'stock'>('market');
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MarketLog | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<{ message: string; type?: 'token' | 'generic' } | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);

  // Stock Intelligence State
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockIntel, setStockIntel] = useState<NewsAttribution | null>(null);
  const [isStockAnalyzing, setIsStockAnalyzing] = useState(false);
  
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

  const handleRunStockAnalysis = async () => {
    if (!stockSearchQuery.trim() || isStockAnalyzing) return;
    
    setIsStockAnalyzing(true);
    setStockIntel(null);
    const today = logs[0]?.date || new Date().toISOString().split('T')[0];
    
    try {
      const intel = await analyzeStockIntelligence(stockSearchQuery.toUpperCase().trim(), today);
      setStockIntel(intel);
    } catch (err: any) {
      alert(`Equity synthesis failed: ${err.message}`);
    } finally {
      setIsStockAnalyzing(false);
    }
  };

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
                  <PriorityStocksCard />
                </div>
              </div>

              {error && (
                <div className={`p-6 rounded-[2rem] border flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 w-full ${error.type === 'token' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  <p className="text-xs font-bold uppercase tracking-wide">{error.message}</p>
                </div>
              )}

              {/* TWO-TAB INTELLIGENCE CONTAINER */}
              <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl relative overflow-hidden group w-full flex flex-col">
                {/* INNER TAB NAV */}
                <div className="px-10 pt-10 flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-50 pb-6">
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-200/50">
                    <button 
                      onClick={() => setIntelTab('market')} 
                      className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${intelTab === 'market' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                    >
                      Market Radar
                    </button>
                    <button 
                      onClick={() => setIntelTab('stock')} 
                      className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${intelTab === 'stock' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}
                    >
                      Equity Deep Dive
                    </button>
                  </div>

                  {/* Stock Search - Persistent for Stock Tab */}
                  {intelTab === 'stock' && (
                    <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/50 w-full sm:w-auto">
                      <input 
                        type="text" 
                        placeholder="ENTER SYMBOL (e.g. RELIANCE)"
                        className="bg-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none border border-slate-100 focus:border-indigo-500 transition-colors w-full sm:w-64"
                        value={stockSearchQuery}
                        onChange={(e) => setStockSearchQuery(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleRunStockAnalysis()}
                      />
                      <button 
                        onClick={handleRunStockAnalysis}
                        disabled={isStockAnalyzing || !stockSearchQuery.trim()}
                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-30"
                      >
                        {isStockAnalyzing ? 'Scanning...' : 'Analyze'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-10 sm:p-14">
                  {intelTab === 'market' ? (
                    todayAttr ? (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex items-start justify-between mb-8">
                          <div className="flex items-center gap-5">
                            <div className={`w-3 h-10 rounded-full ${latest.niftyChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase max-w-4xl">{todayAttr.headline}</h2>
                          </div>
                        </div>
                        <div className="prose prose-slate max-w-none">
                           <p className="text-slate-600 text-lg sm:text-xl leading-relaxed font-medium whitespace-pre-wrap">{todayAttr.narrative}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-24 text-center">
                        <p className="text-slate-900 font-black uppercase text-xs tracking-[0.3em]">Market Intelligence Awaiting Sync</p>
                      </div>
                    )
                  ) : (
                    isStockAnalyzing ? (
                      <div className="py-24 flex flex-col items-center gap-6">
                        <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-slate-900 font-black uppercase text-xs tracking-[0.3em] animate-pulse">Running Forensic Equity Audit...</p>
                      </div>
                    ) : stockIntel ? (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex items-center gap-4 mb-6">
                          <span className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">{stockSearchQuery}</span>
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${stockIntel.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                            {stockIntel.sentiment} Bias
                          </span>
                        </div>
                        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase mb-10">{stockIntel.headline}</h2>
                        <div className="prose prose-slate max-w-none">
                          <p className="text-slate-600 text-lg sm:text-xl leading-relaxed font-medium whitespace-pre-wrap">{stockIntel.narrative}</p>
                        </div>

                        {stockIntel.analyst_calls && stockIntel.analyst_calls.length > 0 && (
                          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-12 border-t border-slate-100">
                             {stockIntel.analyst_calls.map((call, idx) => (
                               <div key={idx} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{call.source}</p>
                                 <h4 className="text-lg font-black text-slate-900 mb-2 uppercase">{call.rating}</h4>
                                 {call.target && <p className="text-sm font-bold text-indigo-600 tracking-tight">TARGET: ₹{call.target}</p>}
                               </div>
                             ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-24 text-center flex flex-col items-center gap-6">
                         <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                         </div>
                         <p className="text-slate-900 font-black uppercase text-xs tracking-[0.3em]">Equity Forensic Engine Ready</p>
                         <p className="text-slate-400 text-[11px] font-medium max-w-xs leading-relaxed">Enter an NSE symbol above to synthesize real-time volatility with analyst recommendations.</p>
                      </div>
                    )
                  )}
                </div>
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
    </div>
  );
};

export default App;
