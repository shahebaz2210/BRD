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

export async function GET(request) {
  let token = request.cookies.get('google_access_token')?.value;
  const refreshToken = request.cookies.get('google_refresh_token')?.value;

  if (!token && !refreshToken) {
    return NextResponse.json(
      { error: 'Not authenticated. Please connect your Google account first.' },
      { status: 401 }
    );
  }

  // Check if token is still valid, refresh if needed
  let tokenRefreshed = false;
  if (token) {
    const checkRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
      { cache: 'no-store' }
    );
    if (!checkRes.ok && refreshToken) {
      console.log('[Gmail] Token expired, refreshing...');
      const newToken = await refreshGoogleToken(refreshToken);
      if (newToken) {
        token = newToken;
        tokenRefreshed = true;
      } else {
        return NextResponse.json(
          { error: 'Google token expired. Please sign in with Google again.' },
          { status: 401 }
        );
      }
    } else if (!checkRes.ok) {
      return NextResponse.json(
        { error: 'Google token expired. Please sign in with Google again.' },
        { status: 401 }
      );
    }
  } else if (refreshToken) {
    const newToken = await refreshGoogleToken(refreshToken);
    if (newToken) {
      token = newToken;
      tokenRefreshed = true;
    } else {
      return NextResponse.json(
        { error: 'Could not refresh Google token. Please sign in again.' },
        { status: 401 }
      );
    }
  }

  try {
    // List recent emails from inbox
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=is:inbox',
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );

    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gmail API error: ${listRes.status}`);
    }

    const listData = await listRes.json();
    const messageIds = listData.messages || [];

    // Fetch details for each message (parallel, limit to 10)
    const messages = await Promise.all(
      messageIds.slice(0, 10).map(async ({ id }) => {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const msgData = await msgRes.json();

          // Extract headers
          const headers = msgData.payload?.headers || [];
          const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
          const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

          // Extract body text
          let body = '';
          if (msgData.payload?.body?.data) {
            body = Buffer.from(msgData.payload.body.data, 'base64url').toString('utf-8');
          } else if (msgData.payload?.parts) {
            const textPart = msgData.payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
            } else {
              // Try HTML part as fallback
              const htmlPart = msgData.payload.parts.find(p => p.mimeType === 'text/html');
              if (htmlPart?.body?.data) {
                body = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
                body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              }
            }
          }

          // Truncate body
          body = body.replace(/<[^>]*>/g, '').trim().slice(0, 1500);

          return { id, subject, from, date, body, snippet: msgData.snippet || '' };
        } catch {
          return null;
        }
      })
    );

    const responseData = {
      success: true,
      messages: messages.filter(Boolean),
    };

    const response = NextResponse.json(responseData);

    // Update cookie if token was refreshed
    if (tokenRefreshed && token) {
      response.cookies.set('google_access_token', token, {
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
      });
    }

    return response;
  } catch (err) {
    console.error('Gmail fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
