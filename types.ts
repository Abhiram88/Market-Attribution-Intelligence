export enum MarketIndex {
  NIFTY = 'NIFTY 50',
  NASDAQ = 'NASDAQ',
  GIFT = 'GIFT NIFTY',
}

export enum Sentiment {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  NEUTRAL = 'NEUTRAL',
}

export interface NewsAttribution {
  headline: string;
  summary: string;
  category: 'Macro' | 'Global' | 'Corporate' | 'Geopolitical';
  sentiment: Sentiment;
  relevanceScore: number; // 0 to 1
}

export interface MarketLog {
  id: string;
  date: string;
  niftyClose: number;
  niftyChange: number; // Absolute point change
  niftyChangePercent: number;
  nasdaqClose: number;
  nasdaqChangePercent: number;
  giftNiftyClose: number;
  thresholdMet: boolean; // > 90 points
  attribution?: NewsAttribution;
  isAnalyzing?: boolean;
}

export interface MarketState {
  logs: MarketLog[];
  lastUpdated: string;
}