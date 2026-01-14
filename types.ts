
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type MacroCategory = 'Geopolitical' | 'Monetary Policy' | 'Inflation' | 'Earnings' | 'Commodities' | 'Currency' | 'Global Markets' | 'Domestic Policy' | 'Risk-off' | 'Technical' | 'Other';

export interface NewsAttribution {
  headline: string;
  narrative: string; // Matches 'narrative' in screenshot
  category?: string;
  sentiment: Sentiment;
  impact_score: number; // Matches 'impact_score' in screenshot
  sources?: { uri: string; title: string }[];
  affected_stocks?: string[];
  affected_sectors?: string[];
}

export interface MarketLog {
  id: string;
  date: string; // Maps to 'log_date'
  niftyClose: number; // Maps to 'ltp'
  niftyChange: number; // Maps to 'points_change'
  niftyChangePercent: number; // Maps to 'change_percent'
  thresholdMet: boolean;
  attribution?: NewsAttribution;
  isAnalyzing: boolean;
  dayLow?: number;
  dayHigh?: number;
  prevClose?: number; // Added to handle telemetry response mismatch
  volume?: number;
  dataSource?: string;
  errorMessage?: string; 
}

export interface LedgerSource {
  id: string;
  ledger_event_id: string;
  source_name: string;
  url: string;
  snippet?: string;
  published_at: string;
  title?: string;
}

export interface LedgerEvent {
  id: string;
  log_date: string; // Matches 'log_date' in screenshot
  intelligence_summary: string; // Matches 'intelligence_summary' in screenshot
  impact_score: number; // Matches 'impact_score' in screenshot
  technical_json: any; // Matches 'technical_json' in screenshot
  model: string;
  sources?: LedgerSource[];
}

export type AppTab = 'live' | 'research';
