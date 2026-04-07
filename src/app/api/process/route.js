// ════════════════════════════════════════════════════════════════
//  UNIFIED AI PIPELINE — POST /api/process
//
//  Flow:
//    Raw data → Chunk → Mistral (filter) → Merge → Mistral (cards) → DeepSeek (BRD)
//
//  Input:  { project, description, data }
//  Output: { cards, brd }
//
//  SECURITY: Raw data NEVER leaves the local machine.
//            Only structured cards are sent to DeepSeek.
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { filterRelevantData, generateCards } from '@/lib/llmLocal';
import { generateBRD } from '@/lib/llmDeepseek';

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
    console.log(`\n[process] ═══ Pipeline started for "${project}" ═══`);
    console.log(`[process] Input: ${data.length} chars`);

    // ── STAGE 1: Relevance Filtering via Mistral ────────────────
    console.log('[process] Stage 1: Filtering relevant data...');
    let filteredData;
    try {
      filteredData = await filterRelevantData(data, project, description || '');
    } catch (err) {
      console.warn('[process] Mistral filtering failed, using raw data:', err.message);
      filteredData = data; // Graceful fallback — use raw data
    }
    console.log(`[process] Filtered: ${filteredData.length} chars (${Math.round((1 - filteredData.length / data.length) * 100)}% removed)`);

    // ── STAGE 2: Card Generation via Mistral ────────────────────
    console.log('[process] Stage 2: Generating structured cards...');
    let cards;
    try {
      cards = await generateCards(filteredData, project);
    } catch (err) {
      console.warn('[process] Card generation failed:', err.message);
      cards = [];
    }
    console.log(`[process] Generated ${cards.length} card(s)`);

    // ── STAGE 3: BRD Generation via DeepSeek ────────────────────
    //    ONLY cards are sent — raw data stays local
    console.log('[process] Stage 3: Generating BRD via DeepSeek...');
    let brd;
    try {
      brd = await generateBRD(cards, project, description || '');
    } catch (err) {
      console.error('[process] BRD generation failed:', err.message);
      brd = { error: 'BRD generation failed', message: err.message };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[process] ═══ Pipeline complete in ${elapsed}s ═══\n`);

    // ── Response ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      cards,
      brd,
      meta: {
        project,
        description: description || '',
        inputChars: data.length,
        filteredChars: filteredData.length,
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
