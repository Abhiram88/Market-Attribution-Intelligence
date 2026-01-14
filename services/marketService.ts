
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
  
  if (isWeekend) return { isOpen: false, label: "Market Closed", color: "text-slate-500" };
  if (currentTimeMinutes < marketOpen) return { isOpen: false, label: "Pre-Market Standby", color: "text-amber-500" };
  if (currentTimeMinutes > marketClose) return { isOpen: false, label: "Session Closed", color: "text-rose-500" };
  
  return { isOpen: true, label: "Live Trading Session", color: "text-teal-400" };
};

/**
 * TELEMETRY INGESTION ENGINE
 */
export const fetchRealtimeMarketTelemetry = async (): Promise<MarketLog> => {
  const isSimulation = localStorage.getItem('breeze_simulation_mode') === 'true';
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const quote = await fetchBreezeNiftyQuote();
    
    const payload = {
      log_date: today,
      ltp: quote.last_traded_price,
      points_change: quote.change,
      change_percent: quote.percent_change,
      day_high: quote.high,
      day_low: quote.low,
      volume: quote.volume,
      source: isSimulation ? 'Simulation' : 'Breeze'
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
        niftyClose: finalRecord.ltp,
        niftyChange: finalRecord.points_change,
        niftyChangePercent: finalRecord.change_percent,
        thresholdMet: Math.abs(finalRecord.change_percent) > 0.4,
        isAnalyzing: false,
        prevClose: quote.previous_close,
        dayHigh: finalRecord.day_high,
        dayLow: finalRecord.day_low,
        volume: finalRecord.volume,
        dataSource: 'Breeze Direct'
      };
    }

    return {
      id: 'mock-id',
      date: today,
      niftyClose: payload.ltp,
      niftyChange: payload.points_change,
      niftyChangePercent: payload.change_percent,
      thresholdMet: Math.abs(payload.change_percent) > 0.4,
      isAnalyzing: false,
      prevClose: quote.previous_close,
      dayHigh: payload.day_high,
      dayLow: payload.day_low,
      volume: payload.volume,
      dataSource: 'Simulation'
    };

  } catch (error: any) {
    // Silent Reconciliation via Cache
    const { data } = await supabase
      .from('market_logs')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) throw error; 

    return {
      id: data.id,
      date: data.log_date,
      niftyClose: data.ltp,
      niftyChange: data.points_change,
      niftyChangePercent: data.change_percent,
      thresholdMet: Math.abs(data.change_percent || 0) > 0.4,
      isAnalyzing: false,
      dayHigh: data.day_high,
      dayLow: data.day_low,
      volume: data.volume,
      dataSource: 'Cached'
    };
  }
};
