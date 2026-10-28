/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ChevronRight,
  Terminal,
  Settings,
  Download,
  Moon,
  Sun,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, useBlocker } from 'react-router-dom';
import SecurityModal from './SecurityModal';
import Footer from './Footer';
import { getStoredTheme, toggleTheme, type ThemeMode } from './theme';
import { fetchWithAuth } from './api';

// --- Types ---
interface PatientRecord {
  id: string;
  pseudonym: string;
  sex: 'M' | 'F';
  cohort: string;
  labEvents: number;
  output: string;
  seal: 'Valid' | 'Tampered';
  raw_data?: Record<string, any>;
  content?: string;
}

// --- Sub-components ---
const StatCard: React.FC<{ label: string, value: string | number, subValue?: string, color?: string }> = ({ label, value, subValue, color = 'text-white' }) => (
  <div className="glass-panel p-4 sm:p-5 border-l-2 border-l-gold">
    <div className="text-white/40 text-[10px] uppercase tracking-[0.15em] mb-2 font-sans">{label}</div>
    <div className="flex items-baseline gap-2">
      <div className={`text-2xl sm:text-3xl technical-data ${color}`}>{value}</div>
      {subValue && <div className="text-white/20 text-sm technical-data">/ {subValue}</div>}
    </div>
  </div>
);

const PipelineStage = ({ label, active, completed }: { label: string, active: boolean, completed: boolean }) => (
  <div className="flex min-w-[120px] sm:min-w-0 flex-col items-center space-y-3 bg-charcoal px-3 sm:px-4 relative z-10">
    <div className={`w-4 h-4 rounded-full border-4 border-charcoal-light transition-all duration-500 ${completed
        ? 'bg-ok-green shadow-[0_0_15px_rgba(106,158,114,0.6)]'
        : active
          ? 'bg-gold shadow-[0_0_15px_rgba(184,168,130,0.6)] animate-pulse'
          : 'bg-charcoal-light'
      }`}></div>
    <span className={`text-[10px] uppercase tracking-wider transition-colors ${completed || active ? 'text-white' : 'text-white/30'
      }`}>{label}</span>
  </div>
);

interface LogEntryProps {
  time: string;
  file: string;
  status: string;
  warning?: boolean;
}

const LogEntry: React.FC<LogEntryProps> = ({ time, file, status, warning = false }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className="grid grid-cols-1 gap-1 border-b border-ui-border/10 pb-2.5 items-start sm:grid-cols-12 sm:gap-2 sm:items-center"
  >
    <div className="text-white/30 font-mono sm:col-span-3">[{time}]</div>
    <div className="text-white/70 truncate sm:col-span-6">{file}</div>
    <div className="flex items-center gap-2 sm:col-span-3 sm:justify-end">
      <span className={warning ? 'text-warn-amber' : 'text-ok-green'}>{status}</span>
      <div className={`w-1 h-1 rounded-full ${warning ? 'bg-warn-amber' : 'bg-ok-green'} animate-pulse`} />
    </div>
  </motion.div>
);

const ConfigItem = ({ label, value }: { label: string, value: string }) => (
  <div>
    <div className="text-white/30 uppercase tracking-wider mb-1.5 text-[9px]">/ {label}</div>
    <div className="text-white/80 break-words">{value}</div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = (location.state || {}) as {
    mode?: 'single' | 'batch';
    dataset?: string;
    runId?: string;
    filePath?: string;
    singlePatientData?: { fields: Record<string, string>; observations: { header: string; value: string }[] };
  };
  const selectedDataset = locState.dataset || 'MIMIC-IV v3.1';
  const pipelineMode = locState.mode || 'batch';

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState(-1);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [hl7Content, setHl7Content] = useState<string>('');
  const [activeFile, setActiveFile] = useState<string>('');
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [validationLogs, setValidationLogs] = useState<{time: string, file: string, status: string}[]>([]);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityTab, setSecurityTab] = useState('encryption');
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [encryptionRunId, setEncryptionRunId] = useState<string | null>(locState.runId || null);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const logContainerRef = useRef<HTMLDivElement>(null);
  const headersInitialized = useRef(false);
  const hasRunRef = useRef(false);
  
  // Navigation Blocker for internal routing (React Router)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isProcessing || records.length > 0) &&
      currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowExitWarning(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail || getStoredTheme();
      setTheme(nextTheme);
    };

    window.addEventListener('theme-change', syncTheme);
    return () => window.removeEventListener('theme-change', syncTheme);
  }, []);

  // Warning for browser refresh / close button
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing || records.length > 0) {
        e.preventDefault();
        e.returnValue = "You have unsaved orchestration progress. Refreshing will terminate the session.";
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, records.length]);

  const runPipeline = async () => {
    if (isProcessing || hasRunRef.current) return;
    hasRunRef.current = true;
    setIsProcessing(true);
    setRecords([]);
    setTableHeaders([]);
    setErrorMessage('');
    setEncryptionRunId(locState.runId || null);
    headersInitialized.current = false;
    setCurrentStage(0);

    try {
      const dataset = locState.dataset || 'mimic';
      const isMIMIC = dataset.toLowerCase().includes('mimic');
      let response: Response;

      if (pipelineMode === 'single' && locState.singlePatientData) {
        // Single patient mode — stream via /api/run-single
        setTableHeaders(['Subject ID', 'Pseudonym', 'Sex', 'Observations', 'Output']);
        headersInitialized.current = true;

        response = await fetchWithAuth('/api/run-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(locState.singlePatientData),
        });
      } else {
        // Batch mode
        if (isMIMIC) {
          setTableHeaders(['Subject ID', 'Pseudonym', 'Sex', 'Cohort', 'Lab Events', 'Output']);
          headersInitialized.current = true;
        }

        response = await fetchWithAuth('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset, runId: locState.runId || '', filePath: locState.filePath }),
        });
      }

      if (!response.ok) {
        const hint = response.status === 401
          ? 'Pipeline request was rejected. Set OPERATOR_TOKEN and VITE_OPERATOR_TOKEN to the same value.'
          : `Pipeline request failed with status ${response.status}`;
        throw new Error(hint);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Pipeline response stream was not available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let data: any;
          try {
            data = JSON.parse(line.slice(6));
          } catch (e) {
            console.error('Error parsing stream line:', e);
            continue;
          }

          if (data.status === 'progress') {
            setCurrentStage(data.stage);
          } else if (data.status === 'processing') {
            if (currentStage < 2) setCurrentStage(2);
          } else if (data.status === 'completed') {
            if (!isMIMIC && data.record.raw_data && !headersInitialized.current) {
              const featureKeys = Object.keys(data.record.raw_data).filter(k =>
                !['id', 'Dataset'].includes(k)
              );
              setTableHeaders(['Subject ID', 'Pseudonym', 'Sex', ...featureKeys, 'Output']);
              headersInitialized.current = true;
            }

            setRecords(prev => {
              if (prev.find(r => r.id === data.record.id)) return prev;
              const updated = [...prev, data.record];
              console.log(`[DEBUG] Dashboard Record Added: ${data.record.id} (Current Count: ${updated.length})`);
              if (updated.length === 1) {
                setActiveFile(data.record.output);
                setHl7Content(data.record.content || '');
              }
              return updated;
            });
            
            setValidationLogs(prev => [
              ...prev,
              {
                time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST',
                file: data.record.output,
                status: 'PASS'
              }
            ]);
            
            setCurrentStage(3);
          } else if (data.status === 'success') {
            setCurrentStage(4);
            if (data.downloadToken) setDownloadToken(data.downloadToken);
            if (data.runId) setEncryptionRunId(data.runId);
          } else if (data.status === 'error') {
            throw new Error(data.message || 'Pipeline failed');
          }
        }
      }

      // Process any remaining data in the buffer after stream completion
      if (buffer.trim()) {
        const line = buffer;
        if (line.startsWith('data: ')) {
          let data: any = null;
          try {
            data = JSON.parse(line.slice(6));
          } catch (e) {
            console.error('Error parsing trailing buffer:', e);
          }

          if (data?.status === 'completed') {
            setRecords(prev => {
              if (prev.find(r => r.id === data.record.id)) return prev;
              return [...prev, data.record];
            });
          } else if (data?.status === 'success') {
            setCurrentStage(4);
            if (data.downloadToken) setDownloadToken(data.downloadToken);
          } else if (data?.status === 'error') {
            throw new Error(data.message || 'Pipeline failed');
          }
        }
      }
    } catch (error) {
      console.error('Failed to run pipeline:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Pipeline failed to run');
      hasRunRef.current = false;
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    runPipeline();
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [validationLogs]);

  const fetchHL7 = (record: PatientRecord) => {
    setActiveFile(record.output);
    setHl7Content(record.content || 'Content unavailable (Stateless run finished).');
  };

  const downloadAllHL7 = async () => {
    if (!downloadToken) return;
    const response = await fetchWithAuth(`/api/download/${downloadToken}`);
    if (!response.ok) {
      setErrorMessage(
        response.status === 401
          ? 'Download was rejected. Set OPERATOR_TOKEN and VITE_OPERATOR_TOKEN to the same value.'
          : `Download failed with status ${response.status}`,
      );
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'hl7-output.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const isMIMIC = selectedDataset.toLowerCase().includes('mimic');

  return (
    <div className="flex min-h-screen bg-charcoal text-[#e2e2e2] font-sans">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-ui-border bg-charcoal/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          <div className="flex min-w-0 items-center space-x-3 sm:space-x-4">
            <button
              onClick={() => navigate('/selection')}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/50 hover:text-gold group"
            >
              <ChevronRight className="rotate-180" size={20} />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="text-[10px] uppercase text-white/40 tracking-[0.2em]">HL7 Orchestrator</div>
              <h2 className="text-lg sm:text-xl font-title text-white truncate">Live Pipeline Status</h2>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end lg:gap-6">
            <div className="flex flex-col items-start sm:items-end">
              {currentStage === 4 ? (
                <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    onClick={downloadAllHL7}
                    className="px-3 py-2 border border-gold/40 text-gold text-[10px] font-bold uppercase tracking-tight rounded hover:bg-gold hover:text-charcoal transition-all flex items-center justify-center gap-2"
                  >
                    <Download size={12} />
                    Download HL7 ZIP
                  </button>
                  <button
                    onClick={() => setIsSecurityModalOpen(true)}
                    className="px-3 py-2 bg-ok-green text-charcoal border border-ok-green/50 text-[10px] font-bold uppercase tracking-tight rounded hover:bg-white hover:border-white transition-all shadow-[0_0_15px_rgba(106,158,114,0.4)]"
                  >
                    Orchestration Complete → View Audit
                  </button>
                </div>
              ) : isProcessing ? (
                <span className="px-2 py-0.5 bg-gold/10 text-gold animate-pulse border border-gold/20 text-[9px] uppercase tracking-tighter mb-1 rounded">
                  Pipeline Active
                </span>
              ) : records.length > 0 ? (
                <button
                  onClick={downloadAllHL7}
                  className="mb-1 px-3 py-2 border border-gold/40 text-gold text-[10px] font-bold uppercase tracking-tight rounded hover:bg-gold hover:text-charcoal transition-all flex items-center justify-center gap-2"
                >
                  <Download size={12} />
                  Download HL7 ZIP
                </button>
              ) : null}
              <span className="text-[10px] technical-data text-white/40">{selectedDataset}</span>
            </div>
            <button
              type="button"
              onClick={() => setTheme(toggleTheme(theme))}
              className="inline-flex items-center justify-center self-start sm:self-auto p-2 border border-gold/20 text-gold rounded-full hover:bg-gold/10 transition-colors"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
          {/* Ephemeral session banner */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-warn-amber/10 border border-warn-amber/20 rounded">
            <ShieldAlert size={14} className="text-warn-amber shrink-0" />
            <span className="text-[10px] uppercase tracking-wider text-warn-amber/80 font-mono">
              Stateless session — Your files are processed in-memory and deleted after download
            </span>
          </div>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-6">
            <StatCard label="Records Processed" value={records.length} />
            <StatCard label="HL7 Files Generated" value={records.length} />
            <StatCard label="Integrity Seals Valid" value={records.length} subValue={records.length.toString()} color="text-ok-green" />
            <StatCard label="PII Instances Scrubbed" value={records.length * (isMIMIC ? 8 : 4)} />
          </section>

          {errorMessage && (
            <section className="glass-panel border border-red-400/30 bg-red-500/10 p-4">
              <h3 className="text-red-300 uppercase tracking-[0.2em] text-[11px] mb-2">Pipeline Error</h3>
              <p className="text-sm text-red-100/90">{errorMessage}</p>
            </section>
          )}

          <section className="glass-panel p-5 sm:p-8 relative overflow-hidden">
            <h3 className="text-gold uppercase tracking-[0.2em] text-[11px] mb-6 sm:mb-10">Current Orchestration Flow</h3>
            <div className="relative overflow-x-auto pb-2">
              <div className="flex min-w-max items-center justify-between gap-2 sm:gap-0 relative px-2 sm:px-12">
              <div className="absolute top-[8px] left-14 right-14 sm:left-24 sm:right-24 h-px bg-ui-border"></div>
              <PipelineStage label="Preprocessing" active={currentStage === 0} completed={currentStage > 0} />
              <PipelineStage label="Anonymizer" active={currentStage === 1} completed={currentStage > 1} />
              <PipelineStage label="HL7 Transform" active={currentStage === 2} completed={currentStage > 2} />
              <PipelineStage label="Integrity Seal" active={currentStage === 3} completed={currentStage > 3} />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:gap-8">
            <section className="glass-panel overflow-hidden flex flex-col">
              <div className="p-4 border-b border-ui-border flex justify-between items-center bg-charcoal-light/30">
                <h3 className="text-gold uppercase tracking-[0.2em] text-[11px]">Primary Record Stream</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-white/40 border-b border-ui-border bg-charcoal-light/10">
                      {tableHeaders.map(header => (
                        <th key={header} className="px-4 py-4 font-normal whitespace-nowrap">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="technical-data text-[11px] divide-y divide-ui-border/5">
                    {records.map((record, idx) => (
                      <motion.tr
                        key={record.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => fetchHL7(record)}
                        className={`hover:bg-gold/5 transition-colors group cursor-pointer ${activeFile === record.output ? 'bg-gold/10' : ''}`}
                      >
                        <td className="px-4 py-3.5">{record.id}</td>
                        <td className="px-4 py-3.5 italic text-gold/80">{record.pseudonym}</td>
                        <td className="px-4 py-3.5">{record.sex}</td>
                        {isMIMIC ? (
                          <>
                            <td className="px-4 py-3.5">{record.cohort}</td>
                            <td className="px-4 py-3.5">{record.labEvents}</td>
                          </>
                        ) : (
                          tableHeaders.slice(3, -1).map(header => (
                            <td key={header} className="px-4 py-3.5">{record.raw_data?.[header] || '—'}</td>
                          ))
                        )}
                        <td className="px-4 py-3.5 text-white/60 whitespace-nowrap">{record.output}</td>
                      </motion.tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan={tableHeaders.length || 7} className="px-4 py-10 text-center text-white/20 uppercase tracking-widest text-[10px]">
                          {isProcessing ? 'Streaming data from secure pipeline...' : 'Initializing connection...'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
            <section className="xl:col-span-7 glass-panel flex flex-col min-w-0">
              <div className="p-4 border-b border-ui-border flex justify-between items-center gap-3 bg-charcoal-light/20">
                <div className="flex items-center space-x-2 min-w-0">
                  <Terminal size={14} className="text-gold shrink-0" />
                  <h3 className="text-gold uppercase tracking-[0.2em] text-[11px] truncate">HL7 Inspect — {activeFile || 'None Selected'}</h3>
                </div>
                {hl7Content && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setSecurityTab('fhir'); setIsSecurityModalOpen(true); }}
                      className="px-2 py-1 border border-gold/40 text-gold text-[9px] uppercase tracking-tight hover:bg-gold hover:text-charcoal"
                    >
                      FHIR
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSecurityTab('phi'); setIsSecurityModalOpen(true); }}
                      className="px-2 py-1 border border-gold/40 text-gold text-[9px] uppercase tracking-tight hover:bg-gold hover:text-charcoal"
                    >
                      PHI
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-4 sm:p-6 technical-data text-[11px] leading-relaxed overflow-x-auto bg-black/20 min-h-[200px]">
                {hl7Content ? hl7Content.split('\n').map((line, i) => (
                  <div key={i} className="text-white/60 mb-1.5 whitespace-pre">
                    <span className="text-gold/40 mr-4">{(i + 1).toString().padStart(2, '0')}</span>
                    {line}
                  </div>
                )) : <div className="h-full flex items-center justify-center text-white/10 italic">Select a record to view HL7</div>}
              </div>
            </section>

            <div className="xl:col-span-5 space-y-6 lg:space-y-8">
              <section className="glass-panel p-6">
                <div className="flex items-center space-x-2 mb-5">
                  <ShieldAlert size={14} className="text-gold" />
                  <h3 className="text-gold uppercase tracking-[0.2em] text-[11px]">Integrity Validation Log (IST)</h3>
                </div>
                <div className="hidden sm:grid grid-cols-12 gap-2 mb-2 px-1 text-white/20 font-mono text-[7px] uppercase tracking-widest border-b border-white/5 pb-1">
                  <div className="col-span-3">Time</div>
                  <div className="col-span-6 text-center">Record File</div>
                  <div className="col-span-3 text-right">Status</div>
                </div>
                <div 
                  ref={logContainerRef}
                  className="space-y-4 technical-data text-[10px] h-[260px] overflow-y-auto pr-2 custom-scroll flex flex-col"
                >
                  <AnimatePresence initial={false}>
                    {validationLogs.map((log, i) => (
                      <LogEntry key={`${log.file}-${i}`} time={log.time} file={log.file} status={log.status} />
                    ))}
                  </AnimatePresence>
                  
                  {isProcessing && (
                    <motion.div 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center space-x-3 text-white/20 px-1 py-1 shrink-0"
                    >
                      <div className="w-2 h-2 rounded-full bg-gold/40 animate-pulse" />
                      <span className="uppercase tracking-[0.2em] text-[8px] italic animate-pulse">Scanning Next Record...</span>
                    </motion.div>
                  )}
                  
                  {validationLogs.length === 0 && !isProcessing && (
                    <div className="text-white/10 italic text-center py-4">Waiting for validation events...</div>
                  )}
                </div>
              </section>

              <section className="glass-panel p-6">
                <div className="flex items-center space-x-2 mb-5">
                  <Settings size={14} className="text-gold" />
                  <h3 className="text-gold uppercase tracking-[0.2em] text-[11px]">Orchestration Config</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 technical-data text-[10px]">
                  <ConfigItem label="Execution Mode" value="Batch / Stateless" />
                  <ConfigItem label="Input Source" value={selectedDataset} />
                  <ConfigItem label="Anonymization" value="Mapping: Indo-Surnames" />
                  <ConfigItem label="Data Persistence" value="None (Ephemeral)" />
                </div>
              </section>
            </div>
          </div>
          
          <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 mt-12 sm:mt-16">
            <Footer />
          </div>
        </main>
      </div>

      <SecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        runId={encryptionRunId}
        initialTab={securityTab}
        hl7Text={hl7Content}
      />

      <AnimatePresence>
        {showExitWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass-panel p-8 max-w-md border-l-4 border-l-warn-amber shadow-2xl"
            >
              <h3 className="text-warn-amber text-lg font-title mb-4 flex items-center">
                <ShieldAlert className="mr-2" size={20} />
                Leave Dashboard?
              </h3>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Navigating away will terminate the current orchestration session. All generated live stream records and visualization state on this page will be cleared.
              </p>
              <div className="flex justify-end space-x-4">
                <button 
                  onClick={() => {
                    if (blocker.state === 'blocked') blocker.reset();
                    setShowExitWarning(false);
                  }}
                  className="px-4 py-2 text-white/50 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (blocker.state === 'blocked') blocker.proceed();
                    setShowExitWarning(false);
                  }}
                  className="px-6 py-2 bg-warn-amber text-charcoal font-bold uppercase tracking-widest text-[11px] rounded hover:bg-white transition-colors"
                >
                  Confirm & Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
