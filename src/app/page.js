'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ──────────────────────────────────────────────
   NAVBAR (shared across all pages)
   ────────────────────────────────────────────── */
function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-brand">
        <div className="navbar-logo">B</div>
        <div>
          <div className="navbar-title">BRD Generator</div>
          <div className="navbar-subtitle">AI-Driven — DeepSeek V3.2</div>
        </div>
      </div>

      <div className="navbar-links">
        <Link href="/" className={`navbar-link ${pathname === '/' ? 'active' : ''}`}>
          Dashboard
        </Link>
        <Link href="/add-input" className={`navbar-link ${pathname === '/add-input' ? 'active' : ''}`}>
          Add Input
        </Link>
        <Link href="/brd-view" className={`navbar-link ${pathname === '/brd-view' ? 'active' : ''}`}>
          BRD View
        </Link>
      </div>

      <div className="navbar-status">
        <span className="status-dot"></span>
        Pipeline active
      </div>
    </nav>
  );
}

/* ──────────────────────────────────────────────
   DASHBOARD PAGE
   ────────────────────────────────────────────── */
export default function DashboardPage() {
  const [stats, setStats] = useState({
    messagesProcessed: 0,
    requirementsExtracted: 0,
    brdsGenerated: 0,
    nlpAccuracy: 0,
  });
  const [messages, setMessages] = useState([]);
  const [moscow, setMoscow] = useState({ must_have: [], should_have: [], could_have: [], wont_have: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/brds');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.messages) setMessages(data.messages);
        if (data.moscow) setMoscow(data.moscow);
      }
    } catch {
      // Use demo data on failure
      setStats({
        messagesProcessed: 24,
        requirementsExtracted: 47,
        brdsGenerated: 3,
        nlpAccuracy: 87,
      });
      setMessages(demoMessages);
      setMoscow(demoMoscow);
    }
    setLoading(false);
  }

  return (
    <>
      <Navbar />
      <main className="main-content">
        {/* Hero Section */}
        <div style={{
          textAlign: 'center',
          padding: '32px 20px 24px',
          marginBottom: 28,
          background: 'linear-gradient(135deg, rgba(124,92,252,0.06), rgba(0,212,170,0.04))',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border-subtle)',
        }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, var(--green), var(--purple), var(--orange))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: 8,
          }}>AI BRD Generator</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 600, margin: '0 auto' }}>
            Extract structured requirements from unstructured conversations using DeepSeek V3.2 NLP
          </p>
        </div>

        {/* Stats Row */}
        <div className="stats-row" id="stats-section">
          <div className="stat-card">
            <div className="stat-label">Messages processed</div>
            <div className="stat-value">{stats.messagesProcessed}</div>
            <div className="stat-change positive">+{Math.max(1, Math.floor(stats.messagesProcessed * 0.12))} today</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Requirements extracted</div>
            <div className="stat-value">{stats.requirementsExtracted}</div>
            <div className="stat-change positive">+{Math.max(1, Math.floor(stats.requirementsExtracted * 0.1))} today</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">BRDs generated</div>
            <div className="stat-value">{stats.brdsGenerated}</div>
            <div className="stat-change neutral">{stats.brdsGenerated > 0 ? `${Math.ceil(stats.brdsGenerated * 0.6)} pending review` : 'None yet'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">NLP accuracy</div>
            <div className="stat-value">{stats.nlpAccuracy}%</div>
            <div className="stat-change neutral">Estimated</div>
          </div>
        </div>

        {/* Live Pipeline Status */}
        <div className="pipeline-section" id="pipeline-section">
          <div className="section-title">Live Pipeline Status</div>
          <div className="pipeline-track">
            <div className="pipeline-stage">
              <div className="pipeline-icon green active">📥</div>
              <div className="pipeline-stage-title">Data Ingestion</div>
              <div className="pipeline-stage-sub">Telegram · Email · Meet</div>
            </div>
            <div className="pipeline-connector active"></div>
            <div className="pipeline-stage">
              <div className="pipeline-icon orange active">🧹</div>
              <div className="pipeline-stage-title">NLP Cleaning</div>
              <div className="pipeline-stage-sub">Tokenization · Regex</div>
            </div>
            <div className="pipeline-connector active"></div>
            <div className="pipeline-stage">
              <div className="pipeline-icon purple active">🤖</div>
              <div className="pipeline-stage-title">LLM Processing</div>
              <div className="pipeline-stage-sub">DeepSeek V3.2</div>
            </div>
            <div className="pipeline-connector active"></div>
            <div className="pipeline-stage">
              <div className="pipeline-icon blue active">🗄️</div>
              <div className="pipeline-stage-title">DB Storage</div>
              <div className="pipeline-stage-sub">MongoDB</div>
            </div>
            <div className="pipeline-connector active"></div>
            <div className="pipeline-stage">
              <div className="pipeline-icon red active">📄</div>
              <div className="pipeline-stage-title">BRD Output</div>
              <div className="pipeline-stage-sub">View · DOCX</div>
            </div>
          </div>
        </div>

        {/* Recent Messages — Live Feed */}
        <div className="messages-section" id="messages-section">
          <div className="section-title">Recent Messages — Live Feed</div>
          {loading ? (
            <div className="loading-spinner"><div className="spinner"></div> Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <h3>No messages yet</h3>
              <p>Go to &quot;Add Input&quot; to paste Telegram chats, emails, or meeting notes and start extracting requirements.</p>
            </div>
          ) : (
            <div className="messages-grid">
              {messages.slice(0, 4).map((msg, i) => (
                <div className="message-card" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="message-header">
                    <span className={`source-badge ${msg.source}`}>
                      {msg.source === 'telegram' && '✈️'}
                      {msg.source === 'email' && '📧'}
                      {msg.source === 'meeting' && '📞'}
                      {msg.source === 'notes' && '📝'}
                      {' '}{msg.source}
                    </span>
                    <span className="message-sender">{msg.senderName}</span>
                  </div>
                  <div className="message-content">{msg.content}</div>
                  <div className="message-tags">
                    {(msg.tags || []).map((tag, j) => (
                      <span className={`tag ${['green', 'blue', 'orange', 'purple', 'red', 'yellow'][j % 6]}`} key={j}>{tag}</span>
                    ))}
                    {msg.priority && (
                      <span className={`tag ${msg.priority === 'High' ? 'red' : msg.priority === 'Medium' ? 'orange' : 'green'}`}>{msg.priority}</span>
                    )}
                  </div>
                  <div className="message-time">
                    {msg.processedAt ? new Date(msg.processedAt).toLocaleString() : 'Just now'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MoSCoW Prioritization */}
        <div className="moscow-section" id="moscow-section">
          <div className="section-title">MoSCoW Prioritization</div>
          {(moscow.must_have.length + moscow.should_have.length + moscow.could_have.length + moscow.wont_have.length) === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <h3>No prioritization data</h3>
              <p>Process some requirements to see MoSCoW classification here.</p>
            </div>
          ) : (
            <div className="moscow-board">
              <div className="moscow-column">
                <div className="moscow-header must">Must Have</div>
                <div className="moscow-items">
                  {moscow.must_have.map((item, i) => (
                    <div className="moscow-item" key={i}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="moscow-column">
                <div className="moscow-header should">Should Have</div>
                <div className="moscow-items">
                  {moscow.should_have.map((item, i) => (
                    <div className="moscow-item" key={i}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="moscow-column">
                <div className="moscow-header could">Could Have</div>
                <div className="moscow-items">
                  {moscow.could_have.map((item, i) => (
                    <div className="moscow-item" key={i}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="moscow-column">
                <div className="moscow-header wont">Won&apos;t Have (v1)</div>
                <div className="moscow-items">
                  {moscow.wont_have.map((item, i) => (
                    <div className="moscow-item" key={i}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/* ──────────────────────────────────────────────
   DEMO DATA (used when API/DB not available)
   ────────────────────────────────────────────── */
const demoMessages = [
  {
    source: 'telegram',
    senderName: 'Gaurav',
    content: 'Need login page ASAP, client said Friday deadline. UPI payments must work.',
    tags: ['Login page', 'Friday', 'UPI'],
    priority: 'High',
    processedAt: new Date().toISOString(),
  },
  {
    source: 'email',
    senderName: 'priya@co.com',
    content: 'Please implement Google OAuth and Razorpay by March 28. High priority per Infosys.',
    tags: ['Google OAuth', 'Razorpay', 'March 28', 'Infosys'],
    priority: 'High',
    processedAt: new Date().toISOString(),
  },
  {
    source: 'meeting',
    senderName: 'Sprint Call',
    content: 'Dashboard layout confirmed. Admin panel needed for transaction view. Deadline Friday.',
    tags: ['Dashboard', 'Admin panel', 'Friday'],
    priority: 'Medium',
    processedAt: new Date().toISOString(),
  },
  {
    source: 'telegram',
    senderName: 'Rahul',
    content: 'Maybe add analytics charts in phase 2, not urgent for now.',
    tags: ['Analytics', 'Phase 2'],
    priority: 'Low',
    processedAt: new Date().toISOString(),
  },
];

const demoMoscow = {
  must_have: ['User login (Google OAuth)', 'UPI payment support', 'Dashboard home page'],
  should_have: ['Email notifications', 'Export to PDF', 'Role-based access'],
  could_have: ['Dark mode toggle', 'Analytics charts', 'Multi-language UI'],
  wont_have: ['Mobile native app', 'AI chatbot', 'Offline mode'],
};
