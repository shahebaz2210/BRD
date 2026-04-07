import { NextResponse } from 'next/server';
import { filterRelevantData, generateCards } from '@/lib/llmLocal';

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
    console.log(`\n[generate-cards] ═══ Stage 1: Filtering started for "${project}" ═══`);

    let filteredData;
    try {
      filteredData = await filterRelevantData(data, project, description || '');
    } catch (err) {
      console.warn('[generate-cards] Mistral filtering failed, using raw data:', err.message);
      filteredData = data; 
    }

    console.log('[generate-cards] Stage 2: Generating structured cards...');
    let cards;
    try {
      cards = await generateCards(filteredData, project);
    } catch (err) {
      console.warn('[generate-cards] Card generation failed:', err.message);
      cards = [];
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[generate-cards] ═══ Cards complete in ${elapsed}s ═══\n`);

    return NextResponse.json({
      success: true,
      cards,
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
    console.error('[generate-cards] Pipeline error:', err);
    return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
  }
}
