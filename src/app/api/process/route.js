import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// ════════════════════════════════════════════
//  LAYER 2: NLP PREPROCESSING (pure JavaScript)
//  Runs BEFORE DeepSeek — no Python needed
// ════════════════════════════════════════════
function nlpPreprocess(text) {
  // 1. Tokenize into sentences
  const sentences = text
    .replace(/\n+/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 8);

  // 2. Tokenize into words
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

  // 3. Stop words list
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'we', 'need', 'can', 'should', 'must', 'will', 'that', 'this',
    'it', 'with', 'not', 'be', 'have', 'do', 'get', 'they', 'their', 'from', 'has',
    'been', 'would', 'could', 'our', 'you', 'your', 'its', 'also', 'just', 'like',
    'very', 'much', 'some', 'any', 'all', 'also', 'into', 'let', 'may', 'more', 'than',
    'then', 'there', 'these', 'those', 'where', 'when', 'which', 'who', 'whom', 'how',
    'what', 'why', 'now', 'new', 'use', 'used', 'using', 'able', 'want', 'way', 'make'
  ]);

  // 4. Extract keywords (TF-based, remove stop words)
  const freq = {};
  words.forEach(w => {
    if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // 5. Named entity hints (simple regex patterns)
  const actorHints = [];
  const actorPatterns = [
    /\b(user|users|customer|customers|client|clients)\b/gi,
    /\b(admin|administrator|manager|operator)\b/gi,
    /\b(driver|agent|vendor|seller|buyer)\b/gi,
    /\b(student|teacher|employee|staff)\b/gi,
  ];
  const actorLabels = ['User', 'Admin', 'Agent', 'Staff'];
  actorPatterns.forEach((pattern, i) => {
    if (pattern.test(text)) actorHints.push(actorLabels[i]);
  });

  // 6. Priority signals
  const highSignals = ['urgent', 'critical', 'must', 'mandatory', 'required', 'asap', 'important', 'crucial'];
  const lowSignals = ['nice to have', 'optional', 'later', 'eventually', 'consider'];
  const hasHigh = highSignals.some(s => text.toLowerCase().includes(s));
  const hasLow = lowSignals.some(s => text.toLowerCase().includes(s));
  const priority = hasHigh ? 'High' : hasLow ? 'Low' : 'Medium';

  // 7. Domain detection
  const domains = {
    ecommerce: ['cart', 'payment', 'product', 'order', 'checkout', 'buy', 'sell'],
    transport: ['bus', 'route', 'ticket', 'track', 'gps', 'location', 'trip'],
    health: ['patient', 'doctor', 'appointment', 'health', 'medicine', 'hospital'],
    finance: ['invoice', 'billing', 'account', 'transaction', 'bank', 'wallet'],
    education: ['student', 'course', 'grade', 'teacher', 'exam', 'assignment'],
  };
  let detectedDomain = 'General';
  let maxMatches = 0;
  for (const [domain, domainWords] of Object.entries(domains)) {
    const matches = domainWords.filter(w => text.toLowerCase().includes(w)).length;
    if (matches > maxMatches) { maxMatches = matches; detectedDomain = domain; }
  }

  // 8. Requirement sentence classification
  const requirementIndicators = ['should', 'must', 'shall', 'need', 'require', 'support', 'allow', 'enable', 'provide', 'manage'];
  const requirementSentences = sentences.filter(s =>
    requirementIndicators.some(ind => s.toLowerCase().includes(ind))
  );

  return {
    sentences,
    keywords,
    actorHints: [...new Set(actorHints)],
    priority,
    detectedDomain,
    requirementSentences,
    wordCount: words.length,
    sentenceCount: sentences.length,
  };
}

// ════════════════════════════════════════════
//  LAYER 3: LLM PROCESSING (DeepSeek V3)
// ════════════════════════════════════════════
async function callDeepSeek(text, source, nlpData) {
  const systemPrompt = `You are an expert Business Analyst and Requirements Engineer.
Extract structured requirements from the input. Use these NLP pre-analysis results to guide you:
- Detected domain: ${nlpData.detectedDomain}
- Likely actors: ${nlpData.actorHints.join(', ') || 'detect from context'}
- Key terms: ${nlpData.keywords.slice(0, 10).join(', ')}
- Overall priority signal: ${nlpData.priority}

Return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "project_title": "inferred project title",
  "actors": [{"name": "Actor Name", "description": "Role description"}],
  "functional_requirements": [
    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "Core/Auth/Payment/UI/Admin/Notification/..."}
  ],
  "non_functional_requirements": [
    {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}
  ],
  "features": ["feature1", "feature2"],
  "tags": ["keyword1", "keyword2"],
  "moscow": {
    "must_have": ["..."],
    "should_have": ["..."],
    "could_have": ["..."],
    "wont_have": ["..."]
  },
  "ambiguities": ["Any unclear or vague requirements"],
  "priority": "High/Medium/Low"
}`;

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
        { role: 'user', content: `Extract requirements from this ${source} input:\n\n${text.slice(0, 6000)}` },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('DeepSeek API error:', response.status, errText);
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON — handle possible code fences
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(content.slice(start, end + 1));
    throw new Error('Could not parse DeepSeek response as JSON');
  }
}

// ════════════════════════════════════════════
//  FALLBACK: NLP-ONLY mode (no DeepSeek)
//  Used when API key missing or 402 error
// ════════════════════════════════════════════
function nlpOnlyRequirements(text, nlpData) {
  const { sentences, keywords, actorHints, priority, detectedDomain, requirementSentences } = nlpData;

  const actors = actorHints.length > 0
    ? actorHints.map(a => ({ name: a, description: `${a} of the system` }))
    : [{ name: 'User', description: 'Primary end user' }, { name: 'Admin', description: 'System administrator' }];

  // Use requirement-rich sentences as FRs
  const baseSentences = requirementSentences.length > 0 ? requirementSentences : sentences;
  const frs = baseSentences.slice(0, 10).map((s, i) => ({
    id: `FR-${String(i + 1).padStart(3, '0')}`,
    description: s.trim(),
    priority: i < 3 ? 'High' : i < 6 ? 'Medium' : 'Low',
    category: detectedDomain === 'transport' ? 'Transport' :
      detectedDomain === 'ecommerce' ? 'Commerce' : 'Core',
  }));

  const nfrs = [
    { id: 'NFR-001', description: 'System shall respond within 2 seconds for all user actions', priority: 'High' },
    { id: 'NFR-002', description: 'System shall support at least 1000 concurrent users', priority: 'Medium' },
    { id: 'NFR-003', description: 'All sensitive data shall be encrypted in transit and at rest', priority: 'High' },
    { id: 'NFR-004', description: 'System shall have 99.9% uptime (SLA)', priority: 'Medium' },
  ];

  return {
    project_title: `${detectedDomain.charAt(0).toUpperCase() + detectedDomain.slice(1)} System Requirements`,
    actors,
    functional_requirements: frs,
    non_functional_requirements: nfrs,
    features: keywords.slice(0, 6),
    tags: keywords.slice(0, 8),
    moscow: {
      must_have: frs.filter(r => r.priority === 'High').map(r => r.description).slice(0, 4),
      should_have: frs.filter(r => r.priority === 'Medium').map(r => r.description).slice(0, 3),
      could_have: frs.filter(r => r.priority === 'Low').map(r => r.description).slice(0, 3),
      wont_have: ['Third-party integrations (v2)', 'Native mobile app (v1)', 'Offline mode'],
    },
    ambiguities: sentences.length < 2
      ? ['Input text is very brief — consider providing more detail']
      : keywords.length < 3
        ? ['Very few keywords detected — input may need more context']
        : [],
    priority,
    _mode: 'nlp_only',
  };
}

// ════════════════════════════════════════════
//  MAIN API HANDLER
// ════════════════════════════════════════════
export async function POST(request) {
  try {
    const { text, source, senderName } = await request.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text input is required' }, { status: 400 });
    }

    // ── LAYER 2: NLP Preprocessing ──
    const nlpData = nlpPreprocess(text);

    // ── LAYER 3: LLM or fallback ──
    let requirements;
    let mode = 'deepseek';

    const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';

    if (hasKey) {
      try {
        requirements = await callDeepSeek(text, source, nlpData);
      } catch (err) {
        console.warn('DeepSeek failed, falling back to NLP-only mode:', err.message);
        // Graceful fallback — NLP-only still produces real structured output
        requirements = nlpOnlyRequirements(text, nlpData);
        mode = 'nlp_fallback';
      }
    } else {
      requirements = nlpOnlyRequirements(text, nlpData);
      mode = 'nlp_only';
    }

    // Attach NLP metadata to response
    requirements._nlp = {
      keywords: nlpData.keywords,
      domain: nlpData.detectedDomain,
      sentenceCount: nlpData.sentenceCount,
      wordCount: nlpData.wordCount,
      mode,
    };

    // ── Save to MongoDB ──
    const db = await connectDB();
    let savedMessage = null;
    if (db) {
      try {
        savedMessage = await Message.create({
          source: source || 'notes',
          senderName: senderName || 'Unknown',
          content: text,
          tags: requirements.tags || [],
          priority: requirements.priority || 'Medium',
          requirements: {
            functional: (requirements.functional_requirements || []).map(r => r.description || r),
            non_functional: (requirements.non_functional_requirements || []).map(r => r.description || r),
            actors: (requirements.actors || []).map(a => a.name || a),
            features: requirements.features || [],
          },
        });
      } catch (dbErr) {
        console.error('MongoDB save error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      requirements,
      messageId: savedMessage?._id || null,
      mode,
    });

  } catch (err) {
    console.error('Process API error:', err);
    return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
  }
}
