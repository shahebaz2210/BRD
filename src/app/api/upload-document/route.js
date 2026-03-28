import { NextResponse } from 'next/server';

// ════════════════════════════════════════════
//  LOCAL DOCUMENT UPLOAD & TEXT EXTRACTION
//  Supports: .txt, .md, .csv, .docx
// ════════════════════════════════════════════

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const fileName = file.name;
    const mimeType = file.type;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    let extractedText = '';

    // Detect file type by extension
    const ext = fileName.split('.').pop().toLowerCase();

    if (['txt', 'md', 'csv', 'log', 'json'].includes(ext)) {
      // Plain text files — read directly
      extractedText = buffer.toString('utf-8');
    } else if (['docx'].includes(ext)) {
      // Word documents — use mammoth
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value || '';
        if (!extractedText.trim()) {
          extractedText = '(Document appears to be empty or contains only images/formatting)';
        }
      } catch (err) {
        console.error('Mammoth extraction error:', err);
        extractedText = `(Failed to extract text from ${fileName}: ${err.message})`;
      }
    } else if (['doc'].includes(ext)) {
      extractedText = `[⚠️ .doc format] Legacy Word format detected. Please save as .docx and re-upload for best results.`;
    } else if (['pdf'].includes(ext)) {
      extractedText = `[⚠️ PDF Upload] PDF text extraction. The document "${fileName}" has been received. For best results, please copy-paste the text content from your PDF into the Manual input tab.`;
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}. Supported: .txt, .md, .csv, .docx` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      extractedText,
      fileName,
      mimeType,
      fileType: ext,
      size: buffer.length,
      charCount: extractedText.length,
    });
  } catch (err) {
    console.error('Document upload error:', err);
    return NextResponse.json(
      { error: err.message || 'Document processing failed' },
      { status: 500 }
    );
  }
}
