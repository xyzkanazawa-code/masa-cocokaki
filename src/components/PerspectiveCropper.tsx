import { Check, RotateCw, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { detectCorners, orderCorners, warpPerspective, type Pt } from '../lib/cv';
import { clamp } from '../lib/id';
import { autoLevels, cloneCanvas, newCanvas } from '../lib/image';

interface Props {
  source: HTMLCanvasElement;
  onConfirm: (result: HTMLCanvasElement) => void;
  onCancel: () => void;
}

/**
 * 写真で撮ったテンプレートの傾き補正（台形補正）＋明るさ・コントラスト自動調整コンポーネント。
 * 四隅の丸を指でドラッグして調整でき、指だけで完結する。
 */
export function PerspectiveCropper({ source, onConfirm, onCancel }: Props) {
  const [workSrc, setWorkSrc] = useState<HTMLCanvasElement>(source);
  const [corners, setCorners] = useState<Pt[]>([
    { x: 0.04, y: 0.04 },
    { x: 0.96, y: 0.04 },
    { x: 0.96, y: 0.96 },
    { x: 0.04, y: 0.96 },
  ]);
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    detectCorners(workSrc)
      .then((pts) => {
        if (alive) setCorners(pts);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [workSrc]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = workSrc.width;
    c.height = workSrc.height;
    const ctx = c.getContext('2d')!;
    const disp = autoAdjust ? autoLevels(workSrc) : workSrc;
    ctx.drawImage(disp, 0, 0);
  }, [workSrc, autoAdjust]);

  const rotate90 = () => {
    const out = newCanvas(workSrc.height, workSrc.width);
    const ctx = out.getContext('2d')!;
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(workSrc, -workSrc.width / 2, -workSrc.height / 2);
    setWorkSrc(out);
  };

  const handlePointerDown = (idx: number, e: PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragIdx(idx);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (dragIdx === null || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    setCorners((prev) => prev.map((p, i) => (i === dragIdx ? { x, y } : p)));
  };

  const handlePointerUp = () => {
    if (dragIdx !== null) {
      setCorners((prev) => orderCorners(prev));
      setDragIdx(null);
    }
  };

  const applyCrop = async () => {
    setBusy(true);
    try {
      const base = autoAdjust ? autoLevels(workSrc) : cloneCanvas(workSrc);
      const warped = await warpPerspective(base, orderCorners(corners));
      const finalCanvas = autoAdjust ? autoLevels(warped) : warped;
      onConfirm(finalCanvas);
    } catch {
      const fallback = autoAdjust ? autoLevels(workSrc) : cloneCanvas(workSrc);
      onConfirm(fallback);
    } finally {
      setBusy(false);
    }
  };

  const skipPerspective = () => {
    const out = autoAdjust ? autoLevels(workSrc) : cloneCanvas(workSrc);
    onConfirm(out);
  };

  const polyPoints = corners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div className="cropper-panel">
      <div className="cropper-header">
        <h2>写真の傾き補正（台形補正）・明るさ自動調整</h2>
        <p className="sub-note">書類の四隅にオレンジの丸を合わせてください（指でドラッグできます）</p>
      </div>

      <div className="cropper-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={rotate90}>
          <RotateCw size={18} />
          90°回転
        </button>
        <button
          type="button"
          className={`btn btn-sm ${autoAdjust ? 'btn-active-toggle' : 'btn-secondary'}`}
          onClick={() => setAutoAdjust((v) => !v)}
        >
          <Sparkles size={18} />
          明るさ・コントラスト自動調整: {autoAdjust ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            setCorners([
              { x: 0.02, y: 0.02 },
              { x: 0.98, y: 0.02 },
              { x: 0.98, y: 0.98 },
              { x: 0.02, y: 0.98 },
            ])
          }
        >
          <Undo2 size={18} />
          四隅を全体に戻す
        </button>
      </div>

      <div className="cropper-stage-outer">
        <div
          ref={wrapRef}
          className="cropper-stage"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={previewRef} className="cropper-canvas" />
          <svg className="cropper-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points={polyPoints} className="cropper-poly" />
          </svg>
          {corners.map((p, i) => (
            <button
              key={i}
              type="button"
              className="cropper-handle"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onPointerDown={(e) => handlePointerDown(i, e)}
              aria-label={`四隅ハンドル ${i + 1}`}
            >
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cropper-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          やり直す
        </button>
        <button type="button" className="btn btn-secondary" onClick={skipPerspective} disabled={busy}>
          そのまま使う
        </button>
        <button type="button" className="btn btn-primary" onClick={applyCrop} disabled={busy}>
          <Check size={20} />
          {busy ? '補正しています…' : '台形補正して次へ'}
        </button>
      </div>
    </div>
  );
}
