/**
 * BatchMode.tsx — Batch processing upload page
 *
 * Separate page for MIMIC 3-file upload and Generic single-CSV upload.
 * Accessible via /batch route within the Pipeline tab.
 *
 * [DPDP Act §8(1)] — Data collected only for declared processing purpose.
 */

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ChevronRight,
  AlertTriangle,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { fetchWithAuth } from './api';

// MIMIC required files
const MIMIC_FILES = [
  { key: 'patients', name: 'patients.csv.gz', description: 'Patient demographics' },
  { key: 'labevents', name: 'labevents.csv.gz', description: 'Lab event records' },
  { key: 'd_labitems', name: 'd_labitems.csv.gz', description: 'Lab item dictionary' },
];

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function BatchMode() {
  const navigate = useNavigate();

  // Mode: 'mimic' or 'generalized'
  const [batchMode, setBatchMode] = useState<'mimic' | 'generalized'>('mimic');

  // MIMIC uploads: one per required file
  const [mimicUploads, setMimicUploads] = useState<Record<string, { filename: string; path: string } | null>>({
    patients: null,
    labevents: null,
    d_labitems: null,
  });
  const [mimicRunId, setMimicRunId] = useState<string | null>(null);

  // Generic upload
  const [genericUpload, setGenericUpload] = useState<{ filename: string; path: string; runId: string } | null>(null);

  // UI state
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mimicInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const genericInputRef = useRef<HTMLInputElement>(null);

  // Upload handler for MIMIC files
  const handleMimicUpload = async (fileKey: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
      return;
    }

    setUploading(fileKey);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      let url = '/api/upload';
      if (mimicRunId) {
        url = `/api/upload/${mimicRunId}`;
      }

      const response = await fetchWithAuth(url, { method: 'POST', body: formData });

      if (response.status === 413) {
        setUploadError(`${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB server limit.`);
        return;
      }

      if (!response.ok) {
        const errData = await response.json();
        setUploadError(errData.detail || 'Upload failed');
        return;
      }

      const data = await response.json();

      if (!mimicRunId) {
        setMimicRunId(data.runId);
      }

      setMimicUploads(prev => ({ ...prev, [fileKey]: { filename: data.filename, path: data.path } }));
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError('Network error. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  // Upload handler for generic CSV
  const handleGenericUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
      return;
    }

    setUploading('generic');
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetchWithAuth('/api/upload', { method: 'POST', body: formData });

      if (response.status === 413) {
        setUploadError(`${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB server limit.`);
        return;
      }

      if (!response.ok) {
        const errData = await response.json();
        setUploadError(errData.detail || 'Upload failed');
        return;
      }

      const data = await response.json();
      setGenericUpload({ filename: data.filename, path: data.path, runId: data.runId });
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError('Network error. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  // Check if ready to run
  const isMimicReady = Object.values(mimicUploads).every(v => v !== null);
  const isGenericReady = genericUpload !== null;
  const isReady = batchMode === 'mimic' ? isMimicReady : isGenericReady;

  const handleRunPipeline = () => {
    if (batchMode === 'mimic' && isMimicReady && mimicRunId) {
      navigate('/dashboard', {
        state: {
          dataset: 'MIMIC-IV v3.1',
          runId: mimicRunId,
        }
      });
    } else if (batchMode === 'generalized' && genericUpload) {
      navigate('/dashboard', {
        state: {
          dataset: genericUpload.filename,
          runId: genericUpload.runId,
          filePath: genericUpload.path,
        }
      });
    }
  };

  const mimicUploadCount = Object.values(mimicUploads).filter(v => v !== null).length;

  return (
    <div className="min-h-screen bg-bg-light text-neutral-dark font-sans selection:bg-primary-gold/30">
      <div className="max-w-[1440px] mx-auto flex flex-col items-center">
        <Header activeTab="pipeline" />

        <main className="w-full max-w-[900px] px-6 py-20 flex flex-col items-center">
          {/* Title */}
          <div className="flex items-center gap-3 mb-2 mt-12">
            <button
              onClick={() => navigate('/selection')}
              className="p-2 hover:bg-primary-gold/10 rounded-full transition-colors text-neutral-dark/50 hover:text-primary-gold"
            >
              <ChevronRight className="rotate-180" size={20} />
            </button>
            <h1 className="font-title text-5xl md:text-[52px] text-neutral-dark leading-tight">
              Batch Mode
            </h1>
          </div>
          <p className="font-sans text-sm text-neutral-dark/60 text-center max-w-lg mb-4 leading-relaxed">
            Upload CSV files to process multiple patient records. Your data is processed
            in-memory and deleted immediately after download.
          </p>

          {/* Stateless disclaimer */}
          <div className="flex items-center gap-2 mb-8 px-4 py-2 bg-primary-gold/5 border border-primary-gold/20 rounded-sm">
            <ShieldCheck size={14} className="text-primary-gold shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-primary-gold/80">
              Stateless Processing — Zero data persistence — {MAX_FILE_SIZE_MB}MB per file
            </span>
          </div>

          <div className="w-[48px] h-[1px] bg-primary-gold mb-12"></div>

          {/* Error banner */}
          {uploadError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-sm text-red-700">{uploadError}</span>
              </div>
              <button onClick={() => setUploadError(null)} className="text-red-300 hover:text-red-500">
                <X size={14} />
              </button>
            </motion.div>
          )}

          {/* Main card */}
          <div className="w-full bg-white border border-primary-gold/20 rounded-sm p-8 md:p-10">
            {/* Mode Selector */}
            <div className="flex gap-2 mb-8">
              <button
                onClick={() => setBatchMode('mimic')}
                className={`flex-1 py-3.5 text-center text-[10px] font-mono uppercase tracking-[0.1em] border rounded-sm transition-all ${
                  batchMode === 'mimic'
                    ? 'border-primary-gold bg-primary-gold/10 text-primary-gold font-bold'
                    : 'border-primary-gold/20 text-neutral-dark/50 hover:border-primary-gold/40'
                }`}
              >
                MIMIC Mode
              </button>
              <button
                onClick={() => setBatchMode('generalized')}
                className={`flex-1 py-3.5 text-center text-[10px] font-mono uppercase tracking-[0.1em] border rounded-sm transition-all ${
                  batchMode === 'generalized'
                    ? 'border-primary-gold bg-primary-gold/10 text-primary-gold font-bold'
                    : 'border-primary-gold/20 text-neutral-dark/50 hover:border-primary-gold/40'
                }`}
              >
                Generic Mode
              </button>
            </div>

            {/* MIMIC Upload Slots */}
            {batchMode === 'mimic' && (
              <div className="space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-dark/40 mb-4">
                  Upload your MIMIC-IV dataset files (≤{MAX_FILE_SIZE_MB}MB each)
                </p>
                {MIMIC_FILES.map(mf => {
                  const uploaded = mimicUploads[mf.key];
                  const isUploading = uploading === mf.key;

                  return (
                    <div
                      key={mf.key}
                      onClick={() => !isUploading && mimicInputRefs.current[mf.key]?.click()}
                      className={`flex items-center justify-between p-4 border border-dashed rounded-sm cursor-pointer transition-all ${
                        uploaded
                          ? 'border-green-500/60 bg-green-500/12 hover:bg-green-500/16'
                          : 'border-primary-gold/25 hover:border-primary-gold/60 hover:bg-primary-gold/8'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isUploading ? (
                          <Loader2 size={16} className="animate-spin text-primary-gold" />
                        ) : uploaded ? (
                          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                        ) : (
                          <UploadCloud size={16} className="text-primary-gold/70" />
                        )}
                        <div>
                          <div className={`text-sm font-mono ${uploaded ? 'text-neutral-dark dark:text-white' : 'text-neutral-dark/85 dark:text-white/90'}`}>{mf.name}</div>
                          <div className={`text-[9px] ${uploaded ? 'text-neutral-dark/70 dark:text-white/65' : 'text-neutral-dark/45 dark:text-white/45'}`}>{mf.description}</div>
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono uppercase ${uploaded ? 'text-green-700 dark:text-green-300' : 'text-neutral-dark/40 dark:text-white/45'}`}>
                        {isUploading ? 'Uploading...' : uploaded ? '✓ Ready' : 'Click to upload'}
                      </span>
                      <input
                        type="file"
                        ref={el => { mimicInputRefs.current[mf.key] = el; }}
                        onChange={(e) => handleMimicUpload(mf.key, e)}
                        className="hidden"
                        accept=".csv,.gz"
                      />
                    </div>
                  );
                })}
                <div className="text-[9px] font-mono text-neutral-dark/30 text-center mt-2">
                  {mimicUploadCount}/3 files uploaded
                </div>
              </div>
            )}

            {/* Generic Upload */}
            {batchMode === 'generalized' && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-dark/40 mb-4">
                  Upload any flat CSV file (≤{MAX_FILE_SIZE_MB}MB)
                </p>
                <div
                  onClick={() => genericInputRef.current?.click()}
                  className={`p-10 border border-dashed rounded-sm flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    genericUpload
                      ? 'border-green-500/60 bg-green-500/12 hover:bg-green-500/16'
                      : 'border-primary-gold/25 hover:border-primary-gold/60 hover:bg-primary-gold/8'
                  }`}
                >
                  {uploading === 'generic' ? (
                    <Loader2 className="animate-spin text-primary-gold mb-2" size={24} />
                  ) : genericUpload ? (
                    <CheckCircle2 className="text-green-600 dark:text-green-400 mb-2" size={24} />
                  ) : (
                    <UploadCloud className="text-primary-gold/70 mb-2" size={24} />
                  )}
                  <p className={`font-mono text-[10px] ${genericUpload ? 'text-neutral-dark/85 dark:text-white/85' : 'text-neutral-dark/55 dark:text-white/55'}`}>
                    {uploading === 'generic'
                      ? 'Uploading...'
                      : genericUpload
                        ? `Ready: ${genericUpload.filename}`
                        : 'Drop CSV here or click to browse'
                    }
                  </p>
                  {genericUpload && (
                    <span className="text-[9px] text-primary-gold mt-1 underline underline-offset-2">Change file</span>
                  )}
                </div>
                <input
                  type="file"
                  ref={genericInputRef}
                  onChange={handleGenericUpload}
                  className="hidden"
                  accept=".csv"
                />
              </div>
            )}

            {/* Run Pipeline Button */}
            <button
              onClick={handleRunPipeline}
              disabled={!isReady}
              className={`w-full mt-8 py-5 rounded-sm text-xs font-sans uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all group ${
                isReady
                  ? 'bg-primary-gold text-charcoal border border-primary-gold shadow-[0_10px_30px_-18px_rgba(166,145,101,0.9)] hover:bg-primary-gold/90 cursor-pointer'
                  : 'bg-neutral-dark/15 text-neutral-dark/35 dark:text-white/35 cursor-not-allowed border border-primary-gold/10'
              }`}
            >
              <span>Run Pipeline</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
