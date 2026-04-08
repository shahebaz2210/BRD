// ════════════════════════════════════════════════════════════════
//  UNIFIED AI PIPELINE — POST /api/process
//
//  Flow:
//    Raw data → GPT-OSS-120B (cards) → DeepSeek (BRD)
//
//  Input:  { project, description, data }
//  Output: { cards, brd }
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { processData } from '@/lib/llmUnified';

export async function POST(request) {
  try {
    const body = await request.json();
    const { project, description, data } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!project || !project.trim()) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }
    if (!data || !data.trim()) {
      return NextResponse.json(
        { error: 'Data input is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    console.log(`\n[process] ═══ Dual-model pipeline started for "${project}" ═══`);
    console.log(`[process] Input: ${data.length} chars`);

    // ── DUAL-MODEL PIPELINE ─────────────────────────────────────
    // Stage 1: GPT-OSS-120B → Cards
    // Stage 2: DeepSeek → BRD
    let result;
    try {
      result = await processData(data, project, description || '');
    } catch (err) {
      console.error('[process] Pipeline failed:', err.message);
      return NextResponse.json(
        { error: 'Processing failed: ' + err.message },
        { status: 500 }
      );
    }

    const { cards, brd } = result;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[process] Generated ${cards.length} card(s) + BRD`);
    console.log(`[process] ═══ Pipeline complete in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      cards,
      brd,
      meta: {
        project,
        description: description || '',
        inputChars: data.length,
        cardCount: cards.length,
        pipelineDurationSeconds: parseFloat(elapsed),
      },
    });

  } catch (err) {
    console.error('[process] Pipeline error:', err);
    return NextResponse.json(
      { error: err.message || 'Processing failed' },
      { status: 500 }
    );
  }
}
