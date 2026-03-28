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

function AddInputContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('manual');

  // Google connection state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');

  // Gmail state
  const [gmailMessages, setGmailMessages] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [selectedGmail, setSelectedGmail] = useState(new Set());

  // Drive/Transcript state
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState(new Set());

  // Telegram state
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [selectedTelegram, setSelectedTelegram] = useState(new Set());

  // Upload state (NEW)
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Manual input state
  const [source, setSource] = useState('telegram');
  const [senderName, setSenderName] = useState('');
  const [text, setText] = useState('');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stepDetails, setStepDetails] = useState(['', '', '']);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Check if Google is connected (via URL params from OAuth callback)
  useEffect(() => {
    const connected = searchParams.get('connected');
    const email = searchParams.get('email');
    const errParam = searchParams.get('error');

    if (connected === 'google') {
      setGoogleConnected(true);
      setGoogleEmail(email || '');
      setActiveTab('gmail');
    }
    if (errParam) {
      setError(`Authentication failed: ${errParam}. Please try again.`);
    }
  }, [searchParams]);

  // ── Fetch Gmail ──
  async function fetchGmail() {
    setGmailLoading(true);
    setError('');
    try {
      const res = await fetch('/api/fetch/gmail');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGmailMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    }
    setGmailLoading(false);
  }

  // ── Fetch Drive (Transcript) ──
  async function fetchDrive() {
    setDriveLoading(true);
    setError('');
    try {
      const res = await fetch('/api/fetch/drive');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDriveFiles(data.files || []);
    } catch (err) {
      setError(err.message);
    }
    setDriveLoading(false);
  }

  // ── Fetch Telegram ──
  async function fetchTelegram() {
    setTelegramLoading(true);
    setError('');
    try {
      const url = telegramToken
        ? `/api/fetch/telegram?token=${encodeURIComponent(telegramToken)}`
        : '/api/fetch/telegram';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.help?.join('\n'));
      setTelegramMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    }
    setTelegramLoading(false);
  }

  // ── Upload media files (image/audio) ──
  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');

    const newExtracted = [];

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');

      if (!isImage && !isAudio) {
        setError(`Unsupported file: ${file.name}. Please upload images (.png, .jpg) or audio (.mp3, .wav, .m4a)`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', isImage ? 'image' : 'audio');

        const res = await fetch('/api/media', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        newExtracted.push({
          id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          fileName: file.name,
          type: isImage ? 'image' : 'audio',
          mimeType: file.type,
          size: file.size,
          extractedText: data.extractedText,
          preview: isImage ? URL.createObjectURL(file) : null,
        });
      } catch (err) {
        setError(`Error processing ${file.name}: ${err.message}`);
      }
    }

    setExtractedTexts(prev => [...prev, ...newExtracted]);
    setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    setUploading(false);
  }

  // ── Drag & Drop handlers ──
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  }, []);

  // ── Browser Speech Recognition ──
  function startRecording() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    // Add transcribed audio to extracted texts
    if (transcript.trim()) {
      setExtractedTexts(prev => [...prev, {
        id: `voice-${Date.now()}`,
        fileName: 'Voice Recording',
        type: 'audio',
        mimeType: 'audio/webm',
        size: 0,
        extractedText: transcript,
        preview: null,
      }]);
    }
  }

  // ── Remove extracted item ──
  function removeExtracted(id) {
    setExtractedTexts(prev => prev.filter(t => t.id !== id));
  }

  // ── Import selected items and fetch doc content for Drive ──
  async function getSelectedText() {
    let combinedText = '';
    let importSource = 'notes';

    if (activeTab === 'gmail') {
      importSource = 'email';
      const selected = gmailMessages.filter(m => selectedGmail.has(m.id));
      combinedText = selected.map(m => `From: ${m.from}\nSubject: ${m.subject}\n\n${m.body}`).join('\n\n---\n\n');
    } else if (activeTab === 'transcript') {
      importSource = 'meeting';
      // Fetch content for each selected doc
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
          } catch {
            return `Document: ${f.name}\n\n(Failed to fetch content)`;
          }
        })
      );
      combinedText = contents.join('\n\n---\n\n');
    } else if (activeTab === 'telegram') {
      importSource = 'telegram';
      const selected = telegramMessages.filter(m => selectedTelegram.has(m.id));
      combinedText = selected.map(m => `${m.from}: ${m.text}`).join('\n');
    } else if (activeTab === 'upload') {
      importSource = 'notes';
      combinedText = extractedTexts.map(t => `[${t.type.toUpperCase()}: ${t.fileName}]\n${t.extractedText}`).join('\n\n---\n\n');
    } else {
      importSource = source;
      combinedText = text;
    }

    return { text: combinedText, source: importSource };
  }

  // ── Process with DeepSeek ──
  async function handleProcess() {
    const { text: inputText, source: inputSource } = await getSelectedText();
    if (!inputText.trim()) {
      setError('No text to process. Please select items or paste text first.');
      return;
    }

    setProcessing(true);
    setError('');
    setResult(null);

    // Step 1
    setCurrentStep(0);
    setStepDetails(prev => { const n = [...prev]; n[0] = `Text received (${inputText.length} chars) from ${inputSource}`; return n; });
    await delay(700);

    // Step 2 — show NLP is running
    setCurrentStep(1);
    setStepDetails(prev => { const n = [...prev]; n[1] = 'Tokenizing text, extracting keywords, detecting domain & actors…'; return n; });
    await delay(600);

    // Step 3
    setCurrentStep(2);
    setStepDetails(prev => { const n = [...prev]; n[2] = 'Calling DeepSeek V3.2 LLM…'; return n; });

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, source: inputSource, senderName: senderName || googleEmail || 'Unknown' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');

      const fr = data.requirements?.functional_requirements?.length || 0;
      const nfr = data.requirements?.non_functional_requirements?.length || 0;
      const actors = data.requirements?.actors?.length || 0;
      const nlp = data.requirements?._nlp || {};
      const modeLabel = data.mode === 'nlp_fallback' ? '⚠️ NLP fallback (DeepSeek unavailable)' :
                        data.mode === 'nlp_only' ? '🧠 NLP-only mode' : '✅ DeepSeek V3.2';
      setStepDetails(prev => {
        const n = [...prev];
        n[1] = `✅ ${nlp.wordCount || 0} words · ${nlp.sentenceCount || 0} sentences · Domain: ${nlp.domain || 'General'} · Keywords: ${(nlp.keywords || []).slice(0,5).join(', ')}`;
        n[2] = `${modeLabel} — ${fr} functional, ${nfr} non-functional reqs · ${actors} actors`;
        return n;
      });
      setCurrentStep(3);
      setResult(data.requirements);
    } catch (err) {
      setError(err.message);
      setCurrentStep(-1);
    }
    setProcessing(false);
  }

  function handleReset() {
    setText('');
    setSenderName('');
    setResult(null);
    setCurrentStep(-1);
    setStepDetails(['', '', '']);
    setError('');
    setSelectedGmail(new Set());
    setSelectedDrive(new Set());
    setSelectedTelegram(new Set());
    setExtractedTexts([]);
    setUploadedFiles([]);
    setTranscript('');
  }

  function toggleSelection(set, setFn, id) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  }

  const tabs = [
    { id: 'manual', icon: '✍️', label: 'Manual' },
    { id: 'upload', icon: '📎', label: 'Upload' },
    { id: 'gmail', icon: '📧', label: 'Gmail' },
    { id: 'transcript', icon: '📝', label: 'Transcript' },
    { id: 'telegram', icon: '✈️', label: 'Telegram' },
  ];

  return (
    <>
      <Navbar />
      <main className="main-content">
        <div className="page-header"><h1>📥 Data Ingestion</h1></div>

        <div className="add-input-page">
          {/* LEFT — Input Panel with Tabs */}
          <div className="input-panel" id="input-form">
            {/* Tab bar */}
            <div className="input-tabs">
              {tabs.map(t => (
                <button
                  key={t.id}
                  className={`input-tab ${t.id} ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                  type="button"
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: '0.82rem' }}>
                ⚠️ {error}
              </div>
            )}

            {/* ─── MANUAL TAB ─── */}
            {activeTab === 'manual' && (
              <>
                <h2>✍️ Paste Your Input</h2>
                <label className="form-label">Source Type</label>
                <div className="source-selector">
                  {[
                    { id: 'telegram', icon: '✈️', label: 'Telegram' },
                    { id: 'email', icon: '📧', label: 'Email' },
                    { id: 'meeting', icon: '📞', label: 'Meeting' },
                    { id: 'notes', icon: '📝', label: 'Notes' },
                  ].map(s => (
                    <button key={s.id} className={`source-btn ${source === s.id ? 'active' : ''}`} onClick={() => setSource(s.id)} type="button">
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
                <label className="form-label">Sender Name</label>
                <input className="sender-input" placeholder="e.g. Gaurav, priya@co.com…" value={senderName} onChange={e => setSenderName(e.target.value)} />
                <label className="form-label">Message / Transcript</label>
                <textarea className="input-textarea" placeholder={`Paste your ${source} chat, email body, meeting transcript, or client notes here…`} value={text} onChange={e => setText(e.target.value)} />
              </>
            )}

            {/* ─── UPLOAD TAB (NEW) ─── */}
            {activeTab === 'upload' && (
              <>
                <h2>📎 Upload Images & Audio</h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                  Upload images (screenshots, whiteboard photos, diagrams) or audio files (meeting recordings, voice notes) to extract text using AI.
                </p>

                {/* Drag & Drop Zone */}
                <div
                  className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp,audio/mp3,audio/wav,audio/ogg,audio/mpeg,audio/m4a,audio/x-m4a"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <div className="upload-icon">{uploading ? '⏳' : '📂'}</div>
                  <div className="upload-text">
                    {uploading ? 'Processing files…' : 'Drag & drop files here or click to browse'}
                  </div>
                  <div className="upload-hint">
                    Supports: PNG, JPG, WebP • MP3, WAV, OGG, M4A
                  </div>
                </div>

                {/* Voice Recording */}
                <div className="voice-section">
                  <button
                    className={`btn-voice ${isRecording ? 'recording' : ''}`}
                    onClick={isRecording ? stopRecording : startRecording}
                    type="button"
                  >
                    {isRecording ? '⏹️ Stop Recording' : '🎤 Record & Transcribe'}
                  </button>
                  {isRecording && (
                    <div className="recording-indicator">
                      <span className="rec-dot"></span>
                      Recording… Speak clearly into your microphone
                    </div>
                  )}
                  {transcript && (
                    <div className="transcript-preview">
                      <div className="transcript-label">Live Transcript:</div>
                      <div className="transcript-text">{transcript}</div>
                    </div>
                  )}
                </div>

                {/* Extracted Texts */}
                {extractedTexts.length > 0 && (
                  <div className="extracted-items">
                    <label className="form-label">Extracted Content ({extractedTexts.length} files)</label>
                    {extractedTexts.map(item => (
                      <div key={item.id} className="extracted-item">
                        <div className="extracted-item-header">
                          <span className={`media-badge ${item.type}`}>
                            {item.type === 'image' ? '🖼️' : '🔊'} {item.fileName}
                          </span>
                          <button className="btn-remove" onClick={() => removeExtracted(item.id)} type="button">✕</button>
                        </div>
                        {item.preview && (
                          <img src={item.preview} alt={item.fileName} className="extracted-preview" />
                        )}
                        <div className="extracted-text">{item.extractedText.slice(0, 300)}{item.extractedText.length > 300 ? '…' : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ─── GMAIL TAB ─── */}
            {activeTab === 'gmail' && (
              <>
                <h2>📧 Fetch from Gmail</h2>
                {!googleConnected ? (
                  <div className="connect-section">
                    <div className="connect-icon">📧</div>
                    <h3>Connect Your Gmail</h3>
                    <p>Sign in with Google to fetch recent emails and extract requirements from them.</p>
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
                      {gmailMessages.length === 0 && !gmailLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Click &quot;Fetch Emails&quot; to load your inbox</div>}
                      {gmailMessages.map(msg => (
                        <div key={msg.id} className={`fetch-item ${selectedGmail.has(msg.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedGmail, setSelectedGmail, msg.id)}>
                          <div className="fetch-checkbox">{selectedGmail.has(msg.id) ? '✓' : ''}</div>
                          <div className="fetch-item-content">
                            <div className="fetch-item-title">{msg.subject}</div>
                            <div className="fetch-item-snippet">{msg.snippet || msg.body?.slice(0, 120)}</div>
                            <div className="fetch-item-meta">
                              <span>From: {msg.from}</span>
                              <span>{msg.date ? new Date(msg.date).toLocaleDateString() : ''}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ─── TRANSCRIPT TAB (renamed from Drive) ─── */}
            {activeTab === 'transcript' && (
              <>
                <h2>📝 Fetch Transcripts</h2>
                {!googleConnected ? (
                  <div className="connect-section">
                    <div className="connect-icon">📝</div>
                    <h3>Connect for Transcripts</h3>
                    <p>Sign in with Google to fetch meeting transcripts and documents from your Drive.</p>
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
                      {driveFiles.length === 0 && !driveLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Click &quot;Fetch Transcripts&quot; to load your documents</div>}
                      {driveFiles.map(file => (
                        <div key={file.id} className={`fetch-item ${selectedDrive.has(file.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedDrive, setSelectedDrive, file.id)}>
                          <div className="fetch-checkbox">{selectedDrive.has(file.id) ? '✓' : ''}</div>
                          <div className="fetch-item-content">
                            <div className="fetch-item-title">📄 {file.name}</div>
                            <div className="fetch-item-meta">
                              <span>Owner: {file.owner}</span>
                              <span>Modified: {new Date(file.modifiedTime).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ─── TELEGRAM TAB ─── */}
            {activeTab === 'telegram' && (
              <>
                <h2>✈️ Fetch from Telegram</h2>
                <label className="form-label">Bot Token (from @BotFather)</label>
                <div className="token-input-group">
                  <input
                    className="sender-input"
                    style={{ marginBottom: 0 }}
                    placeholder="e.g. 7123456789:AAF..."
                    value={telegramToken}
                    onChange={e => setTelegramToken(e.target.value)}
                  />
                  <button className="btn-secondary" onClick={fetchTelegram} disabled={telegramLoading} type="button" style={{ whiteSpace: 'nowrap' }}>
                    {telegramLoading ? '⏳' : '🔄'} Fetch
                  </button>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
                  💡 Create a bot via @BotFather on Telegram → send messages to your bot → then fetch them here.<br/>
                  Leave blank to use the token from .env.local
                </p>
                <div className="fetch-toolbar">
                  <span className="selection-count">{selectedTelegram.size} selected</span>
                </div>
                <div className="fetch-list">
                  {telegramMessages.length === 0 && !telegramLoading && <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>Enter your bot token and click Fetch to load messages</div>}
                  {telegramMessages.map(msg => (
                    <div key={msg.id} className={`fetch-item ${selectedTelegram.has(msg.id) ? 'selected' : ''}`} onClick={() => toggleSelection(selectedTelegram, setSelectedTelegram, msg.id)}>
                      <div className="fetch-checkbox">{selectedTelegram.has(msg.id) ? '✓' : ''}</div>
                      <div className="fetch-item-content">
                        <div className="fetch-item-title">💬 {msg.from}</div>
                        <div className="fetch-item-snippet">{msg.text}</div>
                        <div className="fetch-item-meta">
                          <span>Chat: {msg.chat}</span>
                          <span>{new Date(msg.date).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Process Button */}
            <button className="btn-primary" onClick={handleProcess} disabled={processing} id="process-btn">
              {processing ? <><div className="spinner" style={{width:16,height:16,borderWidth:2}}></div> Processing…</> : <>🚀 Process with DeepSeek</>}
            </button>
            {result && <button className="btn-secondary" onClick={handleReset} style={{width:'100%',marginTop:8}}>🔄 Process Another</button>}
          </div>

          {/* RIGHT — Processing Pipeline + Results */}
          <div>
            <div className="processing-panel" style={{ marginBottom: result ? 20 : 0 }}>
              <h2>⚙️ Processing Pipeline</h2>
              <div className="processing-steps">
                {[
                  { title: 'Data Ingestion', desc: 'Receive and validate raw text input' },
                  { title: 'NLP Processing', desc: 'Tokenization, keyword extraction, entity recognition' },
                  { title: 'LLM Analysis', desc: 'DeepSeek V3.2 requirement extraction & classification' },
                ].map((step, i) => (
                  <div key={i} className={`process-step ${currentStep === i ? 'active' : ''} ${currentStep > i ? 'completed' : ''}`}>
                    <div className="step-indicator">{currentStep > i ? '✓' : i + 1}</div>
                    <div className="step-content">
                      <h3>{step.title}</h3>
                      <p>{step.desc}</p>
                      {stepDetails[i] && currentStep >= i && <div className="step-details">{stepDetails[i]}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {result && (
              <div className="results-panel" id="results-panel">
                <h2>📊 Extracted Requirements</h2>
                {result._nlp && (
                  <div style={{marginBottom:16,padding:'10px 14px',background:'var(--surface-glass)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-xs)',fontSize:'0.78rem',color:'var(--text-secondary)',display:'flex',gap:16,flexWrap:'wrap'}}>
                    <span>🧠 <b>Domain:</b> {result._nlp.domain}</span>
                    <span>📝 <b>Words:</b> {result._nlp.wordCount}</span>
                    <span>📌 <b>Keywords:</b> {(result._nlp.keywords||[]).slice(0,6).join(', ')}</span>
                    <span style={{marginLeft:'auto',color: result._nlp.mode === 'deepseek' ? 'var(--green)' : 'var(--orange)',fontWeight:600}}>
                      {result._nlp.mode === 'deepseek' ? '⚡ DeepSeek V3.2' : result._nlp.mode === 'nlp_fallback' ? '⚠️ NLP Fallback' : '🧠 NLP Only'}
                    </span>
                  </div>
                )}
                {result.actors && result.actors.length > 0 && (
                  <div className="result-section">
                    <h3>👥 Actors</h3>
                    <div className="actors-list">
                      {result.actors.map((actor, i) => <span className="actor-chip" key={i}>👤 {typeof actor === 'string' ? actor : actor.name}</span>)}
                    </div>
                  </div>
                )}
                {result.functional_requirements && result.functional_requirements.length > 0 && (
                  <div className="result-section">
                    <h3>⚡ Functional Requirements</h3>
                    <ul className="result-list">
                      {result.functional_requirements.map((req, i) => (
                        <li className="result-item" key={i}>
                          <span className={`priority-badge ${(req.priority || 'medium').toLowerCase()}`}>{req.priority || 'Medium'}</span>
                          <span>{typeof req === 'string' ? req : req.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.non_functional_requirements && result.non_functional_requirements.length > 0 && (
                  <div className="result-section">
                    <h3>🛡️ Non-Functional Requirements</h3>
                    <ul className="result-list">
                      {result.non_functional_requirements.map((req, i) => (
                        <li className="result-item" key={i}>
                          <span className={`priority-badge ${(req.priority || 'medium').toLowerCase()}`}>{req.priority || 'Medium'}</span>
                          <span>{typeof req === 'string' ? req : req.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.features && result.features.length > 0 && (
                  <div className="result-section">
                    <h3>🎯 Features</h3>
                    <div className="message-tags">
                      {result.features.map((f, i) => <span className={`tag ${['green','blue','purple','orange'][i%4]}`} key={i}>{f}</span>)}
                    </div>
                  </div>
                )}
                {result.moscow && (
                  <div className="result-section">
                    <h3>🏷️ MoSCoW Prioritization</h3>
                    <div className="moscow-board" style={{ marginTop: 10 }}>
                      {['must_have','should_have','could_have','wont_have'].map((key, idx) => (
                        <div className="moscow-column" key={key}>
                          <div className={`moscow-header ${['must','should','could','wont'][idx]}`}>
                            {['Must Have','Should Have','Could Have',"Won't Have (v1)"][idx]}
                          </div>
                          <div className="moscow-items">
                            {(result.moscow[key] || []).map((item, i) => <div className="moscow-item" key={i}>{item}</div>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.ambiguities && result.ambiguities.length > 0 && (
                  <div className="result-section">
                    <h3>⚠️ Ambiguities Detected</h3>
                    <ul className="result-list">
                      {result.ambiguities.map((a, i) => <li className="result-item" key={i} style={{borderLeft:'3px solid var(--orange)'}}>{a}</li>)}
                    </ul>
                  </div>
                )}
                <Link href="/brd-view" style={{display:'block',marginTop:20}}>
                  <button className="btn-primary" style={{background:'linear-gradient(135deg,var(--purple),#6c5ce7)'}}>📄 Go to BRD View →</button>
                </Link>
              </div>
            )}
          </div>
        </div>
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
