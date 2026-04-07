// ════════════════════════════════════════════════════════════════
//  AUTO-GENERATE — One-click BRD generation
//
//  Input:  { project, description, telegramToken?, googleAccessToken? }
//  Flow:   Aggregate ALL sources → Mistral filter → Mistral cards → DeepSeek BRD
//  Output: { cards, brd, meta }
//
//  User ONLY provides project name + description.
//  Everything else is automatic.
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { filterRelevantData, generateCards } from '@/lib/llmLocal';
import { generateBRD } from '@/lib/llmDeepseek';

export async function POST(request) {
  try {
    const body = await request.json();
    const { project, description, telegramToken, googleAccessToken } = body;

    if (!project || !project.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log(`\n[auto-generate] ═══ Full pipeline for "${project}" ═══`);

    // ── STEP 1: Aggregate all sources ───────────────────────────
    console.log('[auto-generate] Step 1: Aggregating all sources...');
    const baseUrl = request.nextUrl.origin;
    const aggRes = await fetch(`${baseUrl}/api/aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, description, telegramToken, googleAccessToken }),
    });

    const aggData = await aggRes.json();
    if (!aggRes.ok || !aggData.success) {
      return NextResponse.json({
        error: aggData.error || 'Aggregation failed — no data from any source',
        sourceMeta: aggData.meta || aggData.sourceMeta || {},
      }, { status: 400 });
    }

    const rawData = aggData.data;
    console.log(`[auto-generate] Aggregated ${rawData.length} chars from ${aggData.meta.totalSources} source(s)`);

    // ── STEP 2: Filter relevant data via Mistral ────────────────
    console.log('[auto-generate] Step 2: Filtering with Mistral...');
    let filteredData;
    try {
      filteredData = await filterRelevantData(rawData, project, description || '');
    } catch (err) {
      console.warn('[auto-generate] Mistral filter failed, using raw:', err.message);
      filteredData = rawData;
    }
    const removalPct = Math.round((1 - filteredData.length / rawData.length) * 100);
    console.log(`[auto-generate] Filtered: ${filteredData.length} chars (${removalPct}% noise removed)`);

    // ── STEP 3: Generate cards via Mistral ──────────────────────
    console.log('[auto-generate] Step 3: Generating cards...');
    let cards;
    try {
      cards = await generateCards(filteredData, project);
    } catch (err) {
      console.warn('[auto-generate] Card generation failed:', err.message);
      cards = [];
    }
    console.log(`[auto-generate] Generated ${cards.length} card(s)`);

    // ── STEP 4: Generate BRD via DeepSeek ───────────────────────
    console.log('[auto-generate] Step 4: Generating BRD via DeepSeek...');
    let brd;
    try {
      brd = await generateBRD(cards, project, description || '');
    } catch (err) {
      console.error('[auto-generate] BRD generation failed:', err.message);
      brd = { error: 'BRD generation failed', message: err.message };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[auto-generate] ═══ Complete in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      cards,
      brd,
      meta: {
        project,
        description: description || '',
        sources: aggData.meta,
        inputChars: rawData.length,
        filteredChars: filteredData.length,
        noiseRemovedPercent: removalPct,
        cardCount: cards.length,
        pipelineDurationSeconds: parseFloat(elapsed),
      },
    });

  } catch (err) {
    console.error('[auto-generate] Error:', err);
    return NextResponse.json({ error: err.message || 'Auto-generate failed' }, { status: 500 });
  }
}
