export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type MacroCategory = 'Geopolitical' | 'Monetary Policy' | 'Inflation' | 'Earnings' | 'Commodities' | 'Currency' | 'Global Markets' | 'Domestic Policy' | 'Risk-off' | 'Technical' | 'Other';

export interface NewsAttribution {
  headline: string;
  summary: string;
  category: string;
  sentiment: Sentiment;
  relevanceScore: number;
  sources?: { uri: string; title: string }[];
}

export interface MarketLog {
  id: string;
  date: string;
  niftyClose: number;
  niftyChange: number;
  niftyChangePercent: number;
  nasdaqClose: number;
  nasdaqChangePercent: number;
  giftNiftyClose: number;
  thresholdMet: boolean;
  attribution?: NewsAttribution;
  isAnalyzing: boolean;
  // Advanced Telemetry for Dashboard
  prevClose?: number;
  dayLow?: number;
  dayHigh?: number;
  volume?: number;
}

export interface LedgerSource {
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  snippet?: string;
}

export interface LedgerEvent {
  id: string;
  event_date: string;
  nifty_close: number;
  change_pts: number;
  reason: string;
  macro_reason: MacroCategory;
  sentiment: Sentiment;
  score: number;
  ai_attribution_summary: string;
  llm_raw_json: any;
  sources?: LedgerSource[];
  affected_stocks: string[];
  affected_sectors: string[];
}

export type AppTab = 'live' | 'research';