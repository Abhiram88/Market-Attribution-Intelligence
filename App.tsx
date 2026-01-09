
import React, { useEffect, useState } from 'react';
import { StatCard } from './components/StatCard';
import { MarketChart } from './components/MarketChart';
import { AttributionTable } from './components/AttributionTable';
import { LogDetailModal } from './components/LogDetailModal';
import { ResearchTab } from './components/ResearchTab';
import { MarketLog, Sentiment, AppTab } from './types';
import { supabase } from './lib/supabase';
import { analyzeMarketLog } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('live');
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
      setError(`Attribution Pipeline Failure: ${err.message}`);
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

  useEffect(() => { 
    if (activeTab === 'live') fetchMarketData(); 
  }, [activeTab]);

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, giftNiftyClose: 0 };

  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans selection:bg-indigo-500/30 overflow-x-hidden ${activeTab === 'live' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      
      {/* Universal Navigation */}
      <nav className="max-w-7xl mx-auto p-8 md:p-12 space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
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

          <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-slate-800 backdrop-blur-md">
            <button 
              onClick={() => setActiveTab('live')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'live' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-100'}`}
            >
              Live Monitor
            </button>
            <button 
              onClick={() => setActiveTab('research')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'research' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-100'}`}
            >
              Research Data
            </button>
          </div>
        </div>
      </nav>

      {activeTab === 'live' ? (
        <div className="max-w-7xl mx-auto px-8 md:px-12 pb-20 space-y-16 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black uppercase tracking-tight">Daily Monitor</h2>
            <div className="flex items-center gap-4">
              <button 
                onClick={fetchMarketData}
                className="p-4 bg-slate-900 rounded-2xl hover:bg-slate-800 transition-all border border-slate-800 shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
              <button 
                onClick={handleRunAttributionNow}
                disabled={isAnalyzing}
                className="bg-indigo-600 px-8 py-4 rounded-2xl font-black hover:bg-indigo-500 disabled:opacity-50 text-xs uppercase tracking-widest flex items-center gap-3 transition-all"
              >
                {isAnalyzing ? "Processing..." : "Run IQ Engine"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StatCard title="NIFTY 50" value={latest.niftyClose || 0} change={latest.niftyChange} changePercent={latest.niftyChangePercent} />
            <StatCard title="NASDAQ COMP" value={latest.nasdaqClose || 0} />
            <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose || 0} />
          </div>

          <MarketChart data={logs} />
          <AttributionTable logs={logs} onAnalyze={handleRowAnalyze} onViewDetails={setSelectedLog} />
        </div>
      ) : (
        <ResearchTab />
      )}

      {selectedLog && activeTab === 'live' && (
        <LogDetailModal 
          log={selectedLog} 
          onClose={() => setSelectedLog(null)} 
          onReAnalyze={handleRowAnalyze} 
        />
      )}

      <footer className={`py-12 text-center space-y-4 border-t ${activeTab === 'live' ? 'border-slate-900 text-slate-600' : 'border-slate-200 text-slate-400'}`}>
        <p className="text-[10px] uppercase font-black tracking-[0.5em]">
          © 2026 Quantitative Intelligence Engine // MBA HPO // Proprietary Layer
        </p>
      </footer>
    </div>
  );
};

export default App;
