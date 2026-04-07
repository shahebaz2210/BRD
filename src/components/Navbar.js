'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

function NavbarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [googleEmail, setGoogleEmail] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check if we just returned from Google OAuth callback
    const connected = searchParams.get('connected');
    const email = searchParams.get('email');
    if (connected === 'google' && email) {
      setGoogleEmail(email);
      localStorage.setItem('google_email', email);
      localStorage.setItem('google_connected', 'true');
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    } else {
      // Load from localStorage
      const savedEmail = localStorage.getItem('google_email');
      const savedConnected = localStorage.getItem('google_connected');
      if (savedConnected === 'true' && savedEmail) {
        setGoogleEmail(savedEmail);
      }
    }

    // Check for auth errors
    const error = searchParams.get('error');
    if (error) {
      console.warn('Google auth error:', error);
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  function handleGoogleSignIn() {
    setIsConnecting(true);
    window.location.href = '/api/auth/google';
  }

  function handleDisconnect() {
    setGoogleEmail('');
    localStorage.removeItem('google_email');
    localStorage.removeItem('google_connected');
  }

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-brand">
        <div className="navbar-logo">B</div>
        <div>
          <div className="navbar-title">BRD Generator</div>
          <div className="navbar-subtitle">AI-Driven — Mistral + DeepSeek</div>
        </div>
      </div>
      <div className="navbar-links">
        <Link href="/" className={`navbar-link ${pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
        <Link href="/add-input" className={`navbar-link ${pathname === '/add-input' ? 'active' : ''}`}>Generate</Link>
        <Link href="/brd-view" className={`navbar-link ${pathname === '/brd-view' ? 'active' : ''}`}>BRD View</Link>
      </div>
      <div className="navbar-right-group">
        {googleEmail ? (
          <div className="google-connected-badge" id="google-connected-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span className="google-email-text">{googleEmail}</span>
            <button className="google-disconnect-btn" onClick={handleDisconnect} title="Disconnect Google">✕</button>
          </div>
        ) : (
          <button
            className="google-signin-btn"
            id="google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={isConnecting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isConnecting ? 'Connecting...' : 'Sign in with Google'}
          </button>
        )}
        <div className="navbar-status"><span className="status-dot"></span>Pipeline active</div>
      </div>
    </nav>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={
      <nav className="navbar" id="main-navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">B</div>
          <div>
            <div className="navbar-title">BRD Generator</div>
            <div className="navbar-subtitle">AI-Driven — Mistral + DeepSeek</div>
          </div>
        </div>
      </nav>
    }>
      <NavbarInner />
    </Suspense>
  );
}
