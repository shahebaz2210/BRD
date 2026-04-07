// ════════════════════════════════════════════════════════════════
//  LOCAL LLM MODULE — Mistral 7B via Ollama
//  Stage 1: Relevance Filtering
//  Stage 2: Structured Card Generation
// ════════════════════════════════════════════════════════════════

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = 'mistral';
const CHUNK_SIZE = 1000;
const OLLAMA_TIMEOUT_MS = 60000; // 60-second timeout per call

// ── Quick connectivity check ────────────────────────────────────
let _ollamaAvailable = null; // cache within same request lifecycle
async function isOllamaRunning() {
  if (_ollamaAvailable !== null) return _ollamaAvailable;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    _ollamaAvailable = res.ok;
  } catch {
    _ollamaAvailable = false;
  }
  console.log(`[llmLocal] Ollama available: ${_ollamaAvailable}`);
  return _ollamaAvailable;
}

// ── Ollama Chat Helper (with timeout) ───────────────────────────
async function ollamaChat(messages, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
          options: { temperature: 0.2 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama returned ${res.status}: ${errText}`);
      }

      const data = await res.json();
      return data.message?.content || '';
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Ollama request timed out (15s) — is Ollama running?');
      }
      if (attempt === retries) throw err;
      console.warn(`Ollama attempt ${attempt + 1} failed, retrying...`, err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ── Source Detection ────────────────────────────────────────────
function detectSource(text) {
  if (/\[TELEGRAM\]/i.test(text)) return 'chat';
  if (/\[GMAIL\]/i.test(text)) return 'email';
  if (/\[MEETING\]/i.test(text)) return 'meeting';
  return 'unknown';
}

// ── Chunking System ─────────────────────────────────────────────
function chunkText(text, maxLen = CHUNK_SIZE) {
  const chunks = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Fallback: if a single chunk is still too long, hard-split it
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      result.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxLen) {
        result.push(chunk.slice(i, i + maxLen));
      }
    }
  }
  return result;
}

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
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  STAGE 1 — RELEVANCE FILTERING
//  Sends each chunk to Mistral to keep only project-relevant text
// ════════════════════════════════════════════════════════════════
async function filterRelevantData(data, project, description) {
  // Fast-fail if Ollama isn't running
  const available = await isOllamaRunning();
  if (!available) {
    console.warn('[llmLocal] Ollama not running — skipping relevance filtering');
    return data; // Return data as-is
  }

  const chunks = chunkText(data, 1000); // Smaller chunks for faster processing
  console.log(`[llmLocal] Filtering ${chunks.length} chunk(s) for project "${project}"`);

  const filterChunk = async (chunk) => {
    const prompt = `You are filtering data for a software project.

Project Name: "${project}"
Project Description: "${description}"

Below is raw text from emails, chat messages, or meeting transcripts.
Your job: Keep ONLY the sentences and paragraphs that discuss:
- Features, requirements, or functionality for this project
- Technical decisions (tech stack, architecture, database, API)
- Deadlines, milestones, or timelines
- Stakeholders, team members, or responsibilities
- Bugs, issues, risks, or blockers
- Any discussion about building, designing, or planning this project

REMOVE:
- Email signatures, disclaimers, and footers
- Unrelated greetings or small talk
- Content clearly about a DIFFERENT project/topic
- Auto-generated email headers

Output ONLY the relevant text. No explanations. No "Here is the filtered text" prefix.
If EVERYTHING in the input is relevant, return it all.
If NOTHING is relevant, return the single word: EMPTY

Input:
${chunk}`;

    try {
      const result = await ollamaChat([
        { role: 'system', content: 'You extract project-relevant content from raw communications. Return only the relevant text.' },
        { role: 'user', content: prompt },
      ]);
      const trimmed = result.trim();
      // If Mistral says nothing is relevant, return empty
      if (trimmed === 'EMPTY' || trimmed.length < 5) return '';
      return trimmed;
    } catch (err) {
      console.warn('[llmLocal] Filter chunk failed:', err.message);
      return chunk; // Keep original on error
    }
  };

  // Process chunks sequentially (2 at a time) to avoid overloading Ollama
  const filtered = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const batch = chunks.slice(i, i + 2).map(filterChunk);
    const results = await Promise.all(batch);
    filtered.push(...results);
  }

  // Merge non-empty results
  const result = filtered.filter(t => t && t.length > 0).join('\n\n');
  // If filtering removed everything, return original data
  if (result.length < 50) {
    console.warn('[llmLocal] Filtering removed too much data, using original');
    return data;
  }
  return result;
}

// ════════════════════════════════════════════════════════════════
//  STAGE 2 — CARD GENERATION
//  Converts filtered text into structured JSON cards
// ════════════════════════════════════════════════════════════════
async function generateCards(filteredData, project) {
  // Fast-fail if Ollama isn't running
  const available = await isOllamaRunning();
  if (!available) {
    console.warn('[llmLocal] Ollama not running — using basic card extraction');
    return buildBasicCards(filteredData, project);
  }

  // Detect sources present in the data
  const defaultSource = detectSource(filteredData);

  const prompt = `Extract structured requirement cards from this project data.

Project: "${project}"

Read the text below carefully. For each distinct requirement, feature, decision, deadline, stakeholder, or issue mentioned, create a card.

Return a JSON array like this (return AT LEAST 3 cards):
[
  {"type": "requirement", "content": "Users must be able to login via Google OAuth", "source": "email"},
  {"type": "timeline", "content": "MVP deadline is March 28", "source": "chat"},
  {"type": "stakeholder", "content": "Priya is the project lead", "source": "meeting"}
]

Card types: requirement, stakeholder, timeline, decision, issue
Source types: chat, email, meeting

IMPORTANT: Return ONLY the JSON array. No explanation text before or after.

Project Data:
${filteredData.slice(0, 8000)}`;

  let raw;
  try {
    raw = await ollamaChat([
      { role: 'system', content: 'You extract structured data. Return ONLY a valid JSON array. No text before or after.' },
      { role: 'user', content: prompt },
    ]);
  } catch (err) {
    console.error('[llmLocal] Card generation LLM call failed:', err.message);
    return buildBasicCards(filteredData, project);
  }

  // Parse with retry
  let cards = safeParseJSON(raw);
  if (!cards) {
    console.warn('[llmLocal] First JSON parse failed, retrying...');
    try {
      raw = await ollamaChat([
        { role: 'system', content: 'You MUST return ONLY a valid JSON array. No text, no markdown, no explanation.' },
        { role: 'user', content: `Fix this into a valid JSON array of cards:\n${raw}` },
      ]);
      cards = safeParseJSON(raw);
    } catch {
      // ignore retry error
    }
  }

  // Final fallback — use basic extraction instead of empty
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    console.warn('[llmLocal] Mistral card generation failed — falling back to basic extraction');
    return buildBasicCards(filteredData, project);
  }

  // Ensure every card has required fields and fix source based on tags
  return cards.map(card => ({
    type: card.type || 'requirement',
    content: card.content || '',
    source: card.source || defaultSource || 'unknown',
  }));
}

// ── Basic card extraction (no LLM needed) ──────────────────────
function buildBasicCards(text, project) {
  const cards = [];
  
  // Detect which source sections exist
  const hasGmail = /\[GMAIL\]/i.test(text);
  const hasTelegram = /\[TELEGRAM\]/i.test(text);
  const hasMeeting = /\[MEETING\]/i.test(text);

  // Split by sections and process each
  const sections = text.split(/\[(?:GMAIL|TELEGRAM|MEETING)\]/i);
  
  for (const section of sections) {
    const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    
    for (const line of lines) {
      // Skip metadata lines
      if (/^(From:|Subject:|Document:|---$)/i.test(line)) continue;
      if (/^(To:|Date:|Cc:|Bcc:)/i.test(line)) continue;
      if (line.length > 500) continue; // Skip very long lines (likely HTML noise)
      
      // Detect card type from keywords
      let type = 'requirement';
      if (/deadline|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|monday|friday|week|sprint)/i.test(line)) type = 'timeline';
      else if (/decide|agreed|confirmed|approved|selected|chose|go with/i.test(line)) type = 'decision';
      else if (/issue|bug|problem|risk|blocker|concern|challenge|failed/i.test(line)) type = 'issue';
      else if (/stakeholder|client|team|manager|lead|responsible|owner|assigned/i.test(line)) type = 'stakeholder';
      else if (/need|must|should|require|implement|feature|support|integrate|build|create|develop|design|add|enable/i.test(line)) type = 'requirement';
      else continue; // Skip lines without any actionable keyword

      // Determine source
      let source = 'unknown';
      if (hasGmail) source = 'email';
      else if (hasTelegram) source = 'chat';
      else if (hasMeeting) source = 'meeting';

      // Clean up content
      let content = line
        .replace(/^\w+[\w\s]*?:\s*/, '') // Remove "Name: " prefixes
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();
      
      if (content.length > 15 && content.length < 300) {
        cards.push({ type, content: content.slice(0, 200), source });
      }
    }
  }

  // Deduplicate by content similarity
  const seen = new Set();
  const unique = cards.filter(c => {
    const key = c.content.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // If still no meaningful cards, create from project name
  if (unique.length === 0) {
    unique.push(
      { type: 'requirement', content: `Build ${project} system as described by stakeholders`, source: hasGmail ? 'email' : 'unknown' },
      { type: 'requirement', content: 'System should implement core functional requirements from project discussions', source: hasGmail ? 'email' : 'unknown' },
      { type: 'requirement', content: 'System should meet security and performance standards', source: 'unknown' },
    );
  }

  console.log(`[llmLocal] Basic extraction: ${unique.length} cards from ${text.length} chars`);
  return unique.slice(0, 25); // Cap at 25 cards
}

export { filterRelevantData, generateCards, chunkText, detectSource, safeParseJSON, isOllamaRunning };
