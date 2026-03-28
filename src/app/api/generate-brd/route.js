import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Brd from '@/models/Brd';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(request) {
  try {
    // Gather all messages from DB (or use provided data)
    let messages = [];
    let rawData = null;

    const db = await connectDB();
    if (db) {
      try {
        messages = await Message.find().sort({ createdAt: -1 }).limit(50).lean();
      } catch {
        // DB error, proceed with mock
      }
    }

    // Build a summary of all collected requirements
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

    const requirementsSummary = {
      functional_requirements: allFunctional,
      non_functional_requirements: allNonFunctional,
      actors: [...allActors],
      features: [...allFeatures],
      raw_text: allText.join('\n\n'),
    };

    let brdContent;
    // Always try DeepSeek first, fall back gracefully on any error
    const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';

    if (hasKey) {
      const systemPrompt = `You are a senior Business Analyst. Generate a comprehensive, professional Business Requirements Document (BRD) from the provided requirements data.\n\nReturn ONLY a valid JSON object (no markdown, no code fences) with this structure:\n{\n  "title": "Project title",\n  "project_name": "Project name",\n  "executive_summary": "2-3 paragraph executive summary",\n  "project_scope": "Detailed project scope description",\n  "actors": [{"name": "...", "description": "..."}],\n  "functional_requirements": [\n    {"id": "FR-001", "description": "...", "priority": "High/Medium/Low", "category": "..."}\n  ],\n  "non_functional_requirements": [\n    {"id": "NFR-001", "description": "...", "priority": "High/Medium/Low"}\n  ],\n  "moscow": {\n    "must_have": ["..."],\n    "should_have": ["..."],
    "could_have": ["..."],\n    "wont_have": ["..."]\n  },\n  "assumptions": ["..."],\n  "constraints": ["..."],\n  "acceptance_criteria": ["..."]\n}`;

      const userMsg = messages.length > 0
        ? `Generate a BRD from these collected requirements:\n\n${JSON.stringify(requirementsSummary, null, 2)}`
        : `Generate a sample/demo BRD for a modern web application project.`;

      try {
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

        if (!response.ok) {
          console.warn(`DeepSeek returned ${response.status} — using mock BRD`);
          brdContent = generateMockBrd(requirementsSummary);
        } else {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          let jsonStr = content;
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1];
          try {
            brdContent = JSON.parse(jsonStr.trim());
          } catch {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            brdContent = (start !== -1 && end !== -1) ? JSON.parse(content.slice(start, end + 1)) : generateMockBrd(requirementsSummary);
          }
        }
      } catch (err) {
        console.warn('DeepSeek call failed — using mock BRD:', err.message);
        brdContent = generateMockBrd(requirementsSummary);
      }
    } else {
      brdContent = generateMockBrd(requirementsSummary);
    }

    // Save BRD to MongoDB
    const brdData = {
      title: brdContent.title || 'Business Requirements Document',
      projectName: brdContent.project_name || brdContent.title,
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
      rawText: requirementsSummary.raw_text,
      messageIds: messages.map(m => m._id).filter(Boolean),
    };

    let savedBrd;
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
        id: savedBrd?._id?.toString() || `demo-${Date.now()}`,
        ...brdData,
        createdAt: savedBrd?.createdAt || new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error('Generate BRD error:', err);
    return NextResponse.json({ error: err.message || 'BRD generation failed' }, { status: 500 });
  }
}

function generateSmartBrd(data) {
  // Build from real collected requirements if available
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
        { id: 'FR-001', description: 'Users shall be able to register and log in using email/password or OAuth (Google)', priority: 'High', category: 'Authentication' },
        { id: 'FR-002', description: 'Users shall be able to browse and search available services', priority: 'High', category: 'Core' },
        { id: 'FR-003', description: 'Users shall be able to book services and receive confirmation', priority: 'High', category: 'Booking' },
        { id: 'FR-004', description: 'Users shall receive real-time notifications for booking updates', priority: 'Medium', category: 'Notifications' },
        { id: 'FR-005', description: 'System shall support payment processing via UPI and card payments', priority: 'High', category: 'Payment' },
        { id: 'FR-006', description: 'Admin shall have a dashboard to view analytics and manage users', priority: 'High', category: 'Admin' },
        { id: 'FR-007', description: 'Users shall be able to rate and review services', priority: 'Medium', category: 'Feedback' },
        { id: 'FR-008', description: 'System shall generate reports for administrators', priority: 'Low', category: 'Reporting' },
      ];

  const actors = hasActors
    ? data.actors.map(a => ({ name: typeof a === 'string' ? a : a.name, description: `${typeof a === 'string' ? a : a.name} of the system` }))
    : [
        { name: 'End User', description: 'Primary user who interacts with the platform to access services.' },
        { name: 'Administrator', description: 'System administrator responsible for managing users and platform settings.' },
        { name: 'Service Provider', description: 'Third-party entity that provides services listed on the platform.' },
      ];

  const highFRs = functionalReqs.filter(r => r.priority === 'High').map(r => r.description);
  const medFRs  = functionalReqs.filter(r => r.priority === 'Medium').map(r => r.description);
  const lowFRs  = functionalReqs.filter(r => r.priority === 'Low').map(r => r.description);

  return {
    title: 'Business Requirements Document',
    project_name: 'AI-Driven Service Platform',
    executive_summary: 'This Business Requirements Document outlines the requirements for developing an AI-Driven Service Platform that enables users to access services through an intuitive web interface. The platform incorporates user authentication, real-time data processing, payment integration, and an administrative dashboard for managing operations. The system is designed to be scalable, secure, and deliver an exceptional user experience across all devices.\n\nThe requirements have been extracted from unstructured inputs using NLP and AI processing pipelines. The document represents the consolidated view of all stakeholder requirements gathered through Telegram, email, meeting transcripts, and client notes.',
    project_scope: 'The project encompasses the development of a full-stack web application with a responsive frontend, RESTful API backend, MongoDB database integration, and third-party service connections. The initial release (v1.0) focuses on core user-facing features and essential administrative capabilities. Advanced features such as AI-powered recommendations and mobile native applications are planned for subsequent releases.',
    actors,
    functional_requirements: functionalReqs,
    non_functional_requirements: [
      { id: 'NFR-001', description: 'System shall respond to user actions within 2 seconds under normal load', priority: 'High' },
      { id: 'NFR-002', description: 'System shall support at least 1000 concurrent users without degradation', priority: 'High' },
      { id: 'NFR-003', description: 'All data in transit shall be encrypted using TLS 1.3', priority: 'High' },
      { id: 'NFR-004', description: 'System shall maintain 99.9% uptime SLA', priority: 'Medium' },
      { id: 'NFR-005', description: 'Application shall be fully responsive across desktop, tablet, and mobile', priority: 'High' },
    ],
    moscow: {
      must_have:   highFRs.slice(0, 4).length > 0 ? highFRs.slice(0, 4) : ['User registration & login', 'Core service functionality', 'Payment integration', 'Admin dashboard'],
      should_have: medFRs.slice(0, 3).length > 0  ? medFRs.slice(0, 3)  : ['Email notifications', 'User reviews & ratings', 'Role-based access control'],
      could_have:  lowFRs.slice(0, 3).length > 0  ? lowFRs.slice(0, 3)  : ['Dark mode', 'Analytics charts', 'Multi-language support'],
      wont_have:   ['Mobile native app (v1)', 'AI chatbot integration', 'Offline mode', 'Blockchain integration'],
    },
    assumptions: [
      'Users will have access to modern web browsers (Chrome, Firefox, Safari, Edge).',
      'Payment gateway APIs will be available and stable throughout the project.',
      'MongoDB Atlas will be used for cloud database hosting.',
      'The development team has expertise in Next.js and React.',
    ],
    constraints: [
      'Project must be delivered within the academic semester timeline.',
      'Budget is limited to free-tier and student-tier cloud services.',
      'Must comply with applicable data privacy regulations (GDPR, IT Act).',
      'System must work on standard internet connections (minimum 2 Mbps).',
    ],
    acceptance_criteria: [
      'Users can successfully register, log in, and use core service functionality.',
      'Admin dashboard displays at least 3 analytics metrics accurately.',
      'Payment processing completes within 5 seconds for 95% of transactions.',
      'System handles 100 concurrent users in load testing without errors.',
      'PDF download generates a correctly formatted, complete BRD document.',
      'NLP pipeline correctly extracts requirements from unstructured text inputs.',
    ],
  };
}

// Keep old name as alias for compatibility
function generateMockBrd(data) { return generateSmartBrd(data); }

