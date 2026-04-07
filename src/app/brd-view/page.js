'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';


export default function BrdViewPage() {
  const [brds, setBrds] = useState([]);
  const [selectedBrd, setSelectedBrd] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const brdRef = useRef(null);

  useEffect(() => {
    fetchBrds();
  }, []);

  async function fetchBrds() {
    try {
      const res = await fetch('/api/brds');
      if (res.ok) {
        const data = await res.json();
        if (data.brds && data.brds.length > 0) {
          setBrds(data.brds);
          setSelectedBrd(data.brds[0]);
          setLoading(false);
          return;
        }
      }
    } catch {
      // no-op, fallback handles this
    }

    // ── LOCAL STORAGE FALLBACK (If DB fails) ──
    try {
      const local = localStorage.getItem('latest_generated_brd');
      if (local) {
        const parsed = JSON.parse(local);
        setBrds([parsed]);
        setSelectedBrd(parsed);
      }
    } catch (e) {
      console.warn('LocalStorage parse failed:', e);
    }
    
    setLoading(false);
  }

  async function handleGenerateBrd() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/generate-brd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'BRD generation failed');

      setBrds(prev => [data.brd, ...prev]);
      setSelectedBrd(data.brd);
    } catch (err) {
      setError(err.message);
    }
    setGenerating(false);
  }

  async function handleDownloadDocx() {
    if (!brd) return;
    setDownloading(true);

    try {
      const docx = await import('docx');
      const fileSaverModule = await import('file-saver');
      const saveAs = fileSaverModule.saveAs || fileSaverModule.default?.saveAs || fileSaverModule.default;

      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
        Header, Footer, PageNumber, NumberFormat, TableOfContents,
      } = docx;

      const titleText = brd.title || 'Business Requirements Document';
      const projectName = brd.projectName || brd.title || 'Project';
      const version = brd.version || '1.0';
      const dateStr = new Date(brd.createdAt || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      // Helper: create styled paragraph
      const h1 = (text) => new Paragraph({
        children: [new TextRun({ text, bold: true, size: 32, font: 'Calibri', color: '2E4057' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      });

      const h2 = (text) => new Paragraph({
        children: [new TextRun({ text, bold: true, size: 26, font: 'Calibri', color: '4A6FA5' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
      });

      const body = (text) => new Paragraph({
        children: [new TextRun({ text, size: 22, font: 'Calibri', color: '333333' })],
        spacing: { after: 120 },
      });

      const bullet = (text) => new Paragraph({
        children: [new TextRun({ text, size: 22, font: 'Calibri' })],
        bullet: { level: 0 },
        spacing: { after: 80 },
      });

      const emptyLine = () => new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 100 } });

      // Build sections
      const children = [];

      // ── Title Page ──
      children.push(
        new Paragraph({ spacing: { before: 2000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: titleText, bold: true, size: 48, font: 'Calibri', color: '2E4057' })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: projectName, size: 28, font: 'Calibri', color: '4A6FA5' })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Version ${version}`, size: 24, font: 'Calibri', color: '666666' })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: dateStr, size: 22, font: 'Calibri', color: '888888' })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Status: ${(brd.status || 'Draft').toUpperCase()}`, bold: true, size: 22, font: 'Calibri', color: 'E67E22' })],
          spacing: { after: 400 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', size: 18, color: 'CCCCCC' })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Generated by AI BRD Generator — Mistral + DeepSeek', italics: true, size: 18, font: 'Calibri', color: '999999' })],
        }),
      );

      // Page break
      children.push(new Paragraph({ children: [], pageBreakBefore: true }));

      // ── Executive Summary ──
      if (brd.content?.executive_summary) {
        children.push(h1('1. Executive Summary'));
        brd.content.executive_summary.split('\n').forEach(para => {
          if (para.trim()) children.push(body(para.trim()));
        });
        children.push(emptyLine());
      }

      // ── Project Scope ──
      if (brd.content?.project_scope) {
        children.push(h1('2. Project Scope'));
        brd.content.project_scope.split('\n').forEach(para => {
          if (para.trim()) children.push(body(para.trim()));
        });
        children.push(emptyLine());
      }

      // ── Actors / Stakeholders ──
      if (brd.content?.actors && brd.content.actors.length > 0) {
        children.push(h1('3. Stakeholders & Actors'));

        const headerRow = new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: 'Actor', bold: true, size: 20, font: 'Calibri', color: 'FFFFFF' })], alignment: AlignmentType.CENTER })],
              shading: { type: ShadingType.SOLID, color: '2E4057' },
            }),
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 20, font: 'Calibri', color: 'FFFFFF' })], alignment: AlignmentType.CENTER })],
              shading: { type: ShadingType.SOLID, color: '2E4057' },
            }),
          ],
        });

        const actorRows = brd.content.actors.map((actor, i) => new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: typeof actor === 'string' ? actor : actor.name, bold: true, size: 20, font: 'Calibri' })] })],
              shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F8F9FA' } : undefined,
            }),
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: typeof actor === 'string' ? '—' : (actor.description || '—'), size: 20, font: 'Calibri' })] })],
              shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F8F9FA' } : undefined,
            }),
          ],
        }));

        children.push(new Table({ rows: [headerRow, ...actorRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(emptyLine());
      }

      // ── Functional Requirements ──
      if (brd.content?.functional_requirements && brd.content.functional_requirements.length > 0) {
        children.push(h1('4. Functional Requirements'));

        const frHeaderRow = new TableRow({
          children: ['ID', 'Description', 'Priority', 'Category'].map(text =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: 'Calibri', color: 'FFFFFF' })], alignment: AlignmentType.CENTER })],
              shading: { type: ShadingType.SOLID, color: '27AE60' },
            })
          ),
        });

        const frRows = brd.content.functional_requirements.map((req, i) => {
          const priorityColor = (req.priority || 'Medium').toLowerCase() === 'high' ? 'E74C3C' :
                                 (req.priority || 'Medium').toLowerCase() === 'low' ? '27AE60' : 'F39C12';
          return new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.id || `FR-${String(i+1).padStart(3,'0')}`, bold: true, size: 18, font: 'Calibri', color: '27AE60' })] })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F0FFF4' } : undefined,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.description || '', size: 18, font: 'Calibri' })] })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F0FFF4' } : undefined,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.priority || 'Medium', bold: true, size: 18, font: 'Calibri', color: priorityColor })], alignment: AlignmentType.CENTER })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F0FFF4' } : undefined,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.category || '—', size: 18, font: 'Calibri' })] })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F0FFF4' } : undefined,
              }),
            ],
          });
        });

        children.push(new Table({ rows: [frHeaderRow, ...frRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(emptyLine());
      }

      // ── Non-Functional Requirements ──
      if (brd.content?.non_functional_requirements && brd.content.non_functional_requirements.length > 0) {
        children.push(h1('5. Non-Functional Requirements'));

        const nfrHeaderRow = new TableRow({
          children: ['ID', 'Description', 'Priority'].map(text =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: 'Calibri', color: 'FFFFFF' })], alignment: AlignmentType.CENTER })],
              shading: { type: ShadingType.SOLID, color: '8E44AD' },
            })
          ),
        });

        const nfrRows = brd.content.non_functional_requirements.map((req, i) => {
          const priorityColor = (req.priority || 'Medium').toLowerCase() === 'high' ? 'E74C3C' :
                                 (req.priority || 'Medium').toLowerCase() === 'low' ? '27AE60' : 'F39C12';
          return new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.id || `NFR-${String(i+1).padStart(3,'0')}`, bold: true, size: 18, font: 'Calibri', color: '8E44AD' })] })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F5EEF8' } : undefined,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.description || '', size: 18, font: 'Calibri' })] })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F5EEF8' } : undefined,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: req.priority || 'Medium', bold: true, size: 18, font: 'Calibri', color: priorityColor })], alignment: AlignmentType.CENTER })],
                shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'F5EEF8' } : undefined,
              }),
            ],
          });
        });

        children.push(new Table({ rows: [nfrHeaderRow, ...nfrRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(emptyLine());
      }

      // ── MoSCoW Prioritization ──
      if (brd.content?.moscow) {
        children.push(h1('6. MoSCoW Prioritization'));

        const moscowCategories = [
          { key: 'must_have', label: 'Must Have', color: 'E74C3C' },
          { key: 'should_have', label: 'Should Have', color: 'F39C12' },
          { key: 'could_have', label: 'Could Have', color: '3498DB' },
          { key: 'wont_have', label: "Won't Have (v1)", color: '95A5A6' },
        ];

        moscowCategories.forEach(cat => {
          const items = brd.content.moscow[cat.key] || [];
          if (items.length > 0) {
            children.push(h2(cat.label));
            items.forEach(item => children.push(bullet(item)));
          }
        });
        children.push(emptyLine());
      }

      // ── Assumptions ──
      if (brd.content?.assumptions && brd.content.assumptions.length > 0) {
        children.push(h1('7. Assumptions'));
        brd.content.assumptions.forEach(item => children.push(bullet(item)));
        children.push(emptyLine());
      }

      // ── Constraints ──
      if (brd.content?.constraints && brd.content.constraints.length > 0) {
        children.push(h1('8. Constraints'));
        brd.content.constraints.forEach(item => children.push(bullet(item)));
        children.push(emptyLine());
      }

      // ── Acceptance Criteria ──
      if (brd.content?.acceptance_criteria && brd.content.acceptance_criteria.length > 0) {
        children.push(h1('9. Acceptance Criteria'));
        brd.content.acceptance_criteria.forEach(item => children.push(bullet(item)));
      }

      // Create document
      const doc = new Document({
        creator: 'AI BRD Generator — Mistral + DeepSeek',
        title: titleText,
        description: 'Auto-generated Business Requirements Document',
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${titleText} — v${version}`, size: 16, color: '999999', italics: true, font: 'Calibri' })],
              })],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '999999', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: 'Calibri' }),
                  new TextRun({ text: ' of ', size: 16, color: '999999', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999', font: 'Calibri' }),
                ],
              })],
            }),
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `${titleText.replace(/\s+/g, '_')}.docx`;
      saveAs(blob, fileName);

    } catch (err) {
      console.error('DOCX error:', err);
      setError('Word document generation failed: ' + err.message);
    }

    setDownloading(false);
  }

  const brd = selectedBrd;

  return (
    <>
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>📄 Business Requirements Document</h1>
        </div>

        <div className="brd-page">
          {/* Toolbar */}
          <div className="brd-toolbar" id="brd-toolbar">
            <div className="brd-toolbar-left">
              {brds.length > 0 && (
                <select
                  className="brd-select"
                  value={selectedBrd?._id || selectedBrd?.id || ''}
                  onChange={e => {
                    const found = brds.find(b => (b._id || b.id) === e.target.value);
                    if (found) setSelectedBrd(found);
                  }}
                >
                  {brds.map(b => (
                    <option key={b._id || b.id} value={b._id || b.id}>
                      {b.title} — v{b.version || '1.0'}
                    </option>
                  ))}
                </select>
              )}
              {brd && (
                <span className={`brd-status-badge ${brd.status || 'draft'}`}>
                  {brd.status || 'draft'}
                </span>
              )}
            </div>
            <div className="brd-toolbar-right">
              <button
                className="btn-secondary"
                onClick={handleGenerateBrd}
                disabled={generating}
              >
                {generating ? (
                  <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div> Generating…</>
                ) : (
                  <>🤖 Generate BRD</>
                )}
              </button>
              {brd && (
                <button
                  className="btn-download"
                  onClick={handleDownloadDocx}
                  disabled={downloading}
                >
                  {downloading ? (
                    <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#fff' }}></div> Exporting…</>
                  ) : (
                    <>📥 Download DOCX</>
                  )}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 18px', background: 'var(--red-dim)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}

          {/* BRD Document */}
          {loading ? (
            <div className="loading-spinner"><div className="spinner"></div> Loading BRDs…</div>
          ) : !brd ? (
            <div className="generate-section">
              <h2>🚀 Generate Your First BRD</h2>
              <p>Go to &quot;Add Input&quot; to process some requirements first, then come back here to generate a professional BRD document.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
                <Link href="/add-input">
                  <button className="btn-primary" style={{ width: 'auto' }}>📥 Add Input First</button>
                </Link>
                <button className="btn-secondary" onClick={handleGenerateBrd} disabled={generating}>
                  {generating ? 'Generating…' : '🤖 Generate Fallback Demo BRD'}
                </button>
              </div>
            </div>
          ) : (
            <div className="brd-document" ref={brdRef} id="brd-document">
              {/* Header */}
              <div className="brd-doc-header">
                <div className="brd-doc-title">{brd.title || 'Business Requirements Document'}</div>
                <div className="brd-doc-meta">
                  <span>📁 {brd.projectName || brd.title}</span>
                  <span>📌 Version {brd.version || '1.0'}</span>
                  <span>📅 {new Date(brd.createdAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  <span className={`brd-status-badge ${brd.status || 'draft'}`}>{brd.status || 'draft'}</span>
                </div>
              </div>

              {/* Body */}
              <div className="brd-doc-body">
                {/* Executive Summary */}
                {brd.content?.executive_summary && (
                  <div className="brd-section">
                    <div className="brd-section-title">📋 1. Executive Summary</div>
                    <div className="brd-section-content">{brd.content.executive_summary}</div>
                  </div>
                )}

                {/* Project Scope */}
                {brd.content?.project_scope && (
                  <div className="brd-section">
                    <div className="brd-section-title">🎯 2. Project Scope</div>
                    <div className="brd-section-content">{brd.content.project_scope}</div>
                  </div>
                )}

                {/* Actors / Stakeholders */}
                {brd.content?.actors && brd.content.actors.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">👥 3. Stakeholders &amp; Actors</div>
                    <table className="brd-table">
                      <thead>
                        <tr><th>Actor</th><th>Description</th></tr>
                      </thead>
                      <tbody>
                        {brd.content.actors.map((actor, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{typeof actor === 'string' ? actor : actor.name}</td>
                            <td>{typeof actor === 'string' ? '—' : actor.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Functional Requirements */}
                {brd.content?.functional_requirements && brd.content.functional_requirements.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">⚡ 4. Functional Requirements</div>
                    <table className="brd-table">
                      <thead>
                        <tr><th>ID</th><th>Description</th><th>Priority</th><th>Category</th></tr>
                      </thead>
                      <tbody>
                        {brd.content.functional_requirements.map((req, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600, color: 'var(--green)' }}>{req.id || `FR-${String(i+1).padStart(3,'0')}`}</td>
                            <td>{req.description}</td>
                            <td><span className={`priority-badge ${(req.priority || 'medium').toLowerCase()}`}>{req.priority || 'Medium'}</span></td>
                            <td>{req.category || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Non-Functional Requirements */}
                {brd.content?.non_functional_requirements && brd.content.non_functional_requirements.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">🛡️ 5. Non-Functional Requirements</div>
                    <table className="brd-table">
                      <thead>
                        <tr><th>ID</th><th>Description</th><th>Priority</th></tr>
                      </thead>
                      <tbody>
                        {brd.content.non_functional_requirements.map((req, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600, color: 'var(--purple)' }}>{req.id || `NFR-${String(i+1).padStart(3,'0')}`}</td>
                            <td>{req.description}</td>
                            <td><span className={`priority-badge ${(req.priority || 'medium').toLowerCase()}`}>{req.priority || 'Medium'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* MoSCoW Prioritization */}
                {brd.content?.moscow && (
                  <div className="brd-section">
                    <div className="brd-section-title">🏷️ 6. MoSCoW Prioritization</div>
                    <div className="moscow-board" style={{ marginTop: 10 }}>
                      <div className="moscow-column">
                        <div className="moscow-header must">Must Have</div>
                        <div className="moscow-items">
                          {(brd.content.moscow.must_have || []).map((item, i) => <div className="moscow-item" key={i}>{item}</div>)}
                        </div>
                      </div>
                      <div className="moscow-column">
                        <div className="moscow-header should">Should Have</div>
                        <div className="moscow-items">
                          {(brd.content.moscow.should_have || []).map((item, i) => <div className="moscow-item" key={i}>{item}</div>)}
                        </div>
                      </div>
                      <div className="moscow-column">
                        <div className="moscow-header could">Could Have</div>
                        <div className="moscow-items">
                          {(brd.content.moscow.could_have || []).map((item, i) => <div className="moscow-item" key={i}>{item}</div>)}
                        </div>
                      </div>
                      <div className="moscow-column">
                        <div className="moscow-header wont">Won&apos;t Have (v1)</div>
                        <div className="moscow-items">
                          {(brd.content.moscow.wont_have || []).map((item, i) => <div className="moscow-item" key={i}>{item}</div>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Assumptions */}
                {brd.content?.assumptions && brd.content.assumptions.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">💡 7. Assumptions</div>
                    <ul className="result-list">
                      {brd.content.assumptions.map((item, i) => (
                        <li className="result-item" key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Constraints */}
                {brd.content?.constraints && brd.content.constraints.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">🚧 8. Constraints</div>
                    <ul className="result-list">
                      {brd.content.constraints.map((item, i) => (
                        <li className="result-item" key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Acceptance Criteria */}
                {brd.content?.acceptance_criteria && brd.content.acceptance_criteria.length > 0 && (
                  <div className="brd-section">
                    <div className="brd-section-title">✅ 9. Acceptance Criteria</div>
                    <ul className="result-list">
                      {brd.content.acceptance_criteria.map((item, i) => (
                        <li className="result-item" key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
