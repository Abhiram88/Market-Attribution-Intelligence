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
              sources: [] // Sources aren't in DB, will be re-gen on Run AI
            } : undefined
          };
        }));
      }
    } catch (err: any) {
      setError(`Sync Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAttributionNow = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const niftyPrice = 25923.65;
      const niftyChange = -217.10;
      const logDate = new Date().toISOString().split('T')[0];

      const payload = {
        log_date: logDate,
        nifty_close: niftyPrice,
        nifty_change: niftyChange,
        nifty_change_percent: -0.83,
        nasdaq_close: 23584.27,
        nasdaq_change_percent: -1.2,
        gift_nifty_close: 26003.50,
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
        // If the detail modal is open for this log, update it
        if (selectedLog?.id === logRecord.id) {
          setSelectedLog({ ...mappedLog, attribution: attr, isAnalyzing: false });
        }
      }

      await fetchMarketData();
    } catch (err: any) {
      console.error("Pipeline Failure:", err);
      setError(`Attribution Logic Failed: ${err.message}`);
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
      setError(`Analysis Failed: ${err.message}`);
      setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: false } : l));
    }
  };

  useEffect(() => { fetchMarketData(); }, []);

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, giftNiftyClose: 0 };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <nav className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">IQ</div>
            Market Attribution
          </h1>
          <span className="text-[10px] text-slate-500 font-mono tracking-[0.3em] uppercase font-bold mt-1">
            Quant Intelligence Layer 
          </span>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchMarketData}
            className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-all border border-slate-700"
            title="Refresh Ledger"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
          <button 
            onClick={handleRunAttributionNow}
            disabled={isAnalyzing || loading}
            className="flex-1 md:flex-none bg-indigo-600 px-8 py-3.5 rounded-2xl font-black hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-3 active:scale-95 border border-indigo-400/20 uppercase text-xs tracking-widest"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing Drivers...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
                </svg>
                Run Attribution Now
              </>
            )}
          </button>
        </div>
      </nav>

      {error && (
        <div className="max-w-7xl mx-auto mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
          <button onClick={() => setError(null)} className="uppercase font-black text-rose-500/50 hover:text-rose-400">Dismiss</button>
        </div>
      )}

      <main className="max-w-7xl mx-auto space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="NIFTY 50" value={latest.niftyClose || 0} change={latest.niftyChange} changePercent={latest.niftyChangePercent} />
          <StatCard title="NASDAQ" value={latest.nasdaqClose || 0} />
          <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose || 0} />
        </div>

        <MarketChart data={logs} />
        
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
            <h2 className="text-xl font-black uppercase tracking-tight">Intelligence Ledger</h2>
          </div>
          <AttributionTable logs={logs} onAnalyze={handleRowAnalyze} onViewDetails={(l) => setSelectedLog(l)} /> 
        </div>
      </main>

      {selectedLog && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={handleRowAnalyze} 
        />
      )}

      <footer className="max-w-7xl mx-auto mt-24 pt-8 border-t border-slate-800 text-center text-slate-500 text-[10px] uppercase font-black tracking-widest pb-12">
        © 2026 Quantitative Intelligence Engine // MBA HPO // Powered by Gemini 3.0 Pro
      </footer>
    </div>
  );
};

export default App;