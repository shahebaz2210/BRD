import { NextResponse } from 'next/server';
import { generateBRD } from '@/lib/llmDeepseek';

export async function POST(request) {
  try {
    const body = await request.json();
    const { cards, project, description } = body;

    if (!cards || !Array.isArray(cards)) {
      return NextResponse.json({ error: 'Cards array is required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log(`\n[brd-from-cards] ═══ Phase 2: BRD Generation started for "${project}" ═══`);

    let brd;
    try {
      brd = await generateBRD(cards, project, description || '');
    } catch (err) {
      console.error('[brd-from-cards] BRD generation failed:', err.message);
      brd = { error: 'BRD generation failed', message: err.message };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[brd-from-cards] ═══ BRD Generation complete in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      brd,
    });

  } catch (err) {
    console.error('[brd-from-cards] API error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
