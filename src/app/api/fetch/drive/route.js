import { NextResponse } from 'next/server';

export async function GET(request) {
  const token = request.cookies.get('google_access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated. Please connect your Google account first.' },
      { status: 401 }
    );
  }

  try {
    // List Google Docs from Drive
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.document'");
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=20&fields=files(id,name,createdTime,modifiedTime,owners)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );

    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Drive API error: ${listRes.status}`);
    }

    const listData = await listRes.json();
    const files = (listData.files || []).map(f => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      owner: f.owners?.[0]?.displayName || 'Unknown',
    }));

    return NextResponse.json({ success: true, files });
  } catch (err) {
    console.error('Drive fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fetch the content of a specific Google Doc
export async function POST(request) {
  const token = request.cookies.get('google_access_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { fileId, fileName } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    // Export Google Doc as plain text
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!exportRes.ok) {
      throw new Error(`Doc export error: ${exportRes.status}`);
    }

    const content = await exportRes.text();

    return NextResponse.json({
      success: true,
      content: content.trim(),
      fileName: fileName || 'Document',
    });
  } catch (err) {
    console.error('Doc fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
