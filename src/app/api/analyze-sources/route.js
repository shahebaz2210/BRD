import { NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// ════════════════════════════════════════════
//  UNIFIED MULTI-SOURCE ANALYSIS
//  Identifies the primary project, detects conflicts,
//  and prepares a unified requirements set
// ════════════════════════════════════════════

export async function POST(request) {
  try {
    const { sources, baseDocument } = await request.json();
    // sources = [{ sourceType: '...', text: '...', label: '...' }, ...]
    // baseDocument = { text: '...', fileName: '...' } — optional existing BRD to update

    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: 'No source data provided' }, { status: 400 });
    }

    const isUpdateMode = !!baseDocument?.text;

    // Combine all NEW source text for analysis
    const combinedText = sources.map((s, i) =>
      `=== SOURCE ${i + 1}: ${s.sourceType.toUpperCase()} (${s.label || 'Untitled'}) ===\n${s.text}`
    ).join('\n\n');

    const totalChars = combinedText.length;
    const sourceTypes = [...new Set(sources.map(s => s.sourceType))];

    // ── NLP Pre-Analysis ──
    const nlpData = quickNlpAnalysis(combinedText);

    // ── DeepSeek Analysis (or fallback) ──
    const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';
    let analysis;

    if (hasKey) {
      try {
        analysis = await deepSeekAnalysis(combinedText, sources, nlpData, baseDocument);
      } catch (err) {
        console.warn('DeepSeek analysis failed, using NLP fallback:', err.message);
        analysis = nlpFallbackAnalysis(sources, nlpData, baseDocument);
      }
    } else {
      analysis = nlpFallbackAnalysis(sources, nlpData, baseDocument);
    }

    return NextResponse.json({
      success: true,
      analysis,
      isUpdateMode,
      meta: {
        totalSources: sources.length,
        sourceTypes,
        totalCharacters: totalChars,
        analysisMode: hasKey ? 'deepseek' : 'nlp_fallback',
        hasBaseDocument: isUpdateMode,
        baseDocumentName: baseDocument?.fileName || null,
      },
    });

  } catch (err) {
    console.error('Analyze sources error:', err);
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}

// ════════════════════════════════════════════
//  QUICK NLP ANALYSIS (JavaScript-only)
// ════════════════════════════════════════════
function quickNlpAnalysis(text) {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'we', 'need', 'can', 'should', 'must', 'will', 'that', 'this',
    'it', 'with', 'not', 'be', 'have', 'do', 'get', 'they', 'their', 'from', 'has',
    'been', 'would', 'could', 'our', 'you', 'your', 'its', 'also', 'just', 'like',
    'very', 'much', 'some', 'any', 'all', 'also', 'into', 'let', 'may', 'more', 'than',
    'then', 'there', 'these', 'those', 'where', 'when', 'which', 'who', 'whom', 'how',
    'what', 'why', 'now', 'new', 'use', 'used', 'using', 'able', 'want', 'way', 'make',
    'source', 'gmail', 'telegram', 'transcript', 'upload', 'manual', 'untitled', 'text',
  ]);

  const freq = {};
  words.forEach(w => { if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1; });
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w);

  // Domain detection
  const domains = {
    'E-Commerce': ['cart', 'payment', 'product', 'order', 'checkout', 'buy', 'sell', 'shop', 'price'],
    'Transport': ['bus', 'route', 'ticket', 'track', 'gps', 'location', 'trip', 'ride', 'driver'],
    'Healthcare': ['patient', 'doctor', 'appointment', 'health', 'medicine', 'hospital', 'clinic'],
    'Finance': ['invoice', 'billing', 'account', 'transaction', 'bank', 'wallet', 'money', 'loan'],
    'Education': ['student', 'course', 'grade', 'teacher', 'exam', 'assignment', 'class', 'learn'],
    'Social Media': ['post', 'feed', 'follow', 'profile', 'share', 'comment', 'like', 'chat'],
    'Project Management': ['task', 'sprint', 'milestone', 'deadline', 'backlog', 'kanban', 'agile'],
  };

  let detectedDomain = 'General';
  let maxMatches = 0;
  for (const [domain, domainWords] of Object.entries(domains)) {
    const matches = domainWords.filter(w => text.toLowerCase().includes(w)).length;
    if (matches > maxMatches) { maxMatches = matches; detectedDomain = domain; }
  }

  return { keywords, detectedDomain, wordCount: words.length };
}

// ════════════════════════════════════════════
//  DEEPSEEK UNIFIED ANALYSIS
// ════════════════════════════════════════════
async function deepSeekAnalysis(combinedText, sources, nlpData, baseDocument) {
  const sourceList = sources.map(s => `- ${s.sourceType}: "${s.label || 'Untitled'}"`).join('\n');
  const isUpdateMode = !!baseDocument?.text;

  let systemPrompt;

  if (isUpdateMode) {
    // ── UPDATE MODE: Compare new data against existing BRD ──
    systemPrompt = `You are an expert Business Analyst specializing in BRD maintenance and incremental updates.

You have been given an EXISTING Business Requirements Document (base document) and NEW data from communication sources. Your job is to:

1. COMPARE the new source data against the existing BRD
2. IDENTIFY what is NEW (additions) that should be added to the BRD
3. IDENTIFY what has CHANGED (modifications) that should update existing requirements
4. DETECT any CONFLICTS between the new data and the existing BRD content
5. Preserve all existing content that is NOT contradicted by new data

EXISTING BRD (base document from "${baseDocument.fileName}"):
${baseDocument.text.slice(0, 4000)}

NEW data sources:
${sourceList}

NLP Pre-Analysis of new data:
- Domain: ${nlpData.detectedDomain}
- Top Keywords: ${nlpData.keywords.slice(0, 15).join(', ')}

Return ONLY a valid JSON object (no markdown, no code fences) with this structure:
{
  "identified_project": {
    "name": "Project Name (from existing BRD or refined)",
    "description": "Brief description",
    "confidence": 0.9
  },
  "source_summaries": [
    { "sourceType": "...", "label": "...", "summary": "What NEW information this source adds", "relevance": "high/medium/low" }
  ],
  "update_summary": {
    "additions_count": 3,
    "modifications_count": 2,
    "description": "Summary of what changed"
  },
  "conflicts": [
    {
      "id": "conflict-1",
      "topic": "Feature Name",
      "description": "New data contradicts existing BRD",
      "options": [
        { "source": "existing_brd", "description": "Current BRD says...", "context": "..." },
        { "source": "gmail", "description": "New email says...", "context": "..." }
      ]
    }
  ],
  "unified_requirements": {
    "project_title": "...",
    "actors": [{"name": "...", "description": "..."}],
    "functional_requirements": [
      {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "...", "status": "existing|new|modified", "agreedBySources": ["existing_brd","gmail"]}
    ],
    "non_functional_requirements": [
      {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low", "status": "existing|new|modified"}
    ],
    "features": ["feature1", "feature2"],
    "moscow": {
      "must_have": ["..."],
      "should_have": ["..."],
      "could_have": ["..."],
      "wont_have": ["..."]
    },
    "ambiguities": ["Any unclear items"]
  }
}

CRITICAL: Mark each requirement with "status": "existing" (unchanged from base), "new" (added from new sources), or "modified" (changed based on new data). Preserve ALL existing requirements that are not contradicted.`;
  } else {
    // ── FRESH MODE: Standard analysis ──
    systemPrompt = `You are an expert Business Analyst specializing in requirements consolidation.

You are analyzing data collected from MULTIPLE communication sources (emails, chats, meeting transcripts, documents, etc.) for a software project.

Your tasks:
1. IDENTIFY which project is being discussed the most across all sources
2. DETECT any CONFLICTS where different sources say contradictory things about the same feature/requirement
3. Summarize what each source contributes
4. Produce a unified view of the project requirements

Input sources:
${sourceList}

NLP Pre-Analysis:
- Domain: ${nlpData.detectedDomain}
- Top Keywords: ${nlpData.keywords.slice(0, 15).join(', ')}

Return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "identified_project": {
    "name": "Project Name",
    "description": "Brief description of what this project is about",
    "confidence": 0.85
  },
  "source_summaries": [
    { "sourceType": "gmail", "label": "...", "summary": "What this source discussed", "relevance": "high/medium/low" }
  ],
  "conflicts": [
    {
      "id": "conflict-1",
      "topic": "Payment Gateway",
      "description": "Sources disagree on payment implementation",
      "options": [
        { "source": "gmail", "description": "Use Razorpay for card/UPI payments", "context": "Quote from email..." },
        { "source": "telegram", "description": "Use Stripe for international payments", "context": "Quote from chat..." }
      ]
    }
  ],
  "unified_requirements": {
    "project_title": "...",
    "actors": [{"name": "...", "description": "..."}],
    "functional_requirements": [
      {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "...", "agreedBySources": ["gmail","telegram"]}
    ],
    "non_functional_requirements": [
      {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}
    ],
    "features": ["feature1", "feature2"],
    "moscow": {
      "must_have": ["..."],
      "should_have": ["..."],
      "could_have": ["..."],
      "wont_have": ["..."]
    },
    "ambiguities": ["Any unclear or vague requirements"]
  }
}

IMPORTANT: If there are NO conflicts, return an empty "conflicts" array [].
If only one source is provided, there can be no conflicts.`;
  }

  const userMsg = isUpdateMode
    ? `Compare these ${sources.length} NEW source(s) against the existing BRD and identify additions, modifications, and conflicts:\n\n${combinedText.slice(0, 6000)}`
    : `Analyze these ${sources.length} source(s) and identify the project, conflicts, and unified requirements:\n\n${combinedText.slice(0, 8000)}`;

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(content.slice(start, end + 1));
    throw new Error('Could not parse DeepSeek analysis response');
  }
}

// ════════════════════════════════════════════
//  NLP FALLBACK ANALYSIS (no DeepSeek)
// ════════════════════════════════════════════
function nlpFallbackAnalysis(sources, nlpData, baseDocument) {
  const isUpdateMode = !!baseDocument?.text;

  const sourceSummaries = sources.map(s => ({
    sourceType: s.sourceType,
    label: s.label || 'Untitled',
    summary: isUpdateMode
      ? `Contains ${s.text.split(/\s+/).length} words of NEW data from ${s.sourceType}`
      : `Contains ${s.text.split(/\s+/).length} words of content from ${s.sourceType}`,
    relevance: 'medium',
  }));

  // Simple conflict detection
  const conflicts = [];
  const allSourceTexts = sources.map(s => s.text.toLowerCase()).join(' ');

  if (isUpdateMode) {
    // Check for contradictions between base doc and new sources
    const baseLower = baseDocument.text.toLowerCase();
    const paymentConflicts = [];
    if (baseLower.includes('razorpay') && allSourceTexts.includes('stripe')) {
      paymentConflicts.push({ base: 'Razorpay', newSource: 'Stripe' });
    }
    if (baseLower.includes('stripe') && allSourceTexts.includes('razorpay')) {
      paymentConflicts.push({ base: 'Stripe', newSource: 'Razorpay' });
    }
    paymentConflicts.forEach(pc => {
      conflicts.push({
        id: `conflict-payment-${pc.base.toLowerCase()}`,
        topic: 'Payment Gateway',
        description: `New data suggests ${pc.newSource} but existing BRD uses ${pc.base}`,
        options: [
          { source: 'existing_brd', description: `Keep ${pc.base} (from existing BRD)`, context: `Current BRD mentions ${pc.base}` },
          { source: sources[0]?.sourceType || 'new_data', description: `Switch to ${pc.newSource} (from new data)`, context: `New source mentions ${pc.newSource}` },
        ],
      });
    });
  } else if (sources.length > 1) {
    const paymentKeywords = { razorpay: [], stripe: [], paypal: [], upi: [] };
    sources.forEach(s => {
      const lower = s.text.toLowerCase();
      if (lower.includes('razorpay')) paymentKeywords.razorpay.push(s.sourceType);
      if (lower.includes('stripe')) paymentKeywords.stripe.push(s.sourceType);
      if (lower.includes('paypal')) paymentKeywords.paypal.push(s.sourceType);
    });
    const usedPayments = Object.entries(paymentKeywords).filter(([, srcs]) => srcs.length > 0);
    if (usedPayments.length > 1) {
      conflicts.push({
        id: 'conflict-payment',
        topic: 'Payment Gateway',
        description: 'Different sources mention different payment providers',
        options: usedPayments.map(([provider, srcs]) => ({
          source: srcs.join(', '),
          description: `Use ${provider.charAt(0).toUpperCase() + provider.slice(1)} for payments`,
          context: `Mentioned in ${srcs.join(' and ')} source(s)`,
        })),
      });
    }
  }

  // Build requirements from NLP
  const requirementPatterns = ['should', 'must', 'shall', 'need', 'require', 'support', 'allow', 'enable', 'provide'];
  const allText = sources.map(s => s.text).join(' ');
  const sentences = allText.replace(/\n+/g, '. ').split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  const reqSentences = sentences.filter(s => requirementPatterns.some(p => s.toLowerCase().includes(p)));

  // In update mode, extract existing requirements from base doc too
  let existingFRs = [];
  if (isUpdateMode) {
    const baseSentences = baseDocument.text.replace(/\n+/g, '. ').split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
    const baseReqSentences = baseSentences.filter(s => requirementPatterns.some(p => s.toLowerCase().includes(p)));
    existingFRs = baseReqSentences.slice(0, 6).map((s, i) => ({
      id: `FR-${String(i + 1).padStart(3, '0')}`,
      description: s.trim(),
      priority: i < 2 ? 'High' : i < 4 ? 'Medium' : 'Low',
      category: 'Core',
      status: 'existing',
      agreedBySources: ['existing_brd'],
    }));
  }

  const newFRs = reqSentences.slice(0, 8).map((s, i) => ({
    id: `FR-${String(existingFRs.length + i + 1).padStart(3, '0')}`,
    description: s.trim(),
    priority: i < 3 ? 'High' : i < 5 ? 'Medium' : 'Low',
    category: 'Core',
    status: isUpdateMode ? 'new' : undefined,
    agreedBySources: sources.map(src => src.sourceType),
  }));

  const allFRs = [...existingFRs, ...newFRs];

  const result = {
    identified_project: {
      name: `${nlpData.detectedDomain} Project`,
      description: isUpdateMode
        ? `Updated ${nlpData.detectedDomain.toLowerCase()} system — base document enhanced with ${sources.length} new source(s)`
        : `A ${nlpData.detectedDomain.toLowerCase()} system based on analysis of ${sources.length} source(s)`,
      confidence: isUpdateMode ? 0.8 : 0.65,
    },
    source_summaries: sourceSummaries,
    conflicts,
    unified_requirements: {
      project_title: `${nlpData.detectedDomain} System Requirements`,
      actors: [
        { name: 'User', description: 'Primary end user of the system' },
        { name: 'Admin', description: 'System administrator' },
      ],
      functional_requirements: allFRs,
      non_functional_requirements: [
        { id: 'NFR-001', description: 'System shall respond within 2 seconds', priority: 'High', status: isUpdateMode ? 'existing' : undefined },
        { id: 'NFR-002', description: 'System shall support 1000+ concurrent users', priority: 'Medium', status: isUpdateMode ? 'existing' : undefined },
        { id: 'NFR-003', description: 'All data encrypted in transit and at rest', priority: 'High', status: isUpdateMode ? 'existing' : undefined },
      ],
      features: nlpData.keywords.slice(0, 6),
      moscow: {
        must_have: allFRs.filter(r => r.priority === 'High').map(r => r.description).slice(0, 4),
        should_have: allFRs.filter(r => r.priority === 'Medium').map(r => r.description).slice(0, 3),
        could_have: allFRs.filter(r => r.priority === 'Low').map(r => r.description).slice(0, 3),
        wont_have: ['Mobile native app (v2)', 'Offline mode', 'Third-party integrations (v2)'],
      },
      ambiguities: sources.length === 1 ? ['Only one new source provided — more data may improve accuracy'] : [],
    },
  };

  if (isUpdateMode) {
    result.update_summary = {
      additions_count: newFRs.length,
      modifications_count: 0,
      description: `${newFRs.length} new requirement(s) identified from ${sources.length} source(s). ${existingFRs.length} existing requirement(s) preserved.`,
    };
  }

  return result;
}

