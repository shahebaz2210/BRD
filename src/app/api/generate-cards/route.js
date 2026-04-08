// ════════════════════════════════════════════════════════════════
//  GENERATE CARDS — POST /api/generate-cards
//  Stage 1: GPT-OSS-120B extracts structured cards from raw data
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { extractCards } from '@/lib/llmUnified';

export async function POST(request) {
  try {
    const body = await request.json();
    const { project, description, data } = body;

    if (!project || !project.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }
    if (!data || !data.trim()) {
      return NextResponse.json({ error: 'Data input is required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log(`\n[generate-cards] ═══ GPT-OSS card extraction for "${project}" ═══`);

    let cards;
    try {
      cards = await extractCards(data, project, description || '');
    } catch (err) {
      console.error('[generate-cards] GPT-OSS extraction failed:', err.message);
      return NextResponse.json({ error: err.message || 'Card extraction failed' }, { status: 500 });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[generate-cards] ═══ ${cards.length} cards in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      cards,
      meta: {
        project,
        description: description || '',
        inputChars: data.length,
        cardCount: cards.length,
        pipelineDurationSeconds: parseFloat(elapsed),
      },
    });

  } catch (err) {
    console.error('[generate-cards] Pipeline error:', err);
    return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
  }
}
