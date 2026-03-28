import { NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// ════════════════════════════════════════════
//  IMAGE → TEXT via Kimi Vision (Moonshot AI)
//  Kimi k2.5 supports multimodal vision input
// ════════════════════════════════════════════
async function extractTextFromImage(base64Data, mimeType) {
  const hasKimiKey = KIMI_API_KEY && KIMI_API_KEY !== 'your_kimi_api_key_here';

  if (hasKimiKey) {
    try {
      console.log('[Kimi Vision] Processing image via Moonshot AI...');
      const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'kimi-k2.5',
          messages: [
            {
              role: 'system',
              content: `You are an expert document reader and OCR specialist. Extract ALL text content from the provided image with high accuracy. Also identify:
1. Any diagrams, flowcharts, or visual elements and describe them
2. Requirements, action items, or decisions mentioned
3. UI mockups or wireframes if present
Return the extracted text in a clear, structured format.`,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract ALL visible text from this image. Include any diagrams, charts, tables, handwritten notes, or UI elements. Be thorough and accurate.',
                },
              ],
            },
          ],
          temperature: 0.2,
          max_tokens: 4000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const extracted = data.choices?.[0]?.message?.content;
        if (extracted) {
          console.log('[Kimi Vision] ✅ Successfully extracted text from image');
          return `[🔍 Extracted via Kimi Vision AI]\n\n${extracted}`;
        }
      } else {
        const errText = await response.text();
        console.warn('[Kimi Vision] API error:', response.status, errText);
      }
    } catch (err) {
      console.warn('[Kimi Vision] Failed:', err.message);
    }
  }

  // Fallback: DeepSeek (text-only, limited)
  const hasDeepSeekKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';
  if (hasDeepSeekKey) {
    try {
      console.log('[DeepSeek Fallback] Attempting image description...');
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant. The user uploaded an image but vision is unavailable. Provide a helpful template for them to fill in the text from their image.',
            },
            {
              role: 'user',
              content: `An image file (${mimeType}) was uploaded. Please provide a structured template for transcribing image content including: headings, body text, tables, diagrams, and action items.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return `[⚠️ Kimi Vision unavailable — DeepSeek fallback]\n\n${data.choices?.[0]?.message?.content || 'Could not process image.'}`;
      }
    } catch (err) {
      console.warn('[DeepSeek Fallback] Failed:', err.message);
    }
  }

  return `[Image uploaded: ${mimeType}]\n\n⚠️ No vision API configured.\nTo enable image-to-text extraction, add your Kimi API key (KIMI_API_KEY) in environment variables.\nGet one at: https://platform.moonshot.ai`;
}

// ════════════════════════════════════════════
//  AUDIO → TEXT via NVIDIA Nemotron (NIM API)
//  Uses NVIDIA's ASR (Automatic Speech Recognition)
// ════════════════════════════════════════════
async function extractTextFromAudio(base64Data, mimeType, fileName) {
  const hasNvidiaKey = NVIDIA_API_KEY && NVIDIA_API_KEY !== 'your_nvidia_api_key_here';

  if (hasNvidiaKey) {
    try {
      console.log('[NVIDIA Nemotron] Processing audio via NIM ASR...');

      // NVIDIA NIM cloud API — OpenAI-compatible transcription endpoint
      const audioBuffer = Buffer.from(base64Data, 'base64');

      // Create FormData with the audio file
      const FormData = (await import('node:buffer')).FormData || globalThis.FormData;
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', blob, fileName);
      formData.append('model', 'nvidia/parakeet-ctc-1.1b-asr');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      const response = await fetch('https://integrate.api.nvidia.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const transcript = data.text || data.transcript || '';
        if (transcript) {
          console.log('[NVIDIA Nemotron] ✅ Successfully transcribed audio');
          return `[🎙️ Transcribed via NVIDIA Nemotron ASR]\n\n${transcript}`;
        }
      } else {
        const errText = await response.text();
        console.warn('[NVIDIA Nemotron] API error:', response.status, errText);

        // Try alternative: use NVIDIA NIM LLM to process audio context
        return await nemotronLLMFallback(fileName, mimeType);
      }
    } catch (err) {
      console.warn('[NVIDIA Nemotron] ASR failed:', err.message);
      // Try LLM fallback
      return await nemotronLLMFallback(fileName, mimeType);
    }
  }

  // Fallback: DeepSeek text-based assistance
  const hasDeepSeekKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';
  if (hasDeepSeekKey) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `The user uploaded an audio file "${fileName}" (${mimeType}). Since audio processing requires NVIDIA Nemotron, provide a structured meeting transcript template they can fill in.`,
            },
            {
              role: 'user',
              content: `Audio file "${fileName}" uploaded. Please provide a template for transcription with speaker labels, timestamps, and action items.`,
            },
          ],
          temperature: 0.4,
          max_tokens: 2000,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return `[⚠️ NVIDIA Nemotron unavailable — DeepSeek fallback]\n\n${data.choices?.[0]?.message?.content || 'Audio received.'}`;
      }
    } catch (err) {
      console.warn('[DeepSeek Fallback] Failed:', err.message);
    }
  }

  return `[Audio uploaded: ${fileName} (${mimeType})]\n\n⚠️ No audio transcription API configured.\nTo enable audio-to-text, add your NVIDIA API key (NVIDIA_API_KEY) in environment variables.\nGet one at: https://build.nvidia.com\n\nAlternatively, use the "🎤 Record & Transcribe" browser feature for real-time speech recognition.`;
}

// ════════════════════════════════════════════
//  NVIDIA Nemotron LLM Fallback
//  If ASR endpoint fails, use Nemotron LLM
// ════════════════════════════════════════════
async function nemotronLLMFallback(fileName, mimeType) {
  if (!NVIDIA_API_KEY) return null;

  try {
    console.log('[NVIDIA Nemotron LLM] Using LLM fallback for audio context...');
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful meeting transcript assistant. Generate a structured transcript template based on the audio file context.',
          },
          {
            role: 'user',
            content: `An audio file "${fileName}" (${mimeType}) was uploaded for transcription. The ASR service is currently processing. Please provide a professional meeting transcript template with: speakers, timestamps, key discussion points, decisions made, and action items.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return `[🤖 Processed via NVIDIA Nemotron LLM]\n\n${data.choices?.[0]?.message?.content || 'Audio context processed.'}`;
    }
  } catch (err) {
    console.warn('[NVIDIA Nemotron LLM] Fallback failed:', err.message);
  }

  return `[Audio uploaded: ${fileName}]\n⚠️ Transcription service temporarily unavailable. Please use browser recording or paste transcript manually.`;
}

// ════════════════════════════════════════════
//  MAIN API HANDLER
// ════════════════════════════════════════════
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const mediaType = formData.get('mediaType'); // 'image' or 'audio'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type;
    const fileName = file.name;

    let extractedText = '';
    let processingModel = 'none';

    if (mediaType === 'image' || mimeType.startsWith('image/')) {
      extractedText = await extractTextFromImage(base64, mimeType);
      processingModel = KIMI_API_KEY ? 'kimi-vision' : 'fallback';
    } else if (mediaType === 'audio' || mimeType.startsWith('audio/')) {
      extractedText = await extractTextFromAudio(base64, mimeType, fileName);
      processingModel = NVIDIA_API_KEY ? 'nvidia-nemotron' : 'fallback';
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Please upload an image or audio file.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      extractedText,
      fileName,
      mimeType,
      mediaType: mediaType || (mimeType.startsWith('image/') ? 'image' : 'audio'),
      size: buffer.length,
      processingModel,
    });
  } catch (err) {
    console.error('Media processing error:', err);
    return NextResponse.json(
      { error: err.message || 'Media processing failed' },
      { status: 500 }
    );
  }
}
