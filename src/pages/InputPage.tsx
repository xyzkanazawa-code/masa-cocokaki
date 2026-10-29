import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Delete,
  FileOutput,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { computeAll, missingRequired } from '../lib/calc';
import { formatValue, isNumeric, sanitizeNumber } from '../lib/format';
import { renderPage } from '../lib/render';
import type { FieldDef, Session, Template } from '../types';

export function InputPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { repos, refreshLocal } = useApp();
  const nav = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!repos || !sessionId) return;
    let alive = true;
    (async () => {
      const s = await repos.sessions.get(sessionId);
      if (!alive || !s) return;
      const t = await repos.templates.get(s.templateId);
      if (!alive || !t) return;
      setSession(s);
      setTemplate(t);
      setValues(s.values);
      const firstEditable = t.fields.find((f) => !f.formula?.length);
      setActiveFieldId(firstEditable?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [repos, sessionId]);

  const computedValues = useMemo(() => {
    if (!template) return values;
    try {
      return computeAll(template.fields, values);
    } catch {
      return values;
    }
  }, [template, values]);

  // 空白テンプレートの背景＋マスク修正のみをキャンバスに描画（文字入力はDOMオーバーレイと出力時に重ねる）
  useEffect(() => {
    if (!repos || !template || !canvasRef.current) return;
    const page = template.pages[pageIndex];
    if (!page) return;
    let alive = true;
    (async () => {
      const bgBlob = await repos.blobs.get(page.bgBlobId);
      if (!alive) return;
      const c = await renderPage(template, pageIndex, bgBlob);
      if (!alive || !canvasRef.current) return;
      canvasRef.current.width = c.width;
      canvasRef.current.height = c.height;
      canvasRef.current.getContext('2d')!.drawImage(c, 0, 0);
    })();
    return () => {
      alive = false;
    };
  }, [repos, template, pageIndex]);

  // 入力変更のたびに別データ（JSON）としてIndexedDBに自動保存（テンプレート本体は一切変更しない）
  const updateFieldValue = (field: FieldDef, raw: string) => {
    if (field.formula?.length) return;
    const cleaned = isNumeric(field) ? sanitizeNumber(raw, field.maxDigits) : raw;
    setValues((prev) => {
      const next = { ...prev, [field.id]: cleaned };
      if (repos && session) {
        setSaveState('saving');
        void repos.sessions
          .saveValues(session.id, next)
          .then(() => refreshLocal())
          .then(() => setSaveState('saved'));
      }
      return next;
    });
  };

  if (!session || !template) {
    return (
      <main className="page-container">
        <p className="info-banner">入力画面を準備しています…</p>
      </main>
    );
  }

  const editableFields = template.fields.filter((f) => !f.formula?.length);
  const pageFields = template.fields.filter((f) => f.page === pageIndex);
  const activeField = template.fields.find((f) => f.id === activeFieldId) ?? null;
  const activeVal = activeField ? (computedValues[activeField.id] ?? '') : '';
  const missing = missingRequired(template.fields, computedValues);

  const moveFocus = (delta: number) => {
    if (editableFields.length === 0) return;
    const idx = editableFields.findIndex((f) => f.id === activeFieldId);
    const nextIdx = (idx + delta + editableFields.length) % editableFields.length;
    const nextField = editableFields[nextIdx];
    setActiveFieldId(nextField.id);
    if (nextField.page !== pageIndex) setPageIndex(nextField.page);
  };

  const tapTenkey = (digit: string) => {
    if (!activeField || !isNumeric(activeField) || activeField.formula?.length) return;
    const cur = values[activeField.id] ?? '';
    if (digit === 'BS') {
      updateFieldValue(activeField, cur.slice(0, -1));
    } else if (digit === 'C') {
      updateFieldValue(activeField, '');
    } else if (digit === '±') {
      updateFieldValue(activeField, cur.startsWith('-') ? cur.slice(1) : `-${cur}`);
    } else {
      updateFieldValue(activeField, cur + digit);
    }
  };

  return (
    <main className="input-page-layout">
      {/* 上部固定バー */}
      <div className="input-top-bar">
        <Link to="/" className="btn btn-secondary btn-sm">
          <ArrowLeft size={18} />
          ホーム
        </Link>
        <div className="input-title-col">
          <h1>{template.name}</h1>
          <span className="autosave-indicator">
            <CheckCircle2 size={14} />
            {saveState === 'saving' ? '自動保存中…' : '自動保存済み（空白テンプレ保護）'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => nav(`/export/${session.id}`)}
        >
          <FileOutput size={18} />
          完成版を出力・共有へ
        </button>
      </div>

      {/* 入力欄が未設定（0個）の場合の案内 */}
      {template.fields.length === 0 && (
        <div
          className="missing-bar"
          style={{
            backgroundColor: '#fef2f2',
            borderColor: '#fca5a5',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>このテンプレートには入力欄がまだ設定されていません（0個）。</span>
          </div>
          <Link
            to={`/edit/${template.id}`}
            className="btn btn-primary btn-sm"
            style={{ padding: '6px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}
          >
            入力欄を自動検出・配置する
          </Link>
        </div>
      )}

      {/* 必須未入力の案内 */}
      {missing.length > 0 && (
        <div className="missing-bar">
          <AlertCircle size={17} />
          <span>
            必須の未入力項目：{missing.map((m) => m.label).join('、')}
          </span>
        </div>
      )}

      {/* 複数ページ切替 */}
      {template.pages.length > 1 && (
        <div className="page-Select-bar">
          <span>ページ：</span>
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

      {/* テンプレート＋ぴったり重なる入力欄ステージ */}
      <div className="input-stage-scroll">
        <div className="editor-stage">
          <canvas ref={canvasRef} className="stage-canvas" />

          {pageFields.map((f) => {
            const isSelected = f.id === activeFieldId;
            const isAuto = Boolean(f.formula && f.formula.length > 0);
            const formatted = formatValue(f, computedValues[f.id]);
            return (
              <button
                key={f.id}
                type="button"
                className={`input-overlay-cell ${isSelected ? 'selected' : ''} ${
                  isAuto ? 'auto-cell' : ''
                } ${!formatted && f.required ? 'required-empty' : ''}`}
                style={{
                  left: `${f.rect.x * 100}%`,
                  top: `${f.rect.y * 100}%`,
                  width: `${f.rect.w * 100}%`,
                  height: `${f.rect.h * 100}%`,
                  justifyContent:
                    f.align === 'left'
                      ? 'flex-start'
                      : f.align === 'right'
                        ? 'flex-end'
                        : 'center',
                }}
                onClick={() => setActiveFieldId(f.id)}
              >
                {formatted ? (
                  <span className="overlay-value-text">{formatted}</span>
                ) : (
                  <span className="overlay-placeholder">
                    {f.label}
                    {f.required ? ' *' : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 下部ドック：選択中の欄の入力シート＆大型テンキー */}
      {activeField && (
        <section className="input-dock" aria-label="項目入力パネル">
          <div className="dock-header">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => moveFocus(-1)}
            >
              <ChevronLeft size={18} />
              前へ
            </button>
            <div className="dock-title">
              <strong>{activeField.label}</strong>
              {activeField.required && <span className="req-badge">必須</span>}
              {activeField.formula?.length ? (
                <span className="calc-badge">自動計算</span>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => moveFocus(1)}
            >
              次へ
              <ChevronRight size={18} />
            </button>
          </div>

          {activeField.formula?.length ? (
            <div className="dock-formula-display">
              <span>自動計算結果：</span>
              <strong>{formatValue(activeField, activeVal) || '0'}</strong>
            </div>
          ) : isNumeric(activeField) ? (
            <div className="tenkey-area">
              <div className="tenkey-display-row">
                <input
                  type="text"
                  inputMode="numeric"
                  className="tenkey-readout"
                  value={formatValue(activeField, activeVal)}
                  placeholder="0"
                  onChange={(e) => updateFieldValue(activeField, e.target.value)}
                  aria-label={activeField.label}
                />
                {activeField.type === 'currency' && <span className="unit-label">円</span>}
              </div>

              <div className="tenkey-grid">
                {['7', '8', '9', 'BS', '4', '5', '6', 'C', '1', '2', '3', '00', '0', '000'].map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      className={`tenkey-btn ${k === 'BS' || k === 'C' ? 'tenkey-fn' : ''}`}
                      onClick={() => tapTenkey(k)}
                    >
                      {k === 'BS' ? <Delete size={22} /> : k === 'C' ? 'クリア' : k}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="tenkey-btn tenkey-next"
                  onClick={() => moveFocus(1)}
                >
                  次の欄へ ▶
                </button>
              </div>
            </div>
          ) : activeField.type === 'date' ? (
            <div className="dock-native-row">
              <input
                type="date"
                className="dock-input"
                value={activeVal}
                onChange={(e) => updateFieldValue(activeField, e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const d = new Date();
                  const p = (n: number) => String(n).padStart(2, '0');
                  updateFieldValue(
                    activeField,
                    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
                  );
                }}
              >
                今日の日付を入れる
              </button>
            </div>
          ) : activeField.type === 'time' ? (
            <div className="dock-native-row">
              <input
                type="time"
                className="dock-input"
                value={activeVal}
                onChange={(e) => updateFieldValue(activeField, e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const d = new Date();
                  const p = (n: number) => String(n).padStart(2, '0');
                  updateFieldValue(activeField, `${p(d.getHours())}:${p(d.getMinutes())}`);
                }}
              >
                現在時刻を入れる
              </button>
            </div>
          ) : (
            <div className="dock-native-row">
              <input
                type="text"
                className="dock-input"
                value={activeVal}
                placeholder={`${activeField.label}を入力`}
                onChange={(e) => updateFieldValue(activeField, e.target.value)}
              />
            </div>
          )}
        </section>
      )}
    </main>
  );
}
