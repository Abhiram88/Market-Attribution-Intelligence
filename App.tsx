import React, { useEffect, useState, useRef } from 'react';
import { StatCard } from './components/StatCard';
import { MarketChart } from './components/MarketChart';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { NiftyRealtimeCard } from './components/NiftyRealtimeCard';
import { MarketLog, Sentiment, AppTab } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog } from './services/geminiService';
import { fetchRealtimeMarketTelemetry } from './services/marketService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('live');
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MarketLog | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; type?: 'quota' | 'generic' } | null>(null);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMarketData = async () => {
    try {
      const { data, error: sbError } = await supabase
        .from('market_logs')
        .select('*, news_attribution(*)')
        .order('log_date', { ascending: false });

      if (sbError) throw sbError;

      if (data) {
        setLogs(data.map((item: any) => {
          const attr = Array.isArray(item.news_attribution) 
            ? item.news_attribution[0] 
            : item.news_attribution;

          return {
            id: item.id,
            date: item.log_date,
            niftyClose: item.nifty_close,
            niftyChange: item.nifty_change,
            niftyChangePercent: item.nifty_change_percent || 0,
            nasdaqClose: item.nasdaq_close,
            nasdaqChangePercent: item.nasdaq_change_percent || 0,
            giftNiftyClose: item.gift_nifty_close,
            thresholdMet: item.threshold_met,
            isAnalyzing: false,
            prevClose: item.meta?.prev_close,
            dayHigh: item.meta?.day_high,
            dayLow: item.meta?.day_low,
            volume: item.meta?.volume,
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
    } finally {
      setLoading(false);
    }
  };

  const updateTelemetry = async () => {
    try {
      const latestLog = await fetchRealtimeMarketTelemetry();
      setError(null);
      setIsPollingPaused(false);
      setLogs(prev => {
        const otherLogs = prev.filter(l => l.date !== latestLog.date);
        return [latestLog, ...otherLogs];
      });
    } catch (err: any) {
      if (err.message.includes("QUOTA_EXCEEDED")) {
        setError({ message: err.message, type: 'quota' });
        setIsPollingPaused(true);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else {
        console.warn("Polling Telemetry Error:", err.message);
      }
    }
  };

  const startPolling = () => {
    if (pollIntervalRef.current) return;
    updateTelemetry();
    pollIntervalRef.current = setInterval(updateTelemetry, 60000);
  };

  const handleRetryTelemetry = () => {
    setError(null);
    setIsPollingPaused(false);
    startPolling();
  };

  const handleRunAttributionNow = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const latestLog = await fetchRealtimeMarketTelemetry();
      await analyzeMarketLog(latestLog);
      await fetchMarketData();
    } catch (err: any) {
      const isQuota = err.message.includes("QUOTA_EXCEEDED");
      setError({ 
        message: isQuota ? err.message : `Attribution Pipeline Failure: ${err.message}`,
        type: isQuota ? 'quota' : 'generic'
      });
      if (isQuota) setIsPollingPaused(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => { 
    fetchMarketData();
    startPolling();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, giftNiftyClose: 0 };
  const todayAttr = latest.attribution;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden w-full flex flex-col">
      
      {/* Universal Navigation */}
      <nav className="w-full px-4 sm:px-8 md:px-12 pt-8 pb-6 border-b border-slate-200/60 bg-white sticky top-0 z-30">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center lg:items-start group cursor-default">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter flex items-center gap-3 md:gap-4 group-hover:scale-[1.01] transition-transform">
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-indigo-600 rounded-lg sm:rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-indigo-600/30 border border-white/10 text-white float-animation text-lg sm:text-xl md:text-2xl">
                IQ
              </div>
              <span className="whitespace-nowrap">Market Intelligence</span>
            </h1>
            <span className="text-[9px] sm:text-[10px] md:text-[11px] text-slate-400 font-mono tracking-[0.3em] sm:tracking-[0.4em] uppercase font-black mt-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
              Quant Layer // Live Telemetry
            </span>
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
            
            {/* Dashboard Header Section */}
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Primary Anchor: Nifty 50 Realtime Card */}
              <div className="flex-1">
                <NiftyRealtimeCard 
                  price={latest.niftyClose} 
                  change={latest.niftyChange} 
                  changePercent={latest.niftyChangePercent}
                  prevClose={latest.prevClose}
                  dayHigh={latest.dayHigh}
                  dayLow={latest.dayLow}
                  volume={latest.volume}
                  isPaused={isPollingPaused}
                />
              </div>

              {/* Supporting Secondary Metrics */}
              <div className="w-full lg:w-1/3 grid grid-cols-1 gap-6">
                <StatCard title="NASDAQ COMP" value={latest.nasdaqClose || 0} changePercent={latest.nasdaqChangePercent} />
                <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose || 0} />
              </div>
            </div>

            {/* ERROR / SYSTEM MESSAGES */}
            {error && (
              <div className={`p-6 rounded-[2rem] border animate-in slide-in-from-top-4 duration-500 flex items-center justify-between gap-4 ${
                error.type === 'quota' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`mt-1 flex-shrink-0 ${error.type === 'quota' ? 'text-amber-500' : 'text-rose-500'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.401 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-[10px] uppercase tracking-widest mb-1">System Notice</p>
                    <p className="text-sm font-medium leading-relaxed">{error.message}</p>
                  </div>
                </div>
                {error.type === 'quota' && (
                  <button onClick={handleRetryTelemetry} className="bg-amber-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md">Retry Ingestion</button>
                )}
              </div>
            )}

            {/* TODAY'S INTELLIGENCE DASHBOARD */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Main Intelligence Card */}
              <div className="xl:col-span-2 space-y-8">
                <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                  
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Today's Market Pulse // {latest.date}</h3>
                    <div className="flex gap-2">
                      {todayAttr && (
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          todayAttr.sentiment === 'POSITIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          {todayAttr.sentiment}
                        </span>
                      )}
                      <button 
                        onClick={handleRunAttributionNow} 
                        disabled={isAnalyzing}
                        className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50"
                      >
                        {isAnalyzing ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        }
                      </button>
                    </div>
                  </div>

                  {todayAttr ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
                        {todayAttr.headline}
                      </h2>
                      <p className="text-slate-500 text-lg leading-relaxed mb-10 font-medium border-l-4 border-indigo-100 pl-6">
                        {todayAttr.summary.substring(0, 350)}...
                        <button onClick={() => setSelectedLog(latest)} className="text-indigo-600 font-black ml-2 hover:underline uppercase text-xs tracking-widest">Read Full Analysis</button>
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Stocks</p>
                          <div className="flex flex-wrap gap-2">
                            {(todayAttr as any).affected_stocks?.map((s: string) => (
                              <span key={s} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg">{s}</span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impacted Sectors</p>
                          <div className="flex flex-wrap gap-2">
                            {(todayAttr as any).affected_sectors?.map((s: string) => (
                              <span key={s} className="px-4 py-2 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-xl border border-slate-200 uppercase tracking-tight">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-24 text-center space-y-6">
                      <div className="w-16 h-16 bg-slate-50 rounded-3xl mx-auto flex items-center justify-center text-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Awaiting Daily Intelligence Run</p>
                      <button onClick={handleRunAttributionNow} disabled={isAnalyzing} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Generate Analysis Now</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Health Metric Column */}
              <div className="space-y-8">
                <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.4em] mb-8 opacity-70">Volatility Gauge</h4>
                   <div className="flex justify-between items-end mb-4">
                      <span className="text-5xl font-black tracking-tighter">
                        {Math.abs(latest.niftyChangePercent || 0).toFixed(2)}%
                      </span>
                      <span className="text-xs font-black uppercase tracking-widest mb-1.5">Movement Scale</span>
                   </div>
                   <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white transition-all duration-1000" style={{ width: `${Math.min(Math.abs(latest.niftyChangePercent || 0) * 50, 100)}%` }} />
                   </div>
                   <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] opacity-60 leading-relaxed">
                     {Math.abs(latest.niftyChangePercent || 0) > 1 ? 'High Volatility detected. System recommends manual attribution check.' : 'Nominal market conditions observed.'}
                   </p>
                </div>
                
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6">Market Health</h4>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center pb-6 border-b border-slate-50">
                      <span className="text-[11px] font-black text-slate-600 uppercase">Day Low</span>
                      <span className="text-sm font-black text-slate-900">{latest.dayLow?.toLocaleString() || '--'}</span>
                    </div>
                    <div className="flex justify-between items-center pb-6 border-b border-slate-50">
                      <span className="text-[11px] font-black text-slate-600 uppercase">Day High</span>
                      <span className="text-sm font-black text-slate-900">{latest.dayHigh?.toLocaleString() || '--'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slate-600 uppercase">Volume</span>
                      <span className="text-sm font-black text-slate-900">{latest.volume ? `${latest.volume.toFixed(2)}M` : '--'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Correlation View */}
            <div className="w-full">
              <MarketChart data={logs} />
            </div>
          </div>
        ) : (
          <ResearchTab />
        )}
      </main>

      {selectedLog && activeTab === 'live' && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={handleRunAttributionNow} 
        />
      )}

      <footer className="py-12 text-center border-t border-slate-200 bg-white w-full mt-auto">
        <p className="text-[10px] uppercase font-black tracking-[0.6em] text-slate-400 px-4">
          PROPRIETARY QUANTITATIVE INTELLIGENCE LAYER // LIVE DASHBOARD VER 3.1
        </p>
      </footer>
    </div>
  );
};

export default App;