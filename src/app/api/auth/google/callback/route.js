import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  if (error || !code) {
    console.error('[Google OAuth] Auth error or no code:', error);
    return NextResponse.redirect(`${baseUrl}/add-input?error=auth_failed`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    // Exchange authorization code for tokens
    // Try with the current host's redirect URI first
    let tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    let tokenData = await tokenRes.json();

    // If redirect_uri mismatch (port changed), try common localhost ports
    if (!tokenRes.ok && tokenData.error === 'redirect_uri_mismatch') {
      console.warn('[Google OAuth] redirect_uri mismatch, trying alternate ports...');
      const ports = ['3000', '3001', '3002'];
      for (const port of ports) {
        const altRedirectUri = `http://localhost:${port}/api/auth/google/callback`;
        if (altRedirectUri === redirectUri) continue; // skip current
        
        tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: altRedirectUri,
            grant_type: 'authorization_code',
          }),
        });
        tokenData = await tokenRes.json();
        if (tokenRes.ok && tokenData.access_token) {
          console.log(`[Google OAuth] ✅ Token exchange succeeded with port ${port}`);
          break;
        }
      }
    }

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[Google OAuth] Token exchange failed:', tokenData);
      throw new Error(`Token exchange failed: ${tokenData.error || 'unknown'}`);
    }

    // Get user email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json();

    // Redirect to frontend
    const redirectUrl = new URL('/add-input', baseUrl);
    redirectUrl.searchParams.set('connected', 'google');
    redirectUrl.searchParams.set('email', userInfo.email || '');

    const response = NextResponse.redirect(redirectUrl.toString());

    // Store access token in secure cookie
    response.cookies.set('google_access_token', tokenData.access_token, {
      httpOnly: true,
      maxAge: tokenData.expires_in || 3600,
      path: '/',
      sameSite: 'lax',
    });

    if (tokenData.refresh_token) {
      response.cookies.set('google_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        sameSite: 'lax',
      });
    }

    console.log(`[Google OAuth] ✅ Authentication successful for ${userInfo.email}`);
    return response;
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err);
    return NextResponse.redirect(`${baseUrl}/add-input?error=token_failed`);
  }
}
