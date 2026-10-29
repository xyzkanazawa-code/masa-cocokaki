import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Move,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PerspectiveCropper } from './PerspectiveCropper';
import { useApp } from '../context/AppContext';
import { cleanPhoto, DEFAULT_CLEAN, type CleanParams } from '../lib/cv';
import { clamp, newId } from '../lib/id';
import { canvasToBlob, imageToCanvas, loadImage, makeThumb } from '../lib/image';
import { rebuildFromPhoto } from '../lib/ocr';
import { drawRebuild } from '../lib/render';
import type { RebuildLine, RebuildPage, RebuildText, Template } from '../types';

interface Props {
  template: Template;
  pageIndex: number;
  onUpdated: (t: Template) => void;
}

export function CleanupPanel({ template, pageIndex, onUpdated }: Props) {
  const { repos, templates } = useApp();
  const nav = useNavigate();

  const [mode, setMode] = useState<'A' | 'B'>(template.kind === 'rebuilt' ? 'B' : 'A');
  const [srcCanvas, setSrcCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showCropper, setShowCropper] = useState(false);

  // モードA用ステート
  const [params, setParams] = useState<CleanParams>(DEFAULT_CLEAN);
  const [cleanedCanvas, setCleanedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [compareSplit, setCompareSplit] = useState(50);
  const [busyA, setBusyA] = useState(false);

  // モードB用ステート
  const existingRebuild = template.rebuild?.find((r) => r.page === pageIndex);
  const [rebuildPage, setRebuildPage] = useState<RebuildPage>(
    existingRebuild ?? { page: pageIndex, lines: [], texts: [] },
  );
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(true);
  const [busyB, setBusyB] = useState(false);
  const [statusB, setStatusB] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const rebuildCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dragState, setDragState] = useState<{
    kind: 'text' | 'line';
    id: string;
    startX: number;
    startY: number;
    origText?: RebuildText;
    origLine?: RebuildLine;
  } | null>(null);

  // 元の写真テンプレートと作り直し版の相互リンクを探す
  const linkedTemplate = templates.find(
    (t) =>
      (template.derivedFrom && t.id === template.derivedFrom) ||
      t.derivedFrom === template.id,
  );

  // 背景画像を読み込む
  useEffect(() => {
    if (!repos) return;
    let alive = true;
    const page = template.pages[pageIndex];
    if (!page) return;
    repos.blobs
      .get(page.bgBlobId)
      .then((b) => loadImage(b))
      .then((img) => {
        if (!alive) return;
        setSrcCanvas(imageToCanvas(img, 2000));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [repos, template, pageIndex]);

  // モードA：スライダー変更時に補正を実行
  useEffect(() => {
    if (mode !== 'A' || !srcCanvas) return;
    let alive = true;
    const timer = setTimeout(() => {
      setBusyA(true);
      cleanPhoto(srcCanvas, params)
        .then((out) => {
          if (alive) setCleanedCanvas(out);
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setBusyA(false);
        });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mode, srcCanvas, params]);

  // モードB：ベクタープレビュー描画
  useEffect(() => {
    if (mode !== 'B' || !srcCanvas || !rebuildCanvasRef.current) return;
    const c = rebuildCanvasRef.current;
    c.width = srcCanvas.width;
    c.height = srcCanvas.height;
    const ctx = c.getContext('2d')!;
    drawRebuild(ctx, rebuildPage, c.width, c.height);
    if (showUnderlay) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);
      ctx.restore();
    }
  }, [mode, srcCanvas, rebuildPage, showUnderlay]);

  // モードAで補正した結果を新しいきれいなテンプレートとして保存（元写真も残す）
  const saveModeAsNewTemplate = async () => {
    if (!repos || !cleanedCanvas) return;
    setBusyA(true);
    try {
      const bgBlob = await canvasToBlob(cleanedCanvas, 'image/png');
      const thumbBlob = await makeThumb(cleanedCanvas);
      const bgBlobId = await repos.blobs.put(bgBlob);
      const thumbBlobId = await repos.blobs.put(thumbBlob);

      const newPages = template.pages.map((p, i) =>
        i === pageIndex
          ? { ...p, width: cleanedCanvas.width, height: cleanedCanvas.height, bgBlobId }
          : p,
      );
      const created = await repos.templates.create({
        name: `${template.name}（写真補正版）`,
        kind: 'photo',
        pages: newPages,
        sourceBlobId: bgBlobId,
        sourceMime: 'image/png',
        thumbBlobId,
        fields: structuredClone(template.fields),
        annotations: structuredClone(template.annotations),
        derivedFrom: template.id,
        variantLabel: '写真補正版（モードA）',
      });
      nav(`/edit/${created.id}`);
    } finally {
      setBusyA(false);
    }
  };

  // モードB：写真から罫線検出＋OCRを実行
  const runModeBRebuild = async () => {
    if (!srcCanvas) return;
    setBusyB(true);
    setStatusB('写真を解析しています…');
    try {
      const rp = await rebuildFromPhoto(srcCanvas, pageIndex, (msg) => setStatusB(msg));
      setRebuildPage(rp);
      setSelectedTextId(rp.texts[0]?.id ?? null);
      setSelectedLineId(null);
    } finally {
      setBusyB(false);
      setStatusB(null);
    }
  };

  // モードBの作り直し版を新しいテンプレートとして保存（元写真も残し切り替え可能）
  const saveModeBTemplate = async () => {
    if (!repos || !srcCanvas || !rebuildCanvasRef.current) return;
    setBusyB(true);
    setStatusB('作り直しテンプレートを保存しています…');
    try {
      const thumbBlob = await makeThumb(rebuildCanvasRef.current);
      const thumbBlobId = await repos.blobs.put(thumbBlob);
      if (template.kind === 'rebuilt') {
        const nextRebuild = [
          ...(template.rebuild ?? []).filter((r) => r.page !== pageIndex),
          rebuildPage,
        ];
        const updated = await repos.templates.updateDefinition(template.id, {
          rebuild: nextRebuild,
        });
        onUpdated(updated);
        setStatusB('保存しました');
        setTimeout(() => setStatusB(null), 1500);
      } else {
        const created = await repos.templates.create({
          name: `${template.name}（作り直し版）`,
          kind: 'rebuilt',
          pages: structuredClone(template.pages),
          sourceBlobId: template.sourceBlobId,
          sourceMime: template.sourceMime,
          thumbBlobId,
          fields: structuredClone(template.fields),
          annotations: structuredClone(template.annotations),
          rebuild: [rebuildPage],
          derivedFrom: template.id,
          variantLabel: '作り直し版（モードB）',
        });
        nav(`/edit/${created.id}?tab=cleanup`);
      }
    } finally {
      setBusyB(false);
    }
  };

  const selectedText = rebuildPage.texts.find((t) => t.id === selectedTextId) ?? null;
  const selectedLine = rebuildPage.lines.find((l) => l.id === selectedLineId) ?? null;

  const updateSelectedText = (patch: Partial<RebuildText>) => {
    if (!selectedTextId) return;
    setRebuildPage((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => (t.id === selectedTextId ? { ...t, ...patch } : t)),
    }));
  };

  const updateSelectedLine = (patch: Partial<RebuildLine>) => {
    if (!selectedLineId) return;
    setRebuildPage((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === selectedLineId ? { ...l, ...patch } : l)),
    }));
  };

  const onStagePointerMove = (e: PointerEvent) => {
    if (!dragState || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragState.startX) / r.width;
    const dy = (e.clientY - dragState.startY) / r.height;
    if (dragState.kind === 'text' && dragState.origText) {
      const o = dragState.origText.rect;
      updateSelectedText({
        rect: {
          ...o,
          x: clamp(o.x + dx, 0, 1 - o.w),
          y: clamp(o.y + dy, 0, 1 - o.h),
        },
      });
    } else if (dragState.kind === 'line' && dragState.origLine) {
      const o = dragState.origLine;
      updateSelectedLine({
        x1: clamp(o.x1 + dx, 0, 1),
        y1: clamp(o.y1 + dy, 0, 1),
        x2: clamp(o.x2 + dx, 0, 1),
        y2: clamp(o.y2 + dy, 0, 1),
      });
    }
  };

  return (
    <div className="cleanup-container">
      {/* きれい化の注意点（仕様必須表示） */}
      <div className="caution-banner" role="note">
        <AlertTriangle size={22} className="caution-icon" />
        <div>
          <strong>きれい化機能のご注意</strong>
          <ul>
            <li>手書き文字、強い折り目、光の反射、解像度の低い写真は、完全には元通りにならない場合があります。</li>
            <li>「きれいに作り直すモード」のOCR（文字読み取り）の読み間違いは、画面上で確認して修正してください。</li>
          </ul>
        </div>
      </div>

      {/* 元写真テンプレート ⇔ 作り直し版/補正版の切り替えバー */}
      {linkedTemplate && (
        <div className="switch-template-bar">
          <span>
            元のテンプレートと切り替えられます：現在 <strong>{template.name}</strong>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => nav(`/edit/${linkedTemplate.id}?tab=cleanup`)}
          >
            <ArrowLeftRight size={17} />
            「{linkedTemplate.name}」に切り替える
          </button>
        </div>
      )}

      {/* モードA / モードB 切替 */}
      <div className="mode-toggle" role="tablist">
        <button
          type="button"
          className={`mode-tab ${mode === 'A' ? 'active' : ''}`}
          onClick={() => setMode('A')}
        >
          <Sliders size={20} />
          モードA：写真補正モード（影消し・白黒鮮明化）
        </button>
        <button
          type="button"
          className={`mode-tab ${mode === 'B' ? 'active' : ''}`}
          onClick={() => setMode('B')}
        >
          <Wand2 size={20} />
          モードB：きれいに作り直すモード（OCR＋罫線再構成）
        </button>
      </div>

      {showCropper && srcCanvas && (
        <div className="card">
          <PerspectiveCropper
            source={srcCanvas}
            onConfirm={(c) => {
              setSrcCanvas(c);
              setShowCropper(false);
            }}
            onCancel={() => setShowCropper(false)}
          />
        </div>
      )}

      {/* ==================== モードA：写真補正モード ==================== */}
      {mode === 'A' && !showCropper && (
        <div className="cleanup-grid">
          <div className="card stack-form">
            <div className="row-between">
              <h3>写真補正スライダー</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCropper(true)}
              >
                台形補正をやり直す
              </button>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={params.deskew}
                onChange={(e) => setParams({ ...params, deskew: e.target.checked })}
              />
              <span>傾きの自動補正</span>
            </label>

            <label className="slider-field">
              <div className="row-between">
                <span>影の除去（照明ムラを消す）</span>
                <strong>{params.shadow}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.shadow}
                onChange={(e) => setParams({ ...params, shadow: Number(e.target.value) })}
              />
            </label>

            <label className="slider-field">
              <div className="row-between">
                <span>背景の白化（紙を白くする）</span>
                <strong>{params.whiten}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.whiten}
                onChange={(e) => setParams({ ...params, whiten: Number(e.target.value) })}
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={params.binarize}
                onChange={(e) => setParams({ ...params, binarize: e.target.checked })}
              />
              <span>二値化（線と文字をくっきり黒く、背景を真っ白にする）</span>
            </label>

            {params.binarize && (
              <label className="slider-field">
                <div className="row-between">
                  <span>文字・線の濃さ（しきい値）</span>
                  <strong>{params.threshold}%</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={params.threshold}
                  onChange={(e) => setParams({ ...params, threshold: Number(e.target.value) })}
                />
              </label>
            )}

            <label className="slider-field">
              <div className="row-between">
                <span>ノイズ・黒点の除去</span>
                <strong>{params.denoise}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.denoise}
                onChange={(e) => setParams({ ...params, denoise: Number(e.target.value) })}
              />
            </label>

            <label className="slider-field">
              <div className="row-between">
                <span>線のなめらか化</span>
                <strong>{params.smooth}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.smooth}
                onChange={(e) => setParams({ ...params, smooth: Number(e.target.value) })}
              />
            </label>

            <label className="slider-field">
              <div className="row-between">
                <span>シャープ化（輪郭強調）</span>
                <strong>{params.sharpen}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.sharpen}
                onChange={(e) => setParams({ ...params, sharpen: Number(e.target.value) })}
              />
            </label>

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busyA || !cleanedCanvas}
              onClick={saveModeAsNewTemplate}
            >
              <Check size={20} />
              {busyA ? '処理中…' : 'この補正結果で新しいテンプレートとして保存（元写真も残す）'}
            </button>
          </div>

          {/* 補正前・補正後の比較ビュー */}
          <div className="card stack-form">
            <div className="row-between">
              <h3>補正前 ⇔ 補正後 比較プレビュー</h3>
              {busyA && <span className="badge-working">画像処理中…</span>}
            </div>
            <label className="slider-field">
              <div className="row-between">
                <span>◀ 左：補正前（元写真）</span>
                <span>右：補正後 ▶ ({compareSplit}%)</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={compareSplit}
                onChange={(e) => setCompareSplit(Number(e.target.value))}
              />
            </label>

            {srcCanvas && cleanedCanvas && (
              <div className="compare-stage">
                <img
                  src={cleanedCanvas.toDataURL('image/png')}
                  alt="補正後"
                  className="compare-img"
                />
                <div
                  className="compare-before-clip"
                  style={{ clipPath: `inset(0 ${100 - compareSplit}% 0 0)` }}
                >
                  <img
                    src={srcCanvas.toDataURL('image/jpeg', 0.85)}
                    alt="補正前"
                    className="compare-img"
                  />
                </div>
                <div className="compare-divider" style={{ left: `${compareSplit}%` }}>
                  <span>比較境界</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== モードB：きれいに作り直すモード ==================== */}
      {mode === 'B' && (
        <div className="cleanup-grid">
          <div className="card stack-form">
            <h3>写真を下書きにして既製品のように再構成</h3>
            <p className="sub-note">
              罫線・枠を検出してまっすぐな線で描き直し、文字をOCRで読み取ってきれいなフォントに置き換えます。
            </p>

            <div className="row-gap wrap">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyB || !srcCanvas}
                onClick={runModeBRebuild}
              >
                <Sparkles size={20} />
                {rebuildPage.lines.length > 0 || rebuildPage.texts.length > 0
                  ? 'もう一度 写真から自動検出（OCR＋罫線）'
                  : '写真から罫線と文字を自動検出する（OCR）'}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const id = newId();
                  const nt: RebuildText = {
                    id,
                    rect: { x: 0.2, y: 0.2, w: 0.25, h: 0.04 },
                    text: '新規テキスト',
                    fontSize: 0.02,
                    bold: false,
                    align: 'left',
                  };
                  setRebuildPage((p) => ({ ...p, texts: [...p.texts, nt] }));
                  setSelectedTextId(id);
                  setSelectedLineId(null);
                }}
              >
                <Plus size={17} />
                文字を追加
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const id = newId();
                  const nl: RebuildLine = {
                    id,
                    x1: 0.1,
                    y1: 0.5,
                    x2: 0.9,
                    y2: 0.5,
                    width: 0.002,
                  };
                  setRebuildPage((p) => ({ ...p, lines: [...p.lines, nl] }));
                  setSelectedLineId(id);
                  setSelectedTextId(null);
                }}
              >
                <Plus size={17} />
                横線を追加
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const id = newId();
                  const nl: RebuildLine = {
                    id,
                    x1: 0.5,
                    y1: 0.1,
                    x2: 0.5,
                    y2: 0.9,
                    width: 0.002,
                  };
                  setRebuildPage((p) => ({ ...p, lines: [...p.lines, nl] }));
                  setSelectedLineId(id);
                  setSelectedTextId(null);
                }}
              >
                <Plus size={17} />
                縦線を追加
              </button>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={showUnderlay}
                onChange={(e) => setShowUnderlay(e.target.checked)}
              />
              <span>元の写真を薄く重ねて表示（位置合わせ確認用）</span>
            </label>

            {statusB && (
              <div className="info-banner">
                <RefreshCw size={18} className="spin" />
                <span>{statusB}</span>
              </div>
            )}

            {/* 選択中のOCR文字の編集・位置微調整パネル */}
            {selectedText && (
              <div className="inspector-box">
                <div className="row-between">
                  <h4>選択中の文字の修正・微調整</h4>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => {
                      setRebuildPage((p) => ({
                        ...p,
                        texts: p.texts.filter((t) => t.id !== selectedText.id),
                      }));
                      setSelectedTextId(null);
                    }}
                  >
                    <Trash2 size={16} />
                    この文字を削除
                  </button>
                </div>

                <label className="form-field">
                  <span>文字内容（OCRの読み間違いをその場で修正）</span>
                  <input
                    type="text"
                    value={selectedText.text}
                    onChange={(e) => updateSelectedText({ text: e.target.value })}
                  />
                </label>

                <div className="row-gap wrap">
                  <label className="form-field compact">
                    <span>文字サイズ</span>
                    <input
                      type="range"
                      min={10}
                      max={50}
                      value={Math.round(selectedText.fontSize * 1000)}
                      onChange={(e) =>
                        updateSelectedText({ fontSize: Number(e.target.value) / 1000 })
                      }
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedText.bold}
                      onChange={(e) => updateSelectedText({ bold: e.target.checked })}
                    />
                    <span>太字</span>
                  </label>
                </div>

                <div className="nudge-pad">
                  <span>指で1ミリずつ位置を微調整：</span>
                  <div className="nudge-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedText({
                          rect: { ...selectedText.rect, x: clamp(selectedText.rect.x - 0.004, 0, 1) },
                        })
                      }
                    >
                      ◀ 左
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedText({
                          rect: { ...selectedText.rect, y: clamp(selectedText.rect.y - 0.004, 0, 1) },
                        })
                      }
                    >
                      ▲ 上
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedText({
                          rect: { ...selectedText.rect, y: clamp(selectedText.rect.y + 0.004, 0, 1) },
                        })
                      }
                    >
                      ▼ 下
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedText({
                          rect: { ...selectedText.rect, x: clamp(selectedText.rect.x + 0.004, 0, 1) },
                        })
                      }
                    >
                      右 ▶
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 選択中の罫線の微調整パネル */}
            {selectedLine && (
              <div className="inspector-box">
                <div className="row-between">
                  <h4>選択中の罫線の微調整</h4>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => {
                      setRebuildPage((p) => ({
                        ...p,
                        lines: p.lines.filter((l) => l.id !== selectedLine.id),
                      }));
                      setSelectedLineId(null);
                    }}
                  >
                    <Trash2 size={16} />
                    この線を削除
                  </button>
                </div>
                <div className="nudge-pad">
                  <span>線の移動：</span>
                  <div className="nudge-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedLine({
                          x1: clamp(selectedLine.x1 - 0.004, 0, 1),
                          x2: clamp(selectedLine.x2 - 0.004, 0, 1),
                        })
                      }
                    >
                      ◀ 左
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedLine({
                          y1: clamp(selectedLine.y1 - 0.004, 0, 1),
                          y2: clamp(selectedLine.y2 - 0.004, 0, 1),
                        })
                      }
                    >
                      ▲ 上
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedLine({
                          y1: clamp(selectedLine.y1 + 0.004, 0, 1),
                          y2: clamp(selectedLine.y2 + 0.004, 0, 1),
                        })
                      }
                    >
                      ▼ 下
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateSelectedLine({
                          x1: clamp(selectedLine.x1 + 0.004, 0, 1),
                          x2: clamp(selectedLine.x2 + 0.004, 0, 1),
                        })
                      }
                    >
                      右 ▶
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busyB || (rebuildPage.lines.length === 0 && rebuildPage.texts.length === 0)}
              onClick={saveModeBTemplate}
            >
              <Check size={20} />
              {template.kind === 'rebuilt'
                ? '作り直し版の修正を保存する'
                : '新しい「作り直し版テンプレート」として保存（元写真も残す）'}
            </button>
          </div>

          {/* モードB：ドラッグ可能な再構成キャンバス */}
          <div className="card stack-form">
            <div className="row-between">
              <h3>再構成キャンバス（文字や線をタップ・ドラッグで微調整）</h3>
              <span className="sub-note">
                <Move size={15} /> 線 {rebuildPage.lines.length}本 / 文字 {rebuildPage.texts.length}個
              </span>
            </div>

            <div
              ref={stageRef}
              className="editor-stage"
              onPointerMove={onStagePointerMove}
              onPointerUp={() => setDragState(null)}
              onPointerCancel={() => setDragState(null)}
            >
              <canvas ref={rebuildCanvasRef} className="stage-canvas" />

              {/* 線のヒット・ドラッグ領域 */}
              <svg className="stage-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                {rebuildPage.lines.map((l) => {
                  const active = l.id === selectedLineId;
                  return (
                    <line
                      key={l.id}
                      x1={l.x1 * 1000}
                      y1={l.y1 * 1000}
                      x2={l.x2 * 1000}
                      y2={l.y2 * 1000}
                      stroke={active ? '#f97316' : 'transparent'}
                      strokeWidth={active ? 10 : 18}
                      style={{ cursor: 'move', pointerEvents: 'stroke' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture(e.pointerId);
                        setSelectedLineId(l.id);
                        setSelectedTextId(null);
                        setDragState({
                          kind: 'line',
                          id: l.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origLine: { ...l },
                        });
                      }}
                    />
                  );
                })}
              </svg>

              {/* OCR文字のタップ・ドラッグ枠 */}
              {rebuildPage.texts.map((t) => {
                const active = t.id === selectedTextId;
                return (
                  <div
                    key={t.id}
                    className={`rebuild-text-handle ${active ? 'selected' : ''}`}
                    style={{
                      left: `${t.rect.x * 100}%`,
                      top: `${t.rect.y * 100}%`,
                      width: `${t.rect.w * 100}%`,
                      height: `${t.rect.h * 100}%`,
                    }}
                    title={t.text}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setSelectedTextId(t.id);
                      setSelectedLineId(null);
                      setDragState({
                        kind: 'text',
                        id: t.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origText: structuredClone(t),
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
