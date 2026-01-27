export const getMarketSessionStatus = () => {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  
  const day = istDate.getUTCDay();
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const time = hours * 100 + minutes;

  // NSE Market Hours: 
  // Pre-market: 9:00 AM - 9:15 AM
  // Normal: 9:15 AM - 3:30 PM
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = time >= 900 && time <= 1530;

  // Note: Public holidays are not hardcoded here, but the status will reflect 
  // if the live feed is active or if we are in standby mode.
  return {
    isOpen: isWeekday && isMarketHours,
    status: isWeekday && isMarketHours ? 'Live Trading Session' : 'Market Closed',
    isPreMarket: time >= 900 && time < 915
  };
};
