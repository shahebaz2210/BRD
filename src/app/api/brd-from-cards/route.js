// ════════════════════════════════════════════════════════════════
//  BRD FROM CARDS — POST /api/brd-from-cards
//  Stage 2: DeepSeek generates BRD from curated cards
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { generateBRD } from '@/lib/llmUnified';

export async function POST(request) {
  try {
    const body = await request.json();
    const { cards, project, description } = body;

    if (!cards || !Array.isArray(cards)) {
      return NextResponse.json({ error: 'Cards array is required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log(`\n[brd-from-cards] ═══ DeepSeek BRD generation for "${project}" ═══`);

    let brd;
    try {
      brd = await generateBRD(cards, project, description || '');
    } catch (err) {
      console.error('[brd-from-cards] DeepSeek BRD generation failed:', err.message);
      brd = { error: 'BRD generation failed', message: err.message };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[brd-from-cards] ═══ BRD complete in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      brd,
    });

  } catch (err) {
    console.error('[brd-from-cards] API error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
