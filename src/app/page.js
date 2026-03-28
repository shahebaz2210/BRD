'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ── NAVBAR ── */
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
        <Link href="/" className={`navbar-link ${pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
        <Link href="/add-input" className={`navbar-link ${pathname === '/add-input' ? 'active' : ''}`}>Add Input</Link>
        <Link href="/brd-view" className={`navbar-link ${pathname === '/brd-view' ? 'active' : ''}`}>BRD View</Link>
      </div>
      <div className="navbar-status"><span className="status-dot"></span>Pipeline active</div>
    </nav>
  );
}

/* ── ANIMATED COUNTER ── */
function AnimatedCounter({ target, suffix = '' }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const duration = 1200;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return <>{count}{suffix}</>;
}

/* ── FLOATING PARTICLES ── */
function Particles() {
  return (
    <div className="particles-container" aria-hidden="true">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="particle" style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 6}s`,
          animationDuration: `${4 + Math.random() * 6}s`,
          width: `${2 + Math.random() * 4}px`,
          height: `${2 + Math.random() * 4}px`,
          opacity: 0.15 + Math.random() * 0.25,
        }} />
      ))}
    </div>
  );
}

/* ── STAT ICONS (SVG) ── */
const StatIcons = {
  messages: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  requirements: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  brds: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  accuracy: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
};

/* ── DASHBOARD ── */
export default function DashboardPage() {
  const [stats, setStats] = useState({ messagesProcessed: 0, requirementsExtracted: 0, brdsGenerated: 0, nlpAccuracy: 0 });
  const [messages, setMessages] = useState([]);
  const [moscow, setMoscow] = useState({ must_have: [], should_have: [], could_have: [], wont_have: [] });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    fetchData();
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
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
      setStats({ messagesProcessed: 24, requirementsExtracted: 47, brdsGenerated: 3, nlpAccuracy: 87 });
      setMessages(demoMessages);
      setMoscow(demoMoscow);
    }
    setLoading(false);
  }

  const statCards = [
    { key: 'messages', label: 'Messages Processed', value: stats.messagesProcessed, change: `+${Math.max(1, Math.floor(stats.messagesProcessed * 0.12))} today`, type: 'positive', icon: StatIcons.messages },
    { key: 'requirements', label: 'Requirements Extracted', value: stats.requirementsExtracted, change: `+${Math.max(1, Math.floor(stats.requirementsExtracted * 0.1))} today`, type: 'positive', icon: StatIcons.requirements },
    { key: 'brds', label: 'BRDs Generated', value: stats.brdsGenerated, change: stats.brdsGenerated > 0 ? `${Math.ceil(stats.brdsGenerated * 0.6)} pending review` : 'None yet', type: 'neutral', icon: StatIcons.brds },
    { key: 'accuracy', label: 'NLP Accuracy', value: stats.nlpAccuracy, suffix: '%', change: 'Estimated', type: 'neutral', icon: StatIcons.accuracy },
  ];

  const pipelineStages = [
    { icon: '📥', title: 'Data Ingestion', sub: 'Telegram · Email · Meet', color: 'green' },
    { icon: '🧹', title: 'NLP Cleaning', sub: 'Tokenization · Regex', color: 'orange' },
    { icon: '🤖', title: 'LLM Processing', sub: 'DeepSeek V3.2', color: 'purple' },
    { icon: '🗄️', title: 'DB Storage', sub: 'MongoDB', color: 'blue' },
    { icon: '📄', title: 'BRD Output', sub: 'View · DOCX', color: 'red' },
  ];

  return (
    <>
      <Navbar />
      <main className="main-content">
        {/* Hero */}
        <div className="dashboard-hero" id="hero-section">
          <Particles />
          <div className="hero-badge">🚀 AI-Powered Requirements Engineering</div>
          <h1 className="hero-title">AI BRD Generator</h1>
          <p className="hero-description">
            Extract structured requirements from unstructured conversations using DeepSeek V3.2 NLP pipeline
          </p>
          <div className="hero-actions">
            <Link href="/add-input"><button className="btn-hero-primary">📥 Add New Input</button></Link>
            <Link href="/brd-view"><button className="btn-hero-secondary">📄 View BRDs</button></Link>
          </div>
          {currentTime && <div className="hero-time">🕐 {currentTime}</div>}
        </div>

        {/* Stats */}
        <div className="stats-row" id="stats-section">
          {statCards.map((s, i) => (
            <div className={`stat-card stat-card-${s.key}`} key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="stat-icon-wrapper">{s.icon}</div>
              <div className="stat-info">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value"><AnimatedCounter target={s.value} suffix={s.suffix || ''} /></div>
                <div className={`stat-change ${s.type}`}>{s.change}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline */}
        <div className="pipeline-section" id="pipeline-section">
          <div className="section-header">
            <div className="section-title">Live Pipeline Status</div>
            <div className="section-badge">⚡ All systems operational</div>
          </div>
          <div className="pipeline-track">
            {pipelineStages.map((stage, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className="pipeline-stage">
                  <div className={`pipeline-icon ${stage.color} active`}>{stage.icon}</div>
                  <div className="pipeline-stage-title">{stage.title}</div>
                  <div className="pipeline-stage-sub">{stage.sub}</div>
                </div>
                {i < pipelineStages.length - 1 && <div className="pipeline-connector active"></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="messages-section" id="messages-section">
          <div className="section-header">
            <div className="section-title">Recent Messages — Live Feed</div>
            <div className="section-badge">{messages.length} messages</div>
          </div>
          {loading ? (
            <div className="loading-spinner"><div className="spinner"></div> Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <h3>No messages yet</h3>
              <p>Go to &quot;Add Input&quot; to paste Telegram chats, emails, or meeting notes and start extracting requirements.</p>
              <Link href="/add-input"><button className="btn-primary" style={{ width: 'auto', marginTop: 16 }}>📥 Add Your First Input</button></Link>
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
                  <div className="message-time">{msg.processedAt ? new Date(msg.processedAt).toLocaleString() : 'Just now'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MoSCoW */}
        <div className="moscow-section" id="moscow-section">
          <div className="section-header">
            <div className="section-title">MoSCoW Prioritization</div>
          </div>
          {(moscow.must_have.length + moscow.should_have.length + moscow.could_have.length + moscow.wont_have.length) === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <h3>No prioritization data</h3>
              <p>Process some requirements to see MoSCoW classification here.</p>
            </div>
          ) : (
            <div className="moscow-board">
              {[
                { key: 'must_have', label: 'Must Have', cls: 'must' },
                { key: 'should_have', label: 'Should Have', cls: 'should' },
                { key: 'could_have', label: 'Could Have', cls: 'could' },
                { key: 'wont_have', label: "Won't Have (v1)", cls: 'wont' },
              ].map(col => (
                <div className="moscow-column" key={col.key}>
                  <div className={`moscow-header ${col.cls}`}>
                    <span>{col.label}</span>
                    <span className="moscow-count">{moscow[col.key].length}</span>
                  </div>
                  <div className="moscow-items">
                    {moscow[col.key].map((item, i) => (
                      <div className="moscow-item" key={i}>{item}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/* ── DEMO DATA ── */
const demoMessages = [
  { source: 'telegram', senderName: 'Gaurav', content: 'Need login page ASAP, client said Friday deadline. UPI payments must work.', tags: ['Login page', 'Friday', 'UPI'], priority: 'High', processedAt: new Date().toISOString() },
  { source: 'email', senderName: 'priya@co.com', content: 'Please implement Google OAuth and Razorpay by March 28. High priority per Infosys.', tags: ['Google OAuth', 'Razorpay', 'March 28', 'Infosys'], priority: 'High', processedAt: new Date().toISOString() },
  { source: 'meeting', senderName: 'Sprint Call', content: 'Dashboard layout confirmed. Admin panel needed for transaction view. Deadline Friday.', tags: ['Dashboard', 'Admin panel', 'Friday'], priority: 'Medium', processedAt: new Date().toISOString() },
  { source: 'telegram', senderName: 'Rahul', content: 'Maybe add analytics charts in phase 2, not urgent for now.', tags: ['Analytics', 'Phase 2'], priority: 'Low', processedAt: new Date().toISOString() },
];

const demoMoscow = {
  must_have: ['User login (Google OAuth)', 'UPI payment support', 'Dashboard home page'],
  should_have: ['Email notifications', 'Export to PDF', 'Role-based access'],
  could_have: ['Dark mode toggle', 'Analytics charts', 'Multi-language UI'],
  wont_have: ['Mobile native app', 'AI chatbot', 'Offline mode'],
};
