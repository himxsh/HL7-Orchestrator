import { motion } from 'motion/react';
import { AlertTriangle, Shield, RefreshCw } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

interface Threat {
  id: string;
  category: string;
  name: string;
  description: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  risk_level: string;
  existing_control: string;
  legal_reference: string;
  residual_risk: string;
}

interface RiskData {
  threats: Threat[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  categories: Record<string, Threat[]>;
  average_risk_score: number;
  overall_risk_level: string;
  framework: string;
}

const levelColor: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-300',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-300',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-300',
  LOW: 'bg-green-100 text-green-700 border-green-300',
};

const cellColor = (score: number) => {
  if (score >= 20) return 'bg-red-500 text-white';
  if (score >= 12) return 'bg-orange-400 text-white';
  if (score >= 6) return 'bg-amber-300 text-amber-900';
  return 'bg-green-200 text-green-800';
};

export const RiskAssessmentContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/risk-assessment');
      if (!res.ok) return;
      setData(await res.json());
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Build 5x5 heatmap
  const heatmap = Array.from({ length: 5 }, () => Array(5).fill(0));
  data?.threats.forEach(t => {
    heatmap[5 - t.impact][t.likelihood - 1] += 1;
  });

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-16 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Risk <span className="italic font-title text-primary-gold">Assessment</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Quantified risk analysis based on NIST SP 800-30 and ISO 27005 — {data?.summary.total || 0} threats across 5 categories.
          </motion.p>
          <button onClick={fetchData} disabled={loading} className="mt-6 flex items-center gap-2 px-6 py-3 border border-primary-gold/30 text-primary-gold font-mono text-[10px] uppercase tracking-widest hover:bg-primary-gold hover:text-[#1c1a16] transition-all disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Risk <span className="italic text-primary-gold">Assessment</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl mb-6">ISO 27005 compliant assessment across {data?.summary.total || 0} threats.</p>
           <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-4 py-2 border border-primary-gold/20 text-primary-gold font-mono text-[9px] uppercase tracking-widest hover:bg-primary-gold hover:text-white transition-all disabled:opacity-50">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(['critical', 'high', 'medium', 'low'] as const).map(level => (
              <div key={level} className={`border p-4 text-center ${levelColor[level.toUpperCase()]}`}>
                <div className="font-title text-2xl">{data.summary[level]}</div>
                <div className="font-mono text-[8px] uppercase tracking-widest">{level}</div>
              </div>
            ))}
             <div className="bg-white border border-primary-gold/10 p-4 text-center">
                <div className="font-title text-2xl text-primary-gold">{data.average_risk_score}</div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-neutral-dark/40">Avg Score</div>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 5x5 Heatmap */}
             <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="bg-white border border-primary-gold/10 p-6">
                <h3 className="font-title text-lg mb-6">Risk Heatmap</h3>
                <div className="flex flex-col items-center">
                  <div className="flex">
                    <div className="flex flex-col justify-between pr-2 text-right font-mono text-[8px] text-neutral-dark/40 py-1">
                      {[5,4,3,2,1].map(n => <div key={n} className="h-10 flex items-center">{n}</div>)}
                    </div>
                    <div>
                      {heatmap.map((row, ri) => (
                        <div key={ri} className="flex gap-1 mb-1">
                          {row.map((count, ci) => {
                            const score = (5 - ri) * (ci + 1);
                            return (
                               <div key={ci} className={`w-10 h-10 flex items-center justify-center font-mono text-[10px] font-bold border ${count > 0 ? cellColor(score) : 'bg-neutral-dark/[0.02] border-neutral-dark/5 text-neutral-dark/5'}`}>
                                {count > 0 ? count : '—'}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <div className="flex gap-1 mt-1 justify-center">
                        {[1,2,3,4,5].map(n => <div key={n} className="w-10 text-center font-mono text-[8px] text-neutral-dark/40">{n}</div>)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 justify-center">
                    {Object.entries({ Critical: 20, High: 12, Medium: 6, Low: 1 }).map(([l, s]) => (
                        <div key={l} className="flex items-center gap-1">
                            <div className={`w-2 h-2 ${cellColor(s)}`} />
                            <span className="font-mono text-[8px] text-neutral-dark/40">{l}</span>
                        </div>
                    ))}
                </div>
             </motion.section>

             <div className="space-y-6">
                {(Object.entries(data.categories) as [string, Threat[]][]).slice(0, 3).map(([cat, threats], catIdx) => (
                  <motion.section key={cat} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: catIdx * 0.05 }} className="border border-primary-gold/10 p-6 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-title text-md flex items-center gap-2">
                        <Shield size={14} className="text-primary-gold" /> {cat}
                      </h4>
                      <span className="font-mono text-[9px] text-neutral-dark/30">{threats.length} threats</span>
                    </div>
                    <div className="space-y-4">
                      {threats.slice(0, 2).map((t: Threat) => (
                        <div key={t.id} className="border-t border-primary-gold/5 pt-3">
                           <div className="flex justify-between items-start mb-1">
                              <span className="font-title text-sm">{t.name}</span>
                              <span className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${levelColor[t.risk_level]}`}>{t.risk_level}</span>
                           </div>
                           <p className="font-sans text-[11px] text-neutral-dark/50 leading-tight mb-2">{t.description}</p>
                           <div className="flex gap-4 font-mono text-[8px]">
                              <div><span className="text-neutral-dark/20 block">Control</span><span className="text-neutral-dark/60">{t.existing_control}</span></div>
                              <div><span className="text-neutral-dark/20 block">Legal</span><span className="text-primary-gold">{t.legal_reference}</span></div>
                           </div>
                        </div>
                      ))}
                    </div>
                  </motion.section>
                ))}
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default function RiskAssessment() {
  return (
    <div className="min-h-screen bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="risk-assessment" />
      <main className="max-w-[1200px] mx-auto px-6 py-24">
        <RiskAssessmentContent />
      </main>
      <Footer />
    </div>
  );
}
