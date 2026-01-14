
import React, { useState } from 'react';

interface DatabaseSetupModalProps {
  onClose: () => void;
}

export const DatabaseSetupModal: React.FC<DatabaseSetupModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const fullSql = `-- CORE MARKET DATA
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

-- NEWS ATTRIBUTION (MATCHES SCREENSHOT)
CREATE TABLE IF NOT EXISTS news_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_log_id UUID REFERENCES market_logs(id) ON DELETE CASCADE,
  headline TEXT,
  narrative TEXT, -- From Screenshot
  impact_json JSONB, -- From Screenshot
  impact_score INTEGER, -- From Screenshot
  model TEXT, -- From Screenshot
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RESEARCH LEDGER (MATCHES SCREENSHOT)
CREATE TABLE IF NOT EXISTS ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE UNIQUE NOT NULL, -- From Screenshot
  technical_json JSONB, -- From Screenshot
  intelligence_summary TEXT, -- From Screenshot
  impact_score INTEGER, -- From Screenshot
  model TEXT, -- From Screenshot
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_event_id UUID REFERENCES ledger_events(id) ON DELETE CASCADE,
  source_name TEXT, -- From Screenshot
  url TEXT, -- From Screenshot
  snippet TEXT, -- From Screenshot
  published_at TIMESTAMPTZ, -- From Screenshot
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PROCESSING INFRASTRUCTURE (MATCHES SCREENSHOT)
CREATE TABLE IF NOT EXISTS volatile_queue (
  log_date DATE PRIMARY KEY, -- From Screenshot
  inserted_at TIMESTAMPTZ DEFAULT now(), -- From Screenshot
  status TEXT, -- From Screenshot
  last_error TEXT -- From Screenshot
);

CREATE TABLE IF NOT EXISTS research_status (
  id INTEGER PRIMARY KEY,
  status_text TEXT, -- From Screenshot
  active_date DATE, -- From Screenshot
  stage TEXT, -- From Screenshot
  breeze_active BOOLEAN, -- From Screenshot
  breeze_last_ok_at TIMESTAMPTZ, -- From Screenshot
  updated_at TIMESTAMPTZ -- From Screenshot
);

CREATE TABLE IF NOT EXISTS iq_schema_meta (
  version INTEGER PRIMARY KEY,
  installed_at TIMESTAMPTZ DEFAULT now()
);

-- Initialize status row
INSERT INTO research_status (id, status_text, stage) 
VALUES (1, 'idle', 'System ready') 
ON CONFLICT (id) DO NOTHING;`;

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
            <h2 className="text-2xl font-black tracking-tight uppercase">Database Schema Setup</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
              Aligned with requested screenshot schema
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
                copied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
          <button 
            onClick={onClose}
            className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-600"
          >
            I've Updated My Database
          </button>
        </div>
      </div>
    </div>
  );
};
