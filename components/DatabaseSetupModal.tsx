
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

-- 3) REG30 Ingestion Runs
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,              -- 'CSV' or 'LIVE_SEARCH'
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  source_notes TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING'  -- RUNNING|SUCCESS|FAILED
);

-- 4) Normalized Event Candidates
CREATE TABLE IF NOT EXISTS event_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
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

-- 5) Analyzed Events (Final Reports)
CREATE TABLE IF NOT EXISTS analyzed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES event_candidates(id) ON DELETE SET NULL,
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
  
  -- NEW EVENT ANALYSIS COLUMNS
  event_analysis_text TEXT,
  institutional_risk TEXT,  -- LOW|MED|HIGH
  policy_bias TEXT,         -- TAILWIND|HEADWIND|NEUTRAL
  policy_event TEXT,
  tactical_plan TEXT,       -- BUY_DIP|WAIT_CONFIRMATION|MOMENTUM_OK|AVOID_CHASE
  trigger_text TEXT,
  analysis_updated_at TIMESTAMPTZ DEFAULT now(),

  market_cap_cr NUMERIC,
  pat_cr NUMERIC,
  networth_cr NUMERIC,
  source_link TEXT,
  attachment_link TEXT,
  attachment_text TEXT,
  verified_on_nse BOOLEAN DEFAULT FALSE,
  event_fingerprint TEXT NOT NULL,     
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_analyzed_event_fingerprint ON analyzed_events(event_fingerprint);

-- MIGRATION SCRIPT
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS event_analysis_text TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS institutional_risk TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS policy_bias TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS policy_event TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS tactical_plan TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS trigger_text TEXT;
-- ALTER TABLE analyzed_events ADD COLUMN IF NOT EXISTS analysis_updated_at TIMESTAMPTZ DEFAULT now();

-- 6) Gemini Response Cache
CREATE TABLE IF NOT EXISTS gemini_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7) Research Ledger
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

CREATE TABLE IF NOT EXISTS ledger_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES ledger_events(id) ON DELETE CASCADE,
  title TEXT,
  url TEXT,
  source_name TEXT,
  published_at TIMESTAMPTZ,
  snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8) Infra Tables
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
ALTER TABLE volatile_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE market_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE news_attribution DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_candidates DISABLE ROW LEVEL SECURITY;
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
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight uppercase">Database Setup (Forensic Edition)</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
              Updated with Tactical Event Analysis Columns
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
        <div className="p-8 bg-white border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-600">
            I've Updated My Database
          </button>
        </div>
      </div>
    </div>
  );
};
