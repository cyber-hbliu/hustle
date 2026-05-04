import { useState, useEffect, useCallback, useMemo } from 'react';
import { parseJobUrl, analyzeMatch, generateCoverLetter, getApiKey, setApiKey } from './api';

// ─── Constants ─────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'saved', label: 'Saved', icon: '○', color: '#71717a', bg: '#f4f4f5' },
  { key: 'applied', label: 'Applied', icon: '◉', color: '#2563eb', bg: '#eff6ff' },
  { key: 'interview', label: 'Interview', icon: '◈', color: '#9333ea', bg: '#faf5ff' },
  { key: 'offer', label: 'Offer', icon: '✦', color: '#16a34a', bg: '#f0fdf4' },
  { key: 'rejected', label: 'Rejected', icon: '—', color: '#dc2626', bg: '#fef2f2' },
];
const statusMap = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

// ─── Sample Data ───────────────────────────────────────────────────────
const SAMPLE_JOBS = [
  {
    id: 'sample-1',
    position: 'Community Data Analyst',
    company: 'Philadelphia Workforce Development Board',
    location: 'Philadelphia, PA',
    salary: '$62,000 – $75,000',
    benefits: 'Health insurance, pension, 20 days PTO, professional development budget',
    sponsorship: 'Yes',
    union: 'Yes',
    deadline: '',
    url: 'https://example.org/jobs/community-data-analyst',
    skills: ['R', 'SQL', 'Data Visualization', 'Labor Market Analysis', 'Policy Research', 'Stakeholder Communication'],
    qualifications: "Bachelor's or Master's in economics, statistics, urban planning, or related field. 2+ years of applied analytical experience.",
    description: 'Conduct applied labor market research and spatial analysis to inform workforce development policy. Work with federal, state, and local partners to translate data into actionable recommendations for job seekers and employers.',
    worker_protections: 'Equal Opportunity Employer. ADA accommodations available on request. Language access in Spanish and Mandarin.',
    community_focus: 'Serves Philadelphia workforce with particular focus on historically underinvested neighborhoods and immigrant communities.',
    status: 'saved',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — feel free to delete. Replace with your own positions.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    position: 'Research Associate, Immigration Policy',
    company: 'Urban Institute',
    location: 'Washington, DC (Hybrid)',
    salary: '$70,000 – $85,000',
    benefits: 'Comprehensive health, 401k match, generous leave',
    sponsorship: 'Yes',
    union: 'No',
    deadline: '',
    url: 'https://example.org/jobs/research-associate',
    skills: ['Python', 'Statistical Analysis', 'Policy Writing', 'Quantitative Research', 'Stata'],
    qualifications: "Master's degree in public policy, economics, or related social science. Experience with immigration or labor topics preferred.",
    description: 'Contribute to policy research on immigrant economic integration, labor market outcomes, and workforce programs. Co-author reports, briefs, and peer-reviewed publications.',
    worker_protections: 'EEO/AA Employer. Commitment to diverse hiring and inclusive workplace.',
    community_focus: 'Research directly informs policy affecting low-income and immigrant communities.',
    status: 'applied',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — applied on 4/15 via online portal.',
    createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
  {
    id: 'sample-3',
    position: 'Data Scientist',
    company: 'TechCorp (fictional)',
    location: 'Remote (US)',
    salary: '$120,000 – $160,000',
    benefits: 'Stock options, unlimited PTO, health insurance',
    sponsorship: 'No',
    union: 'No',
    deadline: '',
    url: 'https://example.com/jobs/data-scientist',
    skills: ['Python', 'Machine Learning', 'SQL', 'AWS', 'TensorFlow'],
    qualifications: "Bachelor's in CS, statistics, or equivalent experience. 3+ years production ML.",
    description: 'Build and deploy ML models for consumer-facing products. Work closely with product and engineering teams.',
    worker_protections: '',
    community_focus: '',
    status: 'rejected',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — no sponsorship, passed.',
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
  },
];

// ─── Persistence ───────────────────────────────────────────────────────
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// ─── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [jobs, setJobs] = useState(() => load('hs-jobs', []));
  const [activeTab, setActiveTab] = useState('jobs');
  const [skillFilter, setSkillFilter] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [panel, setPanel] = useState(null);
  const [apiKeyVal, setApiKeyVal] = useState(getApiKey);
  const [resume, setResume] = useState(() => localStorage.getItem('hs-resume') || '');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [dismissedWelcome, setDismissedWelcome] = useState(() => localStorage.getItem('hs-welcome-dismissed') === '1');

  const hasApiKey = !!apiKeyVal.trim();

  // CL state
  const [analysis, setAnalysis] = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [clStep, setClStep] = useState('idle'); // idle | analysis | letter

  // Manual form
  const emptyManual = { position: '', company: '', location: '', salary: '', benefits: '', sponsorship: 'Unknown', union: 'Unknown', deadline: '', url: '', description: '', skills: '', qualifications: '', worker_protections: '', community_focus: '' };
  const [manualData, setManualData] = useState(emptyManual);

  // Persist
  useEffect(() => save('hs-jobs', jobs), [jobs]);
  useEffect(() => localStorage.setItem('hs-resume', resume), [resume]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ── All skills across jobs ──
  const allSkills = useMemo(() => {
    const map = {};
    jobs.forEach((j) => (j.skills || []).forEach((s) => {
      const k = s.toLowerCase();
      map[k] = (map[k] || 0) + 1;
    }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  // ── Filtering ──
  const filtered = useMemo(() => {
    let list = jobs;
    // Jobs tab = master list (all jobs); other tabs are focused pipeline views
    if (activeTab === 'applied')   list = list.filter(j => j.status === 'applied');
    if (activeTab === 'interview') list = list.filter(j => j.status === 'interview');
    if (activeTab === 'results')   list = list.filter(j => j.status === 'offer' || j.status === 'rejected');
    if (skillFilter) list = list.filter(j => (j.skills || []).some(s => s.toLowerCase() === skillFilter));
    return list;
  }, [jobs, activeTab, skillFilter]);

  const counts = useMemo(() => ({
    jobs:      jobs.length,
    applied:   jobs.filter(j => j.status === 'applied').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    results:   jobs.filter(j => j.status === 'offer' || j.status === 'rejected').length,
  }), [jobs]);

  // ── Parse URL ──
  const handleParse = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setParsing(true); setError(''); setParseMsg('Fetching posting...');
    try {
      setParseMsg('Reading page...');
      const p = await parseJobUrl(url);
      const job = {
        id: crypto.randomUUID(),
        position: p.position || 'Untitled',
        company: p.company || '',
        location: p.location || '',
        salary: p.salary || '',
        benefits: p.benefits || '',
        sponsorship: p.sponsorship || 'Unknown',
        union: p.union || 'Unknown',
        deadline: p.deadline || '',
        url,
        skills: Array.isArray(p.skills) ? p.skills : [],
        qualifications: p.qualifications || '',
        description: p.description || '',
        worker_protections: p.worker_protections || '',
        community_focus: p.community_focus || '',
        status: 'saved',
        coverLetter: '',
        analysis: null,
        notes: '',
        createdAt: new Date().toISOString(),
      };
      setJobs((prev) => [job, ...prev]);
      setUrlInput('');
      showToast('Position added!');
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false); setParseMsg('');
    }
  };

  // ── Manual add ──
  const handleManual = () => {
    if (!manualData.position.trim()) return;
    const skills = manualData.skills ? manualData.skills.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const job = {
      id: crypto.randomUUID(),
      ...manualData,
      skills,
      status: 'saved',
      coverLetter: '',
      analysis: null,
      notes: '',
      createdAt: new Date().toISOString(),
    };
    setJobs((prev) => [job, ...prev]);
    setManualData(emptyManual);
    setPanel(null);
    showToast('Position added!');
  };

  // ── Job mutations ──
  const updateJob = (id, patch) => setJobs((prev) => prev.map((j) => j.id === id ? { ...j, ...patch } : j));
  const deleteJob = (id) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expandedId === id) { setExpandedId(null); resetCL(); }
  };

  // ── Expand ──
  const toggleExpand = (job) => {
    if (expandedId === job.id) {
      setExpandedId(null); resetCL();
    } else {
      setExpandedId(job.id);
      setAnalysis(job.analysis || null);
      setCoverLetter(job.coverLetter || '');
      setClStep(job.coverLetter ? 'letter' : job.analysis ? 'analysis' : 'idle');
    }
  };

  const resetCL = () => {
    setAnalysis(null); setCoverLetter(''); setClStep('idle');
  };

  // ── CL Logic: Step 1 — Analyze ──
  const handleAnalyze = async (job) => {
    if (!getApiKey()) { setError('Set API key in Settings.'); return; }
    if (!resume.trim()) { setError('Add your profile in Settings first.'); return; }
    setAnalyzing(true); setAnalysis(null); setClStep('analysis');
    try {
      const result = await analyzeMatch(job, resume);
      setAnalysis(result);
      updateJob(job.id, { analysis: result });
    } catch (err) {
      setError(err.message); setClStep('idle');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── CL Logic: Step 2 — Generate Letter ──
  const handleGenerate = async (job) => {
    if (!getApiKey()) { setError('Set API key.'); return; }
    setGenerating(true); setCoverLetter(''); setClStep('letter');
    try {
      const text = await generateCoverLetter(job, resume, analysis);
      setCoverLetter(text);
      updateJob(job.id, { coverLetter: text });
      showToast('Cover letter ready!');
    } catch (err) {
      setCoverLetter(`Error: ${err.message}`); setClStep('idle');
    } finally {
      setGenerating(false);
    }
  };

  // ── Helpers ──
  const loadSamples = () => {
    setJobs((prev) => [...SAMPLE_JOBS, ...prev]);
    showToast('Sample positions loaded!');
  };

  const dismissWelcome = () => {
    setDismissedWelcome(true);
    localStorage.setItem('hs-welcome-dismissed', '1');
  };

  const deadlineTag = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / 864e5);
    if (diff < 0) return { t: 'Expired', c: '#dc2626' };
    if (diff <= 7) return { t: `${diff}d left`, c: '#ea580c' };
    if (diff <= 30) return { t: `${diff}d`, c: '#ca8a04' };
    return { t: `${diff}d`, c: '#71717a' };
  };
  const flagColor = (v) => v === 'Yes' ? '#16a34a' : v === 'No' ? '#dc2626' : '#71717a';

  // ─── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">H</div>
          <div>
            <h1 className="app-title">Hustle</h1>
            <p className="app-sub">for workers · by workers</p>
          </div>
        </div>
        <div className="header-actions">
          <button className={`h-btn ${panel === 'manual' ? 'active' : ''}`} onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>+ Manual</button>
          <button className={`h-btn ${panel === 'settings' ? 'active' : ''}`} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>Settings</button>
        </div>
      </header>

      {/* ── Welcome Banner ── */}
      {!dismissedWelcome && (
        <div className="welcome-banner anim-in">
          <div className="wb-body">
            <h2 className="wb-title">Welcome to Hustle</h2>
            <p className="wb-text">
              Paste any job URL — Hustle scrapes it automatically, no API key needed. Extracts title, salary, skills, union status, visa sponsorship, and worker protections.
              Add a <strong>Claude API key</strong> in Settings to also unlock skills match analysis and AI cover letter generation.
            </p>
            <div className="wb-actions">
              <button className="sample-btn" onClick={() => { loadSamples(); dismissWelcome(); }}>Try sample positions</button>
              <button className="sample-btn" onClick={() => { setPanel('settings'); dismissWelcome(); }}>Add API Key (optional)</button>
            </div>
          </div>
          <button className="wb-dismiss" onClick={dismissWelcome} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* ── Settings ── */}
      {panel === 'settings' && (
        <div className="panel anim-in">
          <div className="field">
            <label className="f-label">Anthropic API Key</label>
            <input type="password" className="f-input mono" value={apiKeyVal} onChange={(e) => { setApiKeyVal(e.target.value); setApiKey(e.target.value); }} placeholder="sk-ant-..." />
            <span className="f-hint">Stored locally. Only sent to Anthropic's API.</span>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="f-label">Your Background / Resume <span className="f-hint-inline">— powers skill matching & cover letters</span></label>
            <textarea className="f-textarea" value={resume} onChange={(e) => setResume(e.target.value)} rows={6} placeholder="Your skills, work history, education, languages, immigration status if relevant..." />
          </div>
        </div>
      )}

      {/* ── Manual ── */}
      {panel === 'manual' && (
        <div className="panel anim-in">
          <div className="m-grid">
            <input className="f-input" placeholder="Position *" value={manualData.position} onChange={(e) => setManualData({ ...manualData, position: e.target.value })} />
            <input className="f-input" placeholder="Company" value={manualData.company} onChange={(e) => setManualData({ ...manualData, company: e.target.value })} />
            <input className="f-input" placeholder="Location" value={manualData.location} onChange={(e) => setManualData({ ...manualData, location: e.target.value })} />
            <input className="f-input" placeholder="Salary range" value={manualData.salary} onChange={(e) => setManualData({ ...manualData, salary: e.target.value })} />
            <select className="f-input" value={manualData.sponsorship} onChange={(e) => setManualData({ ...manualData, sponsorship: e.target.value })}>
              <option value="Unknown">Sponsorship: Unknown</option><option value="Yes">Sponsorship: Yes</option><option value="No">Sponsorship: No</option>
            </select>
            <select className="f-input" value={manualData.union} onChange={(e) => setManualData({ ...manualData, union: e.target.value })}>
              <option value="Unknown">Union: Unknown</option><option value="Yes">Union: Yes</option><option value="No">Union: No</option>
            </select>
            <input className="f-input" type="date" value={manualData.deadline} onChange={(e) => setManualData({ ...manualData, deadline: e.target.value })} />
            <input className="f-input" placeholder="Skills (comma-separated)" value={manualData.skills} onChange={(e) => setManualData({ ...manualData, skills: e.target.value })} />
            <input className="f-input full" placeholder="Job URL" value={manualData.url} onChange={(e) => setManualData({ ...manualData, url: e.target.value })} />
            <textarea className="f-input full" placeholder="Job description..." rows={3} value={manualData.description} onChange={(e) => setManualData({ ...manualData, description: e.target.value })} />
          </div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={handleManual}>Save Position</button>
        </div>
      )}

      {/* ── URL Bar ── */}
      <div className="url-bar">
        <div className="url-wrap">
          <span className="url-icon">🔗</span>
          <input className="url-input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleParse()} placeholder="Paste a job posting URL to auto-extract details..." disabled={parsing} />
        </div>
        <button className="url-btn" onClick={handleParse} disabled={parsing}>
          {parsing ? parseMsg || 'Reading...' : 'Add'}
        </button>
      </div>

      {error && <div className="error-bar"><span>{error}</span><button className="err-x" onClick={() => setError('')}>✕</button></div>}

      {/* ── Skills Cloud ── */}
      {allSkills.length > 0 && (
        <div className="skills-cloud">
          <span className="sc-label">Skills</span>
          <div className="sc-tags">
            {skillFilter && (
              <button className="sc-tag active-clear" onClick={() => setSkillFilter(null)}>✕ Clear</button>
            )}
            {allSkills.slice(0, 20).map(([skill, count]) => (
              <button
                key={skill}
                className={`sc-tag ${skillFilter === skill ? 'active' : ''}`}
                onClick={() => setSkillFilter(skillFilter === skill ? null : skill)}
              >
                {skill} <span className="sc-count">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Pipeline Tabs ── */}
      <div className="tab-bar">
        {[
          { key: 'jobs',      label: 'Jobs' },
          { key: 'applied',   label: 'Applied' },
          { key: 'interview', label: 'Interview' },
          { key: 'results',   label: 'Results' },
        ].map(tab => (
          <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label} <span className="tab-cnt">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* ── Empty State ── */}
      {filtered.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <p className="empty-title">{!skillFilter ? (activeTab === 'jobs' ? 'No jobs yet' : 'Nothing here yet') : 'No matching positions'}</p>
          <p className="empty-sub">{activeTab === 'jobs' && !skillFilter ? 'Paste a job URL above, or add one manually' : activeTab === 'jobs' ? 'Try clearing the skill filter' : 'Jobs move here as you progress through the pipeline'}</p>
          {jobs.length === 0 && <button className="sample-btn" style={{ marginTop: 16 }} onClick={loadSamples}>Load sample positions</button>}
        </div>
      )}

      {/* ── Job Table ── */}
      {filtered.length > 0 && (
        <div className="job-table">
          <div className="table-head">
            <div className="th col-pos">Position</div>
            <div className="th col-loc">Location</div>
            <div className="th col-sal">Salary</div>
            <div className="th col-spon">Sponsorship</div>
            <div className="th col-skills">Key Skills</div>
            <div className="th col-apply">Apply</div>
          </div>

          {filtered.map((job) => {
            const dl = deadlineTag(job.deadline);
            const st = statusMap[job.status] || statusMap.saved;
            const isOpen = expandedId === job.id;

            return (
              <div key={job.id} className={`table-row ${isOpen ? 'expanded' : ''}`}>
                {/* ── 6-Column Row ── */}
                <div className="row-cells" onClick={() => toggleExpand(job)}>
                  {/* 1. Position */}
                  <div className="cell col-pos">
                    <span className="cell-title">{job.position}</span>
                    {job.company && <span className="cell-sub">{job.company}</span>}
                    {dl && <span className="deadline-tag" style={{ color: dl.c }}>⏰ {dl.t}</span>}
                  </div>

                  {/* 2. Location */}
                  <div className="cell col-loc">
                    {job.location ? <span className="cell-line">📍 {job.location}</span> : <span className="cell-empty">—</span>}
                  </div>

                  {/* 3. Salary */}
                  <div className="cell col-sal">
                    {job.salary ? <span className="cell-line salary-val">{job.salary}</span> : <span className="cell-empty">—</span>}
                  </div>

                  {/* 4. Sponsorship */}
                  <div className="cell col-spon">
                    <span className="spon-flag" style={{ color: flagColor(job.sponsorship) }}>Visa: {job.sponsorship}</span>
                    <span className="spon-flag" style={{ color: flagColor(job.union) }}>Union: {job.union}</span>
                  </div>

                  {/* 5. Key Skills */}
                  <div className="cell col-skills">
                    <div className="cell-skills">
                      {(job.skills || []).slice(0, 3).map((s, i) => (
                        <span key={i} className={`skill-chip ${skillFilter === s.toLowerCase() ? 'hl' : ''}`}>{s}</span>
                      ))}
                      {(job.skills || []).length > 3 && <span className="skill-chip more">+{job.skills.length - 3}</span>}
                    </div>
                  </div>

                  {/* 6. Apply (to-do style) */}
                  <div className="cell col-apply" onClick={e => e.stopPropagation()}>
                    {job.status === 'saved' ? (
                      <button className="todo-item" onClick={() => updateJob(job.id, { status: 'applied' })}>
                        <span className="todo-box" />
                        <span className="todo-label">Apply</span>
                      </button>
                    ) : (
                      <button className="todo-item done" onClick={() => updateJob(job.id, { status: 'saved' })}>
                        <span className="todo-box checked">✓</span>
                        <span className="todo-label">{st.label}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Expanded Detail ── */}
                {isOpen && (
                  <div className="row-detail anim-in">
                    {/* Status buttons */}
                    <div className="d-top">
                      <div className="d-statuses">
                        {STATUSES.map((s) => (
                          <button key={s.key} className={`s-btn ${job.status === s.key ? 'on' : ''}`}
                            style={job.status === s.key ? { background: s.bg, color: s.color, borderColor: s.color } : {}}
                            onClick={() => updateJob(job.id, { status: s.key })}>
                            {s.icon} {s.label}
                          </button>
                        ))}
                      </div>
                      <div className="d-links">
                        {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="link-out">Posting ↗</a>}
                        <button className="del-btn" onClick={() => deleteJob(job.id)}>Delete</button>
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="d-grid">
                      {/* Description */}
                      {job.description && (
                        <div className="d-section wide">
                          <h4 className="sec-title">Description</h4>
                          <p className="sec-body">{job.description}</p>
                        </div>
                      )}

                      {/* Qualifications */}
                      {job.qualifications && (
                        <div className="d-section">
                          <h4 className="sec-title">Qualifications</h4>
                          <p className="sec-body">{job.qualifications}</p>
                        </div>
                      )}

                      {/* Benefits */}
                      {job.benefits && (
                        <div className="d-section">
                          <h4 className="sec-title">Benefits</h4>
                          <p className="sec-body">{job.benefits}</p>
                        </div>
                      )}

                      {/* Worker Protections */}
                      {job.worker_protections && (
                        <div className="d-section">
                          <h4 className="sec-title">Worker Protections</h4>
                          <p className="sec-body">{job.worker_protections}</p>
                        </div>
                      )}

                      {/* Community Focus */}
                      {job.community_focus && (
                        <div className="d-section">
                          <h4 className="sec-title">Community Focus</h4>
                          <p className="sec-body">{job.community_focus}</p>
                        </div>
                      )}

                      {/* All Skills */}
                      {(job.skills || []).length > 0 && (
                        <div className="d-section">
                          <h4 className="sec-title">All Skills Required</h4>
                          <div className="d-skills">
                            {job.skills.map((s, i) => <span key={i} className="skill-chip">{s}</span>)}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      <div className="d-section wide">
                        <h4 className="sec-title">Notes</h4>
                        <textarea className="notes-ta" placeholder="Interview prep, contacts, follow-ups..." value={job.notes || ''} onChange={(e) => updateJob(job.id, { notes: e.target.value })} rows={2} />
                      </div>
                    </div>

                    {/* ── Cover Letter Logic Generator ── */}
                    <div className="cl-section">
                      <div className="cl-header">
                        <h4 className="sec-title" style={{ margin: 0 }}>Cover Letter Generator</h4>
                        <div className="cl-steps">
                          <span className={`cl-step ${clStep === 'analysis' || clStep === 'letter' ? 'done' : ''} ${analyzing ? 'active' : ''}`}>① Analyze Match</span>
                          <span className="cl-arrow">→</span>
                          <span className={`cl-step ${clStep === 'letter' ? 'done' : ''} ${generating ? 'active' : ''}`}>② Write Letter</span>
                        </div>
                      </div>

                      {/* Step 1 button */}
                      {!analyzing && clStep === 'idle' && (
                        <div className="ai-btn-wrap">
                          <button
                            className="btn-primary"
                            onClick={() => handleAnalyze(job)}
                            disabled={!hasApiKey}
                          >
                            Analyze Skills Match
                          </button>
                          {!hasApiKey && <span className="ai-hint">Add API key in Settings to use AI features</span>}
                        </div>
                      )}

                      {analyzing && <Shimmer label="Analyzing your fit..." />}

                      {/* Analysis results */}
                      {analysis && !analyzing && (
                        <div className="analysis-card anim-in">
                          <div className="a-header">
                            <span className={`match-badge ${(analysis.match_strength || '').toLowerCase()}`}>
                              {analysis.match_strength || 'Unknown'} Match
                            </span>
                            <span className="a-hint">{analysis.tone_advice}</span>
                          </div>

                          {(analysis.strong_matches || []).length > 0 && (
                            <div className="a-block">
                              <h5 className="a-label green">✓ Strong Matches</h5>
                              <ul className="a-list">{analysis.strong_matches.map((m, i) => <li key={i}>{m}</li>)}</ul>
                            </div>
                          )}

                          {(analysis.transferable || []).length > 0 && (
                            <div className="a-block">
                              <h5 className="a-label blue">⟿ Transferable Skills</h5>
                              <ul className="a-list">{analysis.transferable.map((m, i) => <li key={i}>{m}</li>)}</ul>
                            </div>
                          )}

                          {(analysis.gaps || []).length > 0 && (
                            <div className="a-block">
                              <h5 className="a-label amber">△ Gaps to Address</h5>
                              <ul className="a-list">{analysis.gaps.map((m, i) => <li key={i}>{m}</li>)}</ul>
                            </div>
                          )}

                          {(analysis.talking_points || []).length > 0 && (
                            <div className="a-block">
                              <h5 className="a-label purple">◆ Key Talking Points</h5>
                              <ul className="a-list">{analysis.talking_points.map((m, i) => <li key={i}>{m}</li>)}</ul>
                            </div>
                          )}

                          <div className="a-actions">
                            <button className="btn-primary" onClick={() => handleGenerate(job)} disabled={generating}>
                              {generating ? 'Writing...' : 'Generate Cover Letter'}
                            </button>
                            <button className="btn-ghost" onClick={() => handleAnalyze(job)}>Re-analyze</button>
                          </div>
                        </div>
                      )}

                      {generating && <Shimmer label="Writing your cover letter..." />}

                      {/* Cover letter output */}
                      {coverLetter && !generating && (
                        <div className="letter-card anim-in">
                          <div className="letter-top">
                            <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(coverLetter); showToast('Copied!'); }}>Copy</button>
                            <button className="btn-ghost" onClick={() => handleGenerate(job)}>Regenerate</button>
                            <button className="btn-ghost" onClick={() => { setClStep('analysis'); setCoverLetter(''); }}>← Back to Analysis</button>
                          </div>
                          <div className="letter-body">
                            {coverLetter.split('\n').map((l, i) => <p key={i} className="l-line">{l || '\u00A0'}</p>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shimmer ───────────────────────────────────────────────────────────
function Shimmer({ label }) {
  return (
    <div className="shimmer-wrap">
      <span className="shimmer-label">{label}</span>
      <div className="shimmer-bar w90" />
      <div className="shimmer-bar w75" />
      <div className="shimmer-bar w60" />
    </div>
  );
}
