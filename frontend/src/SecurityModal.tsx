import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Lock, ShieldCheck, BarChart3, RefreshCw, 
  FileText, Clock, Filter, Trash2, Search, 
  AlertTriangle, CheckCircle2, Info, XCircle, 
  Unlock, Users, Shield, User, GitBranch, ArrowRight 
} from 'lucide-react';
import { EncryptionComparisonContent } from './EncryptionComparison';
import { AuditLogContent } from './AuditLog';
import { BreachDetectionContent } from './BreachDetection';
import { ComplianceScoreContent } from './ComplianceScore';
import { DataLineageContent } from './DataLineagePage';
import { RiskAssessmentContent } from './RiskAssessment';
import { AccessControlContent } from './AccessControl';
import { FhirExportContent } from './FhirExport';
import { PhiReportContent } from './PhiReport';
import { PseudonymVaultContent } from './PseudonymVault';

// --- Shared Components & Utils ---

const severityColors: Record<string, string> = {
  INFO: 'bg-blue-50 text-blue-600 border-blue-200',
  WARNING: 'bg-amber-50 text-amber-600 border-amber-200',
  ERROR: 'bg-red-50 text-red-600 border-red-200',
  CRITICAL: 'bg-red-100 text-red-700 border-red-300',
};

const eventIcons: Record<string, string> = {
  PIPELINE_START: '🚀',
  RECORD_INGESTED: '📥',
  PII_DETECTED: '🔍',
  PII_ANONYMISED: '🔒',
  INTEGRITY_SEALED: '🛡️',
  ENCRYPTION_APPLIED: '🔐',
  RECORD_COMPLETE: '✅',
  BREACH_SCAN_START: '🔎',
  BREACH_DETECTED: '🚨',
  PIPELINE_END: '🏁',
};

const TABS = (runId?: string | null, hl7Text?: string) => [
  { id: 'encryption', label: 'Encryption', component: () => <EncryptionComparisonContent isModal={true} runId={runId} /> },
  { id: 'fhir', label: 'FHIR R4', component: () => <FhirExportContent isModal hl7Text={hl7Text} /> },
  { id: 'phi', label: 'PHI Report', component: () => <PhiReportContent isModal hl7Text={hl7Text} /> },
  { id: 'vault', label: 'Vault', component: () => <PseudonymVaultContent isModal /> },
  { id: 'audit', label: 'Audit Log', component: () => <AuditLogContent isModal={true} /> },
  { id: 'breach', label: 'Breach Detection', component: () => <BreachDetectionContent isModal={true} /> },
  { id: 'compliance', label: 'Compliance', component: () => <ComplianceScoreContent isModal={true} /> },
  { id: 'lineage', label: 'Data Lineage', component: () => <DataLineageContent isModal={true} /> },
  { id: 'risk', label: 'Risk Assessment', component: () => <RiskAssessmentContent isModal={true} /> },
  { id: 'access', label: 'Access Control', component: () => <AccessControlContent isModal={true} /> },
];

export default function SecurityModal({ isOpen, onClose, runId, initialTab = 'encryption', hl7Text = '' }: { isOpen: boolean, onClose: () => void, runId?: string | null, initialTab?: string, hl7Text?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabs = TABS(runId, hl7Text);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-charcoal/90 backdrop-blur-xl"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-6xl h-full max-h-[90vh] bg-bg-light rounded-lg shadow-2xl overflow-hidden flex flex-col border border-primary-gold/20"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-8 py-6 border-b border-primary-gold/10 bg-white">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-primary-gold/10 rounded-sm flex items-center justify-center border border-primary-gold/20">
                <ShieldCheck className="text-primary-gold" size={20} />
             </div>
             <div>
                <h1 className="font-title text-2xl tracking-tight uppercase text-neutral-dark">Security & Compliance <span className="italic lowercase text-primary-gold ml-1">Center</span></h1>
                <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-dark/60">Audit Trail · PII Safety · Digital Trust</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-dark/5 rounded-full transition-colors">
            <X size={24} className="text-neutral-dark/40 hover:text-primary-gold" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="shrink-0 bg-white border-b border-primary-gold/10 flex px-8 gap-8 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-4 text-[10px] font-mono uppercase tracking-[0.2em] transition-colors whitespace-nowrap ${activeTab === tab.id ? 'text-primary-gold' : 'text-neutral-dark/40 hover:text-neutral-dark/60'}`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="modal-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-gold" />
              )}
            </button>
          ))}
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-12 bg-bg-light text-neutral-dark custom-scroll">
           <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.2 }}
              >
                {(() => {
                  const ActiveComp = tabs.find(t => t.id === activeTab)?.component || (() => null);
                  return <ActiveComp />;
                })()}
              </motion.div>
           </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-4 border-t border-primary-gold/10 bg-white/50 flex justify-between items-center text-[9px] font-mono text-neutral-dark/60 uppercase tracking-[0.1em]">
          <div>Legal Basis: IT Act 2000, DPDP Act 2023, GDPR Article 32</div>
          <div>Secure Orchestration v0.0.1 · Last Assessed: {new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })} {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST</div>
        </div>
      </motion.div>
    </div>
  );
}
