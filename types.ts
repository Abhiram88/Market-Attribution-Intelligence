
// types.ts
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface NewsAttribution {
  headline: string;
  summary: string;
  category: string;
  sentiment: Sentiment;
  relevanceScore: number;
  // Added sources for search grounding URLs as per guidelines
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
  attribution?: NewsAttribution; // Linked via news_attribution table
  // Added isAnalyzing to track UI state for each log entry
  isAnalyzing: boolean;
}