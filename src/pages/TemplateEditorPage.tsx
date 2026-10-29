import {
  ArrowLeft,
  Calculator,
  Check,
  Eraser,
  LayoutGrid,
  PenSquare,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CleanupPanel } from '../components/CleanupPanel';
import { useApp } from '../context/AppContext';
import { createEraseAnnotations, detectTextRegionsToErase } from '../lib/autoEraser';
import { findCycle } from '../lib/calc';
import { FIELD_TYPE_LABEL, isNumeric } from '../lib/format';
import { clamp, newId } from '../lib/id';
import { sampleBackground } from '../lib/image';
import { renderPage } from '../lib/render';
import type {
  Annotation,
  FieldDef,
  FieldType,
  FormulaTerm,
  PdfTextItem,
  Rect,
  Template,
} from '../types';

type EditorTab = 'fields' | 'formula' | 'annotations' | 'cleanup';

const PRESET_LABELS: { label: string; type: FieldType; comma?: boolean }[] = [
  { label: '運賃', type: 'currency', comma: true },
  { label: '高速代', type: 'currency', comma: true },
  { label: '駐車代', type: 'currency', comma: true },
  { label: '燃料・立替', type: 'currency', comma: true },
  { label: '合計', type: 'currency', comma: true },
  { label: '日付', type: 'date' },
  { label: '氏名', type: 'text' },
  { label: '車両番号', type: 'number', comma: false },
  { label: '出庫時間', type: 'time' },
  { label: '入庫時間', type: 'time' },
];

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { repos, refreshLocal } = useApp();
  const nav = useNavigate();

  const initialTab = (searchParams.get('tab') as EditorTab) || 'fields';
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [template, setTemplate] = useState<Template | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<'none' | 'new-field' | 'new-ann' | 'eraser-brush'>('none');
  const [eraserSize, setEraserSize] = useState<number>(0.035);
  const [erasingBusy, setErasingBusy] = useState(false);
  const [erasingStatus, setErasingStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [cycleWarn, setCycleWarn] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dragOp, setDragOp] = useState<{
    target: 'field' | 'ann' | 'create-field' | 'create-ann' | 'brush-erase';
    mode: 'move' | 'resize' | 'draw' | 'brush';
    id?: string;
    startX: number;
    startY: number;
    origRect: Rect;
  } | null>(null);

  useEffect(() => {
    if (!repos || !id) return;
    let alive = true;
    repos.templates.get(id).then((t) => {
      if (!alive || !t) return;
      setTemplate(t);
      setName(t.name);
      setFields(t.fields);
      setAnnotations(t.annotations);
      setSelectedFieldId(t.fields[0]?.id ?? null);
      setSelectedAnnId(t.annotations[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [repos, id]);

  // テンプレート背景＋文字修正（annotations）を描画（入力データは一切書き込まない）
  useEffect(() => {
    if (!repos || !template || !bgCanvasRef.current) return;
    const page = template.pages[pageIndex];
    if (!page) return;
    let alive = true;
    (async () => {
      const bgBlob = await repos.blobs.get(page.bgBlobId);
      if (!alive) return;
      const previewTemplate: Template = { ...template, annotations };
      const rendered = await renderPage(previewTemplate, pageIndex, bgBlob);
      if (!alive || !bgCanvasRef.current) return;
      const c = bgCanvasRef.current;
      c.width = rendered.width;
      c.height = rendered.height;
      c.getContext('2d')!.drawImage(rendered, 0, 0);
    })();
    return () => {
      alive = false;
    };
  }, [repos, template, pageIndex, annotations]);

  if (!template) {
    return (
      <main className="page-container">
        <p className="info-banner">テンプレートを読み込んでいます…</p>
      </main>
    );
  }

  const pageFields = fields.filter((f) => f.page === pageIndex);
  const pageAnns = annotations.filter((a) => a.page === pageIndex);
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;
  const selectedAnn = annotations.find((a) => a.id === selectedAnnId) ?? null;
  const pdfTextItems: PdfTextItem[] = template.pages[pageIndex]?.textItems ?? [];

  const updateField = (fid: string, patch: Partial<FieldDef>) => {
    setFields((prev) => {
      const next = prev.map((f) => (f.id === fid ? { ...f, ...patch } : f));
      const cyc = findCycle(next);
      if (cyc.length > 0) {
        setCycleWarn('計算式が循環参照になっています。対象項目を確認してください。');
      } else {
        setCycleWarn(null);
      }
      return next;
    });
  };

  const updateAnn = (aid: string, patch: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === aid ? { ...a, ...patch } : a)));
  };

  const addFieldAt = (rect: Rect, preset?: { label: string; type: FieldType; comma?: boolean }) => {
    const newF: FieldDef = {
      id: newId(),
      page: pageIndex,
      rect,
      label: preset?.label ?? `項目${fields.length + 1}`,
      type: preset?.type ?? 'currency',
      required: false,
      maxDigits: 8,
      comma: preset?.comma ?? true,
      align: preset?.type === 'currency' || preset?.type === 'number' ? 'right' : 'center',
    };
    setFields((prev) => [...prev, newF]);
    setSelectedFieldId(newF.id);
    setDrawMode('none');
  };

  const addAnnotationAt = (rect: Rect, initialText = '修正文字') => {
    let autoMask = '#ffffff';
    if (bgCanvasRef.current) {
      const c = bgCanvasRef.current;
      autoMask = sampleBackground(
        c,
        rect.x * c.width,
        rect.y * c.height,
        rect.w * c.width,
        rect.h * c.height,
      );
    }
    const newA: Annotation = {
      id: newId(),
      page: pageIndex,
      rect,
      maskColor: autoMask,
      text: initialText,
      fontSize: Math.max(0.014, Math.min(0.04, rect.h * 0.72)),
      textColor: '#111111',
      bold: false,
      align: 'left',
    };
    setAnnotations((prev) => [...prev, newA]);
    setSelectedAnnId(newA.id);
    setDrawMode('none');
  };

  const handleStagePointerDown = (e: PointerEvent) => {
    if (!stageRef.current) return;
    if (drawMode === 'none') return;
    const r = stageRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 0.95);
    const y = clamp((e.clientY - r.top) / r.height, 0, 0.95);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (drawMode === 'new-field') {
      const id = newId();
      const rect: Rect = { x, y, w: 0.22, h: 0.048 };
      const nf: FieldDef = {
        id,
        page: pageIndex,
        rect,
        label: `項目${fields.length + 1}`,
        type: 'currency',
        required: false,
        maxDigits: 8,
        comma: true,
        align: 'right',
      };
      setFields((prev) => [...prev, nf]);
      setSelectedFieldId(id);
      setDragOp({
        target: 'create-field',
        mode: 'draw',
        id,
        startX: e.clientX,
        startY: e.clientY,
        origRect: rect,
      });
    } else if (drawMode === 'new-ann') {
      const rect: Rect = { x, y, w: 0.2, h: 0.04 };
      addAnnotationAt(rect, '修正テキスト');
    } else if (drawMode === 'eraser-brush') {
      const w = eraserSize;
      const h = eraserSize * 0.8;
      const rect: Rect = {
        x: clamp(x - w / 2, 0, 1 - w),
        y: clamp(y - h / 2, 0, 1 - h),
        w,
        h,
      };
      addAnnotationAt(rect, '');
      setDragOp({
        target: 'brush-erase',
        mode: 'brush',
        startX: e.clientX,
        startY: e.clientY,
        origRect: rect,
      });
    }
  };

  const handleStagePointerMove = (e: PointerEvent) => {
    if (!dragOp || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const cx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const cy = clamp((e.clientY - r.top) / r.height, 0, 1);

    if (dragOp.mode === 'brush') {
      // 指でなぞった軌跡に連続してマスク枠（消しゴム）を追加
      const w = eraserSize;
      const h = eraserSize * 0.8;
      const rect: Rect = {
        x: clamp(cx - w / 2, 0, 1 - w),
        y: clamp(cy - h / 2, 0, 1 - h),
        w,
        h,
      };
      addAnnotationAt(rect, '');
      return;
    }

    const dx = (e.clientX - dragOp.startX) / r.width;
    const dy = (e.clientY - dragOp.startY) / r.height;
    const o = dragOp.origRect;

    let nextRect: Rect = o;
    if (dragOp.mode === 'move') {
      nextRect = {
        ...o,
        x: clamp(o.x + dx, 0, 1 - o.w),
        y: clamp(o.y + dy, 0, 1 - o.h),
      };
    } else if (dragOp.mode === 'resize' || dragOp.mode === 'draw') {
      nextRect = {
        ...o,
        w: clamp(Math.max(0.05, o.w + dx), 0.04, 1 - o.x),
        h: clamp(Math.max(0.025, o.h + dy), 0.02, 1 - o.y),
      };
    }

    if ((dragOp.target === 'field' || dragOp.target === 'create-field') && dragOp.id) {
      updateField(dragOp.id, { rect: nextRect });
    } else if (dragOp.target === 'ann' && dragOp.id) {
      updateAnn(dragOp.id, { rect: nextRect });
    }
  };

  const handleStagePointerUp = () => {
    if (dragOp) {
      const wasBrush = dragOp.mode === 'brush';
      setDragOp(null);
      if (!wasBrush) {
        setDrawMode('none');
      }
    }
  };

  const handleSaveAll = async (andStartInput = false) => {
    if (!repos) return;
    const cyc = findCycle(fields);
    if (cyc.length > 0) {
      setCycleWarn('計算式が循環しているため保存できません。計算式を確認してください。');
      return;
    }
    setSaving(true);
    try {
      const updated = await repos.templates.updateDefinition(template.id, {
        name: name.trim() || template.name,
        fields,
        annotations,
      });
      setTemplate(updated);
      setSavedNotice('空白テンプレートとして保存しました');
      setTimeout(() => setSavedNotice(null), 2500);
      if (andStartInput) {
        const s = await repos.sessions.createBlank(updated);
        await refreshLocal();
        nav(`/input/${s.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-container">
      {/* 上部バー */}
      <div className="editor-top-bar">
        <Link to="/" className="btn btn-secondary btn-sm">
          <ArrowLeft size={18} />
          一覧へ戻る
        </Link>
        <input
          type="text"
          className="template-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="テンプレート名"
        />
        <div className="row-gap">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => handleSaveAll(false)}
          >
            <Check size={18} />
            {saving ? '保存中…' : 'テンプレートを保存'}
          </button>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={saving}
            onClick={() => handleSaveAll(true)}
          >
            <PenSquare size={18} />
            保存して空白から入力テスト
          </button>
        </div>
      </div>

      {savedNotice && <p className="success-banner">{savedNotice}</p>}
      {cycleWarn && <p className="error-banner">{cycleWarn}</p>}

      {/* 4機能タブ */}
      <div className="editor-tabs" role="tablist">
        <button
          type="button"
          className={`editor-tab ${tab === 'fields' ? 'active' : ''}`}
          onClick={() => setTab('fields')}
        >
          <LayoutGrid size={19} />
          1. 入力欄の配置 ({fields.length})
        </button>
        <button
          type="button"
          className={`editor-tab ${tab === 'formula' ? 'active' : ''}`}
          onClick={() => setTab('formula')}
        >
          <Calculator size={19} />
          2. 自動計算式の設定
        </button>
        <button
          type="button"
          className={`editor-tab ${tab === 'annotations' ? 'active' : ''}`}
          onClick={() => setTab('annotations')}
        >
          <Eraser size={19} />
          3. 文字の修正・マスク ({annotations.length})
        </button>
        <button
          type="button"
          className={`editor-tab ${tab === 'cleanup' ? 'active' : ''}`}
          onClick={() => setTab('cleanup')}
        >
          <Sparkles size={19} />
          4. きれい化（写真補正 / 作り直し）
        </button>
      </div>

      {/* 複数ページ切替 */}
      {template.pages.length > 1 && (
        <div className="page-Select-bar">
          <span>ページ切替：</span>
          {template.pages.map((p) => (
            <button
              key={p.index}
              type="button"
              className={`btn btn-sm ${p.index === pageIndex ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPageIndex(p.index)}
            >
              {p.index + 1}ページ
            </button>
          ))}
        </div>
      )}

      {/* タブ4: きれい化パネル */}
      {tab === 'cleanup' ? (
        <CleanupPanel
          template={template}
          pageIndex={pageIndex}
          onUpdated={(u) => setTemplate(u)}
        />
      ) : (
        <div className="editor-workspace">
          {/* 左/上：テンプレートステージ（タッチ操作で欄の追加・移動・リサイズ） */}
          <div className="editor-stage-panel card">
            <div className="stage-toolbar">
              {tab === 'fields' && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${drawMode === 'new-field' ? 'btn-active-toggle' : 'btn-primary'}`}
                    onClick={() =>
                      setDrawMode((m) => (m === 'new-field' ? 'none' : 'new-field'))
                    }
                  >
                    <Plus size={18} />
                    {drawMode === 'new-field'
                      ? '配置する場所をタップ / ドラッグしてください'
                      : '画面をタップして入力欄を配置'}
                  </button>
                  <div className="preset-chips">
                    <span>ワンタップ追加：</span>
                    {PRESET_LABELS.map((pr) => (
                      <button
                        key={pr.label}
                        type="button"
                        className="chip-btn"
                        onClick={() => {
                          const offset = (pageFields.length % 8) * 0.055;
                          addFieldAt(
                            { x: 0.25, y: clamp(0.18 + offset, 0.05, 0.85), w: 0.3, h: 0.048 },
                            pr,
                          );
                        }}
                      >
                        ＋{pr.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {tab === 'annotations' && (
                <div className="row-gap wrap">
                  <button
                    type="button"
                    className={`btn btn-sm ${drawMode === 'eraser-brush' ? 'btn-active-toggle' : 'btn-primary'}`}
                    onClick={() =>
                      setDrawMode((m) => (m === 'eraser-brush' ? 'none' : 'eraser-brush'))
                    }
                  >
                    <Eraser size={18} />
                    {drawMode === 'eraser-brush'
                      ? '消したい部分を指でなぞってください'
                      : '手書き・数字を指でなぞって消す（消しゴム）'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={erasingBusy}
                    onClick={async () => {
                      if (!bgCanvasRef.current) return;
                      setErasingBusy(true);
                      setErasingStatus('写真内の数字・記入内容を自動検出中…');
                      try {
                        const regions = await detectTextRegionsToErase(
                          bgCanvasRef.current,
                          true,
                          (msg) => setErasingStatus(msg),
                        );
                        if (regions.length === 0) {
                          alert('消去対象の数字や手書き文字が見つかりませんでした。手動の消しゴムまたは四角マスクをお使いください。');
                          return;
                        }
                        const newAnns = createEraseAnnotations(
                          bgCanvasRef.current,
                          regions.map((r) => r.rect),
                          pageIndex,
                        );
                        setAnnotations((prev) => [...prev, ...newAnns]);
                        setSavedNotice(`${regions.length}箇所の記入数字を白紙化しました！`);
                        setTimeout(() => setSavedNotice(null), 3500);
                      } catch (err) {
                        alert('自動検出でエラーが発生しました: ' + (err as Error).message);
                      } finally {
                        setErasingBusy(false);
                        setErasingStatus(null);
                      }
                    }}
                  >
                    <Wand2 size={18} />
                    {erasingBusy ? erasingStatus : '記入数字・金額を自動検出して一括消去'}
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm ${drawMode === 'new-ann' ? 'btn-active-toggle' : 'btn-secondary'}`}
                    onClick={() => setDrawMode((m) => (m === 'new-ann' ? 'none' : 'new-ann'))}
                  >
                    <Plus size={18} />
                    四角で隠す（マスク）
                  </button>

                  {annotations.filter((a) => a.page === pageIndex).length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => {
                        if (window.confirm('このページの消しゴム・マスクをすべてリセットしますか？')) {
                          setAnnotations((prev) => prev.filter((a) => a.page !== pageIndex));
                          setSelectedAnnId(null);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                      消去を全リセット
                    </button>
                  )}

                  {pdfTextItems.length > 0 && (
                    <span className="sub-note">
                      ※PDF内の青い点線枠をタップすると、その文字を直接マスクして書き換えられます
                    </span>
                  )}
                </div>
              )}

              {tab === 'formula' && (
                <p className="sub-note">
                  自動計算したい欄（例：「合計」「差引納金額」）をタップして、右（下）のパネルで計算式を設定してください。
                </p>
              )}
            </div>

            <div
              ref={stageRef}
              className={`editor-stage ${drawMode !== 'none' ? 'crosshair' : ''}`}
              onPointerDown={handleStagePointerDown}
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              onPointerCancel={handleStagePointerUp}
            >
              <canvas ref={bgCanvasRef} className="stage-canvas" />

              {/* PDFテキストレイヤーがある場合のワンタップ文字編集ターゲット（文字修正タブ時） */}
              {tab === 'annotations' &&
                pdfTextItems.map((it, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="pdf-text-hit"
                    style={{
                      left: `${it.rect.x * 100}%`,
                      top: `${it.rect.y * 100}%`,
                      width: `${Math.max(0.03, it.rect.w) * 100}%`,
                      height: `${Math.max(0.02, it.rect.h) * 100}%`,
                    }}
                    title={`「${it.str}」を修正`}
                    onClick={(e) => {
                      e.stopPropagation();
                      addAnnotationAt(
                        {
                          x: clamp(it.rect.x - 0.004, 0, 0.95),
                          y: clamp(it.rect.y - 0.003, 0, 0.95),
                          w: clamp(Math.max(0.06, it.rect.w + 0.01), 0.04, 1),
                          h: clamp(Math.max(0.025, it.rect.h + 0.006), 0.02, 1),
                        },
                        it.str,
                      );
                    }}
                  />
                ))}

              {/* 入力欄オーバーレイ（入力欄タブ・計算式タブで表示） */}
              {(tab === 'fields' || tab === 'formula') &&
                pageFields.map((f) => {
                  const selected = f.id === selectedFieldId;
                  const hasFormula = Boolean(f.formula && f.formula.length > 0);
                  return (
                    <div
                      key={f.id}
                      className={`field-box ${selected ? 'selected' : ''} ${hasFormula ? 'formula-box' : ''}`}
                      style={{
                        left: `${f.rect.x * 100}%`,
                        top: `${f.rect.y * 100}%`,
                        width: `${f.rect.w * 100}%`,
                        height: `${f.rect.h * 100}%`,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedFieldId(f.id);
                        if (tab !== 'fields') return;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setDragOp({
                          target: 'field',
                          mode: 'move',
                          id: f.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origRect: { ...f.rect },
                        });
                      }}
                    >
                      <span className="field-box-tag">
                        {f.label}
                        {f.required ? ' *' : ''}
                        {hasFormula ? ' [自動計算]' : ` (${FIELD_TYPE_LABEL[f.type]})`}
                      </span>
                      {selected && tab === 'fields' && (
                        <div
                          className="resize-handle"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            setDragOp({
                              target: 'field',
                              mode: 'resize',
                              id: f.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origRect: { ...f.rect },
                            });
                          }}
                          title="ドラッグでサイズ変更"
                        />
                      )}
                    </div>
                  );
                })}

              {/* 文字修正（マスク＋上書き）オーバーレイ（文字修正タブで表示） */}
              {tab === 'annotations' &&
                pageAnns.map((a) => {
                  const selected = a.id === selectedAnnId;
                  return (
                    <div
                      key={a.id}
                      className={`ann-box ${selected ? 'selected' : ''}`}
                      style={{
                        left: `${a.rect.x * 100}%`,
                        top: `${a.rect.y * 100}%`,
                        width: `${a.rect.w * 100}%`,
                        height: `${a.rect.h * 100}%`,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedAnnId(a.id);
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setDragOp({
                          target: 'ann',
                          mode: 'move',
                          id: a.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origRect: { ...a.rect },
                        });
                      }}
                    >
                      {selected && (
                        <div
                          className="resize-handle"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            setDragOp({
                              target: 'ann',
                              mode: 'resize',
                              id: a.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origRect: { ...a.rect },
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 右/下：設定インスペクタパネル */}
          <aside className="editor-side-panel card">
            {/* ---------- タブ1：入力欄の設定 ---------- */}
            {tab === 'fields' && (
              <div className="stack-form">
                <h3>入力欄の詳細設定</h3>
                {!selectedField ? (
                  <p className="sub-note">
                    テンプレート上の入力欄をタップするか、「画面をタップして入力欄を配置」ボタンで新しい欄を作ってください。
                  </p>
                ) : (
                  <>
                    <div className="row-between">
                      <strong>選択中：{selectedField.label}</strong>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => {
                          setFields((prev) => prev.filter((f) => f.id !== selectedField.id));
                          setSelectedFieldId(null);
                        }}
                      >
                        <Trash2 size={16} />
                        削除
                      </button>
                    </div>

                    <label className="form-field">
                      <span>項目名（例：運賃、高速代、駐車代、合計、日付、氏名）</span>
                      <input
                        type="text"
                        value={selectedField.label}
                        onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      />
                    </label>

                    <label className="form-field">
                      <span>入力の種類</span>
                      <select
                        value={selectedField.type}
                        onChange={(e) => {
                          const nextType = e.target.value as FieldType;
                          updateField(selectedField.id, {
                            type: nextType,
                            comma: nextType === 'currency' ? true : selectedField.comma,
                            align:
                              nextType === 'currency' || nextType === 'number'
                                ? 'right'
                                : 'center',
                          });
                        }}
                      >
                        <option value="currency">金額（テンキー・カンマ表示）</option>
                        <option value="number">数字（テンキー）</option>
                        <option value="text">文字（氏名・備考など）</option>
                        <option value="date">日付（カレンダー選択）</option>
                        <option value="time">時間（時刻選択）</option>
                      </select>
                    </label>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedField.required}
                        onChange={(e) =>
                          updateField(selectedField.id, { required: e.target.checked })
                        }
                      />
                      <span>必須項目にする（未入力のとき出力前に警告）</span>
                    </label>

                    {isNumeric(selectedField) && (
                      <>
                        <label className="form-field">
                          <span>最大桁数（数字・金額）</span>
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={selectedField.maxDigits ?? 8}
                            onChange={(e) =>
                              updateField(selectedField.id, {
                                maxDigits: Number(e.target.value) || undefined,
                              })
                            }
                          />
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedField.comma ?? selectedField.type === 'currency'}
                            onChange={(e) =>
                              updateField(selectedField.id, { comma: e.target.checked })
                            }
                          />
                          <span>3桁カンマ区切りで表示する（例: 12,500）</span>
                        </label>
                      </>
                    )}

                    <label className="form-field">
                      <span>文字の揃え位置</span>
                      <div className="seg-group">
                        {(['left', 'center', 'right'] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            className={`seg-btn ${selectedField.align === al ? 'active' : ''}`}
                            onClick={() => updateField(selectedField.id, { align: al })}
                          >
                            {al === 'left' ? '左寄せ' : al === 'center' ? '中央' : '右寄せ'}
                          </button>
                        ))}
                      </div>
                    </label>

                    {/* 指だけで微調整できる移動・サイズ調整パッド */}
                    <div className="nudge-pad">
                      <span>位置と大きさの微調整（指でタップ）：</span>
                      <div className="nudge-buttons">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                x: clamp(selectedField.rect.x - 0.005, 0, 1),
                              },
                            })
                          }
                        >
                          ◀ 左
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                y: clamp(selectedField.rect.y - 0.005, 0, 1),
                              },
                            })
                          }
                        >
                          ▲ 上
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                y: clamp(selectedField.rect.y + 0.005, 0, 1),
                              },
                            })
                          }
                        >
                          ▼ 下
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                x: clamp(selectedField.rect.x + 0.005, 0, 1),
                              },
                            })
                          }
                        >
                          右 ▶
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                w: clamp(selectedField.rect.w + 0.015, 0.04, 1),
                              },
                            })
                          }
                        >
                          幅＋
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            updateField(selectedField.id, {
                              rect: {
                                ...selectedField.rect,
                                w: clamp(selectedField.rect.w - 0.015, 0.04, 1),
                              },
                            })
                          }
                        >
                          幅−
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---------- タブ2：自動計算式の設定 ---------- */}
            {tab === 'formula' && (
              <div className="stack-form">
                <h3>金額・数字の自動計算（足し算・引き算）</h3>
                <label className="form-field">
                  <span>計算結果を表示する欄（例：合計、差引納金額）</span>
                  <select
                    value={selectedFieldId ?? ''}
                    onChange={(e) => setSelectedFieldId(e.target.value || null)}
                  >
                    <option value="">-- 欄を選択してください --</option>
                    {fields.filter(isNumeric).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} {f.formula?.length ? '（自動計算設定中）' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedField && isNumeric(selectedField) ? (
                  <>
                    <div className="formula-list">
                      {(selectedField.formula ?? []).length === 0 ? (
                        <p className="sub-note">
                          現在この欄は手入力です。下の「＋項目を足す / －項目を引く」から計算式を追加すると自動計算欄になります。
                        </p>
                      ) : (
                        (selectedField.formula ?? []).map((term, idx) => (
                          <div key={idx} className="formula-row">
                            <select
                              value={term.op}
                              onChange={(e) => {
                                const next: FormulaTerm[] = (selectedField.formula ?? []).map(
                                  (t, i) =>
                                    i === idx ? { ...t, op: e.target.value as '+' | '-' } : t,
                                );
                                updateField(selectedField.id, { formula: next });
                              }}
                            >
                              <option value="+">＋ 足す</option>
                              <option value="-">－ 引く</option>
                            </select>
                            <select
                              value={term.fieldId}
                              onChange={(e) => {
                                const next: FormulaTerm[] = (selectedField.formula ?? []).map(
                                  (t, i) => (i === idx ? { ...t, fieldId: e.target.value } : t),
                                );
                                updateField(selectedField.id, { formula: next });
                              }}
                            >
                              {fields
                                .filter((f) => isNumeric(f) && f.id !== selectedField.id)
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => {
                                const next = (selectedField.formula ?? []).filter(
                                  (_, i) => i !== idx,
                                );
                                updateField(selectedField.id, {
                                  formula: next.length ? next : undefined,
                                });
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="row-gap wrap">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const candidate = fields.find(
                            (f) => isNumeric(f) && f.id !== selectedField.id,
                          );
                          if (!candidate) return;
                          const next: FormulaTerm[] = [
                            ...(selectedField.formula ?? []),
                            { fieldId: candidate.id, op: '+' },
                          ];
                          updateField(selectedField.id, { formula: next });
                        }}
                      >
                        <Plus size={16} />
                        ＋ 足す項目を追加
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const candidate = fields.find(
                            (f) => isNumeric(f) && f.id !== selectedField.id,
                          );
                          if (!candidate) return;
                          const next: FormulaTerm[] = [
                            ...(selectedField.formula ?? []),
                            { fieldId: candidate.id, op: '-' },
                          ];
                          updateField(selectedField.id, { formula: next });
                        }}
                      >
                        <Plus size={16} />
                        － 引く項目を追加
                      </button>
                      {selectedField.formula && selectedField.formula.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => updateField(selectedField.id, { formula: undefined })}
                        >
                          計算式を解除して手入力に戻す
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="sub-note">金額または数字の欄を選択してください。</p>
                )}
              </div>
            )}

            {/* ---------- タブ3：テンプレートの文字の修正（マスク＋上書き・消しゴム） ---------- */}
            {tab === 'annotations' && (
              <div className="stack-form">
                <h3>文字の修正・手書き数字の消去</h3>
                <p className="sub-note">
                  数字や手書き文字を背景色と同じ色で隠して（消去）、きれいな空白テンプレートにします。
                </p>

                <div className="card-sub stack-form">
                  <div className="row-between">
                    <strong>消しゴムの太さ</strong>
                    <span>{Math.round(eraserSize * 1000)}px</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={80}
                    value={Math.round(eraserSize * 1000)}
                    onChange={(e) => setEraserSize(Number(e.target.value) / 1000)}
                  />
                  <span className="sub-note" style={{ fontSize: 13 }}>
                    ※「手書き・数字を指でなぞって消す」ボタンを押した後、写真上を指でなぞるとその部分が白紙化されます。
                  </span>
                </div>

                {!selectedAnn ? (
                  <p className="sub-note">
                    「手書き・数字を指でなぞって消す」で消去するか、「四角で隠す（マスク）」を押して消したい部分を囲んでください。
                  </p>
                ) : (
                  <>
                    <div className="row-between">
                      <strong>選択中の文字修正</strong>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => {
                          setAnnotations((prev) => prev.filter((a) => a.id !== selectedAnn.id));
                          setSelectedAnnId(null);
                        }}
                      >
                        <Trash2 size={16} />
                        削除
                      </button>
                    </div>

                    <label className="form-field">
                      <span>上書きする新しい文字（空欄にすると白抜きマスクのみ）</span>
                      <input
                        type="text"
                        value={selectedAnn.text}
                        onChange={(e) => updateAnn(selectedAnn.id, { text: e.target.value })}
                      />
                    </label>

                    <div className="row-gap wrap">
                      <label className="form-field compact">
                        <span>マスク背景色</span>
                        <input
                          type="color"
                          value={selectedAnn.maskColor ?? '#ffffff'}
                          onChange={(e) =>
                            updateAnn(selectedAnn.id, { maskColor: e.target.value })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (!bgCanvasRef.current) return;
                          const c = bgCanvasRef.current;
                          const r = selectedAnn.rect;
                          const color = sampleBackground(
                            c,
                            r.x * c.width,
                            r.y * c.height,
                            r.w * c.width,
                            r.h * c.height,
                          );
                          updateAnn(selectedAnn.id, { maskColor: color });
                        }}
                      >
                        周囲の背景色を自動取得
                      </button>
                    </div>

                    <div className="row-gap wrap">
                      <label className="form-field compact">
                        <span>文字の色</span>
                        <input
                          type="color"
                          value={selectedAnn.textColor}
                          onChange={(e) =>
                            updateAnn(selectedAnn.id, { textColor: e.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedAnn.bold}
                          onChange={(e) => updateAnn(selectedAnn.id, { bold: e.target.checked })}
                        />
                        <span>太字にする</span>
                      </label>
                    </div>

                    <label className="slider-field">
                      <div className="row-between">
                        <span>フォントサイズ</span>
                        <strong>{Math.round(selectedAnn.fontSize * 1000)}</strong>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={60}
                        value={Math.round(selectedAnn.fontSize * 1000)}
                        onChange={(e) =>
                          updateAnn(selectedAnn.id, { fontSize: Number(e.target.value) / 1000 })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
