// ════════════════════════════════════════════════════════════════
//  DEEPSEEK MODULE — BRD Generation from Structured Cards
//  SECURITY: Only structured cards are sent, NEVER raw data
// ════════════════════════════════════════════════════════════════

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.startsWith('sk-or-') 
  ? 'https://openrouter.ai/api/v1/chat/completions' 
  : 'https://api.deepseek.com/v1/chat/completions';

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
        // fall through
      }
    }
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  GENERATE BRD — Takes ONLY structured cards + metadata
//  Raw communication data is NEVER sent to DeepSeek
// ════════════════════════════════════════════════════════════════
async function generateBRD(cards, project, description) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
    console.warn('[llmDeepseek] No API key configured, using offline BRD builder');
    return buildOfflineBRD(cards, project, description);
  }

  const systemPrompt = `You are a senior Business Analyst. Generate a comprehensive, professional Business Requirements Document (BRD) from the provided structured requirement cards.

Project: "${project}"
Description: "${description}"

You will receive ONLY pre-processed, structured cards — NOT raw data. Each card has:
- type: requirement | stakeholder | timeline | decision | issue
- content: a short descriptive sentence
- source: chat | email | meeting

Return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "title": "Business Requirements Document",
  "project_name": "${project}",
  "executive_summary": "2-3 paragraph executive summary",
  "project_scope": "Detailed project scope",
  "actors": [{"name": "...", "description": "..."}],
  "functional_requirements": [
    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "...", "source": "chat/email/meeting"}
  ],
  "non_functional_requirements": [
    {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}
  ],
  "moscow": {
    "must_have": ["..."],
    "should_have": ["..."],
    "could_have": ["..."],
    "wont_have": ["..."]
  },
  "decisions": ["key decisions extracted from cards"],
  "issues": ["open issues or risks"],
  "timeline": ["timeline items if any"],
  "assumptions": ["..."],
  "constraints": ["..."],
  "acceptance_criteria": ["..."]
}`;

  const userMsg = `Generate a BRD from these ${cards.length} structured cards:\n\n${JSON.stringify(cards, null, 2)}`;

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_API_KEY.startsWith('sk-or-') ? 'deepseek/deepseek-chat' : 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[llmDeepseek] API error:', response.status, errText);
    // Fallback to offline builder on API failure
    console.warn('[llmDeepseek] Falling back to offline BRD builder');
    return buildOfflineBRD(cards, project, description);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const brd = safeParseJSON(content);
  if (!brd) {
    console.warn('[llmDeepseek] Could not parse response, using offline builder');
    return buildOfflineBRD(cards, project, description);
  }

  return brd;
}

// ════════════════════════════════════════════════════════════════
//  OFFLINE BRD BUILDER — No API needed
//  Structures cards into a BRD format using pure JavaScript
// ════════════════════════════════════════════════════════════════
function buildOfflineBRD(cards, project, description) {
  const requirements = cards.filter(c => c.type === 'requirement');
  const stakeholders = cards.filter(c => c.type === 'stakeholder');
  const timelines = cards.filter(c => c.type === 'timeline');
  const decisions = cards.filter(c => c.type === 'decision');
  const issues = cards.filter(c => c.type === 'issue');

  // Build actors from stakeholder cards or defaults
  const actors = stakeholders.length > 0
    ? stakeholders.map(s => ({ name: s.content, description: `Stakeholder identified from ${s.source}` }))
    : [
        { name: 'End User', description: 'Primary user of the system' },
        { name: 'Admin', description: 'System administrator' },
      ];

  // Build functional requirements
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

  // Source statistics
  const sourceStats = {};
  cards.forEach(c => { sourceStats[c.source] = (sourceStats[c.source] || 0) + 1; });
  const sourceBreakdown = Object.entries(sourceStats)
    .map(([src, count]) => `${count} from ${src}`)
    .join(', ');

  return {
    title: 'Business Requirements Document',
    project_name: project,
    executive_summary: `This Business Requirements Document outlines the requirements for "${project}". ${description ? `Project overview: ${description}.` : ''}\n\nRequirements were automatically extracted from ${cards.length} structured cards (${sourceBreakdown}) using an AI-powered pipeline. The local LLM (Mistral) filtered and structured raw communication data, and this document consolidates all findings into a formal BRD.\n\nThe document covers ${frs.length} functional requirements, ${actors.length} identified actors, ${decisions.length} key decisions, and ${issues.length} open issues.`,
    project_scope: `The project "${project}" encompasses the development of a comprehensive system as described: ${description || 'requirements extracted from multi-source communications'}. This scope is derived from consolidated stakeholder inputs across ${Object.keys(sourceStats).length} communication channel(s).`,
    actors,
    functional_requirements: frs,
    non_functional_requirements: [
      { id: 'NFR-001', description: 'System shall respond within 2 seconds under normal load', priority: 'High' },
      { id: 'NFR-002', description: 'System shall support 1000+ concurrent users', priority: 'High' },
      { id: 'NFR-003', description: 'All sensitive data shall be encrypted using TLS 1.3', priority: 'High' },
      { id: 'NFR-004', description: 'System shall maintain 99.9% uptime SLA', priority: 'Medium' },
    ],
    moscow: {
      must_have: highFRs.slice(0, 5),
      should_have: medFRs.slice(0, 4),
      could_have: lowFRs.slice(0, 3),
      wont_have: ['Native mobile app (v1)', 'Offline mode', 'AI chatbot integration'],
    },
    decisions: decisions.map(d => d.content),
    issues: issues.map(i => i.content),
    timeline: timelines.map(t => t.content),
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

export { generateBRD, buildOfflineBRD };
