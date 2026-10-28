import { motion } from 'motion/react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './api';

interface Check {
  id: string;
  category: string;
  requirement: string;
  legal_reference: string;
  status: string;
  score: number;
  evidence: string;
  recommendation: string;
}

interface Category {
  name: string;
  score: number;
  max_score: number;
  checks: Check[];
  weight: number;
}

interface ScoreData {
  overall_score: number;
  grade: string;
  total_checks: number;
  passed: number;
  partial: number;
  failed: number;
  categories: Record<string, Category>;
}

const gradeColor: Record<string, string> = {
  A: 'text-green-500', B: 'text-lime-500', C: 'text-amber-500',
  D: 'text-orange-500', F: 'text-red-500',
};

const statusIcon = (s: string) => {
  if (s === 'PASS') return <CheckCircle2 size={14} className="text-green-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={14} className="text-amber-500" />;
  return <XCircle size={14} className="text-red-500" />;
};

export const ComplianceScoreContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/compliance-score');
      if (!res.ok) return;
      setData(await res.json());
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex flex-col mb-16 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Compliance <span className="italic font-title text-primary-gold">Score</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Real-time compliance assessment across DPDP Act, IT Act 2000, and GDPR — scored across 5 categories with 15 individual checks.
          </motion.p>
          <button onClick={fetchData} disabled={loading} className="mt-6 flex items-center gap-2 px-6 py-3 border border-primary-gold/30 text-primary-gold font-mono text-[10px] uppercase tracking-widest hover:bg-primary-gold hover:text-[#1c1a16] transition-all disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Compliance <span className="italic text-primary-gold">Score</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl mb-6">Assessed against DPDP Act, IT Act, and GDPR Frameworks.</p>
           <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-4 py-2 border border-primary-gold/20 text-primary-gold font-mono text-[9px] uppercase tracking-widest hover:bg-primary-gold hover:text-white transition-all disabled:opacity-50">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Score Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-primary-gold/10 p-8 mb-12">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-title text-2xl mb-1">Trust Grade</h2>
                <p className="font-mono text-[9px] text-neutral-dark/40">{data.total_checks} automated checks passed</p>
              </div>
              <div className="text-right">
                <div className={`font-title text-6xl ${gradeColor[data.grade] || 'text-primary-gold'}`}>{data.grade}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/40">{data.overall_score}% Compliance Score</div>
              </div>
            </div>
            <div className="w-full bg-primary-gold/10 h-4 rounded-full overflow-hidden mb-8">
              <motion.div initial={{ width: 0 }} animate={{ width: `${data.overall_score}%` }} transition={{ duration: 1.2 }} className="h-full rounded-full bg-primary-gold" />
            </div>
            <div className="grid grid-cols-3 gap-4">
               {[
                 { label: 'Passed', count: data.passed, color: 'text-green-600 bg-green-50' },
                 { label: 'Partial', count: data.partial, color: 'text-amber-600 bg-amber-50' },
                 { label: 'Failed', count: data.failed, color: 'text-red-600 bg-red-50' }
               ].map(s => (
                 <div key={s.label} className={`border p-4 text-center ${s.color}`}>
                    <div className="font-title text-2xl">{s.count}</div>
                    <div className="font-mono text-[8px] uppercase tracking-widest">{s.label}</div>
                 </div>
               ))}
            </div>
          </motion.div>

          <div className={`grid grid-cols-1 ${isModal ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-6`}>
            {(Object.entries(data.categories) as [string, Category][]).map(([key, cat], catIdx) => (
              <motion.section key={key} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: catIdx * 0.05 }} className="border border-primary-gold/10 p-6 bg-white">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-title text-lg flex items-center gap-2">
                    <ShieldCheck size={16} className="text-primary-gold" /> {cat.name}
                  </h4>
                  <span className="font-title text-lg text-primary-gold">{cat.score}</span>
                </div>
                <div className="space-y-3">
                  {cat.checks.map((check: Check) => (
                    <div key={check.id} className="flex items-start gap-3">
                      <div className="mt-1">{statusIcon(check.status)}</div>
                      <div className="flex-1">
                        <div className="font-sans text-[11px] text-neutral-dark/60 leading-tight mb-1">{check.requirement}</div>
                        <div className="font-mono text-[8px] text-primary-gold/40">{check.legal_reference}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default function ComplianceScore() {
  return (
    <div className="min-h-screen bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="compliance-score" />
      <main className="max-w-[1200px] mx-auto px-6 py-24">
        <ComplianceScoreContent />
      </main>
      <Footer />
    </div>
  );
}
