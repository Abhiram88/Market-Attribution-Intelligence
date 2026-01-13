import { MarketLog } from '../types';
import { supabase } from '../lib/supabase';
import { fetchBreezeNiftyQuote } from './breezeService';

/**
 * Checks if the Indian Market is currently in an active trading session (IST 09:15 - 15:30).
 */
export const getMarketSessionStatus = (): { isOpen: boolean; label: string; color: string } => {
  const isSimulation = localStorage.getItem('breeze_simulation_mode') === 'true';
  if (isSimulation) return { isOpen: true, label: "Simulated Session", color: "text-indigo-400" };

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
  
  if (isWeekend) return { isOpen: false, label: "Market Closed (Weekend)", color: "text-slate-500" };
  if (currentTimeMinutes < marketOpen) return { isOpen: false, label: "Pre-Market Standby", color: "text-amber-500" };
  if (currentTimeMinutes > marketClose) return { isOpen: false, label: "Session Closed", color: "text-rose-500" };
  
  return { isOpen: true, label: "Live Trading Session", color: "text-teal-400" };
};

/**
 * TELEMETRY INGESTION ENGINE
 */
export const fetchRealtimeMarketTelemetry = async (sessionToken: string): Promise<MarketLog> => {
  const isSimulation = localStorage.getItem('breeze_simulation_mode') === 'true';
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const quote = await fetchBreezeNiftyQuote(sessionToken);
    
    const payload = {
      log_date: today,
      nifty_close: quote.last_traded_price,
      nifty_change: quote.change,
      nifty_change_percent: quote.percent_change,
      nasdaq_close: 0, 
      nasdaq_change_percent: 0,
      gift_nifty_close: 0,
      threshold_met: Math.abs(quote.percent_change) > 0.4,
      meta: {
        prev_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        volume: quote.volume / 1000000,
        ingested_at: new Date().toISOString(),
        source: isSimulation ? 'SIMULATION_MOCK' : 'BREEZE_DIRECT_V1'
      }
    };

    if (!isSimulation) {
      const { data: finalRecord, error: upsertErr } = await supabase
        .from('market_logs')
        .upsert(payload, { onConflict: 'log_date' })
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      return {
        id: finalRecord.id,
        date: finalRecord.log_date,
        niftyClose: finalRecord.nifty_close,
        niftyChange: finalRecord.nifty_change,
        niftyChangePercent: finalRecord.nifty_change_percent,
        nasdaqClose: 0,
        nasdaqChangePercent: 0,
        giftNiftyClose: 0,
        thresholdMet: finalRecord.threshold_met,
        isAnalyzing: false,
        prevClose: finalRecord.meta?.prev_close,
        dayHigh: finalRecord.meta?.day_high,
        dayLow: finalRecord.meta?.day_low,
        volume: finalRecord.meta?.volume,
        dataSource: 'Breeze Direct'
      };
    }

    return {
      id: 'mock-id',
      date: today,
      niftyClose: payload.nifty_close,
      niftyChange: payload.nifty_change,
      niftyChangePercent: payload.nifty_change_percent,
      nasdaqClose: 0,
      nasdaqChangePercent: 0,
      giftNiftyClose: 0,
      thresholdMet: payload.threshold_met,
      isAnalyzing: false,
      prevClose: payload.meta.prev_close,
      dayHigh: payload.meta.day_high,
      dayLow: payload.meta.day_low,
      volume: payload.meta.volume,
      dataSource: 'Simulation'
    };

  } catch (error: any) {
    const errorMsg = error.message;
    console.warn("[Telemetry Engine] Pipeline Failure:", errorMsg);

    // If it's a connection error or unconfigured, we need to show the modal
    if (errorMsg.includes('CONNECTION_ERROR') || errorMsg.includes('BREEZE_TOKEN')) {
      throw error;
    }

    // Historical Cache Fallback
    const { data } = await supabase
      .from('market_logs')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) throw error; // Re-throw if no cache exists

    return {
      id: data.id,
      date: data.log_date,
      niftyClose: data.nifty_close,
      niftyChange: data.nifty_change,
      niftyChangePercent: data.nifty_change_percent,
      nasdaqClose: 0,
      nasdaqChangePercent: 0,
      giftNiftyClose: 0,
      thresholdMet: data.threshold_met,
      isAnalyzing: false,
      prevClose: data.meta?.prev_close,
      dayHigh: data.meta?.day_high,
      dayLow: data.meta?.day_low,
      volume: data.meta?.volume,
      dataSource: 'Cached',
      errorMessage: errorMsg
    };
  }
};