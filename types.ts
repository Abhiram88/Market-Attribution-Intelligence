
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type MacroCategory = 'Geopolitical' | 'Monetary Policy' | 'Inflation' | 'Earnings' | 'Commodities' | 'Currency' | 'Global Markets' | 'Domestic Policy' | 'Risk-off' | 'Technical' | 'Other';

export interface NewsAttribution {
  headline: string;
  narrative: string;
  category?: string;
  sentiment: Sentiment;
  impact_score: number;
  sources?: { uri: string; title: string }[];
  affected_stocks?: string[];
  affected_sectors?: string[];
}

export interface MarketLog {
  id: string;
  date: string;
  niftyClose: number;
  niftyChange: number;
  niftyChangePercent: number;
  thresholdMet: boolean;
  attribution?: NewsAttribution;
  isAnalyzing: boolean;
  dayLow?: number;
  dayHigh?: number;
  prevClose?: number;
  volume?: number;
  dataSource?: string;
  errorMessage?: string; 
}

export interface LedgerSource {
  id: string;
  event_id: string; 
  source_name: string;
  url: string;
  snippet?: string;
  published_at: string;
  title?: string;
}

export interface LedgerEvent {
  id: string;
  event_date: string; 
  ai_attribution_summary: string; 
  score: number; 
  reason: string; 
  nifty_close: number;
  change_pts: number;
  macro_reason: string;
  sentiment: string;
  llm_raw_json: any; 
  created_at?: string;
  sources?: LedgerSource[];
  affected_stocks: string[];
  affected_sectors: string[];
}

export type AppTab = 'live' | 'research';
