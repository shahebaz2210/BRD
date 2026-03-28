import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Brd from '@/models/Brd';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(request) {
  try {
    const body = await request.json();
    
    // ═══ NEW: Accept unified analysis data with conflict resolutions ═══
    const {
      unifiedRequirements,     // pre-analyzed unified requirements from analyze-sources
      conflictResolutions,     // user's choices for each conflict: { conflictId: chosenOptionIndex }
      sourceTexts,             // combined text from all sources
      projectName,             // identified project name
    } = body;

    let brdContent;
    const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';

    // ── If we have unified analysis data from the new flow ──
    if (unifiedRequirements) {
      if (hasKey) {
        try {
          brdContent = await generateUnifiedBrdWithDeepSeek(
            unifiedRequirements,
            conflictResolutions || {},
            sourceTexts || '',
            projectName || 'Software Project'
          );
        } catch (err) {
          console.warn('DeepSeek unified BRD failed, using smart builder:', err.message);
          brdContent = buildUnifiedBrdFromAnalysis(unifiedRequirements, conflictResolutions || {}, projectName);
        }
      } else {
        brdContent = buildUnifiedBrdFromAnalysis(unifiedRequirements, conflictResolutions || {}, projectName);
      }
    } else {
      // ── Legacy flow: gather from DB ──
      let messages = [];
      const db = await connectDB();
      if (db) {
        try {
          messages = await Message.find().sort({ createdAt: -1 }).limit(50).lean();
        } catch { /* DB error */ }
      }

      const requirementsSummary = buildRequirementsSummary(messages);

      if (hasKey) {
        try {
          brdContent = await generateBrdWithDeepSeek(requirementsSummary, messages.length > 0);
        } catch (err) {
          console.warn('DeepSeek BRD failed:', err.message);
          brdContent = generateSmartBrd(requirementsSummary);
        }
      } else {
        brdContent = generateSmartBrd(requirementsSummary);
      }
    }

    // ── Save BRD to MongoDB ──
    const brdData = {
      title: brdContent.title || 'Business Requirements Document',
      projectName: brdContent.project_name || projectName || brdContent.title,
      version: '1.0',
      content: {
        executive_summary: brdContent.executive_summary,
        project_scope: brdContent.project_scope,
        functional_requirements: brdContent.functional_requirements || [],
        non_functional_requirements: brdContent.non_functional_requirements || [],
        actors: brdContent.actors || [],
        moscow: brdContent.moscow || { must_have: [], should_have: [], could_have: [], wont_have: [] },
        assumptions: brdContent.assumptions || [],
        constraints: brdContent.constraints || [],
        acceptance_criteria: brdContent.acceptance_criteria || [],
      },
      status: 'draft',
      rawText: sourceTexts || '',
    };

    let savedBrd;
    const db = await connectDB();
    if (db) {
      try {
        savedBrd = await Brd.create(brdData);
      } catch (dbErr) {
        console.error('MongoDB BRD save error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      brd: {
        id: savedBrd?._id?.toString() || `brd-${Date.now()}`,
        ...brdData,
        createdAt: savedBrd?.createdAt || new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error('Generate BRD error:', err);
    return NextResponse.json({ error: err.message || 'BRD generation failed' }, { status: 500 });
  }
}

// ════════════════════════════════════════════
//  NEW: Generate BRD from unified analysis + conflict resolutions
// ════════════════════════════════════════════
async function generateUnifiedBrdWithDeepSeek(unifiedReqs, resolutions, sourceTexts, projectName) {
  // Apply conflict resolutions to the prompt
  let conflictContext = '';
  if (Object.keys(resolutions).length > 0) {
    conflictContext = `\n\nThe user has resolved the following conflicts:\n`;
    for (const [conflictId, resolution] of Object.entries(resolutions)) {
      conflictContext += `- ${conflictId}: User chose "${resolution.chosen}" (from ${resolution.source})\n`;
    }
  }

  const systemPrompt = `You are a senior Business Analyst. Generate a comprehensive, professional Business Requirements Document (BRD) from the analyzed requirements data.

This data has been consolidated from MULTIPLE sources (emails, chats, meeting transcripts, uploaded documents). The requirements have already been unified and any conflicts have been resolved by the user.
${conflictContext}

Return ONLY a valid JSON object (no markdown, no code fences) with this structure:
{
  "title": "Business Requirements Document",
  "project_name": "${projectName}",
  "executive_summary": "2-3 paragraph executive summary mentioning data was consolidated from multiple sources",
  "project_scope": "Detailed project scope description",
  "actors": [{"name": "...", "description": "..."}],
  "functional_requirements": [
    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "..."}
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
  "assumptions": ["..."],
  "constraints": ["..."],
  "acceptance_criteria": ["..."]
}`;

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a unified BRD from these consolidated requirements:\n\n${JSON.stringify(unifiedReqs, null, 2).slice(0, 6000)}` },
      ],
      temperature: 0.4,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API returned ${response.status}`);

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
    throw new Error('Could not parse DeepSeek BRD response');
  }
}

// ════════════════════════════════════════════
//  Build BRD from unified analysis (no DeepSeek)
// ════════════════════════════════════════════
function buildUnifiedBrdFromAnalysis(unifiedReqs, resolutions, projectName) {
  const frs = unifiedReqs.functional_requirements || [];
  const nfrs = unifiedReqs.non_functional_requirements || [];
  const actors = unifiedReqs.actors || [
    { name: 'End User', description: 'Primary user of the system' },
    { name: 'Admin', description: 'System administrator' },
  ];

  const highFRs = frs.filter(r => r.priority === 'High').map(r => r.description);
  const medFRs = frs.filter(r => r.priority === 'Medium').map(r => r.description);
  const lowFRs = frs.filter(r => r.priority === 'Low').map(r => r.description);

  return {
    title: 'Business Requirements Document',
    project_name: projectName || unifiedReqs.project_title || 'Software Project',
    executive_summary: `This Business Requirements Document consolidates requirements gathered from multiple communication sources including emails, chat conversations, meeting transcripts, and uploaded documents. The AI-powered analysis pipeline has identified, deduplicated, and unified all requirements into a single coherent document.\n\nThe project "${projectName || unifiedReqs.project_title}" encompasses ${frs.length} functional requirements and ${nfrs.length} non-functional requirements. ${Object.keys(resolutions).length > 0 ? `${Object.keys(resolutions).length} conflict(s) between sources were identified and resolved by the project stakeholders.` : 'No conflicts were detected between the sources.'}`,
    project_scope: `The project covers the development of a comprehensive ${(projectName || unifiedReqs.project_title || '').toLowerCase()} with core user-facing features and administrative capabilities. Requirements have been extracted from ${frs.length > 0 ? 'real stakeholder communications' : 'provided inputs'} and prioritized using the MoSCoW framework.`,
    actors,
    functional_requirements: frs.map((fr, i) => ({
      id: fr.id || `FR-${String(i + 1).padStart(3, '0')}`,
      description: fr.description,
      priority: fr.priority || 'Medium',
      category: fr.category || 'Core',
    })),
    non_functional_requirements: nfrs.length > 0 ? nfrs : [
      { id: 'NFR-001', description: 'System shall respond within 2 seconds under normal load', priority: 'High' },
      { id: 'NFR-002', description: 'System shall support 1000+ concurrent users', priority: 'High' },
      { id: 'NFR-003', description: 'All data encrypted using TLS 1.3', priority: 'High' },
      { id: 'NFR-004', description: 'System shall maintain 99.9% uptime SLA', priority: 'Medium' },
    ],
    moscow: unifiedReqs.moscow || {
      must_have: highFRs.slice(0, 4),
      should_have: medFRs.slice(0, 3),
      could_have: lowFRs.slice(0, 3),
      wont_have: ['Mobile native app (v1)', 'AI chatbot', 'Offline mode'],
    },
    assumptions: [
      'Users have access to modern web browsers.',
      'Required third-party APIs will be available and stable.',
      'Development team has necessary technical expertise.',
      'Requirements consolidated from multiple sources represent stakeholder consensus.',
    ],
    constraints: [
      'Project must be delivered within the agreed timeline.',
      'Must comply with applicable data privacy regulations.',
      'Budget limited to approved cloud service tiers.',
    ],
    acceptance_criteria: [
      'All functional requirements pass acceptance testing.',
      'System handles expected concurrent load without errors.',
      'User interfaces are responsive across desktop and mobile.',
      'Security audit passes with no critical vulnerabilities.',
    ],
  };
}

// ════════════════════════════════════════════
//  Legacy helper functions
// ════════════════════════════════════════════
function buildRequirementsSummary(messages) {
  const allFunctional = [];
  const allNonFunctional = [];
  const allActors = new Set();
  const allFeatures = new Set();
  const allText = [];

  messages.forEach(msg => {
    allText.push(msg.content);
    (msg.requirements?.functional || []).forEach(r => allFunctional.push(r));
    (msg.requirements?.non_functional || []).forEach(r => allNonFunctional.push(r));
    (msg.requirements?.actors || []).forEach(a => allActors.add(a));
    (msg.requirements?.features || []).forEach(f => allFeatures.add(f));
  });

  return {
    functional_requirements: allFunctional,
    non_functional_requirements: allNonFunctional,
    actors: [...allActors],
    features: [...allFeatures],
    raw_text: allText.join('\n\n'),
  };
}

async function generateBrdWithDeepSeek(requirementsSummary, hasMessages) {
  const systemPrompt = `You are a senior Business Analyst. Generate a comprehensive, professional Business Requirements Document (BRD) from the provided requirements data.\n\nReturn ONLY a valid JSON object (no markdown, no code fences) with this structure:\n{\n  "title": "Project title",\n  "project_name": "Project name",\n  "executive_summary": "2-3 paragraph executive summary",\n  "project_scope": "Detailed project scope description",\n  "actors": [{"name": "...", "description": "..."}],\n  "functional_requirements": [\n    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "..."}\n  ],\n  "non_functional_requirements": [\n    {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}\n  ],\n  "moscow": {\n    "must_have": ["..."],\n    "should_have": ["..."],\n    "could_have": ["..."],\n    "wont_have": ["..."]\n  },\n  "assumptions": ["..."],\n  "constraints": ["..."],\n  "acceptance_criteria": ["..."]\n}`;

  const userMsg = hasMessages
    ? `Generate a BRD from these collected requirements:\n\n${JSON.stringify(requirementsSummary, null, 2)}`
    : `Generate a sample/demo BRD for a modern web application project.`;

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      temperature: 0.4,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);

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
    throw new Error('Could not parse DeepSeek BRD response');
  }
}

function generateSmartBrd(data) {
  const hasFRs = data.functional_requirements?.length > 0;
  const hasActors = data.actors?.length > 0;

  const functionalReqs = hasFRs
    ? data.functional_requirements.slice(0, 10).map((desc, i) => ({
        id: `FR-${String(i + 1).padStart(3, '0')}`,
        description: typeof desc === 'string' ? desc : desc.description,
        priority: i < 3 ? 'High' : i < 6 ? 'Medium' : 'Low',
        category: 'Core',
      }))
    : [
        { id: 'FR-001', description: 'Users shall be able to register and log in', priority: 'High', category: 'Auth' },
        { id: 'FR-002', description: 'Users shall browse and search services', priority: 'High', category: 'Core' },
        { id: 'FR-003', description: 'Users shall book services and get confirmation', priority: 'High', category: 'Booking' },
        { id: 'FR-004', description: 'Real-time notifications for updates', priority: 'Medium', category: 'Notifications' },
        { id: 'FR-005', description: 'Payment processing via UPI/cards', priority: 'High', category: 'Payment' },
        { id: 'FR-006', description: 'Admin dashboard for analytics', priority: 'High', category: 'Admin' },
      ];

  const actors = hasActors
    ? data.actors.map(a => ({ name: typeof a === 'string' ? a : a.name, description: `${typeof a === 'string' ? a : a.name} of the system` }))
    : [{ name: 'End User', description: 'Primary user' }, { name: 'Admin', description: 'System administrator' }];

  const highFRs = functionalReqs.filter(r => r.priority === 'High').map(r => r.description);
  const medFRs = functionalReqs.filter(r => r.priority === 'Medium').map(r => r.description);
  const lowFRs = functionalReqs.filter(r => r.priority === 'Low').map(r => r.description);

  return {
    title: 'Business Requirements Document',
    project_name: 'AI-Driven Service Platform',
    executive_summary: 'This BRD outlines requirements for an AI-Driven Service Platform extracted from stakeholder communications using NLP and AI pipelines.',
    project_scope: 'Full-stack web application with responsive frontend, API backend, MongoDB, and third-party integrations.',
    actors,
    functional_requirements: functionalReqs,
    non_functional_requirements: [
      { id: 'NFR-001', description: 'Response time under 2 seconds', priority: 'High' },
      { id: 'NFR-002', description: 'Support 1000+ concurrent users', priority: 'High' },
      { id: 'NFR-003', description: 'TLS 1.3 encryption', priority: 'High' },
      { id: 'NFR-004', description: '99.9% uptime SLA', priority: 'Medium' },
    ],
    moscow: {
      must_have: highFRs.slice(0, 4),
      should_have: medFRs.slice(0, 3),
      could_have: lowFRs.slice(0, 3),
      wont_have: ['Mobile native app (v1)', 'AI chatbot', 'Offline mode'],
    },
    assumptions: ['Modern browsers available', 'APIs stable', 'Team has Next.js expertise'],
    constraints: ['Academic timeline', 'Free-tier services', 'GDPR compliance'],
    acceptance_criteria: ['Users can register & login', 'Admin dashboard works', 'Payments complete in 5s', 'Load test passes'],
  };
}
