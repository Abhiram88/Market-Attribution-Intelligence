
import React, { useState } from 'react';

interface DatabaseSetupModalProps {
  onClose: () => void;
}

export const DatabaseSetupModal: React.FC<DatabaseSetupModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const fullSql = `-- 1) Core Market Logs
CREATE TABLE IF NOT EXISTS market_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE UNIQUE NOT NULL,
  ltp NUMERIC,
  points_change NUMERIC,
  change_percent NUMERIC,
  day_high NUMERIC,
  day_low NUMERIC,
  volume NUMERIC,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) News Attribution
CREATE TABLE IF NOT EXISTS news_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_log_id UUID REFERENCES market_logs(id) ON DELETE CASCADE,
  headline TEXT,
  narrative TEXT,
  impact_json JSONB,
  impact_score INTEGER,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Priority Stocks (Watchlist with LTP Persistence)
CREATE TABLE IF NOT EXISTS priority_stocks (
  symbol TEXT PRIMARY KEY,
  company_name TEXT,
  last_price NUMERIC,
  change_val NUMERIC,
  change_percent NUMERIC,
  last_updated TIMESTAMPTZ,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- 4) NSE Master List (ICICI Symbol Mapping)
CREATE TABLE IF NOT EXISTS nse_master_list (
  symbol TEXT PRIMARY KEY,
  short_name TEXT NOT NULL,
  company_name TEXT,
  isin_code TEXT
);

-- 5) Normalized Event Candidates
CREATE TABLE IF NOT EXISTS event_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                
  event_date DATE,
  event_datetime TIMESTAMPTZ,
  symbol TEXT,
  company_name TEXT,
  event_family TEXT,                   
  stage_hint TEXT,                     
  category TEXT,                       
  raw_text TEXT,
  link TEXT,
  dedupe_key TEXT,                     
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6) Analyzed Events (Final Reports)
CREATE TABLE IF NOT EXISTS analyzed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  event_datetime TIMESTAMPTZ,
  symbol TEXT,
  company_name TEXT,
  source TEXT NOT NULL,                
  event_family TEXT NOT NULL,          
  stage TEXT,                          
  summary TEXT,
  direction TEXT,                      
  confidence NUMERIC,                  
  impact_score NUMERIC,                
  action_recommendation TEXT,          
  extracted_json JSONB,                
  evidence_spans JSONB,                
  missing_fields JSONB,                
  scoring_factors JSONB,               
  event_analysis_text TEXT,
  institutional_risk TEXT,
  policy_bias TEXT,
  policy_event TEXT,
  tactical_plan TEXT,
  trigger_text TEXT,
  
  -- CONVERSION BONUS COLUMNS
  conversion_bonus NUMERIC DEFAULT 0,
  execution_months NUMERIC,
  order_type TEXT,
  inferred_execution_months NUMERIC,

  analysis_updated_at TIMESTAMPTZ DEFAULT now(),
  source_link TEXT,
  attachment_link TEXT,
  attachment_text TEXT,
  event_fingerprint TEXT NOT NULL,     
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_analyzed_event_fingerprint ON analyzed_events(event_fingerprint);

-- 7) Gemini Response Cache
CREATE TABLE IF NOT EXISTS gemini_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8) Research Ledger
CREATE TABLE IF NOT EXISTS ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE UNIQUE NOT NULL,
  nifty_close NUMERIC,
  change_pts NUMERIC,
  reason TEXT,
  macro_reason TEXT,
  sentiment TEXT,
  score INTEGER,
  ai_attribution_summary TEXT,
  llm_raw_json JSONB,
  affected_stocks TEXT[], 
  affected_sectors TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9) Infra Tables
CREATE TABLE IF NOT EXISTS volatile_queue (
  log_date DATE PRIMARY KEY,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending',
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS research_status (
  id INTEGER PRIMARY KEY,
  status_text TEXT DEFAULT 'idle',
  active_date DATE,
  stage TEXT DEFAULT 'System Initialized',
  breeze_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DISABLE RLS
ALTER TABLE priority_stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE nse_master_list DISABLE ROW LEVEL SECURITY;
ALTER TABLE volatile_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE market_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE news_attribution DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE analyzed_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE research_status DISABLE ROW LEVEL SECURITY;`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black tracking-tight uppercase">Database Setup (Mapped Watchlist)</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
              Includes `analyzed_events` update for Conversion Bonus.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="relative group">
            <button 
              onClick={handleCopy}
              className={`absolute top-4 right-4 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all z-10 ${
                copied ? 'bg-emerald-50 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {copied ? 'Copied!' : 'Copy SQL Script'}
            </button>
            <pre className="bg-[#0f172a] text-indigo-300 p-8 rounded-[2rem] text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 shadow-inner max-h-[60vh]">
              {fullSql}
            </pre>
          </div>
        </div>
        <div className="p-8 bg-white border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-600">
            I've Updated My Database
          </button>
        </div>
      </div>
    </div>
  );
};
