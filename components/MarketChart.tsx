
import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { MarketLog } from '../types';

interface MarketChartProps {
  data: MarketLog[];
}

export const MarketChart: React.FC<MarketChartProps> = ({ data }) => {
  const chartData = [...data].reverse();

  return (
    <div className="w-full h-[450px] bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8">Correlation Matrix // NSE vs NASDAQ</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis 
            yAxisId="left" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            domain={['auto', 'auto']}
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}
          />
          <Legend 
            verticalAlign="top" 
            align="right" 
            iconType="circle"
            wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} 
          />
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="niftyClose" 
            stroke="#10b981" 
            strokeWidth={3} 
            dot={false} 
            name="Nifty 50"
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="nasdaqClose" 
            stroke="#6366f1" 
            strokeWidth={3} 
            dot={false} 
            name="NASDAQ"
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
