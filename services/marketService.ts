import { MarketLog } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Checks if the Indian Market is currently in an active trading session (IST 09:15 - 15:30).
 */
export const isMarketSessionActive = (): { active: boolean; reason: string } => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  
  const day = istDate.getDay(); 
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentTimeMinutes = hours * 60 + minutes;
  
  const isWeekend = day === 0 || day === 6;
  const marketOpen = 9 * 60 + 15; 
  const marketClose = 15 * 60 + 30; 
  
  if (isWeekend) return { active: false, reason: "Weekend" };
  if (currentTimeMinutes < marketOpen) return { active: false, reason: "Pre-Market" };
  if (currentTimeMinutes > marketClose) return { active: false, reason: "Post-Market" };
  
  return { active: true, reason: "Live Session" };
};

/**
 * INTELLIGENT DATA INGESTION
 * Fetches high-fidelity market telemetry including intraday ranges and volume.
 */
export const fetchRealtimeMarketTelemetry = async (force: boolean = false): Promise<MarketLog> => {
  const session = isMarketSessionActive();
  
  // If market is closed and we aren't forcing an update, return the last known record from DB
  if (!session.active && !force) {
    const { data } = await supabase
      .from('market_logs')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const meta = data.meta || {};
      return {
        id: data.id,
        date: data.log_date,
        niftyClose: data.nifty_close,
        niftyChange: data.nifty_change,
        niftyChangePercent: data.nifty_change_percent,
        nasdaqClose: data.nasdaq_close,
        nasdaqChangePercent: data.nasdaq_change_percent || 0,
        giftNiftyClose: data.gift_nifty_close,
        thresholdMet: data.threshold_met,
        isAnalyzing: false,
        prevClose: meta.prev_close,
        dayHigh: meta.day_high,
        dayLow: meta.day_low,
        volume: meta.volume
      };
    }
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const today = new Date().toISOString().split('T')[0];

  const prompt = `
    Find the absolute LATEST real-time market data for the following