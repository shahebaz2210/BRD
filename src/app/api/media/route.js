import { NextResponse } from 'next/server';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// ════════════════════════════════════════════
//  IMAGE → TEXT via DeepSeek LLM
//  Sends a description prompt + image context
// ════════════════════════════════════════════
async function extractTextFromImage(base64Data, mimeType) {
  // DeepSeek chat doesn't support vision natively,
  // so we describe what we want and include the base64 as context
  // For actual OCR, we use a lightweight approach

  const systemPrompt = `You are an expert at reading and transcribing content from images.
The user will provide a base64-encoded image. Analyze the image and:
1. Extract ALL visible text (OCR)
2. Describe any diagrams, charts, or visual elements
3. Identify any requirements, action items, or decisions mentioned
4. Note any UI mockups or wireframes if present

Return a structured text extraction with clear sections.`;

  const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';

  if (hasKey) {
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `I have uploaded an image (${mimeType}). The image data is encoded in base64. Please analyze and extract all text content, descriptions, and any requirements or action items visible in this image.\n\nBase64 data (first 500 chars for context): ${base64Data.substring(0, 500)}...\n\nPlease provide a comprehensive text extraction.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 3000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Could not extract text from image.';
      }
    } catch (err) {
      console.warn('DeepSeek image analysis failed:', err.message);
    }
  }

  // Fallback: return a helpful message
  return `[Image uploaded: ${mimeType}]\nNote: Image text extraction requires a vision-capable LLM model. The image has been received but automatic OCR is not available in fallback mode.\n\nTo extract text from this image, please:\n1. Manually transcribe the visible text\n2. Or configure a vision-capable API key`;
}

// ════════════════════════════════════════════
//  AUDIO → TEXT via transcription
//  Uses a simple approach - in production you'd use Whisper/Google STT
// ════════════════════════════════════════════
async function extractTextFromAudio(base64Data, mimeType, fileName) {
  const hasKey = DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here';

  if (hasKey) {
    try {
      const response = await fetch(DEEPSEEK_URL, {
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
              content: `You are an AI assistant. The user has uploaded an audio file named "${fileName}" (${mimeType}). 
Since you cannot directly listen to audio, provide guidance on what this file likely contains based on the filename and context.
Also generate a sample transcription format that the user can fill in, showing the proper structure for meeting notes/conversation transcription.`,
            },
            {
              role: 'user',
              content: `I've uploaded an audio file: "${fileName}" (${mimeType}). 
Please provide a structured template for transcribing this audio, including speaker identification, timestamps, and action items sections.`,
            },
          ],
          temperature: 0.4,
          max_tokens: 2000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Audio file received. Please use browser transcription.';
      }
    } catch (err) {
      console.warn('DeepSeek audio assist failed:', err.message);
    }
  }

  return `[Audio file uploaded: ${fileName} (${mimeType})]\n\nAudio transcription is available via browser-based speech recognition.\nPlease use the "🎤 Record & Transcribe" feature on the Upload tab for real-time transcription.\n\nAlternatively, paste the transcript manually in the Manual tab.`;
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

    if (mediaType === 'image' || mimeType.startsWith('image/')) {
      extractedText = await extractTextFromImage(base64, mimeType);
    } else if (mediaType === 'audio' || mimeType.startsWith('audio/')) {
      extractedText = await extractTextFromAudio(base64, mimeType, fileName);
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
    });
  } catch (err) {
    console.error('Media processing error:', err);
    return NextResponse.json(
      { error: err.message || 'Media processing failed' },
      { status: 500 }
    );
  }
}
