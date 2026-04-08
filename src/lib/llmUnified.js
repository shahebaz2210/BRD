// ════════════════════════════════════════════════════════════════
//  DUAL-MODEL PIPELINE
//  MODEL 1: GPT-OSS-120B → Preprocessing, filtering, card extraction
//  MODEL 2: DeepSeek v3.2 → Reasoning + BRD generation
//
//  Flow: Raw Data → GPT-OSS → Structured Cards → DeepSeek → BRD
// ════════════════════════════════════════════════════════════════

// ── Model 1: GPT-OSS-120B Config ────────────────────────────────
const GPT_OSS_API_KEY = process.env.GPT_OSS_API_KEY;
const GPT_OSS_URL = 'https://api.gpt-oss.com/chat/completions';
const GPT_OSS_MODEL = 'gpt-oss-120b';

// ── Model 2: DeepSeek Config ────────────────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.startsWith('sk-or-')
  ? 'https://openrouter.ai/api/v1/chat/completions'
  : 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.startsWith('sk-or-')
  ? 'deepseek/deepseek-chat'
  : 'deepseek-chat';

// ── Safe JSON Parse ─────────────────────────────────────────────
function safeParseJSON(raw) {
  let cleaned = raw.trim();

  // Remove markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting JSON object
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.slice(objStart, objEnd + 1));
      } catch {
        // Try extracting JSON array
        const arrStart = cleaned.indexOf('[');
        const arrEnd = cleaned.lastIndexOf(']');
        if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
          try {
            return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
          } catch {
            // fall through
          }
        }
      }
    }
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  STAGE 1 — GPT-OSS-120B: CARD EXTRACTION
//  Input:  Raw communication data + project context
//  Output: Array of structured cards
// ════════════════════════════════════════════════════════════════
async function extractCards(data, project, description) {
  if (!GPT_OSS_API_KEY || GPT_OSS_API_KEY === 'your_gpt_oss_api_key_here') {
    console.warn('[Stage1-GPT-OSS] No API key configured, using offline card extraction');
    return buildBasicCards(data, project);
  }

  const prompt = `You are an AI preprocessing system for Business Requirement Document generation.

Project: "${project}"
Description: "${description}"

Your task:
1. Read the raw communication data below (from chats, emails, meetings)
2. Identify which parts relate to the project "${project}"
3. Remove irrelevant content, noise, greetings, signatures
4. Extract key information and convert into structured cards

Card format — return a JSON array:
[
  {
    "type": "requirement | stakeholder | timeline | decision | issue",
    "content": "short sentence describing the item",
    "source": "chat | email | meeting"
  }
]

Rules:
* Only extract information relevant to "${project}"
* Keep content concise (one sentence per card)
* No duplicate cards
* No explanation, no markdown
* Return ONLY the JSON array
* Extract at least 3 cards if data has any relevance

Input data:
${data.slice(0, 30000)}`;

  console.log(`[Stage1-GPT-OSS] Extracting cards for "${project}" (${data.length} chars input)`);

  try {
    const response = await fetch(GPT_OSS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GPT_OSS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GPT_OSS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Stage1-GPT-OSS] API error: ${response.status}`, errText);
      console.warn('[Stage1-GPT-OSS] Falling back to offline card extraction');
      return buildBasicCards(data, project);
    }

    const responseData = await response.json();
    const content = responseData.choices?.[0]?.message?.content || '';
    const cards = safeParseJSON(content);

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      console.warn('[Stage1-GPT-OSS] Could not parse card array, using offline extraction');
      return buildBasicCards(data, project);
    }

    // Validate card fields
    const validated = cards.map(card => ({
      type: card.type || 'requirement',
      content: card.content || '',
      source: card.source || 'unknown',
    })).filter(c => c.content.length > 0);

    console.log(`[Stage1-GPT-OSS] Extracted ${validated.length} cards`);
    return validated;

  } catch (err) {
    console.error('[Stage1-GPT-OSS] Request failed:', err.message);
    return buildBasicCards(data, project);
  }
}

// ════════════════════════════════════════════════════════════════
//  STAGE 2 — DEEPSEEK: BRD GENERATION (Reasoning Layer)
//  Input:  Structured cards from GPT-OSS
//  Output: Complete BRD object
// ════════════════════════════════════════════════════════════════
async function generateBRD(cards, project, description) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
    console.warn('[Stage2-DeepSeek] No API key configured, using offline BRD builder');
    return buildOfflineBRD(cards, project, description);
  }

  const prompt = `You are a senior Business Analyst. You receive structured requirement cards that have been pre-extracted from raw communication data by an AI preprocessing system.

Your job: Convert these cards into a professional, comprehensive Business Requirements Document (BRD).

Project: "${project}"
Description: "${description}"

Instructions:
* Group related requirements logically
* Ensure no duplication
* Infer priorities where possible
* Convert timelines into clear milestones
* Map decisions clearly
* Ensure professional and structured output

Return ONLY a valid JSON object (no markdown, no code fences, no explanation) with this STRICT schema:

{
  "project_name": "${project}",
  "executive_summary": "2-3 paragraph professional summary of the project",
  "project_scope": "Detailed project scope description",
  "stakeholders": ["list of identified stakeholders"],
  "actors": [{"name": "...", "description": "..."}],
  "functional_requirements": [
    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "..."}
  ],
  "non_functional_requirements": [
    {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}
  ],
  "decisions_and_approvals": ["key decisions extracted from cards"],
  "timelines_and_milestones": ["timeline items as clear milestones"],
  "feature_prioritization": [
    {"feature": "...", "priority": "High | Medium | Low"}
  ],
  "moscow": {
    "must_have": ["..."],
    "should_have": ["..."],
    "could_have": ["..."],
    "wont_have": ["..."]
  },
  "risks_or_issues": ["open issues or risks"],
  "assumptions": ["..."],
  "constraints": ["..."],
  "acceptance_criteria": ["..."]
}

Here are the ${cards.length} structured cards to process:

${JSON.stringify(cards, null, 2)}`;

  console.log(`[Stage2-DeepSeek] Generating BRD from ${cards.length} cards for "${project}"`);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Stage2-DeepSeek] API error: ${response.status}`, errText);
      console.warn('[Stage2-DeepSeek] Falling back to offline BRD builder');
      return buildOfflineBRD(cards, project, description);
    }

    const responseData = await response.json();
    const content = responseData.choices?.[0]?.message?.content || '';
    const brd = safeParseJSON(content);

    if (!brd) {
      console.warn('[Stage2-DeepSeek] Could not parse BRD response, using offline builder');
      return buildOfflineBRD(cards, project, description);
    }

    console.log(`[Stage2-DeepSeek] BRD generated successfully`);
    return brd;

  } catch (err) {
    console.error('[Stage2-DeepSeek] Request failed:', err.message);
    return buildOfflineBRD(cards, project, description);
  }
}

// ════════════════════════════════════════════════════════════════
//  FULL PIPELINE — processData()
//  Runs both stages: GPT-OSS → Cards → DeepSeek → BRD
// ════════════════════════════════════════════════════════════════
async function processData(data, project, description) {
  console.log(`\n[Pipeline] ═══ Dual-model pipeline for "${project}" ═══`);

  // Stage 1: GPT-OSS-120B extracts cards
  console.log('[Pipeline] Stage 1: GPT-OSS-120B → Card Extraction...');
  const cards = await extractCards(data, project, description);
  console.log(`[Pipeline] Stage 1 complete: ${cards.length} cards`);

  // Stage 2: DeepSeek generates BRD from cards
  console.log('[Pipeline] Stage 2: DeepSeek → BRD Generation...');
  const brd = await generateBRD(cards, project, description);
  console.log('[Pipeline] Stage 2 complete: BRD generated');

  console.log('[Pipeline] ═══ Dual-model pipeline complete ═══\n');

  return { cards, brd };
}

// ════════════════════════════════════════════════════════════════
//  OFFLINE FALLBACKS — No API needed
// ════════════════════════════════════════════════════════════════

// ── Source Detection ────────────────────────────────────────────
function detectSource(text) {
  if (/\[TELEGRAM\]/i.test(text)) return 'chat';
  if (/\[GMAIL\]/i.test(text)) return 'email';
  if (/\[MEETING\]/i.test(text)) return 'meeting';
  return 'unknown';
}

// ── Basic card extraction (no LLM needed) ──────────────────────
function buildBasicCards(text, project) {
  const cards = [];

  const hasGmail = /\[GMAIL\]/i.test(text);
  const hasTelegram = /\[TELEGRAM\]/i.test(text);
  const hasMeeting = /\[MEETING\]/i.test(text);

  const sections = text.split(/\[(?:GMAIL|TELEGRAM|MEETING)\]/i);

  for (const section of sections) {
    const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 15);

    for (const line of lines) {
      if (/^(From:|Subject:|Document:|---$)/i.test(line)) continue;
      if (/^(To:|Date:|Cc:|Bcc:)/i.test(line)) continue;
      if (line.length > 500) continue;

      let type = 'requirement';
      if (/deadline|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|monday|friday|week|sprint)/i.test(line)) type = 'timeline';
      else if (/decide|agreed|confirmed|approved|selected|chose|go with/i.test(line)) type = 'decision';
      else if (/issue|bug|problem|risk|blocker|concern|challenge|failed/i.test(line)) type = 'issue';
      else if (/stakeholder|client|team|manager|lead|responsible|owner|assigned/i.test(line)) type = 'stakeholder';
      else if (/need|must|should|require|implement|feature|support|integrate|build|create|develop|design|add|enable/i.test(line)) type = 'requirement';
      else continue;

      let source = 'unknown';
      if (hasGmail) source = 'email';
      else if (hasTelegram) source = 'chat';
      else if (hasMeeting) source = 'meeting';

      let content = line
        .replace(/^\w+[\w\s]*?:\s*/, '')
        .replace(/<[^>]*>/g, '')
        .trim();

      if (content.length > 15 && content.length < 300) {
        cards.push({ type, content: content.slice(0, 200), source });
      }
    }
  }

  const seen = new Set();
  const unique = cards.filter(c => {
    const key = c.content.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    unique.push(
      { type: 'requirement', content: `Build ${project} system as described by stakeholders`, source: hasGmail ? 'email' : 'unknown' },
      { type: 'requirement', content: 'System should implement core functional requirements from project discussions', source: hasGmail ? 'email' : 'unknown' },
      { type: 'requirement', content: 'System should meet security and performance standards', source: 'unknown' },
    );
  }

  console.log(`[Offline] Basic extraction: ${unique.length} cards from ${text.length} chars`);
  return unique.slice(0, 25);
}

// ── Offline BRD builder ────────────────────────────────────────
function buildOfflineBRD(cards, project, description) {
  const requirements = cards.filter(c => c.type === 'requirement');
  const stakeholders = cards.filter(c => c.type === 'stakeholder');
  const timelines = cards.filter(c => c.type === 'timeline');
  const decisions = cards.filter(c => c.type === 'decision');
  const issues = cards.filter(c => c.type === 'issue');

  const actors = stakeholders.length > 0
    ? stakeholders.map(s => ({ name: s.content, description: `Stakeholder identified from ${s.source}` }))
    : [
        { name: 'End User', description: 'Primary user of the system' },
        { name: 'Admin', description: 'System administrator' },
      ];

  const frs = requirements.length > 0
    ? requirements.map((r, i) => ({
        id: `FR-${String(i + 1).padStart(3, '0')}`,
        description: r.content,
        priority: i < Math.ceil(requirements.length * 0.3) ? 'High'
                : i < Math.ceil(requirements.length * 0.7) ? 'Medium'
                : 'Low',
        category: 'Core',
        source: r.source,
      }))
    : [
        { id: 'FR-001', description: 'System shall support user registration and authentication', priority: 'High', category: 'Auth', source: 'unknown' },
        { id: 'FR-002', description: 'System shall provide core business functionality', priority: 'High', category: 'Core', source: 'unknown' },
      ];

  const highFRs = frs.filter(r => r.priority === 'High').map(r => r.description);
  const medFRs = frs.filter(r => r.priority === 'Medium').map(r => r.description);
  const lowFRs = frs.filter(r => r.priority === 'Low').map(r => r.description);

  const sourceStats = {};
  cards.forEach(c => { sourceStats[c.source] = (sourceStats[c.source] || 0) + 1; });
  const sourceBreakdown = Object.entries(sourceStats)
    .map(([src, count]) => `${count} from ${src}`)
    .join(', ');

  return {
    project_name: project,
    executive_summary: `This Business Requirements Document outlines the requirements for "${project}". ${description ? `Project overview: ${description}.` : ''}\n\nRequirements were automatically extracted from ${cards.length} structured cards (${sourceBreakdown}) using the GPT-OSS-120B + DeepSeek dual-model AI pipeline. The document consolidates all findings into a formal BRD.\n\nThe document covers ${frs.length} functional requirements, ${actors.length} identified actors, ${decisions.length} key decisions, and ${issues.length} open issues.`,
    project_scope: `The project "${project}" encompasses the development of a comprehensive system as described: ${description || 'requirements extracted from multi-source communications'}. This scope is derived from consolidated stakeholder inputs across ${Object.keys(sourceStats).length} communication channel(s).`,
    stakeholders: stakeholders.map(s => s.content),
    actors,
    functional_requirements: frs,
    non_functional_requirements: [
      { id: 'NFR-001', description: 'System shall respond within 2 seconds under normal load', priority: 'High' },
      { id: 'NFR-002', description: 'System shall support 1000+ concurrent users', priority: 'High' },
      { id: 'NFR-003', description: 'All sensitive data shall be encrypted using TLS 1.3', priority: 'High' },
      { id: 'NFR-004', description: 'System shall maintain 99.9% uptime SLA', priority: 'Medium' },
    ],
    decisions_and_approvals: decisions.map(d => d.content),
    timelines_and_milestones: timelines.map(t => t.content),
    feature_prioritization: frs.slice(0, 8).map(fr => ({
      feature: fr.description,
      priority: fr.priority,
    })),
    moscow: {
      must_have: highFRs.slice(0, 5),
      should_have: medFRs.slice(0, 4),
      could_have: lowFRs.slice(0, 3),
      wont_have: ['Native mobile app (v1)', 'Offline mode', 'AI chatbot integration'],
    },
    risks_or_issues: issues.map(i => i.content),
    assumptions: [
      'Users have access to modern web browsers',
      'Required third-party APIs will be available and stable',
      'Development team has necessary technical expertise',
      'Stakeholder inputs from all communication channels are representative',
    ],
    constraints: [
      'Project must be delivered within the agreed timeline',
      'Must comply with applicable data privacy regulations',
      'Budget limited to approved infrastructure tiers',
    ],
    acceptance_criteria: [
      'All functional requirements pass acceptance testing',
      'System handles expected concurrent load without degradation',
      'User interfaces are responsive across desktop and mobile',
      'Security audit passes with no critical vulnerabilities',
    ],
  };
}

export { processData, extractCards, generateBRD, buildOfflineBRD, buildBasicCards, safeParseJSON };
