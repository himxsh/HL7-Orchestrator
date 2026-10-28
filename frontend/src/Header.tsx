/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Menu, Moon, Sun, X } from 'lucide-react';
import { getStoredTheme, toggleTheme, type ThemeMode } from './theme';

type TabId = 'home' | 'pipeline' | 'architecture' | 'compliance' | 'legal-framework' | 'digital-signatures' | 'gdpr' | 'healthcare' | 'case-studies' | 'data-lifecycle' | 'data-classification' | 'penalties' | 'consent' | 'encryption' | 'audit-log' | 'breach-detection' | 'compliance-score' | 'data-lineage' | 'risk-assessment' | 'access-control' | 'fhir-export' | 'phi-report' | 'pseudonym-vault';

interface HeaderProps {
  activeTab?: TabId;
}

export default function Header({ activeTab }: HeaderProps) {
  const [legalOpen, setLegalOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const legalRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileOpen(false);
    setLegalOpen(false);
    setToolsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (legalRef.current && !legalRef.current.contains(e.target as Node)) {
        setLegalOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail || getStoredTheme();
      setTheme(nextTheme);
    };

    window.addEventListener('theme-change', syncTheme);
    return () => window.removeEventListener('theme-change', syncTheme);
  }, []);

  const primaryNav = [
    { id: 'home', label: 'Home', path: '/' },
    { id: 'pipeline', label: 'Pipeline', path: '/selection' },
    { id: 'architecture', label: 'Architecture', path: '/architecture' },
    { id: 'compliance', label: 'Compliance', path: '/compliance' },
  ];

  const legalPages = [
    { id: 'legal-framework', label: 'Legal Framework', path: '/legal-framework' },
    { id: 'digital-signatures', label: 'Digital Signatures', path: '/digital-signatures' },
    { id: 'gdpr', label: 'GDPR', path: '/gdpr' },
    { id: 'healthcare', label: 'Healthcare Protection', path: '/healthcare' },
    { id: 'case-studies', label: 'Case Studies', path: '/case-studies' },
    { id: 'data-lifecycle', label: 'Data Lifecycle', path: '/data-lifecycle' },
    { id: 'data-classification', label: 'Data Classification', path: '/data-classification' },
    { id: 'penalties', label: 'Penalties & Offences', path: '/penalties' },
    { id: 'consent', label: 'Consent Management', path: '/consent' },
  ];

  const toolPages = [
    { id: 'fhir-export', label: 'FHIR R4 Export', path: '/fhir' },
    { id: 'phi-report', label: 'PHI Report', path: '/phi' },
    { id: 'pseudonym-vault', label: 'Pseudonym Vault', path: '/vault' },
  ];

  const isLegalActive = legalPages.some(p => p.id === activeTab);
  const isToolsActive = toolPages.some(p => p.id === activeTab);

  return (
    <header className="fixed top-0 w-full z-50 bg-bg-light/80 backdrop-blur-md border-b border-gold/10">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
        <Link to="/" onClick={() => window.scrollTo(0, 0)} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="font-title text-2xl tracking-tight font-light uppercase text-neutral-dark">
            HL7 <span className="italic lowercase font-title">Orchestrator</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-10 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
          {primaryNav.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              onClick={() => window.scrollTo(0, 0)}
              className={`relative py-1 transition-colors hover:text-gold ${activeTab === item.id ? 'text-gold' : ''
                }`}
            >
              {item.label}
              {activeTab === item.id && (
                <motion.div
                  layoutId="header-underline"
                  className="absolute bottom-0 left-0 right-0 h-px bg-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
          ))}

          {/* Legal Dropdown */}
          <div className="relative" ref={legalRef}>
            <button
              onClick={() => { setLegalOpen(!legalOpen); }}
              className={`relative py-1 transition-colors hover:text-gold flex items-center gap-1 ${isLegalActive ? 'text-gold' : ''
                }`}
            >
              Legal
              <ChevronDown size={12} className={`transition-transform ${legalOpen ? 'rotate-180' : ''}`} />
              {isLegalActive && (
                <motion.div
                  layoutId="header-underline"
                  className="absolute bottom-0 left-0 right-0 h-px bg-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>

            <AnimatePresence>
              {legalOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-3 w-56 bg-white border border-gold/20 shadow-xl shadow-black/5 py-2 z-50"
                >
                  {legalPages.map((page) => (
                    <Link
                      key={page.id}
                      to={page.path}
                      onClick={() => {
                        window.scrollTo(0, 0);
                        setLegalOpen(false);
                      }}
                      className={`block px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] transition-all hover:bg-gold/5 hover:text-gold ${activeTab === page.id ? 'text-gold bg-gold/5' : 'text-slate-600'
                        }`}
                    >
                      {page.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => { setToolsOpen(!toolsOpen); }}
              className={`relative py-1 transition-colors hover:text-gold flex items-center gap-1 ${isToolsActive ? 'text-gold' : ''}`}
            >
              Tools
              <ChevronDown size={12} className={`transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
              {isToolsActive && (
                <motion.div
                  layoutId="header-underline"
                  className="absolute bottom-0 left-0 right-0 h-px bg-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
            <AnimatePresence>
              {toolsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-3 w-56 bg-white border border-gold/20 shadow-xl shadow-black/5 py-2 z-50"
                >
                  {toolPages.map((page) => (
                    <Link
                      key={page.id}
                      to={page.path}
                      onClick={() => {
                        window.scrollTo(0, 0);
                        setToolsOpen(false);
                      }}
                      className={`block px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] transition-all hover:bg-gold/5 hover:text-gold ${activeTab === page.id ? 'text-gold bg-gold/5' : 'text-slate-600'}`}
                    >
                      {page.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </nav>
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setTheme(toggleTheme(theme))}
            className="inline-flex items-center justify-center p-2 border border-gold/20 text-gold rounded-full hover:bg-gold/10 transition-colors"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden inline-flex items-center justify-center p-2 border border-gold/20 text-gold rounded-full"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="font-mono text-[10px] px-3 py-1 border border-gold text-gold tracking-tighter uppercase">v0.0.1</span>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="md:hidden border-t border-gold/10 bg-bg-light/95 backdrop-blur-md"
          >
            <nav className="px-6 py-4 flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
              {primaryNav.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => window.scrollTo(0, 0)}
                  className={`px-3 py-3 rounded-sm transition-colors ${activeTab === item.id ? 'bg-gold/10 text-gold' : 'hover:bg-gold/5'}`}
                >
                  {item.label}
                </Link>
              ))}

              <div className="mt-2 pt-3 border-t border-gold/10">
                <div className="px-3 pb-2 text-[9px] tracking-[0.22em] text-slate-400">Tools</div>
                <div className="flex flex-col gap-1">
                  {toolPages.map((page) => (
                    <Link
                      key={page.id}
                      to={page.path}
                      onClick={() => window.scrollTo(0, 0)}
                      className={`px-3 py-3 rounded-sm transition-colors ${activeTab === page.id ? 'bg-gold/10 text-gold' : 'hover:bg-gold/5'}`}
                    >
                      {page.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-2 pt-3 border-t border-gold/10">
                <div className="px-3 pb-2 text-[9px] tracking-[0.22em] text-slate-400">Legal</div>
                <div className="flex flex-col gap-1">
                  {legalPages.map((page) => (
                    <Link
                      key={page.id}
                      to={page.path}
                      onClick={() => window.scrollTo(0, 0)}
                      className={`px-3 py-3 rounded-sm transition-colors ${activeTab === page.id ? 'bg-gold/10 text-gold' : 'hover:bg-gold/5'}`}
                    >
                      {page.label}
                    </Link>
                  ))}
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
