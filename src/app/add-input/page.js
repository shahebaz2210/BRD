'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="navbar">
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

/* ── STEP INDICATOR ── */
function StepIndicator({ steps, currentStep }) {
  return (
    <div className="wizard-steps" id="wizard-steps">
      {steps.map((step, i) => (
        <div key={i} className={`wizard-step ${currentStep === i ? 'active' : ''} ${currentStep > i ? 'completed' : ''}`}>
          <div className="wizard-step-number">{currentStep > i ? '✓' : i + 1}</div>
          <div className="wizard-step-label">{step}</div>
          {i < steps.length - 1 && <div className={`wizard-step-connector ${currentStep > i ? 'completed' : ''}`}></div>}
        </div>
      ))}
    </div>
  );
}

function AddInputContent() {
  const searchParams = useSearchParams();

  // ── Wizard state ──
  const [wizardStep, setWizardStep] = useState(0); // 0=select sources, 1=collect data, 2=analysis, 3=conflicts, 4=generate
  const wizardSteps = ['Select Sources', 'Collect Data', 'AI Analysis', 'Resolve Conflicts', 'Generate BRD'];

  // ── Selected sources ──
  const [selectedSources, setSelectedSources] = useState(new Set());

  // ── Google connection state ──
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');

  // ── Gmail state ──
  const [gmailMessages, setGmailMessages] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [selectedGmail, setSelectedGmail] = useState(new Set());

  // ── Drive/Transcript state ──
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState(new Set());

  // ── Telegram state ──
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [selectedTelegram, setSelectedTelegram] = useState(new Set());

  // ── Upload media state ──
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Local files state ──
  const [localDocTexts, setLocalDocTexts] = useState([]);
  const [localUploading, setLocalUploading] = useState(false);
  const [localDragOver, setLocalDragOver] = useState(false);
  const localFileInputRef = useRef(null);

  // ── Audio recording ──
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  // ── Manual input ──
  const [manualSource, setManualSource] = useState('notes');
  const [senderName, setSenderName] = useState('');
  const [manualText, setManualText] = useState('');

  // ── Analysis state ──
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  // ── Conflict resolutions ──
  const [conflictChoices, setConflictChoices] = useState({});

  // ── BRD generation ──
  const [generating, setGenerating] = useState(false);
  const [generatedBrd, setGeneratedBrd] = useState(null);

  // ── General state ──
  const [error, setError] = useState('');

  // ── Google OAuth callback ──
  useEffect(() => {
    const connected = searchParams.get('connected');
    const email = searchParams.get('email');
    const errParam = searchParams.get('error');
    if (connected === 'google') {
      setGoogleConnected(true);
      setGoogleEmail(email || '');
    }
    if (errParam) setError(`Authentication failed: ${errParam}`);
  }, [searchParams]);

  // ══════════════════ SOURCE SELECTION ══════════════════
  const sourceOptions = [
    { id: 'manual', icon: '✍️', label: 'Manual Input', desc: 'Paste text from chats, emails, or notes' },
    { id: 'local_file', icon: '📁', label: 'Local Files', desc: 'Upload .txt, .docx, .md, .csv from your device' },
    { id: 'upload', icon: '📎', label: 'Media Upload', desc: 'Images (OCR) & audio files for transcription' },
    { id: 'gmail', icon: '📧', label: 'Gmail', desc: 'Fetch emails from your connected Gmail' },
    { id: 'transcript', icon: '📝', label: 'Transcripts', desc: 'Google Drive meeting transcripts & docs' },
    { id: 'telegram', icon: '✈️', label: 'Telegram', desc: 'Fetch messages from Telegram bot' },
  ];

  function toggleSource(id) {
    const next = new Set(selectedSources);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSources(next);
  }

  // ══════════════════ DATA FETCHERS ══════════════════
  async function fetchGmail() {
    setGmailLoading(true); setError('');
    try {
      const res = await fetch('/api/fetch/gmail');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGmailMessages(data.messages || []);
    } catch (err) { setError(err.message); }
    setGmailLoading(false);
  }

  async function fetchDrive() {
    setDriveLoading(true); setError('');
    try {
      const res = await fetch('/api/fetch/drive');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDriveFiles(data.files || []);
    } catch (err) { setError(err.message); }
    setDriveLoading(false);
  }

  async function fetchTelegram() {
    setTelegramLoading(true); setError('');
    try {
      const url = telegramToken
        ? `/api/fetch/telegram?token=${encodeURIComponent(telegramToken)}`
        : '/api/fetch/telegram';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.help?.join('\n'));
      setTelegramMessages(data.messages || []);
    } catch (err) { setError(err.message); }
    setTelegramLoading(false);
  }

  // ── Media upload (image/audio) ──
  async function handleMediaUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true); setError('');
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      if (!isImage && !isAudio) { setError(`Unsupported: ${file.name}`); continue; }
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', isImage ? 'image' : 'audio');
        const res = await fetch('/api/media', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setExtractedTexts(prev => [...prev, {
          id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          fileName: file.name, type: isImage ? 'image' : 'audio',
          extractedText: data.extractedText,
          preview: isImage ? URL.createObjectURL(file) : null,
        }]);
      } catch (err) { setError(`Error processing ${file.name}: ${err.message}`); }
    }
    setUploading(false);
  }

  // ── Local document upload (.txt, .docx, etc.) ──
  async function handleLocalFileUpload(files) {
    if (!files || files.length === 0) return;
    setLocalUploading(true); setError('');
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      try {
        if (['txt', 'md', 'csv', 'log', 'json'].includes(ext)) {
          // Read text files client-side
          const text = await file.text();
          setLocalDocTexts(prev => [...prev, {
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            fileName: file.name, fileType: ext, extractedText: text, size: file.size,
          }]);
        } else if (ext === 'docx') {
          // Send to server for mammoth extraction
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/upload-document', { method: 'POST', body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setLocalDocTexts(prev => [...prev, {
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            fileName: file.name, fileType: ext, extractedText: data.extractedText, size: file.size,
          }]);
        } else {
          setError(`Unsupported file type: .${ext}. Use .txt, .md, .csv, or .docx`);
        }
      } catch (err) { setError(`Error reading ${file.name}: ${err.message}`); }
    }
    setLocalUploading(false);
  }

  // ── Drag & Drop handlers ──
  const handleMediaDragOver = useCallback(e => { e.preventDefault(); setDragOver(true); }, []);
  const handleMediaDragLeave = useCallback(e => { e.preventDefault(); setDragOver(false); }, []);
  const handleMediaDrop = useCallback(e => { e.preventDefault(); setDragOver(false); handleMediaUpload(e.dataTransfer.files); }, []);

  const handleLocalDragOver = useCallback(e => { e.preventDefault(); setLocalDragOver(true); }, []);
  const handleLocalDragLeave = useCallback(e => { e.preventDefault(); setLocalDragOver(false); }, []);
  const handleLocalDrop = useCallback(e => { e.preventDefault(); setLocalDragOver(false); handleLocalFileUpload(e.dataTransfer.files); }, []);

  // ── Speech recognition ──
  function startRecording() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported. Use Chrome.'); return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let f = '', i2 = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) f += event.results[i][0].transcript + ' ';
        else i2 += event.results[i][0].transcript;
      }
      setTranscript(f + i2);
    };
    recognition.onerror = (event) => { setError(`Speech error: ${event.error}`); setIsRecording(false); };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start(); setIsRecording(true);
  }

  function stopRecording() {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    if (transcript.trim()) {
      setExtractedTexts(prev => [...prev, {
        id: `voice-${Date.now()}`, fileName: 'Voice Recording',
        type: 'audio', extractedText: transcript, preview: null,
      }]);
    }
  }

  // ══════════════════ COLLECT ALL SOURCE DATA ══════════════════
  async function collectAllSourceData() {
    const collectedSources = [];

    // Manual
    if (selectedSources.has('manual') && manualText.trim()) {
      collectedSources.push({
        sourceType: manualSource,
        label: `Manual input (${manualSource})`,
        text: manualText,
      });
    }

    // Local files
    if (selectedSources.has('local_file') && localDocTexts.length > 0) {
      localDocTexts.forEach(doc => {
        collectedSources.push({
          sourceType: 'local_file',
          label: doc.fileName,
          text: doc.extractedText,
        });
      });
    }

    // Media uploads
    if (selectedSources.has('upload') && extractedTexts.length > 0) {
      extractedTexts.forEach(item => {
        collectedSources.push({
          sourceType: 'upload',
          label: `${item.type}: ${item.fileName}`,
          text: item.extractedText,
        });
      });
    }

    // Gmail
    if (selectedSources.has('gmail') && selectedGmail.size > 0) {
      const selected = gmailMessages.filter(m => selectedGmail.has(m.id));
      const text = selected.map(m => `From: ${m.from}\nSubject: ${m.subject}\n\n${m.body}`).join('\n\n---\n\n');
      collectedSources.push({ sourceType: 'gmail', label: `Gmail (${selected.length} emails)`, text });
    }

    // Transcripts
    if (selectedSources.has('transcript') && selectedDrive.size > 0) {
      const selected = driveFiles.filter(f => selectedDrive.has(f.id));
      const contents = await Promise.all(
        selected.map(async (f) => {
          try {
            const res = await fetch('/api/fetch/drive', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId: f.id, fileName: f.name }),
            });
            const data = await res.json();
            return `Document: ${f.name}\n\n${data.content || '(empty)'}`;
          } catch { return `Document: ${f.name}\n\n(Failed to fetch)`; }
        })
      );
      collectedSources.push({
        sourceType: 'transcript',
        label: `Transcripts (${selected.length} docs)`,
        text: contents.join('\n\n---\n\n'),
      });
    }

    // Telegram
    if (selectedSources.has('telegram') && selectedTelegram.size > 0) {
      const selected = telegramMessages.filter(m => selectedTelegram.has(m.id));
      const text = selected.map(m => `${m.from}: ${m.text}`).join('\n');
      collectedSources.push({ sourceType: 'telegram', label: `Telegram (${selected.length} messages)`, text });
    }

    return collectedSources;
  }

  // ══════════════════ ANALYZE SOURCES ══════════════════
  async function handleAnalyze() {
    setError('');
    const sources = await collectAllSourceData();
    if (sources.length === 0) {
      setError('No data collected. Please add data to your selected sources first.');
      return;
    }

    setAnalyzing(true);
    setWizardStep(2);

    try {
      const res = await fetch('/api/analyze-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAnalysisResult(data.analysis);

      // Check if there are conflicts
      if (data.analysis.conflicts && data.analysis.conflicts.length > 0) {
        setWizardStep(3); // Go to conflict resolution
      } else {
        setWizardStep(4); // Skip to generate
      }
    } catch (err) {
      setError(err.message);
      setWizardStep(1);
    }
    setAnalyzing(false);
  }

  // ══════════════════ GENERATE BRD ══════════════════
  async function handleGenerateBrd() {
    if (!analysisResult) { setError('No analysis data. Please analyze sources first.'); return; }

    setGenerating(true); setError('');

    try {
      const sources = await collectAllSourceData();
      const sourceTexts = sources.map(s => s.text).join('\n\n---\n\n');

      const res = await fetch('/api/generate-brd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedRequirements: analysisResult.unified_requirements,
          conflictResolutions: conflictChoices,
          sourceTexts,
          projectName: analysisResult.identified_project?.name || 'Software Project',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setGeneratedBrd(data.brd);
    } catch (err) {
      setError(err.message);
    }
    setGenerating(false);
  }

  // ══════════════════ HELPERS ══════════════════
  function toggleSelection(set, setFn, id) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFn(next);
  }

  function removeLocalDoc(id) { setLocalDocTexts(prev => prev.filter(d => d.id !== id)); }
  function removeExtracted(id) { setExtractedTexts(prev => prev.filter(t => t.id !== id)); }

  function handleReset() {
    setWizardStep(0);
    setSelectedSources(new Set());
    setManualText(''); setSenderName('');
    setAnalysisResult(null);
    setConflictChoices({});
    setGeneratedBrd(null);
    setSelectedGmail(new Set());
    setSelectedDrive(new Set());
    setSelectedTelegram(new Set());
    setExtractedTexts([]); setLocalDocTexts([]);
    setTranscript(''); setError('');
  }

  function hasDataForSource(srcId) {
    if (srcId === 'manual') return manualText.trim().length > 0;
    if (srcId === 'local_file') return localDocTexts.length > 0;
    if (srcId === 'upload') return extractedTexts.length > 0;
    if (srcId === 'gmail') return selectedGmail.size > 0;
    if (srcId === 'transcript') return selectedDrive.size > 0;
    if (srcId === 'telegram') return selectedTelegram.size > 0;
    return false;
  }

  const sourcesWithData = [...selectedSources].filter(s => hasDataForSource(s));

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <>
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>📥 Unified Data Ingestion</h1>
          <p className="page-subtitle">Collect from multiple sources → AI identifies the project → Resolve conflicts → Generate one BRD</p>
        </div>

        {/* Wizard Step Indicator */}
        <StepIndicator steps={wizardSteps} currentStep={wizardStep} />

        {error && (
          <div className="error-banner" id="error-banner">⚠️ {error}
            <button className="error-close" onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* STEP 0: SELECT SOURCES                          */}
        {/* ═══════════════════════════════════════════════ */}
        {wizardStep === 0 && (
          <div className="wizard-panel" id="step-select-sources">
            <h2>🔌 Choose Your Data Sources</h2>
            <p className="wizard-desc">Select one or more sources to collect data from. The AI will combine everything and generate a single, unified BRD.</p>

            <div className="source-grid">
              {sourceOptions.map(opt => (
                <div
                  key={opt.id}
                  className={`source-card ${selectedSources.has(opt.id) ? 'selected' : ''}`}
                  onClick={() => toggleSource(opt.id)}
                  id={`source-${opt.id}`}
                >
                  <div className="source-card-check">{selectedSources.has(opt.id) ? '✓' : ''}</div>
                  <div className="source-card-icon">{opt.icon}</div>
                  <div className="source-card-label">{opt.label}</div>
                  <div className="source-card-desc">{opt.desc}</div>
                </div>
              ))}
            </div>

            <button
              className="btn-primary"
              disabled={selectedSources.size === 0}
              onClick={() => setWizardStep(1)}
              style={{ marginTop: 24 }}
            >
              ➡️ Next: Collect Data ({selectedSources.size} source{selectedSources.size !== 1 ? 's' : ''} selected)
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* STEP 1: COLLECT DATA FROM EACH SOURCE           */}
        {/* ═══════════════════════════════════════════════ */}
        {wizardStep === 1 && (
          <div className="wizard-panel" id="step-collect-data">
            <div className="wizard-panel-header">
              <h2>📋 Collect Data</h2>
              <button className="btn-text" onClick={() => setWizardStep(0)}>← Back to Sources</button>
            </div>
            <p className="wizard-desc">Fill in or fetch data from each selected source. When ready, click "Analyze All Sources" to let AI process everything together.</p>

            {/* Source panels - one accordion for each selected source */}
            <div className="source-panels">

              {/* ── MANUAL ── */}
              {selectedSources.has('manual') && (
                <div className="source-panel" id="panel-manual">
                  <div className="source-panel-header">
                    <span>✍️ Manual Input</span>
                    {manualText.trim() && <span className="data-badge">✓ {manualText.split(/\s+/).length} words</span>}
                  </div>
                  <div className="source-panel-body">
                    <label className="form-label">Source Type</label>
                    <div className="source-selector">
                      {[
                        { id: 'telegram', icon: '✈️', label: 'Telegram' },
                        { id: 'email', icon: '📧', label: 'Email' },
                        { id: 'meeting', icon: '📞', label: 'Meeting' },
                        { id: 'notes', icon: '📝', label: 'Notes' },
                      ].map(s => (
                        <button key={s.id} className={`source-btn ${manualSource === s.id ? 'active' : ''}`} onClick={() => setManualSource(s.id)} type="button">
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                    <label className="form-label">Sender Name</label>
                    <input className="sender-input" placeholder="e.g. Gaurav, priya@co.com…" value={senderName} onChange={e => setSenderName(e.target.value)} />
                    <label className="form-label">Message / Transcript</label>
                    <textarea className="input-textarea" placeholder={`Paste your ${manualSource} chat, email body, meeting transcript, or notes…`} value={manualText} onChange={e => setManualText(e.target.value)} />
                  </div>
                </div>
              )}

              {/* ── LOCAL FILES ── */}
              {selectedSources.has('local_file') && (
                <div className="source-panel" id="panel-local-file">
                  <div className="source-panel-header">
                    <span>📁 Local Files</span>
                    {localDocTexts.length > 0 && <span className="data-badge">✓ {localDocTexts.length} file{localDocTexts.length !== 1 ? 's' : ''}</span>}
                  </div>
                  <div className="source-panel-body">
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                      Upload documents from your device. Supported: <strong>.txt, .md, .csv, .docx</strong>
                    </p>
                    <div
                      className={`upload-dropzone ${localDragOver ? 'drag-over' : ''}`}
                      onDragOver={handleLocalDragOver}
                      onDragLeave={handleLocalDragLeave}
                      onDrop={handleLocalDrop}
                      onClick={() => localFileInputRef.current?.click()}
                    >
                      <input
                        ref={localFileInputRef}
                        type="file"
                        multiple
                        accept=".txt,.md,.csv,.docx,.log,.json"
                        style={{ display: 'none' }}
                        onChange={(e) => handleLocalFileUpload(e.target.files)}
                      />
                      <div className="upload-icon">{localUploading ? '⏳' : '📂'}</div>
                      <div className="upload-text">{localUploading ? 'Reading files…' : 'Drag & drop documents or click to browse'}</div>
                      <div className="upload-hint">TXT, Markdown, CSV, DOCX, JSON, LOG</div>
                    </div>

                    {localDocTexts.length > 0 && (
                      <div className="extracted-items">
                        <label className="form-label">Loaded Documents ({localDocTexts.length})</label>
                        {localDocTexts.map(doc => (
                          <div key={doc.id} className="extracted-item">
                            <div className="extracted-item-header">
                              <span className="media-badge local">📄 {doc.fileName} <small>({(doc.size / 1024).toFixed(1)} KB)</small></span>
                              <button className="btn-remove" onClick={() => removeLocalDoc(doc.id)} type="button">✕</button>
                            </div>
                            <div className="extracted-text">{doc.extractedText.slice(0, 300)}{doc.extractedText.length > 300 ? '…' : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── MEDIA UPLOAD ── */}
              {selectedSources.has('upload') && (
                <div className="source-panel" id="panel-upload">
                  <div className="source-panel-header">
                    <span>📎 Media Upload</span>
                    {extractedTexts.length > 0 && <span className="data-badge">✓ {extractedTexts.length} file{extractedTexts.length !== 1 ? 's' : ''}</span>}
                  </div>
                  <div className="source-panel-body">
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                      Upload images (screenshots, diagrams) or audio (meeting recordings) for AI text extraction.
                    </p>
                    <div
                      className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
                      onDragOver={handleMediaDragOver}
                      onDragLeave={handleMediaDragLeave}
                      onDrop={handleMediaDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/jpg,image/webp,audio/mp3,audio/wav,audio/ogg,audio/mpeg,audio/m4a,audio/x-m4a" style={{ display: 'none' }} onChange={(e) => handleMediaUpload(e.target.files)} />
                      <div className="upload-icon">{uploading ? '⏳' : '🖼️'}</div>
                      <div className="upload-text">{uploading ? 'Processing…' : 'Drag & drop images or audio, or click to browse'}</div>
                      <div className="upload-hint">PNG, JPG, WebP • MP3, WAV, OGG, M4A</div>
                    </div>

                    <div className="voice-section">
                      <button className={`btn-voice ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} type="button">
                        {isRecording ? '⏹️ Stop Recording' : '🎤 Record & Transcribe'}
                      </button>
                      {isRecording && (<div className="recording-indicator"><span className="rec-dot"></span> Recording… Speak clearly</div>)}
                      {transcript && (<div className="transcript-preview"><div className="transcript-label">Live Transcript:</div><div className="transcript-text">{transcript}</div></div>)}
                    </div>

                    {extractedTexts.length > 0 && (
                      <div className="extracted-items">
                        <label className="form-label">Extracted Content ({extractedTexts.length} files)</label>
                        {extractedTexts.map(item => (
                          <div key={item.id} className="extracted-item">
                            <div className="extracted-item-header">
                              <span className={`media-badge ${item.type}`}>{item.type === 'image' ? '🖼️' : '🔊'} {item.fileName}</span>
                              <button className="btn-remove" onClick={() => removeExtracted(item.id)} type="button">✕</button>
                            </div>
                            {item.preview && <img src={item.preview} alt={item.fileName} className="extracted-preview" />}
                            <div className="extracted-text">{item.extractedText.slice(0, 300)}{item.extractedText.length > 300 ? '…' : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── GMAIL ── */}
              {selectedSources.has('gmail') && (
                <div className="source-panel" id="panel-gmail">
                  <div className="source-panel-header">
                    <span>📧 Gmail</span>
                    {selectedGmail.size > 0 && <span className="data-badge">✓ {selectedGmail.size} selected</span>}
                  </div>
                  <div className="source-panel-body">
                    {!googleConnected ? (
                      <div className="connect-section">
                        <div className="connect-icon">📧</div>
                        <h3>Connect Your Gmail</h3>
                        <p>Sign in with Google to fetch recent emails.</p>
                        <a href="/api/auth/google">
                          <button className="btn-google" type="button">
                            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Sign in with Google
                          </button>
                        </a>
                      </div>
                    ) : (
                      <>
                        <div className="connected-badge"><span className="dot"></span> Connected as {googleEmail}</div>
                        <div className="fetch-toolbar">
                          <button className="btn-secondary" onClick={fetchGmail} disabled={gmailLoading} type="button">
                            {gmailLoading ? <><div className="spinner" style={{width:14,height:14,borderWidth:2}}></div> Fetching…</> : '🔄 Fetch Emails'}
                          </button>
                          <span className="selection-count">{selectedGmail.size} selected</span>
                        </div>
                        <div className="fetch-list">
                          {gmailMessages.length === 0 && !gmailLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Click &quot;Fetch Emails&quot; to load</div>}
                          {gmailMessages.map(msg => (
                            <div key={msg.id} className={`fetch-item ${selectedGmail.has(msg.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedGmail, setSelectedGmail, msg.id)}>
                              <div className="fetch-checkbox">{selectedGmail.has(msg.id) ? '✓' : ''}</div>
                              <div className="fetch-item-content">
                                <div className="fetch-item-title">{msg.subject}</div>
                                <div className="fetch-item-snippet">{msg.snippet || msg.body?.slice(0, 120)}</div>
                                <div className="fetch-item-meta"><span>From: {msg.from}</span><span>{msg.date ? new Date(msg.date).toLocaleDateString() : ''}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── TRANSCRIPTS ── */}
              {selectedSources.has('transcript') && (
                <div className="source-panel" id="panel-transcript">
                  <div className="source-panel-header">
                    <span>📝 Transcripts</span>
                    {selectedDrive.size > 0 && <span className="data-badge">✓ {selectedDrive.size} selected</span>}
                  </div>
                  <div className="source-panel-body">
                    {!googleConnected ? (
                      <div className="connect-section">
                        <div className="connect-icon">📝</div>
                        <h3>Connect for Transcripts</h3>
                        <p>Sign in with Google to fetch meeting transcripts from Drive.</p>
                        <a href="/api/auth/google">
                          <button className="btn-google" type="button">
                            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Sign in with Google
                          </button>
                        </a>
                      </div>
                    ) : (
                      <>
                        <div className="connected-badge"><span className="dot"></span> Connected as {googleEmail}</div>
                        <div className="fetch-toolbar">
                          <button className="btn-secondary" onClick={fetchDrive} disabled={driveLoading} type="button">
                            {driveLoading ? <><div className="spinner" style={{width:14,height:14,borderWidth:2}}></div> Fetching…</> : '🔄 Fetch Transcripts'}
                          </button>
                          <span className="selection-count">{selectedDrive.size} selected</span>
                        </div>
                        <div className="fetch-list">
                          {driveFiles.length === 0 && !driveLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Click &quot;Fetch Transcripts&quot; to load</div>}
                          {driveFiles.map(file => (
                            <div key={file.id} className={`fetch-item ${selectedDrive.has(file.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedDrive, setSelectedDrive, file.id)}>
                              <div className="fetch-checkbox">{selectedDrive.has(file.id) ? '✓' : ''}</div>
                              <div className="fetch-item-content">
                                <div className="fetch-item-title">📄 {file.name}</div>
                                <div className="fetch-item-meta"><span>Owner: {file.owner}</span><span>Modified: {new Date(file.modifiedTime).toLocaleDateString()}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── TELEGRAM ── */}
              {selectedSources.has('telegram') && (
                <div className="source-panel" id="panel-telegram">
                  <div className="source-panel-header">
                    <span>✈️ Telegram</span>
                    {selectedTelegram.size > 0 && <span className="data-badge">✓ {selectedTelegram.size} selected</span>}
                  </div>
                  <div className="source-panel-body">
                    <label className="form-label">Bot Token (from @BotFather)</label>
                    <div className="token-input-group">
                      <input className="sender-input" style={{ marginBottom: 0 }} placeholder="e.g. 7123456789:AAF..." value={telegramToken} onChange={e => setTelegramToken(e.target.value)} />
                      <button className="btn-secondary" onClick={fetchTelegram} disabled={telegramLoading} type="button" style={{ whiteSpace: 'nowrap' }}>
                        {telegramLoading ? '⏳' : '🔄'} Fetch
                      </button>
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
                      💡 Create a bot via @BotFather → send messages to your bot → fetch them here.
                    </p>
                    <div className="fetch-list">
                      {telegramMessages.length === 0 && !telegramLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Enter token and click Fetch</div>}
                      {telegramMessages.map(msg => (
                        <div key={msg.id} className={`fetch-item ${selectedTelegram.has(msg.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedTelegram, setSelectedTelegram, msg.id)}>
                          <div className="fetch-checkbox">{selectedTelegram.has(msg.id) ? '✓' : ''}</div>
                          <div className="fetch-item-content">
                            <div className="fetch-item-title">💬 {msg.from}</div>
                            <div className="fetch-item-snippet">{msg.text}</div>
                            <div className="fetch-item-meta"><span>Chat: {msg.chat}</span><span>{new Date(msg.date).toLocaleString()}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Data summary & Analyze button */}
            <div className="analyze-bar">
              <div className="analyze-bar-left">
                <span className="analyze-summary">
                  {sourcesWithData.length === 0
                    ? '⚠️ No data added yet — fill in at least one source above'
                    : `✅ ${sourcesWithData.length} source${sourcesWithData.length !== 1 ? 's' : ''} have data`
                  }
                </span>
                <div className="source-badges">
                  {sourcesWithData.map(s => {
                    const opt = sourceOptions.find(o => o.id === s);
                    return <span key={s} className="source-mini-badge">{opt?.icon} {opt?.label}</span>;
                  })}
                </div>
              </div>
              <button
                className="btn-primary btn-analyze"
                onClick={handleAnalyze}
                disabled={analyzing || sourcesWithData.length === 0}
              >
                {analyzing
                  ? <><div className="spinner" style={{width:16,height:16,borderWidth:2}}></div> Analyzing…</>
                  : <>🧠 Analyze All Sources</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* STEP 2: AI ANALYSIS IN PROGRESS                 */}
        {/* ═══════════════════════════════════════════════ */}
        {wizardStep === 2 && analyzing && (
          <div className="wizard-panel analysis-loading" id="step-analysis">
            <div className="analysis-spinner-wrap">
              <div className="spinner large"></div>
              <h2>🧠 AI is Analyzing Your Sources…</h2>
              <p>Identifying the project, detecting conflicts, and unifying requirements from all {selectedSources.size} sources.</p>
              <div className="analysis-steps-mini">
                <div className="analysis-mini-step active">📥 Combining source data</div>
                <div className="analysis-mini-step">🔍 NLP preprocessing</div>
                <div className="analysis-mini-step">🤖 DeepSeek V3.2 analysis</div>
                <div className="analysis-mini-step">⚖️ Conflict detection</div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* STEP 3: CONFLICT RESOLUTION                     */}
        {/* ═══════════════════════════════════════════════ */}
        {wizardStep === 3 && analysisResult && (
          <div className="wizard-panel" id="step-conflicts">
            <div className="wizard-panel-header">
              <h2>⚖️ Conflicts Detected</h2>
              <button className="btn-text" onClick={() => setWizardStep(1)}>← Back to Data</button>
            </div>

            {/* Project identification */}
            {analysisResult.identified_project && (
              <div className="project-id-card">
                <div className="project-id-label">🎯 Identified Project</div>
                <div className="project-id-name">{analysisResult.identified_project.name}</div>
                <div className="project-id-desc">{analysisResult.identified_project.description}</div>
                <div className="project-id-confidence">
                  Confidence: <span className="confidence-value">{Math.round((analysisResult.identified_project.confidence || 0.8) * 100)}%</span>
                </div>
              </div>
            )}

            <p className="wizard-desc">
              The AI found <strong>{analysisResult.conflicts?.length || 0} conflict{(analysisResult.conflicts?.length || 0) !== 1 ? 's' : ''}</strong> across your sources.
              Please choose which version to follow for each conflict.
            </p>

            <div className="conflicts-list">
              {(analysisResult.conflicts || []).map((conflict, idx) => (
                <div key={conflict.id || idx} className="conflict-card" id={`conflict-${idx}`}>
                  <div className="conflict-header">
                    <span className="conflict-topic">⚡ {conflict.topic}</span>
                    <span className="conflict-badge">Conflict #{idx + 1}</span>
                  </div>
                  <p className="conflict-desc">{conflict.description}</p>

                  <div className="conflict-options">
                    {(conflict.options || []).map((option, optIdx) => (
                      <div
                        key={optIdx}
                        className={`conflict-option ${conflictChoices[conflict.id]?.index === optIdx ? 'chosen' : ''}`}
                        onClick={() => setConflictChoices(prev => ({
                          ...prev,
                          [conflict.id]: { index: optIdx, chosen: option.description, source: option.source },
                        }))}
                      >
                        <div className="conflict-option-radio">
                          {conflictChoices[conflict.id]?.index === optIdx ? '●' : '○'}
                        </div>
                        <div className="conflict-option-content">
                          <div className="conflict-option-source">📌 From: {option.source}</div>
                          <div className="conflict-option-text">{option.description}</div>
                          {option.context && <div className="conflict-option-context">"{option.context}"</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn-primary"
              onClick={() => setWizardStep(4)}
              disabled={Object.keys(conflictChoices).length < (analysisResult.conflicts?.length || 0)}
              style={{ marginTop: 24 }}
            >
              ✅ Confirm Resolutions & Continue
            </button>
            {Object.keys(conflictChoices).length < (analysisResult.conflicts?.length || 0) && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 8 }}>
                Please resolve all {analysisResult.conflicts?.length} conflicts to continue
              </p>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* STEP 4: GENERATE UNIFIED BRD                    */}
        {/* ═══════════════════════════════════════════════ */}
        {(wizardStep === 4) && analysisResult && (
          <div className="wizard-panel" id="step-generate">
            <div className="wizard-panel-header">
              <h2>🚀 Generate Unified BRD</h2>
              <button className="btn-text" onClick={() => {
                if (analysisResult.conflicts?.length > 0) setWizardStep(3);
                else setWizardStep(1);
              }}>← Back</button>
            </div>

            {/* Project summary */}
            {analysisResult.identified_project && (
              <div className="project-id-card">
                <div className="project-id-label">🎯 Project</div>
                <div className="project-id-name">{analysisResult.identified_project.name}</div>
                <div className="project-id-desc">{analysisResult.identified_project.description}</div>
              </div>
            )}

            {/* Source summaries */}
            {analysisResult.source_summaries && (
              <div className="source-summaries">
                <h3>📊 Source Contributions</h3>
                <div className="source-summary-grid">
                  {analysisResult.source_summaries.map((ss, i) => (
                    <div key={i} className={`source-summary-card relevance-${ss.relevance || 'medium'}`}>
                      <div className="source-summary-type">
                        {ss.sourceType === 'gmail' && '📧'}
                        {ss.sourceType === 'telegram' && '✈️'}
                        {ss.sourceType === 'transcript' && '📝'}
                        {ss.sourceType === 'upload' && '📎'}
                        {ss.sourceType === 'local_file' && '📁'}
                        {(ss.sourceType === 'notes' || ss.sourceType === 'meeting' || ss.sourceType === 'email') && '✍️'}
                        {' '}{ss.label}
                      </div>
                      <div className="source-summary-text">{ss.summary}</div>
                      <div className={`relevance-badge ${ss.relevance || 'medium'}`}>{ss.relevance || 'medium'} relevance</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick preview of unified requirements */}
            {analysisResult.unified_requirements && (
              <div className="unified-preview">
                <h3>📋 Unified Requirements Preview</h3>
                <div className="preview-stats">
                  <span>⚡ {analysisResult.unified_requirements.functional_requirements?.length || 0} Functional</span>
                  <span>🛡️ {analysisResult.unified_requirements.non_functional_requirements?.length || 0} Non-Functional</span>
                  <span>👥 {analysisResult.unified_requirements.actors?.length || 0} Actors</span>
                  <span>🎯 {analysisResult.unified_requirements.features?.length || 0} Features</span>
                </div>
                {Object.keys(conflictChoices).length > 0 && (
                  <div className="conflict-resolutions-summary">
                    <span>✅ {Object.keys(conflictChoices).length} conflict{Object.keys(conflictChoices).length !== 1 ? 's' : ''} resolved</span>
                  </div>
                )}
              </div>
            )}

            {!generatedBrd ? (
              <button
                className="btn-primary btn-generate-brd"
                onClick={handleGenerateBrd}
                disabled={generating}
              >
                {generating
                  ? <><div className="spinner" style={{width:16,height:16,borderWidth:2}}></div> Generating Unified BRD…</>
                  : <>📄 Generate Unified BRD</>
                }
              </button>
            ) : (
              <div className="brd-success">
                <div className="brd-success-icon">🎉</div>
                <h3>BRD Generated Successfully!</h3>
                <p>Your unified Business Requirements Document has been created from {selectedSources.size} source{selectedSources.size !== 1 ? 's' : ''}.</p>
                <div className="brd-success-actions">
                  <Link href="/brd-view">
                    <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--purple), #6c5ce7)' }}>📄 View BRD →</button>
                  </Link>
                  <button className="btn-secondary" onClick={handleReset}>🔄 Start New Analysis</button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </>
  );
}

export default function AddInputPage() {
  return (
    <Suspense fallback={<div className="loading-spinner"><div className="spinner"></div> Loading…</div>}>
      <AddInputContent />
    </Suspense>
  );
}
