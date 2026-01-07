import React, { useEffect, useState } from 'react';
import { StatCard } from './components/StatCard';
import { MarketChart } from './components/MarketChart';
import { AttributionTable } from './components/AttributionTable';
import { MarketLog, Sentiment } from './types';
import { analyzeMarketLog } from './services/geminiService';
import { ingestLatestMarketData } from './services/marketService';
import { supabase } from './lib/supabase';
import { MOCK_MARKET_DATA } from './services/mockData';

const App: React.FC = () => {
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [isGlobalAnalyzing, setIsGlobalAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  const fetchMarketData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('market_logs')
        .select(`
          *,
          news_attribution (
            headline,
            summary,
            category,
            sentiment,
            relevance_score
          )
        `)
        .order('log_date', { ascending: false });

      if (supabaseError) {
        if (supabaseError.code === 'PGRST116' || supabaseError.message.includes('not found')) {
          throw new Error("TABLE_NOT_FOUND");
        }
        throw supabaseError;
      }

      if (data) {
        const mappedLogs: MarketLog[] = data.map((item: any) => {
          const attr = Array.isArray(item.news_attribution) 
            ? item.news_attribution[0] 
            : item.news_attribution;

          return {
            id: item.id,
            date: item.log_date,
            niftyClose: item.nifty_close,
            niftyChange: item.nifty_change,
            niftyChangePercent: item.nifty_change_percent,
            nasdaqClose: item.nasdaq_close,
            nasdaqChangePercent: item.nasdaq_change_percent,
            giftNiftyClose: item.gift_nifty_close,
            thresholdMet: item.threshold_met,
            attribution: attr ? {
              headline: attr.headline,
              summary: attr.summary,
              category: attr.category,
              sentiment: attr.sentiment as Sentiment,
              relevanceScore: attr.relevance_score
            } : undefined,
            isAnalyzing: false
          };
        });
        setLogs(mappedLogs);
      }
    } catch (err: any) {
      const msg = err.message === "TABLE_NOT_FOUND" 
        ? "The 'market_logs' table does not exist in your Supabase database." 
        : err?.message || JSON.stringify(err);
      console.error("Fetch Error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  const handleIngestion = async () => {
    setIngesting(true);
    try {
      await ingestLatestMarketData();
      await fetchMarketData();
    } catch (err: any) {
      alert(`Ingestion Tool Error: ${err.message}`);
    } finally {
      setIngesting(false);
    }
  };

  const seedDatabase = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: seedError } = await supabase.from('market_logs').upsert(
        MOCK_MARKET_DATA.map(m => ({
          log_date: m.date,
          nifty_close: m.niftyClose,
          nifty_change: m.niftyChange,
          nifty_change_percent: m.niftyChangePercent,
          nasdaq_close: m.nasdaqClose,
          nasdaq_change_percent: m.nasdaqChangePercent,
          gift_nifty_close: m.giftNiftyClose,
          threshold_met: m.thresholdMet
        })),
        { onConflict: 'log_date' }
      );
      if (seedError) throw seedError;
      await fetchMarketData();
    } catch (err: any) {
      setError(`Seeding failed: ${err.message}. Ensure the SQL schema is created first.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, []);

  const handleAnalyze = async (id: string) => {
    setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: true } : l));
    const targetLog = logs.find(l => l.id === id);
    if (!targetLog) return;

    try {
      const attribution = await analyzeMarketLog(targetLog);
      setLogs(prev => prev.map(l => 
        l.id === id ? { ...l, isAnalyzing: false, attribution } : l
      ));
    } catch (err) {
      console.error("Analysis Failed:", err);
      setLogs(prev => prev.map(l => l.id === id ? { ...l, isAnalyzing: false } : l));
    }
  };

  const handleRunAttributionNow = async () => {
    // Find the latest log that meets threshold but hasn't been analyzed
    const pendingLog = logs.find(log => log.thresholdMet && !log.attribution && !log.isAnalyzing);
    if (pendingLog) {
      setIsGlobalAnalyzing(true);
      await handleAnalyze(pendingLog.id);
      setIsGlobalAnalyzing(false);
    } else {
      alert("No pending volatility events (>90 pts) found for attribution analysis.");
    }
  };

  const latest = logs[0] || { niftyClose: 0, niftyChange: 0, niftyChangePercent: 0, nasdaqClose: 0, nasdaqChangePercent: 0, giftNiftyClose: 0 };

  const sqlCode = `CREATE TABLE market_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  nifty_close NUMERIC(12, 2) NOT NULL,
  nifty_change NUMERIC(12, 2) NOT NULL,
  nifty_change_percent NUMERIC(6, 3) NOT NULL,
  nasdaq_close NUMERIC(12, 2) NOT NULL,
  nasdaq_change_percent NUMERIC(6, 3) NOT NULL,
  gift_nifty_close NUMERIC(12, 2) NOT NULL,
  threshold_met BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE news_attribution (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_log_id UUID REFERENCES market_logs(id) ON DELETE CASCADE UNIQUE,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  relevance_score FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 pb-12 font-sans selection:bg-indigo-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
                M
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
                Market Attribution Intelligence
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleRunAttributionNow}
                disabled={isGlobalAnalyzing || ingesting || logs.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGlobalAnalyzing ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                    </svg>
                    Run Attribution Now
                  </>
                )}
              </button>
              <div className="text-xs text-right hidden sm:block">
                <p className="text-slate-400">Last Synced</p>
                <p className="font-mono text-emerald-400">{lastUpdated}</p>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {error && (
          <div className="p-8 bg-slate-800/80 border border-rose-500/30 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex items-start gap-6">
              <div className="w-14 h-14 bg-rose-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-rose-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-100">Database Schema Required</h2>
                <p className="mt-2 text-slate-400 leading-relaxed">
                  Please run the following SQL in your Supabase SQL Editor to initialize the database:
                </p>
                
                <div className="mt-6 relative group">
                  <pre className="bg-slate-950 p-6 rounded-2xl border border-slate-700 text-slate-300 text-xs overflow-x-auto font-mono leading-relaxed max-h-64 scrollbar-thin">
                    {sqlCode}
                  </pre>
                  <button 
                    onClick={() => navigator.clipboard.writeText(sqlCode)}
                    className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest border border-slate-600"
                  >
                    Copy SQL
                  </button>
                </div>

                <div className="mt-8">
                  <button onClick={fetchMarketData} className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-rose-500/20">
                    Refresh Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96">
             <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
             <p className="text-slate-400 text-lg font-medium tracking-wide animate-pulse">Establishing Secure Database Session...</p>
          </div>
        ) : (
          <>
            {!error && logs.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-800/30 rounded-3xl border border-dashed border-slate-700">
                <h3 className="text-xl font-bold mb-2 text-indigo-400">System Ready</h3>
                <p className="text-slate-400 mb-6 max-w-md text-center">Initialize your attribution engine by importing historical data or running the live ingestion tool.</p>
                <div className="flex gap-4">
                  <button onClick={seedDatabase} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20 flex items-center gap-2">
                    Import 30-Day History
                  </button>
                  <button onClick={handleIngestion} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all flex items-center gap-2">
                    Run Live Ingestion
                  </button>
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard title="NIFTY 50 (^NSEI)" value={latest.niftyClose.toLocaleString()} change={latest.niftyChange} changePercent={latest.niftyChangePercent} />
                  <StatCard title="NASDAQ (^IXIC)" value={latest.nasdaqClose.toLocaleString()} change={latest.nasdaqClose * (latest.nasdaqChangePercent / 100)} changePercent={latest.nasdaqChangePercent} />
                  <StatCard title="GIFT NIFTY" value={latest.giftNiftyClose.toLocaleString()} change={latest.giftNiftyClose - latest.niftyClose} changePercent={latest.niftyClose ? ((latest.giftNiftyClose - latest.niftyClose) / latest.niftyClose) * 100 : 0} />
                </div>
                <MarketChart data={logs} />
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Quantitative Intelligence Table</h2>
                    {ingesting && <span className="text-indigo-400 text-xs animate-pulse font-mono font-bold uppercase">Ingesting Live Data...</span>}
                  </div>
                  <AttributionTable logs={logs} onAnalyze={handleAnalyze} />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;