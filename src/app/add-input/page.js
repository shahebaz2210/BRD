'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';


/* ── PIPELINE STAGE COMPONENT ── */
function PipelineStage({ icon, title, subtitle, status, detail, elapsed }) {
  const statusClass = status === 'done' ? 'completed' : status === 'active' ? 'active' : status === 'error' ? 'error' : '';
  return (
    <div className={`auto-pipeline-stage ${statusClass}`} id={`stage-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="auto-pipeline-icon-wrap">
        {status === 'active' ? (
          <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }}></div>
        ) : status === 'done' ? (
          <div className="auto-pipeline-check">✓</div>
        ) : status === 'error' ? (
          <div className="auto-pipeline-error-icon">✕</div>
        ) : (
          <div className="auto-pipeline-icon-pending">{icon}</div>
        )}
      </div>
      <div className="auto-pipeline-info">
        <div className="auto-pipeline-title">{title}</div>
        <div className="auto-pipeline-sub">{subtitle}</div>
        {detail && <div className="auto-pipeline-detail">{detail}</div>}
        {elapsed && status === 'done' && <div className="auto-pipeline-elapsed">✓ {elapsed}</div>}
      </div>
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function AutoGeneratePage() {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Pipeline state
  const [running, setRunning] = useState(false);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [totalElapsed, setTotalElapsed] = useState(null);

  // Log entries
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  function addLog(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { ts, msg, type }]);
  }

  function updateStage(index, updates) {
    setPipelineStages(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }

  // ════════════════════════════════════════════════════════════════
  //  TWO-PHASE PIPELINE
  // ════════════════════════════════════════════════════════════════

  // Phase 1: Aggregation & Card Generation
  async function fetchAndExtractCards() {
    if (!projectName.trim()) { setError('Please enter a project name.'); return; }
    setError('');
    setResult(null);
    setRunning(true);
    setLogs([]);
    const startTime = Date.now();

    const stages = [
      { icon: '📥', title: 'Data Aggregation', subtitle: 'Fetching ALL data from Telegram, Gmail, Drive...', status: 'pending', detail: '', elapsed: '' },
      { icon: '🧠', title: 'Mistral — Relevance Filter & Cards', subtitle: 'Local LLM filtering noise & structuring requirements...', status: 'pending', detail: '', elapsed: '' }
    ];
    setPipelineStages(stages);

    try {
      // ── STAGE 0: AGGREGATE ALL SOURCES ──
      addLog('Starting pipeline Phase 1: Data Fetch & Cards...', 'system');
      addLog(`Project: "${projectName}"`, 'info');
      updateStage(0, { status: 'active' });
      addLog('📥 Aggregating ALL data from Telegram, Gmail, Google Drive...', 'info');

      let stageStart = Date.now();
      let rawData = '';
      let meta = { telegram: 0, gmail: 0, meeting: 0, totalSources: 0 };
      
      const aggRes = await fetch('/api/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectName,
          description: description || '',
          telegramToken: telegramToken || undefined,
        }),
      });
      const aggData = await aggRes.json();

      if (!aggRes.ok || !aggData.success) {
        addLog('⚠️ No live data sources available — using project description as seed data', 'warn');
        rawData = `[PROJECT]\nProject: ${projectName}\nDescription: ${description || 'No description provided'}\n\nThe system should generate requirements based on the project name and description provided.`;
      } else {
        rawData = aggData.data;
        meta = aggData.meta;
        addLog(`✅ Aggregated ${rawData.length.toLocaleString()} chars from ${meta.totalSources} source(s)`, 'success');
        if (meta.telegram > 0) addLog(`   ✈️ Telegram: ${meta.telegram} messages`, 'info');
      }

      updateStage(0, {
        status: 'done',
        detail: `${meta.totalSources || 1} source(s) · ${rawData.length} chars`,
        elapsed: `${((Date.now() - stageStart) / 1000).toFixed(1)}s`,
      });

      // ── STAGE 1: FILTERING & CARDS (Mistral) ──
      updateStage(1, { status: 'active' });
      addLog('🧠 Sending data to Mistral (Ollama) to filter and extract requirement cards...', 'info');
      
      stageStart = Date.now();
      const processRes = await fetch('/api/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectName,
          description: description || '',
          data: rawData,
        }),
      });
      const processData = await processRes.json();
      
      if (!processRes.ok || !processData.success) {
        throw new Error(processData.error || 'Mistral extraction failed');
      }

      const cards = processData.cards || [];
      const procMeta = processData.meta;
      
      updateStage(1, {
        status: 'done',
        detail: `${cards.length} structured cards generated`,
        elapsed: `${((Date.now() - stageStart) / 1000).toFixed(1)}s`,
      });
      addLog(`✅ Generated ${cards.length} cards. Waiting for user curation...`, 'success');

      // Pause pipeline and render cards
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      setTotalElapsed(totalTime);
      setResult({ rawData, cards, meta: procMeta });
      setRunning(false);
      
    } catch (err) {
      setError(err.message || 'Pipeline failed');
      addLog(`❌ Error: ${err.message}`, 'error');
      setPipelineStages(prev => prev.map(s =>
        s.status === 'active' || s.status === 'pending' ? { ...s, status: 'error' } : s
      ));
      setRunning(false);
    }
  }

  // Phase 2: BRD Generation
  async function generateBrdFromCards() {
    if (!result || !result.cards || result.cards.length === 0) {
      setError('No cards available to generate BRD.');
      return;
    }
    setError('');
    setRunning(true);
    const startTime = Date.now();

    const stages = [
      { icon: '🤖', title: 'DeepSeek — BRD Generation', subtitle: 'Generating Business Requirements Document from curated cards...', status: 'active', detail: '', elapsed: '' },
      { icon: '💾', title: 'Save & Finalize', subtitle: 'Saving BRD to database...', status: 'pending', detail: '', elapsed: '' },
    ];
    setPipelineStages(stages);
    addLog('🚀 Starting Phase 2: Generating BRD from curated cards...', 'system');

    try {
      // ── STAGE 0 (in Phase 2): DEEPSEEK BRD ──
      let stageStart = Date.now();
      const brdRes = await fetch('/api/brd-from-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards: result.cards,
          project: projectName,
          description: description || ''
        }),
      });
      const brdData = await brdRes.json();

      if (!brdRes.ok || !brdData.success) {
        throw new Error(brdData.error || 'BRD generation failed');
      }

      const brd = brdData.brd;
      updateStage(0, {
        status: 'done',
        detail: 'Unified BRD generated successfully',
        elapsed: `${((Date.now() - stageStart) / 1000).toFixed(1)}s`,
      });
      addLog(`✅ BRD generated via DeepSeek!`, 'success');

      // ── STAGE 1 (in Phase 2): SAVE ──
      updateStage(1, { status: 'active' });
      addLog('💾 Saving BRD to database...', 'info');
      stageStart = Date.now();

      try {
        const saveRes = await fetch('/api/generate-brd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unifiedRequirements: {
              project_title: brd?.project_name || projectName,
              actors: brd?.actors || [],
              functional_requirements: (brd?.functional_requirements || []).map(fr => ({
                ...fr, status: 'new',
              })),
              non_functional_requirements: brd?.non_functional_requirements || [],
              moscow: brd?.moscow || {},
            },
            conflictResolutions: {},
            sourceTexts: result.rawData?.slice(0, 5000),
            projectName: brd?.project_name || projectName,
            isUpdateMode: false,
          }),
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
          addLog(`✅ BRD saved with ID: ${saveData.brd?.id || 'generated'}`, 'success');
        } else {
          addLog('⚠️ BRD generated but save to DB failed — available below', 'warn');
        }
      } catch {
        addLog('⚠️ Database save skipped — BRD still available below', 'warn');
      }

      updateStage(1, {
        status: 'done',
        detail: 'Saved to Database',
        elapsed: `${((Date.now() - stageStart) / 1000).toFixed(1)}s`,
      });

      // Save to localStorage
      try {
        if (typeof window !== 'undefined' && brd) {
          localStorage.setItem('latest_generated_brd', JSON.stringify({
             ...brd,
             _id: 'local_temp',
             status: 'draft',
             createdAt: new Date().toISOString()
          }));
        }
      } catch (e) {
         console.warn('Could not save to localStorage:', e);
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      setTotalElapsed(prev => `${prev}s + ${totalTime}`); // combined times
      setResult(prev => ({ ...prev, brd }));
      addLog(`\n🎉 Phase 2 complete! BRD ready to view.`, 'system');

    } catch (err) {
      setError(err.message || 'Phase 2 failed');
      addLog(`❌ Error: ${err.message}`, 'error');
      setPipelineStages(prev => prev.map(s =>
        s.status === 'active' || s.status === 'pending' ? { ...s, status: 'error' } : s
      ));
    } finally {
      setRunning(false);
    }
  }

  function handleReset() {
    setProjectName('');
    setDescription('');
    setResult(null);
    setError('');
    setPipelineStages([]);
    setLogs([]);
    setTotalElapsed(null);
  }

  const brd = result?.brd;
  const cards = result?.cards || [];

  return (
    <>
      <Navbar />
      <main className="main-content">
        <div className="page-header" id="auto-generate-header">
          <h1>🤖 AI Auto-Generate BRD</h1>
          <p className="page-subtitle">
            Fully automated — Enter project details, AI handles everything.
            Mistral filters &amp; extracts → DeepSeek generates BRD.
          </p>
        </div>

        {error && (
          <div className="error-banner" id="error-banner">⚠️ {error}
            <button className="error-close" onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/*  INPUT FORM — Only project + description   */}
        {/* ═══════════════════════════════════════════ */}
        {!running && !result && (
          <div className="wizard-panel" id="auto-input-panel" style={{ maxWidth: 680, margin: '0 auto' }}>

            <div style={{
              textAlign: 'center', marginBottom: 32, padding: '28px 20px',
              background: 'linear-gradient(135deg, rgba(124,92,252,0.06), rgba(0,212,170,0.04))',
              borderRadius: 'var(--radius)', border: '1px solid rgba(124,92,252,0.12)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🚀</div>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                Zero-Effort BRD Generation
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Just enter your project name and a short description.<br />
                The AI will <strong>automatically</strong> fetch all Telegram chats, Gmail emails, and meeting transcripts,
                filter relevant content, extract requirements, and generate a complete BRD.
              </p>
            </div>

            <label className="form-label" style={{ fontSize: '0.92rem', fontWeight: 700 }}>
              📁 Project Name <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              className="sender-input"
              id="project-name-input"
              placeholder="e.g. E-Commerce Platform, Bus Tracking App..."
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              style={{ fontSize: '1rem', padding: '14px 16px', marginBottom: 20 }}
              autoFocus
            />

            <label className="form-label" style={{ fontSize: '0.92rem', fontWeight: 700 }}>
              📝 Short Description
            </label>
            <textarea
              className="input-textarea"
              id="description-input"
              placeholder="Brief description of the project (the AI uses this to identify relevant data from all sources)..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ minHeight: 120, fontSize: '0.95rem' }}
            />

            {/* Advanced settings toggle */}
            <div
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', padding: '10px 0', marginTop: 8,
                color: 'var(--text-muted)', fontSize: '0.82rem',
              }}
            >
              <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'var(--transition)', display: 'inline-block' }}>▶</span>
              Advanced Settings (optional)
            </div>

            {showAdvanced && (
              <div style={{
                padding: '16px 20px', background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)',
                marginBottom: 16, animation: 'fadeInUp 0.2s ease',
              }}>
                <label className="form-label" style={{ fontSize: '0.82rem' }}>✈️ Telegram Bot Token (optional)</label>
                <input
                  className="sender-input"
                  id="telegram-token-input"
                  placeholder="e.g. 7123456789:AAF... (leave blank to use env default)"
                  value={telegramToken}
                  onChange={e => setTelegramToken(e.target.value)}
                  style={{ fontSize: '0.85rem', marginBottom: 0 }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  If blank, the system uses the bot token from your .env.local file.
                  Gmail and Drive use your Google OAuth session.
                </div>
              </div>
            )}

            <div style={{
              padding: '16px 20px', marginTop: 12, marginBottom: 24,
              background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.12)',
              borderRadius: 'var(--radius-xs)', fontSize: '0.8rem', color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              <strong style={{ color: 'var(--green)' }}>How it works:</strong><br />
              1️⃣ Fetches <strong>ALL</strong> Telegram messages, Gmail emails, Drive transcripts<br />
              2️⃣ Mistral (local LLM) identifies what's relevant to <em>your project</em><br />
              3️⃣ Mistral extracts structured requirement cards<br />
              4️⃣ DeepSeek generates a complete BRD from the cards<br />
              5️⃣ BRD saved to database — ready to view &amp; download as DOCX
            </div>

            <button
              className="btn-primary btn-generate-brd"
              id="btn-auto-generate"
              onClick={fetchAndExtractCards}
              disabled={!projectName.trim()}
              style={{
                width: '100%', padding: '18px', fontSize: '1.05rem',
                fontWeight: 700, letterSpacing: '0.3px',
                background: projectName.trim()
                  ? 'linear-gradient(135deg, var(--purple), #6c5ce7, var(--green))'
                  : undefined,
              }}
            >
              📥 Fetch Data & Extract Cards
            </button>

            <div style={{
              textAlign: 'center', marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)',
            }}>
              First, the AI will extract structured requirement cards for you to review.
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/*  RUNNING PIPELINE — Live Status             */}
        {/* ═══════════════════════════════════════════ */}
        {running && (
          <div className="wizard-panel" id="pipeline-running-panel">
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>
                🤖 AI Pipeline Running for &ldquo;{projectName}&rdquo;
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Everything is automated — sit back and watch the AI work.
              </p>
            </div>

            {/* Pipeline stages */}
            <div className="auto-pipeline-stages" id="pipeline-stages">
              {pipelineStages.map((stage, i) => (
                <PipelineStage key={i} {...stage} />
              ))}
            </div>

            {/* Live logs */}
            <div className="auto-pipeline-logs" id="pipeline-logs" ref={logRef}>
              <div className="auto-pipeline-logs-header">📡 Live Pipeline Log</div>
              <div className="auto-pipeline-logs-body">
                {logs.map((log, i) => (
                  <div key={i} className={`auto-log-entry log-${log.type}`}>
                    <span className="auto-log-ts">{log.ts}</span>
                    <span className="auto-log-msg">{log.msg}</span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Waiting for pipeline to start...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/*  RESULTS — BRD Generated                    */}
        {/* ═══════════════════════════════════════════ */}
        {result && !running && (
          <div className="wizard-panel" id="pipeline-result-panel">

            {/* Success banner (only show if BRD is generated) */}
            {brd && (
              <div className="brd-success" style={{ marginBottom: 28 }}>
                <div className="brd-success-icon">🎉</div>
                <h3>BRD Generated Successfully!</h3>
                <p>
                  Processed in <strong>{totalElapsed}</strong> — extracted <strong>{cards.length} cards</strong> from
                  all sources and generated a complete BRD for <strong>&ldquo;{brd?.project_name || projectName}&rdquo;</strong>.
                </p>
                <div className="brd-success-actions">
                  <Link href="/brd-view">
                    <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--purple), #6c5ce7)' }}>
                      📄 View Full BRD →
                    </button>
                  </Link>
                  <button className="btn-secondary" onClick={handleReset}>🔄 Start Over</button>
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="stats-row" style={{ marginBottom: 28 }}>
              <div className="stat-card stat-card-messages" style={{ flex: 1 }}>
                <div className="stat-info" style={{ textAlign: 'center' }}>
                  <div className="stat-label">Cards Extracted</div>
                  <div className="stat-value">{cards.length}</div>
                </div>
              </div>
              <div className="stat-card stat-card-requirements" style={{ flex: 1 }}>
                <div className="stat-info" style={{ textAlign: 'center' }}>
                  <div className="stat-label">Functional Reqs</div>
                  <div className="stat-value">{brd?.functional_requirements?.length || '-'}</div>
                </div>
              </div>
              <div className="stat-card stat-card-accuracy" style={{ flex: 1 }}>
                <div className="stat-info" style={{ textAlign: 'center' }}>
                  <div className="stat-label">Pipeline Time</div>
                  <div className="stat-value">{totalElapsed}</div>
                </div>
              </div>
            </div>

            {/* Cards preview */}
            {cards.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div className="section-header">
                  <div className="section-title">🃏 Extracted Requirement Cards</div>
                  <div className="section-badge">{cards.length} cards</div>
                </div>
                <div className="messages-grid">
                  {cards.slice(0, 8).map((card, i) => (
                    <div className="message-card" key={i} style={{ animationDelay: `${i * 0.05}s`, position: 'relative' }}>
                      <button
                        onClick={() => {
                          const updatedCards = [...cards];
                          // To match the original index we need to find it if we aren't slicing, but since we are slicing:
                          // wait, using the mapped index is only for the sliced array.
                          // Let's just filter it out.
                          const cardToRemove = card;
                          const newCards = cards.filter(c => c !== cardToRemove);
                          setResult(prev => ({ ...prev, cards: newCards }));
                        }}
                        style={{
                          position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)'
                        }}
                        title="Remove Card"
                      >
                        ❌
                      </button>
                      <div className="message-header" style={{ paddingRight: '24px' }}>
                        <span className={`source-badge ${card.source === 'chat' ? 'telegram' : card.source === 'email' ? 'email' : card.source === 'meeting' ? 'meeting' : 'notes'}`}>
                          {card.source === 'chat' && '✈️'}
                          {card.source === 'email' && '📧'}
                          {card.source === 'meeting' && '📞'}
                          {!['chat', 'email', 'meeting'].includes(card.source) && '📝'}
                          {' '}{card.source}
                        </span>
                        <span className={`tag ${
                          card.type === 'requirement' ? 'green' :
                          card.type === 'stakeholder' ? 'blue' :
                          card.type === 'decision' ? 'purple' :
                          card.type === 'timeline' ? 'orange' :
                          card.type === 'issue' ? 'red' : 'yellow'
                        }`}>{card.type}</span>
                      </div>
                      <div className="message-content">{card.content}</div>
                    </div>
                  ))}
                </div>
                {cards.length > 8 && (
                  <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    + {cards.length - 8} more cards — view full BRD for all details
                  </div>
                )}
                
                {/* PHASE 2 BUTTON */}
                {!brd && cards.length > 0 && (
                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button
                      className="btn-primary"
                      onClick={generateBrdFromCards}
                      disabled={running}
                      style={{
                        padding: '16px 32px', fontSize: '1.05rem', fontWeight: 700,
                        background: 'linear-gradient(135deg, var(--green), #00b894)',
                        boxShadow: '0 4px 15px rgba(0, 212, 170, 0.4)'
                      }}
                    >
                      🤖 Generate BRD from Curated Cards
                    </button>
                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Click this when you are finished removing irrelevant cards above.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pipeline logs (collapsed) */}
            <details style={{ marginTop: 12 }}>
              <summary style={{
                cursor: 'pointer', padding: '10px 16px', fontSize: '0.85rem',
                color: 'var(--text-secondary)', background: 'var(--surface-glass)',
                borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)',
              }}>
                📡 View Pipeline Log ({logs.length} entries)
              </summary>
              <div className="auto-pipeline-logs" style={{ marginTop: 8 }}>
                <div className="auto-pipeline-logs-body">
                  {logs.map((log, i) => (
                    <div key={i} className={`auto-log-entry log-${log.type}`}>
                      <span className="auto-log-ts">{log.ts}</span>
                      <span className="auto-log-msg">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}

      </main>
    </>
  );
}
