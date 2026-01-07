import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { MarketLog } from '../types';

interface MarketChartProps {
  data: MarketLog[];
}

export const MarketChart: React.FC<MarketChartProps> = ({ data }) => {
  // We need to reverse the data back to chronological order for the chart
  const chartData = [...data].reverse();

  return (
    <div className="w-full h-[400px] bg-slate-800/50 p-4 rounded-xl border border-slate-700">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Market Correlation (NSE vs NASDAQ)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
          />
          <YAxis 
            yAxisId="left" 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
            domain={['auto', 'auto']}
            label={{ value: 'Nifty 50', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
            domain={['auto', 'auto']}
            label={{ value: 'NASDAQ', angle: 90, position: 'insideRight', fill: '#94a3b8' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
            itemStyle={{ color: '#f1f5f9' }}
            labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
          />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="niftyClose" 
            stroke="#10b981" 
            strokeWidth={2} 
            dot={false} 
            name="Nifty 50"
            activeDot={{ r: 6 }}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="nasdaqClose" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            dot={false} 
            name="NASDAQ"
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};