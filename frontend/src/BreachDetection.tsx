import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Search, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useState } from 'react';
import { fetchWithAuth } from './api';

interface Finding {
  severity: string;
  category: string;
  file: string;
  description: string;
  legal_reference: string;
  line_number: number | null;
  evidence: string | null;
}

interface ScanResult {
  findings: Finding[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  risk_score: number;
  files_scanned: number;
  scan_status: string;
}

const severityConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  CRITICAL: { color: 'bg-red-100 text-red-700 border-red-300', icon: <XCircle size={16} className="text-red-600" /> },
  HIGH: { color: 'bg-orange-100 text-orange-700 border-orange-300', icon: <AlertTriangle size={16} className="text-orange-600" /> },
  MEDIUM: { color: 'bg-amber-100 text-amber-700 border-amber-300', icon: <AlertTriangle size={16} className="text-amber-600" /> },
  LOW: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Info size={16} className="text-blue-600" /> },
};

export const BreachDetectionContent = ({ isModal = false }: { isModal?: boolean }) => {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/breach-scan', { method: 'POST' });
      if (!res.ok) {
        setError(res.status === 401
          ? 'Operator token missing. Set OPERATOR_TOKEN and VITE_OPERATOR_TOKEN.'
          : 'Breach scan failed.');
        return;
      }
      const json = await res.json();
      setResult(json);
    } catch {
      setError('Backend not running. Start the FastAPI server to run a breach scan.');
    } finally {
      setLoading(false);
    }
  };

  const riskColor = (score: number) => {
    if (score >= 75) return 'text-red-600';
    if (score >= 50) return 'text-orange-500';
    if (score >= 25) return 'text-amber-500';
    return 'text-green-500';
  };

  const riskBarColor = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-12">
      {!isModal && (
        <div className="flex flex-col mb-20 text-center items-center">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-title text-5xl lg:text-7xl leading-[0.9] tracking-tighter mb-8">
            Breach <span className="italic font-title text-primary-gold">Detection</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-sans text-neutral-dark/60 max-w-xl leading-relaxed text-sm">
            Automated scanning for residual PII leaks, integrity violations, and anomalies in processed HL7 output — as mandated by DPDP Act §15.
          </motion.p>
          <motion.button onClick={runScan} disabled={loading} className="mt-8 flex items-center gap-3 px-10 py-4 bg-primary-gold text-[#1c1a16] font-mono text-xs uppercase tracking-widest hover:bg-primary-gold/90 transition-all border border-primary-gold disabled:opacity-50">
            <Search size={14} className={loading ? 'animate-pulse' : ''} /> {loading ? 'Scanning...' : 'Run Breach Scan'}
          </motion.button>
          {error && <p className="mt-4 font-sans text-[12px] text-red-500">{error}</p>}
        </div>
      )}

      {isModal && (
        <div className="flex flex-col items-center text-center">
          <h2 className="font-title text-3xl mb-4">Breach <span className="italic text-primary-gold">Detection</span></h2>
          <p className="text-neutral-dark/60 text-xs max-w-xl mb-6">Automated scanning for PII leaks and integrity violations (DPDP §15).</p>
          <button onClick={runScan} disabled={loading} className="px-8 py-3 bg-primary-gold text-[#1c1a16] font-mono text-[10px] uppercase tracking-widest hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            <Search size={12} className={loading ? 'animate-pulse' : ''} /> {loading ? 'Scanning Output Registry...' : 'Run Real-time Breach Scan'}
          </button>
        </div>
      )}

      {/* Scan Types Reference */}
      <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
        <div className={`grid grid-cols-1 ${isModal ? 'md:grid-cols-3' : 'md:grid-cols-3'} gap-4`}>
          {[
            { title: 'PII Scan', desc: 'Regex-based detection of Aadhaar, PAN, SSN in NTE segments.', legal: 'IT Act §72A', icon: '🔍' },
            { title: 'Integrity', desc: 'SHA-256 hash validation vs ZSH segments.', legal: 'IT Act §14', icon: '🛡️' },
            { title: 'Anomaly', desc: 'Statistical analysis of sizes and duplicates.', legal: 'DPDP §8(4)', icon: '📊' },
          ].map((scan, idx) => (
            <div key={scan.title} className="bg-white border border-primary-gold/10 p-6">
              <span className="text-xl block mb-2">{scan.icon}</span>
              <h3 className="font-title text-lg mb-1">{scan.title}</h3>
              <p className="font-sans text-[11px] text-neutral-dark/50 leading-relaxed mb-2">{scan.desc}</p>
              <span className="font-mono text-[8px] text-primary-gold/60 uppercase">{scan.legal}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Results */}
      {result && (
        <>
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <div className="bg-white border border-primary-gold/10 p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-title text-2xl mb-1">Risk Assessment</h2>
                  <p className="font-mono text-[9px] text-neutral-dark/40">{result.files_scanned} files scanned · {result.summary.total} findings</p>
                </div>
                <div className="text-right">
                  <div className={`font-title text-5xl ${riskColor(result.risk_score)}`}>{result.risk_score}</div>
                  <div className="font-mono text-[8px] uppercase tracking-widest text-neutral-dark/40">Risk Score</div>
                </div>
              </div>
              <div className="w-full bg-neutral-dark/5 h-3 rounded-full overflow-hidden mb-8">
                <motion.div initial={{ width: 0 }} animate={{ width: `${result.risk_score}%` }} transition={{ duration: 1 }} className={`h-full rounded-full ${riskBarColor(result.risk_score)}`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Critical', count: result.summary.critical, color: 'text-red-600 bg-red-50' },
                  { label: 'High', count: result.summary.high, color: 'text-orange-600 bg-orange-50' },
                  { label: 'Medium', count: result.summary.medium, color: 'text-amber-600 bg-amber-50' },
                  { label: 'Low', count: result.summary.low, color: 'text-blue-600 bg-blue-50' },
                ].map(s => (
                  <div key={s.label} className={`border p-4 text-center ${s.color}`}>
                    <div className="font-title text-2xl">{s.count}</div>
                    <div className="font-mono text-[8px] uppercase tracking-widest">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {result.findings.length > 0 ? (
            <div className="space-y-4">
               {result.findings.map((finding, idx) => {
                 const config = severityConfig[finding.severity] || severityConfig.LOW;
                 return (
                   <div key={idx} className="bg-white border border-primary-gold/10 p-5 flex items-start gap-4">
                      {config.icon}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 border rounded-sm ${config.color}`}>{finding.severity}</span>
                          <span className="font-mono text-[9px] text-neutral-dark/40">{finding.category}</span>
                          <span className="font-mono text-[9px] text-primary-gold bg-primary-gold/10 px-1.5 py-0.5">{finding.file}</span>
                          {finding.line_number && <span className="font-mono text-[9px] text-neutral-dark/30">Line {finding.line_number}</span>}
                        </div>
                        <p className="font-sans text-xs text-neutral-dark/60 mb-1">{finding.description}</p>
                        <p className="font-mono text-[8px] text-primary-gold/60">{finding.legal_reference}</p>
                        {finding.evidence && <p className="font-mono text-[8px] text-red-500 mt-1">{finding.evidence}</p>}
                      </div>
                   </div>
                 );
               })}
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 p-8 text-center">
              <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
              <p className="font-sans text-xs text-green-600">No breaches detected. System integrity verified.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default function BreachDetection() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <Header activeTab="breach-detection" />
      <main className="max-w-[1200px] flex-1 mx-auto px-6 py-24 w-full">
        <BreachDetectionContent />
      </main>
      <Footer />
    </div>
  );
}
