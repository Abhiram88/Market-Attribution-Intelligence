
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

export type AppTab = 'live' | 'research' | 'reg30';

/** 
 * REG30 TYPES 
 */
export type Reg30EventFamily = 
  | 'ORDER_CONTRACT' 
  | 'ORDER_PIPELINE' 
  | 'DILUTION_CAPITAL' 
  | 'SHAREHOLDER_RETURNS' 
  | 'GOVERNANCE_MANAGEMENT' 
  | 'LITIGATION_REGULATORY' 
  | 'CREDIT_RATING';

export type Reg30Source = 'XBRL' | 'CorporateActions' | 'CreditRating' | 'RSSNews';

export type ActionRecommendation = 
  | 'ACTIONABLE_BULLISH' 
  | 'ACTIONABLE_BEARISH_RISK' 
  | 'HIGH_PRIORITY_WATCH' 
  | 'TRACK' 
  | 'IGNORE' 
  | 'NEEDS_MANUAL_REVIEW';

export interface EventCandidate {
  id: string;
  source: Reg30Source;
  event_date_time: string;
  event_date: string;
  symbol: string | null;
  company_name: string;
  category: string;
  raw_text: string;
  link?: string;
  stage_hint?: string;
  event_family?: Reg30EventFamily;
}

export interface Reg30Report {
  id: string;
  event_date: string;
  symbol: string | null;
  company_name: string;
  source: Reg30Source;
  event_family: Reg30EventFamily;
  stage?: string;
  summary: string;
  impact_score: number;
  direction: Sentiment;
  confidence: number;
  recommendation: ActionRecommendation;
  link?: string;
  extracted_data: any;
  evidence_spans: string[];
}
