
import React, { useEffect, useState } from 'react';
import { StatCard } from './components/StatCard';
import { MarketChart } from './components/MarketChart';
import { AttributionTable } from './components/AttributionTable';
import { LogDetailModal } from './components/LogDetailModal';
import { MarketLog, Sentiment } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog } from './services/geminiService';

const App: React.FC = () => {
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<MarketLog | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Check for API Key on mount as required for Gemini 3 / Veo models
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } catch (err) {
        setHasApiKey(false);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success as per guidelines to mitigate race condition
      setHasApiKey(true);
    } catch (err) {
      console.error("Failed to open key selector:", err);
    }
  };

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
      setError(`Ledger Sync Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAttributionNow = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      // Updated with the correct market data from user feedback
      const niftyPrice = 25876.85;
      const niftyChange = -263.90;
      const logDate = new Date().toISOString().split('T')[0];

      const payload = {
        log_date: logDate,
        nifty_close: niftyPrice,
        nifty_change: niftyChange,
        nifty_change_percent: -1.01,
        nasdaq_close: 23584.27,
        nasdaq_change_percent: -1.2,
        gift_nifty_close: 25950.00,
        threshold_met: Math.abs(niftyChange) > 90
      };

      let logRecord;
      const { data: existing } = await supabase
        .from('market_logs')
        .select('id')
        .eq('log_date', logDate)
        .maybeSingle();

      if (existing) {
        const { data, error: updateError } = await supabase
          .from("market_logs")
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (updateError) throw updateError;
        logRecord = data;
      } else {
        const { data, error: insertError } = await supabase
          .from("market_logs")
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        logRecord = data;
      }

      if (logRecord && logRecord.threshold_met) {
        const mappedLog: MarketLog = {
          id: logRecord.id,
          date: logRecord.log_date,
          niftyClose: logRecord.nifty_close,
          niftyChange: logRecord.nifty_change,
          niftyChangePercent: logRecord.nifty_change_percent || 0,
          nasdaqClose: logRecord.nasdaq_close,
          nasdaqChangePercent: logRecord.nasdaq_change_percent || 0,
          giftNiftyClose: logRecord.gift_nifty_close,
          thresholdMet: logRecord.threshold_met,
          isAnalyzing: true
        };
        const attr = await analyzeMarketLog(mappedLog);
        const completeLog = { ...mappedLog, attribution: attr, isAnalyzing: false };
        if (selectedLog?.id === logRecord.id) {
          setSelectedLog(completeLog);
        }
      }

      await fetchMarketData();
    } catch (err: any) {
      if (err.message === "API_KEY_ERROR") {
        setHasApiKey(false);
        setError("API Session Expired. Please select your API key again.");
      } else {
        setError(`Attribution Pipeline Failure: ${err.message}`);
      }
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
      if (err.message === "API_KEY_ERROR") {
        setHasApiKey(false);
        setError("API Key verification failed. Please select a valid paid project key.");
      } else {
        setError(`Analysis Failed: ${err.message}`);
      }
      setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: false } : l));
    }
  };

  useEffect(() => { 
    if (hasApiKey) fetchMarketData(); 
  }, [hasApiKey]);

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8 animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(79,70,229,0.3)] border border-indigo-500/30">
            <span className="text-4xl font-black text-white">IQ</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Professional Access</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              This intelligence layer utilizes <strong>Gemini 3 Pro</strong> and real-time grounding. To continue, please authenticate with a paid Google Cloud Project API Key.
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Documentation: <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-400 hover:underline">ai.google.dev/gemini-api/docs/billing</a>
            </p>
          </div>
          <button 
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-5 rounded-3xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
          >
            Authenticate Session
          </button>
        </div>
      </div>
    );
  }

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, giftNiftyClose: 0 };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-12 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <nav className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-16 gap-8">
        <div className="flex flex-col items-center md:items-start group">
          <h1 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4 group-hover:scale-[1.02] transition-transform">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-indigo-600/30 border border-indigo-500/30">IQ</div>
            Market Attribution
          </h1>
          <span className="text-[11px] text-slate-500 font-mono tracking-[0.4em] uppercase font-black mt-3 flex items-center gap-2">
            <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></span>
            Quant Strategy Layer // MBA Framework
          </span>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={fetchMarketData}
            className="p-4 bg-slate-900 rounded-2xl hover:bg-slate-800 transition-all border border-slate-800 shadow-lg active:scale-95"
            title="Refresh Ledger"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
          <button 
            onClick={handleRunAttributionNow}
            disabled={isAnalyzing || loading}
            className="flex-1 md:flex-none bg-indigo-600 px-10 py-4.5 rounded-[1.5rem] font-black hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-2xl shadow-indigo-600/20 flex items-center justify-center gap-4 active:scale-95 border border-indigo-400/20 uppercase text-xs tracking-[0.2em]"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                </svg>
                Run IQ Engine
              </>
            )}
          </button>
        </div>
      </nav>

      {error && (
        <div className="max-w-7xl mx-auto mb-12 p-6 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] text-rose-400 text-[11px] font-black tracking-widest uppercase flex items-center justify-between shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
            {error}
          </div>
          <button onClick={() => setError(null)} className="hover:text-rose-300 transition-colors">Dismiss</button>
        </div>
      )}

      <main className="max-w-7xl mx-auto space-y-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <StatCard title="NIFTY 50" value={latest.niftyClose || 0} change={latest.niftyChange} changePercent={latest.niftyChangePercent} />
          <StatCard title="NASDAQ COMP" value={latest.nasdaqClose || 0} />
          <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose || 0} />
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <MarketChart data={logs} />
        </div>
        
        <div className="space-y-8 pb-20">
          <div className="flex items-center gap-4 px-2">
            <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Intelligence Ledger</h2>
          </div>
          <AttributionTable 
            logs={logs} 
            onAnalyze={handleRowAnalyze} 
            onViewDetails={(l) => setSelectedLog(l)} 
          /> 
        </div>
      </main>

      {selectedLog && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={handleRowAnalyze} 
        />
      )}

      <footer className="max-w-7xl mx-auto mt-12 py-12 border-t border-slate-900 text-center space-y-4">
        <p className="text-slate-600 text-[10px] uppercase font-black tracking-[0.5em]">
          © 2026 Quantitative Intelligence Engine // MBA HPO // Proprietary Layer
        </p>
        <div className="flex justify-center items-center gap-4 opacity-50">
          <div className="h-[1px] w-12 bg-slate-800"></div>
          <span className="text-[9px] text-slate-500 font-mono">Gemini 3 Pro Deep Research Active</span>
          <div className="h-[1px] w-12 bg-slate-800"></div>
        </div>
      </footer>
    </div>
  );
};

export default App;
