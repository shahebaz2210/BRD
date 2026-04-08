// ════════════════════════════════════════════════════════════════
//  AGGREGATION LAYER — Automatically combines ALL data sources
//  Fetches from Telegram, Gmail, Drive and tags with source markers
//
//  NO manual selection — pulls everything available, then the
//  local LLM (Mistral) filters for relevance downstream.
// ════════════════════════════════════════════════════════════════

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
    if (res.ok && data.access_token) {
      console.log('[aggregate] ✅ Google token refreshed successfully');
      return data.access_token;
    }
    console.warn('[aggregate] ⚠️ Token refresh failed:', data.error || res.status);
    return null;
  } catch (err) {
    console.warn('[aggregate] ⚠️ Token refresh error:', err.message);
    return null;
  }
}

// ── Helper: Test if a Google token is still valid ──
async function isTokenValid(token) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
      { cache: 'no-store' }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const {
      project,
      description,
      telegramToken,
      googleAccessToken,
    } = await request.json();

    // Read Google tokens from httpOnly cookies (set by OAuth callback) or from body
    const cookieToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;
    let effectiveGoogleToken = googleAccessToken || cookieToken || null;

    if (!project || !project.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    // ── Validate & refresh Google token if needed ──
    let tokenRefreshed = false;
    if (effectiveGoogleToken) {
      const valid = await isTokenValid(effectiveGoogleToken);
      if (!valid && refreshToken) {
        console.log('[aggregate] Google token expired, attempting refresh...');
        const newToken = await refreshGoogleToken(refreshToken);
        if (newToken) {
          effectiveGoogleToken = newToken;
          tokenRefreshed = true;
        } else {
          effectiveGoogleToken = null;
          console.warn('[aggregate] ⚠️ Could not refresh token — Gmail/Drive will be skipped');
        }
      } else if (!valid) {
        console.warn('[aggregate] ⚠️ Google token invalid and no refresh token — Gmail/Drive will be skipped');
        effectiveGoogleToken = null;
      }
    }

    const segments = [];
    const sourceMeta = { telegram: 0, gmail: 0, meeting: 0 };
    const diagnostics = { telegram: 'skipped', gmail: 'skipped', drive: 'skipped' };

    // ── 1. Fetch Telegram messages ──────────────────────────────
    const botToken = telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    if (botToken && botToken !== 'your_telegram_bot_token_here') {
      try {
        console.log('[aggregate] Fetching Telegram messages...');
        diagnostics.telegram = 'attempted';
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
              diagnostics.telegram = `success: ${msgs.length} messages`;
              console.log(`[aggregate] ✅ Telegram: ${msgs.length} messages fetched`);
            } else {
              diagnostics.telegram = 'no text messages found';
              console.log('[aggregate] ⚠️ Telegram: API returned updates but no text messages');
            }
          } else {
            diagnostics.telegram = 'no updates from bot';
            console.log('[aggregate] ⚠️ Telegram: No updates from bot (send messages to your bot first!)');
          }
        } else {
          diagnostics.telegram = `API error: ${res.status}`;
          console.warn(`[aggregate] ⚠️ Telegram API returned ${res.status}`);
        }
      } catch (err) {
        diagnostics.telegram = `error: ${err.message}`;
        console.warn('[aggregate] ❌ Telegram fetch failed:', err.message);
      }
    } else {
      console.log('[aggregate] ⚠️ Telegram: No bot token configured');
      diagnostics.telegram = 'no bot token';
    }

    // ── 2. Fetch Gmail emails ──────────────────────────────────
    const gToken = effectiveGoogleToken;
    if (gToken) {
      console.log('[aggregate] Google token found, fetching Gmail and Drive...');
      try {
        diagnostics.gmail = 'attempted';
        console.log('[aggregate] Fetching Gmail inbox...');
        const listRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=is:inbox',
          { headers: { Authorization: `Bearer ${gToken}` }, cache: 'no-store' }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const messageIds = (listData.messages || []).slice(0, 15);
          console.log(`[aggregate] Gmail: found ${messageIds.length} message IDs`);
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
            diagnostics.gmail = `success: ${validEmails.length} emails`;
            console.log(`[aggregate] ✅ Gmail: ${validEmails.length} emails fetched`);
          } else {
            diagnostics.gmail = 'no emails found';
            console.log('[aggregate] ⚠️ Gmail: No readable emails found');
          }
        } else {
          const errBody = await listRes.text().catch(() => '');
          diagnostics.gmail = `API error: ${listRes.status}`;
          console.warn(`[aggregate] ❌ Gmail API returned ${listRes.status}: ${errBody.slice(0, 200)}`);

          // If 401, token is expired — already tried refresh above
          if (listRes.status === 401) {
            diagnostics.gmail = 'token expired — re-sign in with Google';
          }
        }
      } catch (err) {
        diagnostics.gmail = `error: ${err.message}`;
        console.warn('[aggregate] ❌ Gmail fetch failed:', err.message);
      }

      // ── 3. Fetch Google Drive meeting transcripts ─────────────
      try {
        diagnostics.drive = 'attempted';
        console.log('[aggregate] Fetching Google Drive documents...');
        const query = encodeURIComponent("mimeType='application/vnd.google-apps.document'");
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=10&fields=files(id,name)&orderBy=modifiedTime desc`,
          { headers: { Authorization: `Bearer ${gToken}` }, cache: 'no-store' }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const files = listData.files || [];
          console.log(`[aggregate] Drive: found ${files.length} Google Docs`);
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
            diagnostics.drive = `success: ${validDocs.length} docs`;
            console.log(`[aggregate] ✅ Drive: ${validDocs.length} documents fetched`);
          } else {
            diagnostics.drive = 'no documents found';
            console.log('[aggregate] ⚠️ Drive: No Google Docs found');
          }
        } else {
          const errBody = await listRes.text().catch(() => '');
          diagnostics.drive = `API error: ${listRes.status}`;
          console.warn(`[aggregate] ❌ Drive API returned ${listRes.status}: ${errBody.slice(0, 200)}`);
          if (listRes.status === 401) {
            diagnostics.drive = 'token expired — re-sign in with Google';
          }
        }
      } catch (err) {
        diagnostics.drive = `error: ${err.message}`;
        console.warn('[aggregate] ❌ Drive fetch failed:', err.message);
      }
    } else {
      console.log('[aggregate] ⚠️ No Google access token — Gmail and Drive will be skipped.');
      console.log('[aggregate]    → User must click "Sign in with Google" in the navbar first.');
      diagnostics.gmail = 'no google token';
      diagnostics.drive = 'no google token';
    }

    // ── Combine all segments ──────────────────────────────────
    const combinedData = segments.join('\n\n');
    const totalSources = sourceMeta.telegram + sourceMeta.gmail + sourceMeta.meeting;

    if (!combinedData.trim()) {
      return NextResponse.json({
        error: 'No data could be fetched from any source. Check API tokens and Google authentication.',
        sourceMeta,
        diagnostics,
      }, { status: 400 });
    }

    console.log(`[aggregate] ═══ Aggregation complete: ${totalSources} source(s), ${combinedData.length} chars ═══`);
    console.log(`[aggregate]   Telegram: ${diagnostics.telegram} | Gmail: ${diagnostics.gmail} | Drive: ${diagnostics.drive}`);

    // Build response — update cookie if token was refreshed
    const responseData = {
      success: true,
      project,
      description: description || '',
      data: combinedData,
      meta: {
        totalSources,
        totalCharacters: combinedData.length,
        ...sourceMeta,
      },
      diagnostics,
    };

    const response = NextResponse.json(responseData);

    // If the token was refreshed, update the cookie
    if (tokenRefreshed && effectiveGoogleToken) {
      response.cookies.set('google_access_token', effectiveGoogleToken, {
        httpOnly: true,
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
      });
    }

    return response;

  } catch (err) {
    console.error('[aggregate] Error:', err);
    return NextResponse.json({ error: err.message || 'Aggregation failed' }, { status: 500 });
  }
}
