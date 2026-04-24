const API_URL = 'https://api.anthropic.com/v1/messages';

export function getApiKey() {
  return localStorage.getItem('hs-api-key') || '';
}

export function setApiKey(key) {
  localStorage.setItem('hs-api-key', key);
}

async function callClaude({ messages, tools, maxTokens = 2000 }) {
  const key = getApiKey();
  if (!key) throw new Error('API key not set. Go to Settings to add your Anthropic API key.');

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages,
  };
  if (tools) body.tools = tools;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  return res.json();
}

function extractText(data) {
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse response as JSON.');
  }
}

// ─── Parse Job URL ─────────────────────────────────────────────────────
export async function parseJobUrl(url) {
  const data = await callClaude({
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Visit this job posting URL and extract detailed information. URL: ${url}

You are extracting data for a job tracker used by vulnerable community members (immigrants, workers seeking labor protections). Pay special attention to visa sponsorship, union representation, and worker protections.

Return ONLY a JSON object (no markdown, no backticks, no preamble):
{
  "position": "exact job title",
  "company": "company/organization name",
  "location": "city, state or Remote",
  "salary": "salary range if listed, or ''",
  "benefits": "key benefits mentioned (health insurance, PTO, retirement, etc.) as a short comma-separated list, or ''",
  "sponsorship": "Yes / No / Unknown — look for mentions of visa sponsorship, H-1B, work authorization requirements",
  "union": "Yes / No / Unknown — look for mentions of union representation, collective bargaining, AFSCME, SEIU, CWA, UAW, or any union affiliation. Also check if salary is listed as a union scale/grade.",
  "deadline": "YYYY-MM-DD or ''",
  "skills": ["list", "of", "key", "skills", "and", "tools", "required"],
  "qualifications": "brief summary of required education, experience, certifications",
  "description": "2-3 paragraph summary of the role responsibilities and what the org does",
  "worker_protections": "any mentions of EEO, ADA accommodations, anti-discrimination policy, language access, fair chance hiring, or similar protections — as a short summary, or ''",
  "community_focus": "does this org serve vulnerable/underserved communities? If yes, briefly describe (e.g. 'serves immigrant communities', 'workforce development for low-income populations', 'public health for underserved neighborhoods'). If unclear, ''"
}

Be thorough with skills — extract both hard skills (Python, GIS, SQL, Excel) and domain knowledge (workforce development, public policy, data analysis). Normalize skill names.

JSON only.`,
      },
    ],
  });

  return parseJSON(extractText(data));
}

// ─── Cover Letter Logic Generator ──────────────────────────────────────
// Step 1: Analyze the match between candidate and job
export async function analyzeMatch(job, resumeText) {
  const data = await callClaude({
    messages: [
      {
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
  "strong_matches": ["list of skills/experiences that directly match the job"],
  "transferable": ["list of skills/experiences that are transferable even if not exact match — explain the connection briefly for each"],
  "gaps": ["list of required skills/qualifications the candidate may lack"],
  "talking_points": ["3-4 specific, concrete points the candidate should emphasize in their cover letter — be specific, not generic"],
  "tone_advice": "one sentence on the right tone for this application given the org type",
  "match_strength": "Strong / Moderate / Stretch"
}

Be honest but empowering. Focus on what they CAN offer. For transferable skills, explain the bridge clearly — this helps non-native speakers articulate their value.

JSON only.`,
      },
    ],
  });

  return parseJSON(extractText(data));
}

// Step 2: Generate cover letter using the analysis
export async function generateCoverLetter(job, resumeText, analysis) {
  const analysisContext = analysis
    ? `
MATCH ANALYSIS (use this to guide the letter):
Strong matches: ${(analysis.strong_matches || []).join('; ')}
Transferable skills: ${(analysis.transferable || []).join('; ')}
Key talking points: ${(analysis.talking_points || []).join('; ')}
Tone: ${analysis.tone_advice || 'Professional and warm'}
`
    : '';

  const data = await callClaude({
    messages: [
      {
        role: 'user',
        content: `Write a compelling, tailored cover letter. The candidate may be an immigrant or non-native English speaker — write in clear, confident, professional English that sounds natural (not overly formal or stiff). Every sentence should be specific and purposeful.

CANDIDATE:
${resumeText}

POSITION: ${job.position}
COMPANY: ${job.company || 'Not specified'}
LOCATION: ${job.location || 'Not specified'}
REQUIRED SKILLS: ${(job.skills || []).join(', ') || 'Not specified'}
${job.description ? `DESCRIPTION:\n${job.description}` : ''}
${analysisContext}

Guidelines:
- Lead with the strongest match point
- Bridge transferable skills explicitly ("My experience doing X directly translates to Y")
- Be specific about achievements with numbers where possible
- Show genuine understanding of the org's mission
- Keep it under 400 words
- Do NOT start with "I am writing to apply" — start with something that shows you understand the role
- If the org serves communities, connect the candidate's background to that mission

Output ONLY the cover letter text.`,
      },
    ],
  });

  const text = extractText(data);
  if (!text) throw new Error('Empty response.');
  return text;
}
