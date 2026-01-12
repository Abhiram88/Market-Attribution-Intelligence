
import React, { useState, useEffect } from 'react';

interface BreezeTokenModalProps {
  onSave: (token: string) => void;
  onClose: () => void;
}

export const BreezeTokenModal: React.FC<BreezeTokenModalProps> = ({ onSave, onClose }) => {
  const [token, setToken] = useState(localStorage.getItem('breeze_token') || '');
  const [proxyBase, setProxyBase] = useState(localStorage.getItem('breeze_proxy_url') || '');
  const [proxyKey, setProxyKey] = useState(localStorage.getItem('breeze_proxy_key') || '');
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    const origin = window.location.origin;
    setIsPreview(origin.includes('localhost') || origin.includes('aistudio') || origin.includes('usercontent.goog'));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return alert("Enter your session token.");

    if (proxyBase.trim()) {
      localStorage.setItem('breeze_proxy_url', proxyBase.trim().replace(/\/$/, ""));
    } else {
      localStorage.removeItem('breeze_proxy_url');
    }

    if (proxyKey.trim()) {
      localStorage.setItem('breeze_proxy_key', proxyKey.trim());
    } else {
      localStorage.removeItem('breeze_proxy_key');
    }

    localStorage.setItem('breeze_token', token.trim());
    onSave(token.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        <div className="p-8 bg-indigo-600 text-white">
          <h2 className="text-2xl font-black tracking-tight uppercase">Breeze API Link</h2>
          <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
            {isPreview ? "Bridge Configuration Required" : "Direct Production Feed Active"}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${!isPreview ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <p className={`text-[11px] font-bold ${!isPreview ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isPreview 
                  ? "⚠ Cloud Run is strict. You must provide your deployed URL and ensure 'Allow unauthenticated invocations' is enabled in the GCP console." 
                  : "✓ Running in production mode. API routes are resolved automatically."}
              </p>
            </div>

            {isPreview && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Deployed Cloud Run URL</label>
                  <input
                    type="url"
                    value={proxyBase}
                    onChange={(e) => setProxyBase(e.target.value)}
                    placeholder="https://your-service-xyz.run.app"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Proxy Access Key (Optional)</label>
                  <input
                    type="password"
                    value={proxyKey}
                    onChange={(e) => setProxyKey(e.target.value)}
                    placeholder="Matches server PROXY_API_KEY"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                  <p className="text-[9px] text-slate-400 font-medium px-1">Required only if your proxy server has a PROXY_API_KEY set.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Daily Session Token</label>
              <textarea
                required
                rows={2}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from ICICI Breeze portal..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest transition-all">Dismiss</button>
            <button type="submit" className="flex-1 px-6 py-4 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all hover:bg-indigo-700">Connect Now</button>
          </div>
        </form>
      </div>
    </div>
  );
};
