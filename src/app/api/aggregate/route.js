// ════════════════════════════════════════════════════════════════
//  AGGREGATION LAYER — Automatically combines ALL data sources
//  Fetches from Telegram, Gmail, Drive and tags with source markers
//
//  NO manual selection — pulls everything available, then the
//  local LLM (Mistral) filters for relevance downstream.
// ════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const {
      project,
      description,
      telegramToken,
      googleAccessToken,
    } = await request.json();

    // Read Google token from httpOnly cookie (set by OAuth callback) or from body
    const cookieToken = request.cookies.get('google_access_token')?.value;
    const effectiveGoogleToken = googleAccessToken || cookieToken || null;

    if (!project || !project.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const segments = [];
    const sourceMeta = { telegram: 0, gmail: 0, meeting: 0 };

    // ── 1. Fetch Telegram messages ──────────────────────────────
    const botToken = telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    if (botToken && botToken !== 'your_telegram_bot_token_here') {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.result?.length > 0) {
            const msgs = data.result
              .filter(u => u.message?.text)
              .map(u => {
                const from = u.message.from?.first_name
                  ? `${u.message.from.first_name}${u.message.from.last_name ? ' ' + u.message.from.last_name : ''}`
                  : u.message.from?.username || 'Unknown';
                return `${from}: ${u.message.text}`;
              });
            if (msgs.length > 0) {
              segments.push(`[TELEGRAM]\n${msgs.join('\n')}`);
              sourceMeta.telegram = msgs.length;
            }
          }
        }
      } catch (err) {
        console.warn('[aggregate] Telegram fetch failed:', err.message);
      }
    }

    // ── 2. Fetch Gmail emails ──────────────────────────────────
    const gToken = effectiveGoogleToken;
    if (gToken) {
      try {
        const listRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=is:inbox',
          { headers: { Authorization: `Bearer ${gToken}` }, cache: 'no-store' }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const messageIds = (listData.messages || []).slice(0, 15);
          const emails = await Promise.all(
            messageIds.map(async ({ id }) => {
              try {
                const msgRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
                  { headers: { Authorization: `Bearer ${gToken}` } }
                );
                const msgData = await msgRes.json();
                const headers = msgData.payload?.headers || [];
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
                const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
                let body = '';
                if (msgData.payload?.body?.data) {
                  body = Buffer.from(msgData.payload.body.data, 'base64url').toString('utf-8');
                } else if (msgData.payload?.parts) {
                  const textPart = msgData.payload.parts.find(p => p.mimeType === 'text/plain');
                  if (textPart?.body?.data) {
                    body = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
                  }
                }
                body = body.replace(/<[^>]*>/g, '').trim().slice(0, 1500);
                return `From: ${from}\nSubject: ${subject}\n${body}`;
              } catch { return null; }
            })
          );
          const validEmails = emails.filter(Boolean);
          if (validEmails.length > 0) {
            segments.push(`[GMAIL]\n${validEmails.join('\n---\n')}`);
            sourceMeta.gmail = validEmails.length;
          }
        }
      } catch (err) {
        console.warn('[aggregate] Gmail fetch failed:', err.message);
      }

      // ── 3. Fetch Google Drive meeting transcripts ─────────────
      try {
        const query = encodeURIComponent("mimeType='application/vnd.google-apps.document'");
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=10&fields=files(id,name)&orderBy=modifiedTime desc`,
          { headers: { Authorization: `Bearer ${gToken}` }, cache: 'no-store' }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const files = listData.files || [];
          const docs = await Promise.all(
            files.slice(0, 10).map(async (f) => {
              try {
                const exportRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=text/plain`,
                  { headers: { Authorization: `Bearer ${gToken}` } }
                );
                if (!exportRes.ok) return null;
                const content = await exportRes.text();
                return `Document: ${f.name}\n${content.trim().slice(0, 2000)}`;
              } catch { return null; }
            })
          );
          const validDocs = docs.filter(Boolean);
          if (validDocs.length > 0) {
            segments.push(`[MEETING]\n${validDocs.join('\n---\n')}`);
            sourceMeta.meeting = validDocs.length;
          }
        }
      } catch (err) {
        console.warn('[aggregate] Drive fetch failed:', err.message);
      }
    }

    // ── Combine all segments ──────────────────────────────────
    const combinedData = segments.join('\n\n');
    const totalSources = sourceMeta.telegram + sourceMeta.gmail + sourceMeta.meeting;

    if (!combinedData.trim()) {
      return NextResponse.json({
        error: 'No data could be fetched from any source. Check API tokens and Google authentication.',
        sourceMeta,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      project,
      description: description || '',
      data: combinedData,
      meta: {
        totalSources,
        totalCharacters: combinedData.length,
        ...sourceMeta,
      },
    });

  } catch (err) {
    console.error('[aggregate] Error:', err);
    return NextResponse.json({ error: err.message || 'Aggregation failed' }, { status: 500 });
  }
}
