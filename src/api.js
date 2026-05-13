// ─── API Key (for optional AI features only) ───────────────────────────
export function getApiKey() {
  return localStorage.getItem('hs-api-key') || '';
}
export function setApiKey(key) {
  localStorage.setItem('hs-api-key', key);
}

// ─── Free Scraping (no API key needed) ────────────────────────────────

// Primary: Jina AI Reader — handles JS-rendered pages, no CORS issues, free
async function fetchViaJina(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain,text/markdown,*/*' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Jina returned ${res.status}`);
    const text = await res.text();
    if (text.length < 300) throw new Error('Too little content returned');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Fallback: CORS proxy (may be unreliable depending on proxy status)
const PROXIES = [
  { url: 'https://corsproxy.io/?', json: false },
  { url: 'https://api.allorigins.win/get?url=', json: true },
];

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    for (const proxy of PROXIES) {
      try {
        const res = await fetch(proxy.url + encodeURIComponent(url), { signal: controller.signal });
        if (!res.ok) continue;
        if (proxy.json) {
          const data = await res.json();
          if (data.contents && data.contents.length > 200) return data.contents;
        } else {
          const text = await res.text();
          if (text.length > 200) return text;
        }
      } catch {}
    }
    throw new Error('All CORS proxies failed');
  } finally {
    clearTimeout(timer);
  }
}

// Known job board / site names to filter from pipe-separated page titles
const JOB_BOARD_NAMES = new Set([
  'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'monster', 'careerbuilder',
  'simplyhired', 'dice', 'usajobs', 'idealist', 'handshake', 'lever', 'greenhouse',
  'workday', 'smartrecruiters', 'ashby', 'jobs', 'careers', 'job listings',
  'open positions', 'apply now', 'join us', 'work with us', 'employment',
]);

// Split a raw HTML page title into { position, location, company }
function parsePageTitle(rawTitle, atsCompany) {
  if (!rawTitle) return { position: '', location: '', company: atsCompany || '' };
  const title = rawTitle.trim();
  const pipeParts = title.split(/\s*\|\s*/);

  let position = '';
  let company = atsCompany || '';
  let location = '';

  if (pipeParts.length >= 2) {
    const valid = pipeParts.filter(p => !JOB_BOARD_NAMES.has(p.toLowerCase().trim()) && p.trim());
    const first = valid[0]?.trim() || '';
    const last = valid[valid.length - 1]?.trim() || '';

    if (valid.length >= 2) {
      if (!atsCompany) company = last;
      // "Title in City, State" → split off location
      const locM = first.match(/\s+in\s+([A-Z][a-zA-Z][a-zA-Z .]*,\s*[A-Z][a-zA-Z]{1,20})\s*$/);
      if (locM) {
        location = locM[1].trim();
        position = first.slice(0, locM.index).trim();
      } else {
        position = first;
      }
    } else {
      // Only one non-board segment — try "Title at Company"
      const atM = first.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atM) {
        position = atM[1].trim();
        if (!atsCompany) company = atM[2].trim();
      } else {
        position = first;
      }
    }
  } else {
    // No pipe — try "Title - Company" on last dash, then "Title at Company"
    const dashIdx = title.lastIndexOf(' - ');
    if (dashIdx > 0) {
      const after = title.slice(dashIdx + 3).trim();
      if (after.length < 60 && !atsCompany) {
        position = title.slice(0, dashIdx).trim();
        company = after;
      } else {
        position = title;
      }
    } else {
      const atM = title.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atM) {
        position = atM[1].trim();
        if (!atsCompany) company = atM[2].trim();
      } else {
        position = title;
      }
    }
  }

  position = position.replace(/\s*[-–—]+\s*$/, '').trim();
  return { position, location, company };
}

// Extract a duties/responsibilities section from markdown job content
function extractDuties(content) {
  const m = content.match(
    /(?:^|\n)#{0,3}\s*(?:key\s+)?(?:responsibilities|duties|what you(?:'ll| will) do|the role|essential functions)\s*:?\s*\n([\s\S]{30,600}?)(?=\n#{1,3}\s|\n\n[A-Z][^\n]*:\s*\n|\n---|\n\n\n)/im
  );
  if (!m) return '';
  const bullets = m[1].match(/[-•*▪◦✓]\s*[^\n]+/g) || [];
  if (bullets.length) return bullets.slice(0, 7).join('\n').trim().slice(0, 500);
  return m[1].replace(/\n{3,}/g, '\n\n').trim().slice(0, 400);
}

// Parse Jina's markdown output (Title: / URL Source: / Markdown Content: format)
function parseFromText(text, url) {
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '';

  const contentIdx = text.indexOf('Markdown Content:');
  const content = contentIdx >= 0 ? text.slice(contentIdx + 'Markdown Content:'.length).trim() : text;

  // Extract company from known ATS URL patterns (used as authoritative hint)
  let atsCompany = '';
  try {
    const u = new URL(url);
    const host = u.hostname;
    const gh = url.match(/boards\.greenhouse\.io\/([^/?#]+)/);
    const lv = url.match(/jobs\.lever\.co\/([^/?#]+)/);
    const wd = host.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
    const ash = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
    const smart = url.match(/boards\.smartrecruiters\.com\/([^/?#]+)/);
    if (gh) atsCompany = gh[1].replace(/-/g, ' ');
    else if (lv) atsCompany = lv[1].replace(/-/g, ' ');
    else if (wd) atsCompany = wd[1].replace(/-/g, ' ');
    else if (ash) atsCompany = ash[1].replace(/-/g, ' ');
    else if (smart) atsCompany = smart[1].replace(/-/g, ' ');
  } catch {}

  const parsed = parsePageTitle(rawTitle, atsCompany);

  // Fall back to domain name if no company extracted from title or ATS
  let company = parsed.company;
  if (!company) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
      company = host.charAt(0).toUpperCase() + host.slice(1);
    } catch {}
  }

  // Try to pull location from content if title parsing didn't find one
  let location = parsed.location;
  if (!location) {
    const locMatch = content.match(
      /(?:^|\n)\s*(?:Location|Based in|Office|Where you.{0,10}work)[:\s–-]+([^\n]{5,60})/im
    ) || content.match(/\b(Remote|Hybrid|On[\s-]?site)[,\s–-]*([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
    location = locMatch ? locMatch[1]?.trim().replace(/\*+/g, '') || locMatch[0].trim() : '';
  }

  // Find role-specific description section; skip company mission boilerplate
  const roleStart = content.search(
    /(?:^|\n)#{0,3}\s*(?:about\s+the\s+(role|position|opportunity|team)|the\s+role|role\s+overview|position\s+overview|job\s+summary|about\s+this\s+(role|position))\s*\n/im
  );
  const descRaw = roleStart > 0 && roleStart < 1200
    ? content.slice(roleStart, roleStart + 900)
    : content.slice(0, 900);
  const desc = descRaw
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 700);

  return {
    position: parsed.position || rawTitle,
    company,
    location: location.slice(0, 80),
    salary: parseSalary(content),
    benefits: '',
    description: desc,
    duties: extractDuties(content),
    qualifications: '',
    deadline: '',
    skills: extractSkills(content),
    sponsorship: detectSponsorship(content),
    union: detectUnion(content),
    worker_protections: extractWorkerProtections(content),
    community_focus: detectCommunityFocus(content),
  };
}

function cleanText(str = '') {
  return str.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const SKILL_KEYWORDS = [
  'python', 'r programming', 'sql', 'excel', 'tableau', 'power bi', 'javascript', 'typescript',
  'react', 'node.js', 'java', 'c++', 'c#', 'golang', 'rust', 'scala', 'spark', 'hadoop',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'linux', 'bash', 'terraform',
  'machine learning', 'deep learning', 'nlp', 'tensorflow', 'pytorch', 'scikit-learn',
  'data analysis', 'data visualization', 'statistics', 'econometrics', 'gis', 'arcgis', 'qgis',
  'stata', 'spss', 'sas', 'matlab', 'julia', 'dbt', 'airflow', 'looker',
  'project management', 'stakeholder engagement', 'grant writing', 'policy analysis',
  'qualitative research', 'quantitative research', 'program evaluation', 'community outreach',
  'case management', 'social work', 'public health', 'epidemiology', 'biostatistics',
  'budget management', 'fundraising', 'communications', 'content writing',
];

export function extractSkills(text) {
  const lower = text.toLowerCase();
  return [...new Set(SKILL_KEYWORDS.filter(s => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  }))].slice(0, 14);
}

function detectSponsorship(text) {
  const t = text.toLowerCase();
  if (/will\s+sponsor|visa\s+sponsor|h[\s\-]?1[\s\-]?b\s+sponsor|sponsorship\s+(is\s+)?(available|offered|provided|considered)/.test(t)) return 'Yes';
  if (/no\s+sponsorship|not\s+(able|authorized|available)\s+to\s+sponsor|cannot\s+sponsor|unable\s+to\s+sponsor|must\s+(be\s+)?(currently\s+)?(authorized|eligible)\s+to\s+work|us\s+citizen(ship)?\s+required|must\s+have\s+work\s+authorization|not\s+eligible\s+for\s+sponsorship/.test(t)) return 'No';
  return 'Unknown';
}

function detectUnion(text) {
  const t = text.toLowerCase();
  if (/\b(afscme|seiu|cwa|uaw|ufcw|iamaw|ibew|teamsters?|unite here|union[\s\-]represented|collectively\s+bargained|collective\s+bargaining\s+(agreement|unit)|bargaining\s+unit|labor\s+agreement|covered\s+by\s+(a\s+)?union)\b/.test(t)) return 'Yes';
  return 'Unknown';
}

function extractWorkerProtections(text) {
  const t = text.toLowerCase();
  const found = [];
  if (/\bequal\s+opportunity\s+(employer|employment)\b|\beeo\b|\beeoc\b/.test(t)) found.push('Equal Opportunity Employer');
  if (/\bada\b|disability\s+accommodat|reasonable\s+accommodat/.test(t)) found.push('ADA accommodations');
  if (/fair\s+chance|ban[\s\-]the[\s\-]box|criminal\s+(history|background)\s+will\s+not\s+(disqualify|automatically)/.test(t)) found.push('Fair chance hiring');
  if (/\bfmla\b|family\s+(and\s+)?medical\s+leave/.test(t)) found.push('FMLA');
  if (/language\s+access|bilingual\s+preferred|multilingual/.test(t)) found.push('Language access');
  return found.join('; ');
}

function detectCommunityFocus(text) {
  const t = text.toLowerCase();
  const found = [];
  if (/\bimmigrant(s)?\b|\brefugee(s)?\b|\basylum[\s\-]seek/.test(t)) found.push('serves immigrant/refugee communities');
  if (/low[\s\-]income|underserved|underinvested|marginalized|historically\s+excluded/.test(t)) found.push('serves low-income/underserved communities');
  if (/workforce\s+development|job\s+training|employment\s+services|re[\s\-]entry/.test(t)) found.push('workforce development');
  if (/public\s+health|community\s+health|health\s+equity/.test(t)) found.push('community health');
  if (/affordable\s+housing|housing\s+justice|homelessness/.test(t)) found.push('affordable housing');
  return found.join('; ');
}

function parseSalary(text) {
  const m = text.match(/\$\s*[\d,]+(?:\.\d+)?(?:\s*[–\-—to]+\s*\$?\s*[\d,]+(?:\.\d+)?)?(?:\s*(?:per\s+(?:year|hr|hour|month|annum)|\/(?:yr|hr|mo|year|hour|annum)))?/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

function formatLocation(loc) {
  if (!loc) return '';
  const a = Array.isArray(loc) ? loc[0]?.address : loc?.address;
  if (!a) return '';
  return [a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
}

function formatSalary(baseSalary, bodyText) {
  if (!baseSalary) return parseSalary(bodyText);
  const v = baseSalary.value;
  if (!v) return parseSalary(bodyText);
  const min = v.minValue ?? baseSalary.minValue;
  const max = v.maxValue ?? baseSalary.maxValue;
  const single = v.value ?? baseSalary.value;
  if (min && max) return `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
  if (single && typeof single === 'number') return `$${Number(single).toLocaleString()}`;
  return parseSalary(bodyText);
}

function cleanDescription(raw) {
  if (!raw) return '';
  let text = cleanText(raw);
  // Skip leading nav/breadcrumb junk (common on SPAs like DoorDash, Greenhouse, Lever)
  // Find the first sentence that looks like real job content
  const contentStart = text.search(
    /\b(about\s+the\s+(team|role|company|position|job)|the\s+role|job\s+description|responsibilities|what\s+you.{0,15}(do|build|work|own)|we\s+are\s+(looking|hiring|seeking)|overview|who\s+we\s+are|about\s+us)\b/i
  );
  if (contentStart > 0 && contentStart < 600) text = text.slice(contentStart);
  return text.slice(0, 1200).trim();
}

function fromJsonLd(job, bodyText) {
  const rawDesc = cleanDescription(job.description || '');
  const combined = bodyText + ' ' + rawDesc;
  return {
    position: job.title?.trim() || '',
    company: job.hiringOrganization?.name?.trim() || '',
    location: formatLocation(Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation),
    salary: formatSalary(job.baseSalary, bodyText),
    benefits: cleanText(job.jobBenefits || ''),
    description: rawDesc,
    duties: '',
    qualifications: cleanText(job.qualifications || job.experienceRequirements || '').slice(0, 600),
    deadline: (job.validThrough || '').split('T')[0] || '',
    skills: extractSkills(combined),
    sponsorship: detectSponsorship(combined),
    union: detectUnion(combined),
    worker_protections: extractWorkerProtections(combined),
    community_focus: detectCommunityFocus(combined),
  };
}

function findDescriptionContainer(doc) {
  // Ordered by specificity — most job boards use one of these
  const candidates = [
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[data-testid*="job-description"]',
    '[class*="description__text"]',
    '[class*="jobDescriptionContent"]',
    '[class*="job-details"]',
    '[class*="posting-content"]',
    'article',
    'main',
  ];
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && el.textContent.trim().length > 200) {
      return el.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function fromHtmlFallback(doc, bodyText) {
  const pick = (sel) => doc.querySelector(sel)?.textContent?.trim() || '';
  const title = pick('[class*="job-title"],[class*="jobtitle"],[id*="job-title"],[data-testid*="job-title"],h1')
    || doc.title.split(/[-|·:]/)[0].trim();
  const desc = cleanDescription(findDescriptionContainer(doc) || bodyText);

  return {
    position: title,
    company: pick('[class*="company-name"],[class*="employer"],[class*="org-name"]'),
    location: pick('[class*="location"],[itemprop="jobLocation"],[data-testid*="location"]'),
    salary: parseSalary(bodyText),
    benefits: '',
    description: desc,
    duties: '',
    qualifications: '',
    deadline: '',
    skills: extractSkills(bodyText),
    sponsorship: detectSponsorship(bodyText),
    union: detectUnion(bodyText),
    worker_protections: extractWorkerProtections(bodyText),
    community_focus: detectCommunityFocus(bodyText),
  };
}

export async function parseJobUrl(url) {
  // Detect login-walled sites before wasting a round trip
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/\blinkedin\.com\b/.test(host)) throw new Error('LinkedIn requires login to view job details. Copy the key details and use manual entry instead.');
    if (/\bglassdoor\.com\b/.test(host)) throw new Error('Glassdoor requires login to view job details. Copy the key details and use manual entry instead.');
    if (/\bindeed\.com\b/.test(host)) throw new Error('Indeed blocks automated access. Copy the job details and paste them into manual entry instead.');
  } catch (e) {
    if (e.message.includes('requires login') || e.message.includes('blocks automated')) throw e;
  }

  // Primary: Jina AI Reader
  try {
    const jinaText = await fetchViaJina(url);
    // With API key: use AI for smart summarization and extraction
    if (getApiKey()) {
      try {
        return await parseJobWithAI(jinaText, url);
      } catch (aiErr) {
        console.warn('AI extraction failed, using heuristics:', aiErr.message);
      }
    }
    const result = parseFromText(jinaText, url);
    if (result.position) return result;
  } catch (jinaErr) {
    console.warn('Jina scrape failed:', jinaErr.message);
  }

  // Fallback: CORS proxy + JSON-LD / HTML heuristics
  try {
    const html = await fetchPage(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();

    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const job = items.find(i => i?.['@type'] === 'JobPosting');
        if (job) return fromJsonLd(job, bodyText);
      } catch {}
    }

    const result = fromHtmlFallback(doc, bodyText);
    if (result.position) return result;
  } catch (proxyErr) {
    console.warn('CORS proxy failed:', proxyErr.message);
  }

  throw new Error("Couldn't extract details from this page — the site may block automated access. Try copying the job details and using manual entry.");
}

// ─── Optional AI Features (require API key) ────────────────────────────
const API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude({ messages, maxTokens = 2000 }) {
  const key = getApiKey();
  if (!key) throw new Error('No API key set. Add one in Settings.');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens, messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  return res.json();
}

function extractText(data) {
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse AI response.');
  }
}

async function parseJobWithAI(jinaText, url) {
  const titleMatch = jinaText.match(/^Title:\s*(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '';
  const contentIdx = jinaText.indexOf('Markdown Content:');
  const content = contentIdx >= 0
    ? jinaText.slice(contentIdx + 'Markdown Content:'.length).trim()
    : jinaText;

  const data = await callClaude({
    maxTokens: 700,
    messages: [{
      role: 'user',
      content: `Extract structured information from this job posting. Be precise and concise.

Return ONLY valid JSON — no extra text:
{
  "position": "exact job title only, no company or location appended",
  "company": "company or organization name",
  "location": "City, ST  or  Remote  or  Hybrid, City, ST",
  "salary": "salary range as written in the posting, or ''",
  "description": "2-3 sentences only: what this team does and what this specific role will own/build/analyze — skip company mission statements and boilerplate",
  "skills": ["up to 10 technical or domain skills explicitly required — no single letters, no generic verbs, real tool/language/method names only"],
  "duties": "4-6 key responsibilities, one per line, each starting with '• '",
  "deadline": "YYYY-MM-DD if an application deadline is stated, else ''"
}

Page title: ${rawTitle}
URL: ${url}

Job content:
${content.slice(0, 3500)}`,
    }],
  });

  const r = parseJSON(extractText(data));

  // Determine ATS company as fallback hint
  let atsCompany = '';
  try {
    const u = new URL(url);
    const gh = url.match(/boards\.greenhouse\.io\/([^/?#]+)/);
    const lv = url.match(/jobs\.lever\.co\/([^/?#]+)/);
    const wd = u.hostname.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (gh) atsCompany = gh[1].replace(/-/g, ' ');
    else if (lv) atsCompany = lv[1].replace(/-/g, ' ');
    else if (wd) atsCompany = wd[1].replace(/-/g, ' ');
  } catch {}

  return {
    position: r.position || parsePageTitle(rawTitle, atsCompany).position,
    company: r.company || parsePageTitle(rawTitle, atsCompany).company,
    location: r.location || '',
    salary: r.salary || parseSalary(content),
    benefits: '',
    description: r.description || '',
    duties: r.duties || '',
    qualifications: '',
    deadline: r.deadline || '',
    skills: Array.isArray(r.skills) ? r.skills.slice(0, 10) : extractSkills(content),
    sponsorship: detectSponsorship(content),
    union: detectUnion(content),
    worker_protections: extractWorkerProtections(content),
    community_focus: detectCommunityFocus(content),
  };
}

export async function analyzeMatch(job, resumeText) {
  const data = await callClaude({
    messages: [{
      role: 'user',
      content: `You are a career coach helping a job seeker from a vulnerable community (may be an immigrant, non-native English speaker, or career changer). Analyze the match between their background and this job.

CANDIDATE BACKGROUND:
${resumeText}

JOB:
Position: ${job.position}
Company: ${job.company || 'Not specified'}
Skills required: ${(job.skills || []).join(', ') || 'Not specified'}
Qualifications: ${job.qualifications || 'Not specified'}
Description: ${job.description || 'Not specified'}

Return ONLY a JSON object:
{
  "strong_matches": ["skills/experiences that directly match the job"],
  "transferable": ["transferable skills — explain the bridge for each"],
  "gaps": ["required skills the candidate may lack"],
  "talking_points": ["3-4 specific points to emphasize in the cover letter"],
  "tone_advice": "one sentence on the right tone given the org type",
  "match_strength": "Strong / Moderate / Stretch"
}

Be honest but empowering. JSON only.`,
    }],
  });
  return parseJSON(extractText(data));
}

export async function generateCoverLetter(job, resumeText, analysis) {
  const analysisCtx = analysis ? `
MATCH ANALYSIS:
Strong matches: ${(analysis.strong_matches || []).join('; ')}
Transferable: ${(analysis.transferable || []).join('; ')}
Talking points: ${(analysis.talking_points || []).join('; ')}
Tone: ${analysis.tone_advice || 'Professional and warm'}
` : '';

  const data = await callClaude({
    messages: [{
      role: 'user',
      content: `Write a compelling, tailored cover letter. The candidate may be an immigrant or non-native English speaker — write in clear, confident, professional English. Every sentence should be specific.

CANDIDATE:
${resumeText}

POSITION: ${job.position}
COMPANY: ${job.company || 'Not specified'}
LOCATION: ${job.location || ''}
SKILLS REQUIRED: ${(job.skills || []).join(', ') || ''}
${job.description ? `DESCRIPTION:\n${job.description}` : ''}
${analysisCtx}

Guidelines:
- Lead with the strongest match point
- Bridge transferable skills explicitly ("My experience with X directly translates to Y")
- Show genuine understanding of the org's mission
- Keep it under 400 words
- Do NOT start with "I am writing to apply"

Output ONLY the cover letter text.`,
    }],
  });

  const text = extractText(data);
  if (!text) throw new Error('Empty response from AI.');
  return text;
}
