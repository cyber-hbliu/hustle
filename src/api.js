// ─── API Key (for optional AI features only) ───────────────────────────
export function getApiKey() {
  return localStorage.getItem('hs-api-key') || '';
}
export function setApiKey(key) {
  localStorage.setItem('hs-api-key', key);
}

// ─── Free Scraping (no API key needed) ────────────────────────────────
const PROXY = 'https://api.allorigins.win/get?url=';

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(PROXY + encodeURIComponent(url), { signal: controller.signal });
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    const data = await res.json();
    if (!data.contents) throw new Error('Page returned empty content');
    return data.contents;
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(str = '') {
  return str.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const SKILL_KEYWORDS = [
  'python', 'r', 'sql', 'excel', 'tableau', 'power bi', 'javascript', 'typescript',
  'react', 'node.js', 'java', 'c++', 'c#', 'go', 'rust', 'scala', 'spark', 'hadoop',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'linux', 'bash', 'terraform',
  'machine learning', 'deep learning', 'nlp', 'tensorflow', 'pytorch', 'scikit-learn',
  'data analysis', 'data visualization', 'statistics', 'econometrics', 'gis', 'arcgis', 'qgis',
  'stata', 'spss', 'sas', 'matlab', 'julia', 'dbt', 'airflow', 'looker',
  'project management', 'stakeholder engagement', 'grant writing', 'policy analysis',
  'qualitative research', 'quantitative research', 'program evaluation', 'community outreach',
  'case management', 'social work', 'public health', 'epidemiology', 'biostatistics',
  'budget management', 'fundraising', 'communications', 'content writing',
];

function extractSkills(text) {
  const lower = text.toLowerCase();
  return [...new Set(SKILL_KEYWORDS.filter(s => lower.includes(s.toLowerCase())))].slice(0, 14);
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
  const html = await fetchPage(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();

  // JSON-LD structured data — LinkedIn, Indeed, Glassdoor, USAJOBS all support this
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const job = items.find(i => i?.['@type'] === 'JobPosting');
      if (job) return fromJsonLd(job, bodyText);
    } catch {}
  }

  // HTML heuristic fallback
  const result = fromHtmlFallback(doc, bodyText);
  if (!result.position) throw new Error("Couldn't extract details from this page — the site may block automated access. Try manual entry.");
  return result;
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
