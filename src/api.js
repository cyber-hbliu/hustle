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
      // "Title in City, State" or "Title - Remote" → split off location
      const locM = first.match(/\s+in\s+([A-Za-z][a-zA-Z .]{2,},\s*[A-Za-z]{2,20})\s*$/)
        || first.match(/\s*[-–]\s*(Remote|Hybrid|On[\s-]?[Ss]ite)\s*$/i);
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

// Strip markdown syntax from a string for clean display
function stripMd(text = '') {
  return text
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Lines that are clearly UI / navigation chrome, not job content
const NAV_RE = /^(?:skip\s+to|close\b|menu\b|\bHome\b|main\s+nav(?:igation)?|back\s+to|apply\s+now|share\b|save\s+job|log\s*in|sign\s+in|\d+\s+days?\s+ago|posted\s+\d|overview\s*$|breadcrumb|cookie|privacy\s+policy|terms\s+of)/i;

// Extract the role overview as readable prose — skips nav/boilerplate junk
function extractDescription(content) {
  // 1. Try an explicit "About the Role / Position Overview" section header
  const sectionM = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:about\s+the\s+(?:role|position|opportunity|job|team)|the\s+role|role\s+overview|position\s+overview|job\s+(?:summary|description)|about\s+this\s+(?:role|position)|department\s+overview)\*{0,2}\s*\n+([\s\S]{80,2500}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]{0,60}\*{2}|\n---)/im
  );

  let raw = sectionM ? sectionM[1] : null;

  if (!raw) {
    const cleanLines = content.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 50 && !NAV_RE.test(l));

    const roleStart = cleanLines.findIndex(l =>
      /(?:we(?:'re| are) looking for|you will (?:be|work|report|own|join)|this role|the (?:position|role)\s+(?:will|is|reports?)|responsible for|is (?:seeking|looking for)|reports? (?:to|directly)|will (?:work|join|lead|support|build|own|partner))/i.test(l)
    );
    const start = roleStart >= 0 && roleStart < 15 ? roleStart : 0;
    raw = cleanLines.slice(start, start + 4).join(' ');
  }

  if (!raw || raw.length < 50) return '';

  const text = stripMd(raw);

  // If the section already has bullet-like items, normalize them
  const inlineBullets = text.match(/(?:[-•*▪◦]|\d+\.)\s+[^\n]{20,}/g);
  if (inlineBullets && inlineBullets.length >= 2) {
    return inlineBullets
      .slice(0, 5)
      .map(b => '• ' + b.replace(/^[-•*▪◦\d.]+\s*/, '').trim())
      .join('\n')
      .slice(0, 900);
  }

  // Prose: take first 3 sentences (up to ~550 chars)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length >= 2) {
    let result = '';
    for (const s of sentences.slice(0, 4)) {
      if ((result + s).length > 550) break;
      result += s;
    }
    return result.trim() || text.slice(0, 500).trim();
  }
  return text.slice(0, 500).trim();
}

// Shared regex stop condition for plain-text section breaks
const SECTION_STOP = `(?=\\n#{1,3}\\s|\\n\\*{2}[A-Z][^\\n]*\\*{2}|\\n---|\\n\\n[A-Z][^\\n]{0,70}:\\s*\\n)`;

// Bold degree/experience markers within a requirement bullet
function boldReqLine(b) {
  // Degree level
  b = b.replace(/((?:Master|Bachelor|PhD|Doctoral|Graduate|Associate)'?s?\s+degree\b[^,;]*)/, '**$1**');
  // Experience duration: "at least N year(s)", "N+ years", "X to Y years"
  b = b.replace(/\b((?:at\s+least\s+)?(?:\d+\+?(?:\s*(?:–|-|to)\s*\d+)?)\s+years?\s+(?:of\s+)?(?:relevant\s+|related\s+)?(?:work\s+)?experience)/i, '**$1**');
  // "Advanced knowledge", "Expertise in", "Proficiency in", "Demonstrated" openers
  b = b.replace(/^((?:Advanced|Expert(?:ise)?|Proficien[ct]\w*|Strong|Demonstrated|Proven|Excellent)\s+(?:knowledge|experience|ability|command|understanding|skill)\b[^,]*)/i, '**$1**');
  return b;
}

// Extract qualifications/requirements with Required/Preferred distinction
function extractRequirements(content) {
  function toItems(raw) {
    if (!raw) return [];
    const text = stripMd(raw);
    const bullets = text.match(/(?:[-•*▪◦✓]|\d+\.)\s+[^\n]{8,}/g) || [];
    if (bullets.length >= 1) return bullets.slice(0, 9).map(b => b.replace(/^[-•*▪◦✓\d.]+\s*/, '').trim());
    return text.split(/\n+/).filter(l => l.trim().length > 15 && !NAV_RE.test(l)).slice(0, 7).map(l => l.trim().replace(/^[•\-]\s*/, ''));
  }

  const stopRE = new RegExp(SECTION_STOP.slice(4, -1)); // strip (?= and ) for use in match
  const reqM = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:required\s+qualifications?|minimum\s+qualifications?|basic\s+qualifications?)\*{0,2}\s*:?\s*\n([\s\S]{30,2000}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]*\*{2}|\n---|\n\n[A-Z][^\n]{0,70}:\s*\n)/im
  );
  const prefM = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:preferred\s+qualifications?|desired\s+qualifications?|nice[\s-]+to[\s-]+have)\*{0,2}\s*:?\s*\n([\s\S]{20,1500}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]*\*{2}|\n---|\n\n[A-Z][^\n]{0,70}:\s*\n)/im
  );

  const reqItems = toItems(reqM?.[1]);
  const prefItems = toItems(prefM?.[1]);

  if (reqItems.length > 0 || prefItems.length > 0) {
    const lines = [];
    if (reqItems.length > 0) {
      if (prefItems.length > 0) lines.push('**Required:**');
      reqItems.forEach(b => lines.push('• ' + boldReqLine(b)));
    }
    if (prefItems.length > 0) {
      if (reqItems.length > 0) lines.push('**Preferred:**');
      prefItems.forEach(b => lines.push('• ' + b));
    }
    return lines.join('\n').slice(0, 1500);
  }

  // Fallback: generic qualifications section
  const fallbackM = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:qualifications?|requirements?|what you(?:'ll)?\s+bring|experience\s+(?:and\s+)?skills?)\*{0,2}\s*:?\s*\n([\s\S]{50,2000}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]*\*{2}|\n---|\n\n[A-Z][^\n]{0,70}:\s*\n)/im
  );
  if (!fallbackM) return '';
  const items = toItems(fallbackM[1]);
  return items.map(b => '• ' + boldReqLine(b)).join('\n').slice(0, 1200);
}

// Extract duties/responsibilities as structured bullet points
function extractDuties(content) {
  const m = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:key\s+)?(?:responsibilities|duties|what you(?:'ll| will) do|what we(?:'re| are) looking for|the role|essential functions|your (?:day|work|responsibilities)|primary\s+responsibilities|position\s+responsibilities)\*{0,2}\s*:?\s*\n([\s\S]{30,2500}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]*\*{2}\s*\n|\n---|\n\n[A-Z][^\n]{0,70}:\s*\n)/im
  );
  if (!m) return '';
  const raw = m[1];
  const bullets = raw.match(/(?:[-•*▪◦✓]|\d+\.)\s+[^\n]{10,}/g) || [];
  if (bullets.length >= 2) {
    return bullets
      .slice(0, 10)
      .map(b => '• ' + stripMd(b.replace(/^[-•*▪◦✓\d.]+\s*/, '').trim()))
      .join('\n')
      .slice(0, 1200);
  }
  const lines = stripMd(raw).split(/\n+/).filter(l => l.trim().length > 25 && !NAV_RE.test(l));
  return lines.slice(0, 8).map(l => '• ' + l.trim().replace(/^[•\-]\s*/, '')).join('\n').slice(0, 900);
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

  // Title parsing covers "Title in City, ST" format; content scan covers everything else
  const location = parsed.location || extractLocation(content);

  const desc = extractDescription(content);

  return {
    position: parsed.position || rawTitle,
    company,
    location: location.slice(0, 80),
    salary: parseSalary(content),
    benefits: '',
    description: desc,
    duties: extractDuties(content),
    qualifications: extractRequirements(content),
    deadline: '',
    skills: extractSkills(content),
    sponsorship: detectSponsorship(content),
    union: detectUnion(content),
    worker_protections: extractWorkerProtections(content),
    community_focus: detectCommunityFocus(content),
  };
}

// Clean up already-saved jobs: strip markdown, re-extract skills, duties, requirements
export function remigrateJob(j) {
  if (!j.description) return j;
  const cleaned = stripMd(j.description);
  return {
    ...j,
    description: cleaned,
    skills: extractSkills(j.description),
    duties: j.duties || extractDuties(j.description),
    qualifications: j.qualifications || extractRequirements(j.description),
  };
}

function cleanText(str = '') {
  return str.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Case-insensitive skills — multi-word or long enough to be unambiguous
const SKILL_KEYWORDS = [
  // Languages
  'python', 'sql', 'javascript', 'typescript', 'java', 'c++', 'c#', 'golang', 'scala', 'bash',
  // BI & Visualization
  'tableau', 'power bi', 'looker', 'looker studio', 'excel', 'google sheets',
  'data visualization', 'dashboard', 'dashboards', 'reporting',
  // Cloud Data Warehouses & Query Engines
  'bigquery', 'snowflake', 'redshift', 'databricks', 'spark', 'hadoop', 'presto', 'athena',
  // Cloud Platforms
  'aws', 'azure', 'gcp', 'google cloud',
  // DevOps & Version Control
  'docker', 'kubernetes', 'terraform', 'linux', 'git', 'github',
  // Data Engineering
  'dbt', 'airflow', 'etl', 'data pipeline', 'data pipelines', 'data transformation',
  'data modeling', 'data warehousing', 'data engineering',
  // Analytics & ML
  'machine learning', 'deep learning', 'nlp', 'tensorflow', 'pytorch', 'scikit-learn',
  'data analysis', 'statistical analysis', 'statistics', 'econometrics',
  'quantitative research', 'qualitative research', 'quantitative analysis',
  'research methods', 'visualization',
  // Spatial
  'gis', 'arcgis', 'qgis',
  // Statistical Tools
  'stata', 'spss', 'sas', 'matlab', 'julia',
  // Domain / Soft Skills
  'policy analysis', 'program evaluation', 'project management', 'stakeholder engagement',
  'grant writing', 'community outreach', 'case management', 'social work',
  'public health', 'epidemiology', 'biostatistics', 'budget management',
  'fundraising', 'communications',
];

// Single-letter or short language names matched case-sensitively to avoid false positives
// e.g. "R" matches "Python, R, SQL" but not "our", "for", "work"
const EXACT_CASE_SKILLS = ['R'];

// Find the qualifications / requirements / skills section for skills scoping
function extractQualSection(content) {
  const m = content.match(
    /(?:^|\n)#{0,3}\s*\*{0,2}(?:qualifications?|requirements?|required\s+qualifications?|what you(?:'ll)?\s+bring|skills?\s+(?:and\s+)?(?:experience|required)|technical\s+skills?|minimum\s+qualifications?|preferred\s+qualifications?|basic\s+qualifications?|experience\s+(?:and\s+)?skills?|desired\s+(?:skills?|qualifications?))\*{0,2}\s*:?\s*\n([\s\S]{50,2500}?)(?=\n#{1,3}\s|\n\*{2}[A-Z][^\n]*\*{2}|\n---|\n\n[A-Z][^\n]{0,70}:\s*\n)/im
  );
  return m ? m[1] : null;
}

export function extractSkills(content) {
  // Search full content — word-boundary regex prevents false positives
  const lower = content.toLowerCase();

  const found = new Set(SKILL_KEYWORDS.filter(s => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Also match with optional trailing 's' (e.g. "data visualizations" → "data visualization")
    return new RegExp(`\\b${escaped}s?\\b`).test(lower);
  }));

  // Case-sensitive pass for short/ambiguous names like "R"
  EXACT_CASE_SKILLS.forEach(s => {
    if (new RegExp(`\\b${s}\\b`).test(content)) found.add(s);
  });

  // Contextual phrase boost — catch skills near explicit "experience with / expertise in" markers
  const contextRE = /(?:experience\s+(?:with|in|using)|proficiency\s+in|knowledge\s+of|familiarity\s+with|expertise\s+in|skilled\s+in|including\s+(?:but\s+not\s+limited\s+to\s+)?)\s+([^.,;\n]{3,60})/gi;
  let m;
  while ((m = contextRE.exec(content)) !== null) {
    const phrase = m[1].toLowerCase();
    SKILL_KEYWORDS.forEach(s => {
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}s?\\b`).test(phrase)) found.add(s);
    });
    EXACT_CASE_SKILLS.forEach(s => {
      if (new RegExp(`\\b${s}\\b`).test(m[1])) found.add(s);
    });
  }

  return [...found].slice(0, 14);
}

// Extract location from job content — handles Remote, Hybrid, City/ST, label lines
function extractLocation(content) {
  // 1. Explicit "Location: ..." label
  const byLabel = content.match(
    /(?:^|\n)\s*\*{0,2}(?:location|work\s+location|job\s+location|office\s+location)\*{0,2}\s*[:\s–-]+([^\n*]{3,70})/im
  );
  if (byLabel) {
    const loc = stripMd(byLabel[1]).trim();
    if (loc.length > 2) return loc.slice(0, 80);
  }

  // 2. Remote / Hybrid / On-site — optionally followed by a city
  const remoteM = content.match(
    /\b(Remote|Hybrid|On[\s-]?[Ss]ite)\b(?:\s*[-–(\/,]\s*([A-Z][a-zA-Z\s.]{2,35}(?:,\s*[A-Z][a-zA-Z]{0,18})?))?/
  );
  if (remoteM) {
    const city = remoteM[2]?.replace(/[()]/g, '').trim();
    return (city ? `${remoteM[1]} — ${city}` : remoteM[1]).slice(0, 80);
  }

  // 3. "City, ST" pattern (search in first 3000 chars to avoid footer noise)
  const early = content.slice(0, 3000);
  const cityM = early.match(
    /\b([A-Z][a-z]{2,18}(?:[\s-][A-Z][a-z]{2,15})?),\s*([A-Z]{2})\b/
  );
  if (cityM) return `${cityM[1]}, ${cityM[2]}`;

  return '';
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

// Parse a job posting from raw pasted text (no URL needed)
export async function parseFromPaste(rawText) {
  // AI path: structured extraction with Claude
  if (getApiKey()) {
    try {
      const data = await callClaude({
        maxTokens: 1000,
        messages: [{
          role: 'user',
          content: `Extract structured information from this job posting text. The user copied and pasted it directly from a job website.

Return ONLY valid JSON — no extra text:
{
  "position": "exact job title only",
  "company": "company or organization name",
  "location": "city/state or Remote or Hybrid. Empty string if not found.",
  "salary": "salary or pay range as written, or ''",
  "description": "2-3 sentence prose overview of what the team/org does and what this role owns. No bullets.",
  "duties": "key responsibilities as bullet points, one per line starting with '• '. Aim for 6-10 bullets.",
  "requirements": "qualifications as bullet points, one per line starting with '• '. If the posting has separate Required and Preferred sections, output a '**Required:**' label line, those bullets, a '**Preferred:**' label line, then those bullets. Use **bold** on the critical qualifier in each bullet — e.g. '• **Master\\'s degree** in public policy…', '• **At least 1 year** of relevant experience'. Aim for 5-10 bullets total.",
  "skills": ["up to 14 specific tools, technologies, or domain skills explicitly named — e.g. 'R', 'Python', 'SQL', 'data visualization', 'research methods', 'quantitative analysis'. Include single-letter names like 'R' when listed. No generic soft-skill verbs."],
  "deadline": "YYYY-MM-DD if an application deadline is stated, else ''"
}

Job posting text:
${rawText.slice(0, 4500)}`,
        }],
      });
      const r = parseJSON(extractText(data));
      return {
        position:   r.position   || '',
        company:    r.company    || '',
        location:   r.location   || extractLocation(rawText),
        salary:     r.salary     || parseSalary(rawText),
        benefits:   '',
        description: r.description || '',
        duties:     r.duties     || '',
        qualifications: r.requirements || '',
        deadline:   r.deadline   || '',
        skills:     Array.isArray(r.skills) ? r.skills.slice(0, 14) : extractSkills(rawText),
        sponsorship: detectSponsorship(rawText),
        union:       detectUnion(rawText),
        worker_protections: extractWorkerProtections(rawText),
        community_focus:    detectCommunityFocus(rawText),
      };
    } catch (err) {
      console.warn('AI paste extraction failed, using heuristics:', err.message);
    }
  }

  // Heuristic path (no API key)
  // First line that looks like a title (not a URL, not nav text, not too long)
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const titleLine = lines.find(l =>
    l.length > 4 && l.length < 120 && !/^https?:/.test(l) && !NAV_RE.test(l)
  ) || '';
  const parsed = parsePageTitle(titleLine, '');

  return {
    position:   parsed.position || titleLine.replace(/[|–-].*$/, '').trim(),
    company:    parsed.company  || '',
    location:   parsed.location || extractLocation(rawText),
    salary:     parseSalary(rawText),
    benefits:   '',
    description: extractDescription(rawText),
    duties:      extractDuties(rawText),
    qualifications: '',
    deadline:    '',
    skills:      extractSkills(rawText),
    sponsorship: detectSponsorship(rawText),
    union:       detectUnion(rawText),
    worker_protections: extractWorkerProtections(rawText),
    community_focus:    detectCommunityFocus(rawText),
  };
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
    maxTokens: 1000,
    messages: [{
      role: 'user',
      content: `Extract structured information from this job posting. Preserve enough detail to help a job seeker quickly understand the role — do not flatten or over-summarize.

Return ONLY valid JSON — no extra text:
{
  "position": "exact job title only, no company or location appended",
  "company": "company or organization name",
  "location": "exact location as stated — 'Remote', 'Hybrid — New York, NY', 'New York, NY', etc. Empty string if truly not found.",
  "salary": "salary range as written in the posting, or ''",
  "description": "2-3 sentence prose overview of what the team/org does and what this role owns. Skip boilerplate company mission copy. No bullets.",
  "duties": "key responsibilities as bullet points, one per line starting with '• '. Aim for 6-10 bullets.",
  "requirements": "qualifications as bullet points, one per line starting with '• '. If the posting has separate Required and Preferred sections, output a '**Required:**' label line, those bullets, a '**Preferred:**' label line, then those bullets. Use **bold** on the critical qualifier in each bullet — e.g. '• **Master\\'s degree** in public policy…', '• **At least 1 year** of relevant experience', '• **Expertise in R** preferred'. Aim for 5-10 bullets total.",
  "skills": ["up to 14 specific tools, technologies, or domain skills explicitly named — e.g. 'R', 'Python', 'SQL', 'data visualization', 'research methods', 'quantitative analysis'. Include single-letter names like 'R' when listed. No generic soft-skill verbs."],
  "deadline": "YYYY-MM-DD if an application deadline is stated, else ''"
}

Page title: ${rawTitle}
URL: ${url}

Job content:
${content.slice(0, 4000)}`,
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
    location: r.location || extractLocation(content),
    salary: r.salary || parseSalary(content),
    benefits: '',
    description: r.description || '',
    duties: r.duties || '',
    qualifications: r.requirements || '',
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
