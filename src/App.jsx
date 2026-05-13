import { useState, useEffect, useCallback, useMemo } from 'react';
import { parseJobUrl, analyzeMatch, generateCoverLetter, getApiKey, setApiKey } from './api';

// ─── Constants ─────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'saved',     label: 'Saved',     color: '#6b7280' },
  { key: 'applied',   label: 'Applied',   color: '#1f3da0' },
  { key: 'interview', label: 'Interview', color: '#9333ea' },
  { key: 'offer',     label: 'Offer',     color: '#16a34a' },
  { key: 'rejected',  label: 'Rejected',  color: '#dc2626' },
];
const statusMap = Object.fromEntries(STATUSES.map(s => [s.key, s]));

const PANELS = [
  { key: 'saved',     label: 'Saved',     bg: '#d8fe74', fg: '#1b1b1b' },
  { key: 'applied',   label: 'Applied',   bg: '#1f3da0', fg: '#ffffff' },
  { key: 'interview', label: 'Interview', bg: '#f097e0', fg: '#1b1b1b' },
  { key: 'results',   label: 'Results',   bg: '#1b1b1b', fg: '#ffffff' },
];
const panelMap = Object.fromEntries(PANELS.map(p => [p.key, p]));

// ─── Sample Data ───────────────────────────────────────────────────────
const SAMPLE_JOBS = [
  {
    id: 'sample-1',
    position: 'Community Data Analyst',
    company: 'Philadelphia Workforce Development Board',
    location: 'Philadelphia, PA',
    salary: '$62,000 – $75,000',
    benefits: 'Health insurance, pension, 20 days PTO',
    sponsorship: 'Yes',
    union: 'Yes',
    deadline: '',
    url: 'https://example.org/jobs/community-data-analyst',
    skills: ['R', 'SQL', 'Data Visualization', 'Policy Research'],
    qualifications: "Bachelor's or Master's in economics, statistics, or urban planning.",
    description: 'Conduct applied labor market research and spatial analysis to inform workforce development policy.',
    worker_protections: 'Equal Opportunity Employer. ADA accommodations available.',
    community_focus: 'Serves Philadelphia workforce, focus on immigrant communities.',
    status: 'saved',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — feel free to delete.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    position: 'Research Associate, Immigration Policy',
    company: 'Urban Institute',
    location: 'Washington, DC (Hybrid)',
    salary: '$70,000 – $85,000',
    benefits: 'Comprehensive health, 401k match',
    sponsorship: 'Yes',
    union: 'No',
    deadline: new Date(Date.now() + 12 * 86400000).toISOString().split('T')[0],
    url: 'https://example.org/jobs/research-associate',
    skills: ['Python', 'Stata', 'Policy Writing', 'Quantitative Research'],
    qualifications: "Master's in public policy, economics, or social science.",
    description: 'Contribute to policy research on immigrant economic integration and labor market outcomes.',
    worker_protections: 'EEO/AA Employer.',
    community_focus: 'Research informs policy affecting low-income and immigrant communities.',
    status: 'applied',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — applied 4/15.',
    createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
  {
    id: 'sample-3',
    position: 'GIS Data Specialist',
    company: 'City of Philadelphia',
    location: 'Philadelphia, PA',
    salary: '$58,000 – $68,000',
    benefits: 'City pension, health, transit subsidy',
    sponsorship: 'No',
    union: 'Yes',
    deadline: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    url: 'https://example.org/jobs/gis-specialist',
    skills: ['ArcGIS', 'QGIS', 'Python', 'SQL'],
    qualifications: "2+ years GIS experience.",
    description: 'Manage and analyze geospatial datasets to support city planning and operations.',
    worker_protections: 'Equal Opportunity. Fair chance hiring.',
    community_focus: 'Public sector serving all Philadelphia residents.',
    status: 'interview',
    coverLetter: '',
    analysis: null,
    notes: 'Sample — interview scheduled.',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
];

// ─── Persistence ───────────────────────────────────────────────────────
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// ─── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [jobs, setJobs]             = useState(() => load('hs-jobs', []));
  const [activeTab, setActiveTab]   = useState('saved');
  const [urlInput, setUrlInput]     = useState('');
  const [parsing, setParsing]       = useState(false);
  const [parseMsg, setParseMsg]     = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [panel, setPanel]           = useState(null);
  const [apiKeyVal, setApiKeyVal]   = useState(getApiKey);
  const [resume, setResume]         = useState(() => localStorage.getItem('hs-resume') || '');
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState('');
  const [dismissedWelcome, setDismissedWelcome] = useState(
    () => localStorage.getItem('hs-welcome-dismissed') === '1'
  );

  const hasApiKey = !!apiKeyVal.trim();

  // CL state
  const [analysis, setAnalysis]     = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [analyzing, setAnalyzing]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [clStep, setClStep]         = useState('idle');

  // Manual form
  const emptyManual = {
    position: '', company: '', location: '', salary: '', benefits: '',
    sponsorship: 'Unknown', union: 'Unknown', deadline: '', url: '',
    description: '', skills: '', qualifications: '', worker_protections: '', community_focus: '',
  };
  const [manualData, setManualData] = useState(emptyManual);

  // Persist
  useEffect(() => save('hs-jobs', jobs), [jobs]);
  useEffect(() => localStorage.setItem('hs-resume', resume), [resume]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ── Counts & filtering ──
  const counts = useMemo(() => ({
    saved:     jobs.filter(j => j.status === 'saved').length,
    applied:   jobs.filter(j => j.status === 'applied').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    results:   jobs.filter(j => j.status === 'offer' || j.status === 'rejected').length,
  }), [jobs]);

  const filtered = useMemo(() => {
    if (activeTab === 'saved')     return jobs.filter(j => j.status === 'saved');
    if (activeTab === 'applied')   return jobs.filter(j => j.status === 'applied');
    if (activeTab === 'interview') return jobs.filter(j => j.status === 'interview');
    if (activeTab === 'results')   return jobs.filter(j => j.status === 'offer' || j.status === 'rejected');
    return jobs;
  }, [jobs, activeTab]);

  // ── Parse URL ──
  const handleParse = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setParsing(true); setError(''); setParseMsg('Reading page…');
    try {
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
      setJobs(prev => [job, ...prev]);
      setUrlInput('');
      if (activeTab !== 'saved') setActiveTab('saved');
      showToast('Position added!');
    } catch (err) {
      const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
      setError(isAbort
        ? 'Request timed out — try manual entry instead.'
        : err.message || 'Failed to load the job page.');
    } finally {
      setParsing(false); setParseMsg('');
    }
  };

  // ── Manual add ──
  const handleManual = () => {
    if (!manualData.position.trim()) return;
    const skills = manualData.skills
      ? manualData.skills.split(',').map(s => s.trim()).filter(Boolean)
      : [];
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
    setJobs(prev => [job, ...prev]);
    setManualData(emptyManual);
    setPanel(null);
    showToast('Position added!');
  };

  // ── Job mutations ──
  const updateJob = (id, patch) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  const deleteJob = (id) => {
    setJobs(prev => prev.filter(j => j.id !== id));
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

  const resetCL = () => { setAnalysis(null); setCoverLetter(''); setClStep('idle'); };

  // ── AI: Analyze ──
  const handleAnalyze = async (job) => {
    if (!getApiKey()) { setError('Set API key in Settings.'); return; }
    if (!resume.trim()) { setError('Add your background in Settings first.'); return; }
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

  // ── AI: Generate letter ──
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
    setJobs(prev => [...SAMPLE_JOBS, ...prev]);
    showToast('Sample positions loaded!');
  };
  const dismissWelcome = () => {
    setDismissedWelcome(true);
    localStorage.setItem('hs-welcome-dismissed', '1');
  };
  const deadlineTag = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / 864e5);
    if (diff < 0) return { t: 'Expired', urgent: true };
    if (diff <= 7) return { t: `${diff}d left`, urgent: true };
    return { t: `${diff}d`, urgent: false };
  };

  // ─── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <span className="logo-mark">H</span>
          <span className="app-name">Hustle</span>
        </div>
        <div className="header-actions">
          <button
            className={`icon-btn${panel === 'manual' ? ' active' : ''}`}
            onClick={() => setPanel(panel === 'manual' ? null : 'manual')}
            title="Add position"
          >+</button>
          <button
            className={`icon-btn${panel === 'settings' ? ' active' : ''}`}
            onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
            title="Settings"
          >⚙</button>
        </div>
      </header>

      {/* ── URL Bar ── */}
      <div className="url-bar">
        <span className="url-icon">🔗</span>
        <input
          className="url-input"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleParse()}
          placeholder="Paste a job URL to auto-extract…"
          disabled={parsing}
        />
        <button className="url-btn" onClick={handleParse} disabled={parsing}>
          {parsing ? parseMsg || '…' : 'Add'}
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button className="err-x" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* ── Welcome Banner ── */}
      {!dismissedWelcome && (
        <div className="welcome-banner anim-in">
          <button className="wb-close" onClick={dismissWelcome}>✕</button>
          <p className="wb-title">Welcome to Hustle</p>
          <p className="wb-text">
            Paste any job URL — auto-extracts title, salary, location, skills, union status, and visa
            sponsorship. Add a <strong>Claude API key</strong> in Settings to unlock AI cover letters.
          </p>
          <div className="wb-actions">
            <button className="wb-btn" onClick={() => { loadSamples(); dismissWelcome(); }}>
              Load samples
            </button>
            <button className="wb-btn outline" onClick={dismissWelcome}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Settings Panel ── */}
      {panel === 'settings' && (
        <div className="panel anim-in">
          <div className="panel-row">
            <label className="f-label">Anthropic API Key</label>
            <input
              type="password"
              className="f-input mono"
              value={apiKeyVal}
              onChange={e => { setApiKeyVal(e.target.value); setApiKey(e.target.value); }}
              placeholder="sk-ant-…"
            />
            <span className="f-hint">Stored locally. Only sent to Anthropic's API.</span>
          </div>
          <div className="panel-row">
            <label className="f-label">Your Background <span className="f-hint-inline">— powers match analysis & cover letters</span></label>
            <textarea
              className="f-textarea"
              value={resume}
              onChange={e => setResume(e.target.value)}
              rows={5}
              placeholder="Skills, work history, education, immigration status if relevant…"
            />
          </div>
        </div>
      )}

      {/* ── Manual Panel ── */}
      {panel === 'manual' && (
        <div className="panel anim-in">
          <div className="m-grid">
            <input className="f-input" placeholder="Position *" value={manualData.position} onChange={e => setManualData({ ...manualData, position: e.target.value })} />
            <input className="f-input" placeholder="Company" value={manualData.company} onChange={e => setManualData({ ...manualData, company: e.target.value })} />
            <input className="f-input" placeholder="Location" value={manualData.location} onChange={e => setManualData({ ...manualData, location: e.target.value })} />
            <input className="f-input" placeholder="Salary range" value={manualData.salary} onChange={e => setManualData({ ...manualData, salary: e.target.value })} />
            <input className="f-input" type="date" value={manualData.deadline} onChange={e => setManualData({ ...manualData, deadline: e.target.value })} />
            <input className="f-input" placeholder="Skills (comma-separated)" value={manualData.skills} onChange={e => setManualData({ ...manualData, skills: e.target.value })} />
            <select className="f-input" value={manualData.sponsorship} onChange={e => setManualData({ ...manualData, sponsorship: e.target.value })}>
              <option value="Unknown">Sponsorship: Unknown</option>
              <option value="Yes">Sponsorship: Yes</option>
              <option value="No">Sponsorship: No</option>
            </select>
            <select className="f-input" value={manualData.union} onChange={e => setManualData({ ...manualData, union: e.target.value })}>
              <option value="Unknown">Union: Unknown</option>
              <option value="Yes">Union: Yes</option>
              <option value="No">Union: No</option>
            </select>
            <input className="f-input full" placeholder="Job URL" value={manualData.url} onChange={e => setManualData({ ...manualData, url: e.target.value })} />
            <textarea className="f-input full" placeholder="Job description…" rows={3} value={manualData.description} onChange={e => setManualData({ ...manualData, description: e.target.value })} />
          </div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={handleManual}>
            Save Position
          </button>
        </div>
      )}

      {/* ── Stat Grid ── */}
      <div className="stat-grid">
        {PANELS.map(p => (
          <button
            key={p.key}
            className={`stat-card${activeTab === p.key ? ' active' : ''}`}
            style={activeTab === p.key ? { background: p.bg, color: p.fg } : {}}
            onClick={() => setActiveTab(p.key)}
          >
            <span className="stat-count">{counts[p.key]}</span>
            <span className="stat-label">{p.label}</span>
          </button>
        ))}
      </div>

      {/* ── Panel label ── */}
      <div className="panel-label">
        <span className="panel-name">{panelMap[activeTab]?.label}</span>
        <span className="panel-total">
          {filtered.length} position{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Empty State ── */}
      {filtered.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            {activeTab === 'saved' ? '🔖' : activeTab === 'applied' ? '📤' : activeTab === 'interview' ? '💬' : '🏆'}
          </div>
          <p className="empty-title">
            {activeTab === 'saved' ? 'No saved positions yet'
              : activeTab === 'applied' ? 'No applications yet'
              : activeTab === 'interview' ? 'No interviews yet'
              : 'No results yet'}
          </p>
          <p className="empty-sub">
            {activeTab === 'saved'
              ? 'Paste a job URL above, or use the + button'
              : 'Jobs appear here as you update their status'}
          </p>
          {jobs.length === 0 && activeTab === 'saved' && (
            <button className="sample-btn" style={{ marginTop: 16 }} onClick={loadSamples}>
              Load sample positions
            </button>
          )}
        </div>
      )}

      {/* ── Job Cards ── */}
      <div className="job-cards">
        {filtered.map(job => {
          const isOpen = expandedId === job.id;
          const dl = deadlineTag(job.deadline);
          const st = statusMap[job.status] || statusMap.saved;

          return (
            <div key={job.id} className={`job-card${isOpen ? ' open' : ''}`}>
              {/* Tappable summary */}
              <div className="card-summary" onClick={() => toggleExpand(job)}>
                <div className="card-main">
                  <div className="job-title">{job.position}</div>
                  {job.company && <div className="job-company">{job.company}</div>}
                </div>
                <span className="card-chevron">{isOpen ? '▴' : '▾'}</span>
              </div>

              {/* Info chips */}
              <div className="job-chips">
                {job.location && <span className="info-chip">📍 {job.location}</span>}
                {job.salary && <span className="info-chip">💰 {job.salary}</span>}
                {dl && <span className={`info-chip${dl.urgent ? ' urgent' : ''}`}>📅 {dl.t}</span>}
                {job.sponsorship === 'Yes' && <span className="info-chip sponsor">✓ Visa</span>}
                {job.union === 'Yes' && <span className="info-chip union">⚡ Union</span>}
              </div>

              {/* ── Expanded Detail ── */}
              {isOpen && (
                <div className="job-detail anim-in" onClick={e => e.stopPropagation()}>
                  {/* Status row */}
                  <div className="detail-top">
                    <div className="detail-statuses">
                      {STATUSES.map(s => (
                        <button
                          key={s.key}
                          className={`s-btn${job.status === s.key ? ' on' : ''}`}
                          style={job.status === s.key
                            ? { background: s.color + '18', color: s.color, borderColor: s.color }
                            : {}}
                          onClick={() => updateJob(job.id, { status: s.key })}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="detail-links">
                      {job.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="link-out">
                          Posting ↗
                        </a>
                      )}
                      <button className="del-btn" onClick={() => deleteJob(job.id)}>Delete</button>
                    </div>
                  </div>

                  {/* Info sections */}
                  <div className="d-grid">
                    {job.description && (
                      <div className="d-section wide">
                        <h4 className="sec-title">Description</h4>
                        <p className="sec-body">{job.description}</p>
                      </div>
                    )}
                    {job.qualifications && (
                      <div className="d-section">
                        <h4 className="sec-title">Qualifications</h4>
                        <p className="sec-body">{job.qualifications}</p>
                      </div>
                    )}
                    {job.benefits && (
                      <div className="d-section">
                        <h4 className="sec-title">Benefits</h4>
                        <p className="sec-body">{job.benefits}</p>
                      </div>
                    )}
                    {job.worker_protections && (
                      <div className="d-section">
                        <h4 className="sec-title">Worker Protections</h4>
                        <p className="sec-body">{job.worker_protections}</p>
                      </div>
                    )}
                    {job.community_focus && (
                      <div className="d-section">
                        <h4 className="sec-title">Community Focus</h4>
                        <p className="sec-body">{job.community_focus}</p>
                      </div>
                    )}
                    {(job.skills || []).length > 0 && (
                      <div className="d-section">
                        <h4 className="sec-title">Skills</h4>
                        <div className="d-skills">
                          {job.skills.map((s, i) => <span key={i} className="skill-chip">{s}</span>)}
                        </div>
                      </div>
                    )}
                    <div className="d-section wide">
                      <h4 className="sec-title">Notes</h4>
                      <textarea
                        className="notes-ta"
                        placeholder="Interview prep, contacts, follow-ups…"
                        value={job.notes || ''}
                        onChange={e => updateJob(job.id, { notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* ── Cover Letter Generator ── */}
                  <div className="cl-section">
                    <div className="cl-header">
                      <h4 className="sec-title" style={{ margin: 0 }}>Cover Letter</h4>
                      <div className="cl-steps">
                        <span className={`cl-step${clStep === 'analysis' || clStep === 'letter' ? ' done' : ''}${analyzing ? ' active' : ''}`}>① Analyze</span>
                        <span className="cl-arrow">→</span>
                        <span className={`cl-step${clStep === 'letter' ? ' done' : ''}${generating ? ' active' : ''}`}>② Write</span>
                      </div>
                    </div>

                    {!analyzing && clStep === 'idle' && (
                      <div className="ai-btn-wrap">
                        <button className="btn-primary" onClick={() => handleAnalyze(job)} disabled={!hasApiKey}>
                          Analyze Skills Match
                        </button>
                        {!hasApiKey && <span className="ai-hint">Add API key in Settings to unlock</span>}
                      </div>
                    )}

                    {analyzing && <Shimmer label="Analyzing your fit…" />}

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
                            {generating ? 'Writing…' : 'Generate Cover Letter'}
                          </button>
                          <button className="btn-ghost" onClick={() => handleAnalyze(job)}>Re-analyze</button>
                        </div>
                      </div>
                    )}

                    {generating && <Shimmer label="Writing your cover letter…" />}

                    {coverLetter && !generating && (
                      <div className="letter-card anim-in">
                        <div className="letter-top">
                          <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(coverLetter); showToast('Copied!'); }}>Copy</button>
                          <button className="btn-ghost" onClick={() => handleGenerate(job)}>Regenerate</button>
                          <button className="btn-ghost" onClick={() => { setClStep('analysis'); setCoverLetter(''); }}>← Back</button>
                        </div>
                        <div className="letter-body">
                          {coverLetter.split('\n').map((l, i) => <p key={i} className="l-line">{l || ' '}</p>)}
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
