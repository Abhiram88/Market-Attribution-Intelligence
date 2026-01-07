import { MarketLog } from '../types';

// Helper to generate random consistent data
const generateHistoricalData = (): MarketLog[] => {
  const data: MarketLog[] = [];
  let niftyPrice = 22000;
  let nasdaqPrice = 16000;
  let giftPrice = 22100;
  
  const today = new Date();

  // Generate last 30 days of data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    // Skip weekends roughly
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    // Simulate volatility
    const volatility = Math.random() > 0.8 ? 150 : 40; // Occasional spikes > 90
    const direction = Math.random() > 0.5 ? 1 : -1;
    const niftyChange = Math.floor(Math.random() * volatility) * direction;
    
    // Update prices
    niftyPrice += niftyChange;
    // Nasdaq correlation (loose)
    const nasdaqChangePercent = (Math.random() * 2 - 1); 
    nasdaqPrice = nasdaqPrice * (1 + nasdaqChangePercent / 100);
    giftPrice = niftyPrice + (Math.random() * 50 - 25);

    const log: MarketLog = {
      id: date.toISOString(),
      date: date.toISOString().split('T')[0],
      niftyClose: parseFloat(niftyPrice.toFixed(2)),
      niftyChange: niftyChange,
      niftyChangePercent: parseFloat(((niftyChange / (niftyPrice - niftyChange)) * 100).toFixed(2)),
      nasdaqClose: parseFloat(nasdaqPrice.toFixed(2)),
      nasdaqChangePercent: parseFloat(nasdaqChangePercent.toFixed(2)),
      giftNiftyClose: parseFloat(giftPrice.toFixed(2)),
      thresholdMet: Math.abs(niftyChange) > 90,
      isAnalyzing: false,
    };

    data.push(log);
  }
  return data.reverse(); // Newest first
};

export const MOCK_MARKET_DATA = generateHistoricalData();