// ════════════════════════════════════════════════════════════════
//  AUTO-GENERATE — One-click BRD generation
//
//  Input:  { project, description, telegramToken?, googleAccessToken? }
//  Flow:   Aggregate ALL sources → GPT-OSS (cards) → DeepSeek (BRD)
//  Output: { cards, brd, meta }
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { processData } from '@/lib/llmUnified';

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

    // ── STEP 2: Dual-model pipeline ─────────────────────────────
    // GPT-OSS-120B → Cards → DeepSeek → BRD
    console.log('[auto-generate] Step 2: Running dual-model pipeline...');
    let result;
    try {
      result = await processData(rawData, project, description || '');
    } catch (err) {
      console.error('[auto-generate] Pipeline failed:', err.message);
      return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
    }

    const { cards, brd } = result;

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
        cardCount: cards.length,
        pipelineDurationSeconds: parseFloat(elapsed),
      },
    });

  } catch (err) {
    console.error('[auto-generate] Error:', err);
    return NextResponse.json({ error: err.message || 'Auto-generate failed' }, { status: 500 });
  }
}
