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

    return NextResponse.json({
      success: true,
      messages: messages.filter(Boolean),
    });
  } catch (err) {
    console.error('Gmail fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
