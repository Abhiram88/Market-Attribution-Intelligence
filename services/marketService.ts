import { MarketLog } from '../types';
import { supabase } from '../lib/supabase';

/**
 * SIMULATED BACKEND TOOL
 * In a real-world scenario, this would be a Python script using yfinance.
 * For this dashboard, we simulate the 'Fetch daily close for ^NSEI, ^IXIC, and GIFT Nifty' logic.
 */
export const ingestLatestMarketData = async (): Promise<MarketLog> => {
  // Simulate fetching ^NSEI, ^IXIC, and GIFT Nifty
  // In reality: 
  // nsei = yf.Ticker("^NSEI").history(period="1d")['Close'].iloc[-1]
  // ixic = yf.Ticker("^IXIC").history(period="1d")['Close'].iloc[-1]
  
  const today = new Date().toISOString().split('T')[0];
  const lastNiftyClose = 22450.00; // Mocked previous close
  const currentNiftyClose = 22555.50; // +105.50 points (Threshold Met!)
  const niftyChange = currentNiftyClose - lastNiftyClose;
  
  const newLog = {
    log_date: today,
    nifty_close: currentNiftyClose,
    nifty_change: niftyChange,
    nifty_change_percent: (niftyChange / lastNiftyClose) * 100,
    nasdaq_close: 16400.20,
    nasdaq_change_percent: 0.85,
    gift_nifty_close: 22610.00,
    threshold_met: Math.abs(niftyChange) > 90
  };

  // Upsert to Supabase
  const { data, error } = await supabase
    .from('market_logs')
    .upsert(newLog, { onConflict: 'log_date' })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    date: data.log_date,
    niftyClose: data.nifty_close,
    niftyChange: data.nifty_change,
    niftyChangePercent: data.nifty_change_percent,
    nasdaqClose: data.nasdaq_close,
    nasdaqChangePercent: data.nasdaq_change_percent,
    giftNiftyClose: data.gift_nifty_close,
    thresholdMet: data.threshold_met,
    isAnalyzing: false
  };
};