import { NextResponse } from 'next/server';

// ── Helper: Refresh the Google access token using the refresh token ──
async function refreshGoogleToken(refreshToken) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) return data.access_token;
    return null;
  } catch {
    return null;
  }
}

// ── Helper: Get a valid token (refresh if needed) ──
async function getValidToken(request) {
  let token = request.cookies.get('google_access_token')?.value;
  const refreshToken = request.cookies.get('google_refresh_token')?.value;
  let refreshed = false;

  if (!token && !refreshToken) return { token: null, refreshed: false };

  if (token) {
    const checkRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
      { cache: 'no-store' }
    );
    if (!checkRes.ok && refreshToken) {
      const newToken = await refreshGoogleToken(refreshToken);
      if (newToken) {
        token = newToken;
        refreshed = true;
      } else {
        return { token: null, refreshed: false };
      }
    } else if (!checkRes.ok) {
      return { token: null, refreshed: false };
    }
  } else if (refreshToken) {
    const newToken = await refreshGoogleToken(refreshToken);
    if (newToken) {
      token = newToken;
      refreshed = true;
    } else {
      return { token: null, refreshed: false };
    }
  }

  return { token, refreshed };
}

export async function GET(request) {
  const { token, refreshed } = await getValidToken(request);

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

    const response = NextResponse.json({ success: true, files });
    if (refreshed) {
      response.cookies.set('google_access_token', token, {
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
      });
    }
    return response;
  } catch (err) {
    console.error('Drive fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fetch the content of a specific Google Doc
export async function POST(request) {
  const { token } = await getValidToken(request);

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
