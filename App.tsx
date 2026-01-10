import React, { useEffect, useState } from 'react';
import { StatCard } from './components/StatCard';
import { MarketChart } from './components/MarketChart';
import { AttributionTable } from './components/AttributionTable';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
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

  const fetchMarketData = async () => {
    setLoading(true);
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
            attribution: attr ? {
              headline: attr.headline,
              summary: attr.summary,
              category: attr.category,
              sentiment: attr.sentiment as Sentiment,
              relevanceScore: attr.relevance_score,
              sources: [] 
            } : undefined
          };
        }));
      }
    } catch (err: any) {
      setError({ message: `Ledger Sync Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRunAttributionNow = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const latestLog = await fetchRealtimeMarketTelemetry();
      if (latestLog && latestLog.thresholdMet) {
        setLogs(prev => [ { ...latestLog, isAnalyzing: true }, ...prev.filter(l => l.date !== latestLog.date) ]);
        const attr = await analyzeMarketLog(latestLog);
        const completeLog = { ...latestLog, attribution: attr, isAnalyzing: false };
        if (selectedLog?.id === latestLog.id) setSelectedLog(completeLog);
      }
      await fetchMarketData();
    } catch (err: any) {
      const isQuota = err.message.includes("QUOTA_EXCEEDED");
      setError({ 
        message: isQuota ? err.message : `Attribution Pipeline Failure: ${err.message}`,
        type: isQuota ? 'quota' : 'generic'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRowAnalyze = async (id: string) => {
    setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: true } : l));
    const target = logs.find(l => l.id === id);
    if (!target) return;

    try {
      const attribution = await analyzeMarketLog(target);
      const updatedLog = { ...target, isAnalyzing: false, attribution };
      setLogs(prev => prev.map(l => l.id === id ? updatedLog : l));
      if (selectedLog?.id === id) setSelectedLog(updatedLog);
    } catch (err: any) {
      const isQuota = err.message.includes("QUOTA_EXCEEDED");
      setError({ 
        message: isQuota ? err.message : `Analysis Failed: ${err.message}`,
        type: isQuota ? 'quota' : 'generic'
      });
      setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: false } : l));
    }
  };

  useEffect(() => { 
    fetchMarketData();
  }, []);

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, giftNiftyClose: 0 };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden w-full flex flex-col">
      
      {/* Universal Navigation - Edge to Edge with Padding */}
      <nav className="w-full px-4 sm:px-8 md:px-12 pt-8 pb-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md sticky top-0 z-30">
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
          <div className="w-full space-y-8 sm:space-y-12 animate-in slide-in-from-bottom-2 duration-700">
            
            {/* Error Banner */}
            {error && (
              <div className={`p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border animate-in slide-in-from-top-4 duration-500 flex items-start gap-4 ${
                error.type === 'quota' ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-rose-50 border-rose-100 text-rose-800'
              }`}>
                <div className={`p-2 rounded-xl flex-shrink-0 ${error.type === 'quota' ? 'bg-amber-100' : 'bg-rose-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[9px] sm:text-[10px] uppercase tracking-widest mb-1">{error.type === 'quota' ? 'Quota Limitation Met' : 'Engine Interruption'}</p>
                  <p className="text-sm font-medium leading-relaxed truncate sm:whitespace-normal">{error.message}</p>
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-black/5 rounded-lg transition-colors flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm gap-4">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">Telemetry Stream</h2>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global & Domestic Analytics</p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <button 
                  onClick={fetchMarketData}
                  className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl hover:bg-slate-100 transition-all border border-slate-200"
                  aria-label="Refresh Data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <button 
                  onClick={handleRunAttributionNow}
                  disabled={isAnalyzing}
                  className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black hover:bg-indigo-700 disabled:opacity-50 text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-xl shadow-indigo-600/20"
                >
                  {isAnalyzing ? "Processing..." : "Run Engine"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              <StatCard title="NSE NIFTY 50" value={latest.niftyClose || 0} change={latest.niftyChange} changePercent={latest.niftyChangePercent} />
              <StatCard title="NASDAQ COMP" value={latest.nasdaqClose || 0} />
              <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose || 0} />
            </div>

            <div className="w-full">
              <MarketChart data={logs} />
            </div>
            
            <div className="bg-white rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/40">
                 <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.3em]">Historical Intelligence Ledger</h3>
              </div>
              <AttributionTable logs={logs} onAnalyze={handleRowAnalyze} onViewDetails={setSelectedLog} />
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
          onReAnalyze={handleRowAnalyze} 
        />
      )}

      <footer className="py-12 text-center border-t border-slate-200 bg-white w-full">
        <p className="text-[9px] sm:text-[10px] uppercase font-black tracking-[0.4em] sm:tracking-[0.6em] text-slate-400 px-4">
          PROPRIETARY QUANTITATIVE INTELLIGENCE LAYER // ALPHA VER 2.5
        </p>
      </footer>
    </div>
  );
};

export default App;