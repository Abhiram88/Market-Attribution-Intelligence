
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { MarketLog } from '../types';

interface MarketChartProps {
  data: MarketLog[];
}

export const MarketChart: React.FC<MarketChartProps> = ({ data }) => {
  const chartData = [...data].reverse();

  return (
    <div className="w-full h-[450px] bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8">Nifty 50 Trend Matrix</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}
          />
          <Area 
            type="monotone" 
            dataKey="niftyClose" 
            stroke="#6366f1" 
            strokeWidth={3} 
            fillOpacity={1}
            fill="url(#colorPrice)"
            name="Nifty 50"
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
