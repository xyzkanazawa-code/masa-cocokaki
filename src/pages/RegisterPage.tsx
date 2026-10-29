import { ArrowLeft, Camera, Check, FileUp, Image as ImageIcon, Lightbulb } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PerspectiveCropper } from '../components/PerspectiveCropper';
import { useApp } from '../context/AppContext';
import { canvasToBlob, imageToCanvas, loadImage, makeThumb } from '../lib/image';
import { renderPdf } from '../lib/pdf';
import type { PageDef } from '../types';

export function RegisterPage() {
  const { repos } = useApp();
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'pdf' | 'photo' | null>(null);
  const [rawPhotoCanvas, setRawPhotoCanvas] = useState<HTMLCanvasElement | null>(null);
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '');

  const onSelectPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    setStatusMsg('PDFを読み込んでいます…');
    try {
      if (!name) setName(baseName(f.name) || '精算書');
      const pages = await renderPdf(f, 1600, (done, total) =>
        setStatusMsg(`PDFページを展開中 (${done}/${total})…`),
      );
      if (pages.length === 0) throw new Error('PDFのページが見つかりませんでした');
      setPdfFile(f);
      setPdfPageCount(pages.length);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(pages[0].blob));
      setKind('pdf');
      setRawPhotoCanvas(null);
      setCroppedCanvas(null);
    } catch (ex) {
      setErr((ex as Error).message || 'PDFの読み込みに失敗しました');
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  const onSelectPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    setStatusMsg('写真を読み込んでいます…');
    try {
      if (!name) setName(baseName(f.name) || '乗務日報');
      const img = await loadImage(f);
      const c = imageToCanvas(img, 2200);
      setKind('photo');
      setRawPhotoCanvas(c);
      setCroppedCanvas(null);
      setPdfFile(null);
    } catch (ex) {
      setErr((ex as Error).message || '写真の読み込みに失敗しました');
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  const handleSaveTemplate = async (nextDest: 'edit' | 'cleanup' | 'home') => {
    if (!repos) return;
    const trimmedName = name.trim() || '精算書テンプレート';
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'pdf' && pdfFile) {
        setStatusMsg('PDFテンプレートを保存しています…');
        const rendered = await renderPdf(pdfFile, 2000);
        const sourceBlobId = await repos.blobs.put(pdfFile);
        const pages: PageDef[] = [];
        for (let i = 0; i < rendered.length; i++) {
          const r = rendered[i];
          const bgBlobId = await repos.blobs.put(r.blob);
          pages.push({
            index: i,
            width: r.width,
            height: r.height,
            bgBlobId,
            pdfWidth: r.pdfWidth,
            pdfHeight: r.pdfHeight,
            textItems: r.textItems,
          });
        }
        const firstImg = await loadImage(rendered[0].blob);
        const thumbBlob = await makeThumb(imageToCanvas(firstImg, 600));
        const thumbBlobId = await repos.blobs.put(thumbBlob);

        const created = await repos.templates.create({
          name: trimmedName,
          kind: 'pdf',
          pages,
          sourceBlobId,
          sourceMime: 'application/pdf',
          thumbBlobId,
          fields: [],
          annotations: [],
        });
        nav(nextDest === 'home' ? '/' : `/edit/${created.id}`);
        return;
      }

      if (kind === 'photo' && croppedCanvas) {
        setStatusMsg('写真テンプレートを保存しています…');
        const bgBlob = await canvasToBlob(croppedCanvas, 'image/jpeg', 0.92);
        const thumbBlob = await makeThumb(croppedCanvas);
        const bgBlobId = await repos.blobs.put(bgBlob);
        const thumbBlobId = await repos.blobs.put(thumbBlob);
        const created = await repos.templates.create({
          name: trimmedName,
          kind: 'photo',
          pages: [
            {
              index: 0,
              width: croppedCanvas.width,
              height: croppedCanvas.height,
              bgBlobId,
            },
          ],
          sourceBlobId: bgBlobId,
          sourceMime: 'image/jpeg',
          thumbBlobId,
          fields: [],
          annotations: [],
        });
        if (nextDest === 'cleanup') {
          nav(`/edit/${created.id}?tab=cleanup`);
        } else if (nextDest === 'edit') {
          nav(`/edit/${created.id}`);
        } else {
          nav('/');
        }
      }
    } catch (ex) {
      setErr((ex as Error).message || 'テンプレートの保存に失敗しました');
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  return (
    <main className="page-container">
      <div className="top-back-row">
        <Link to="/" className="btn btn-secondary btn-sm">
          <ArrowLeft size={18} />
          ホームへ戻る
        </Link>
        <h1>新規テンプレート登録</h1>
      </div>

      {/* 撮影のコツ（仕様必須表示） */}
      <section className="tips-banner" aria-label="撮影のコツ">
        <Lightbulb size={24} className="tips-icon" />
        <div>
          <strong>写真でテンプレートを撮るときのコツ</strong>
          <p>明るい場所で、書類の真上から、スマホや手の影を入れずに撮るときれいに仕上がります。</p>
        </div>
      </section>

      {/* ステップ1: 名前とファイル選択 */}
      <section className="card stack-form">
        <label className="form-field">
          <span>テンプレート名（例：精算書、乗務日報）</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：乗務精算書、高速バス日報"
          />
        </label>

        <div className="upload-grid">
          <button
            type="button"
            className="upload-tile"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
          >
            <Camera size={34} />
            <strong>カメラで書類を撮影</strong>
            <span>スマホのカメラで直接撮る</span>
          </button>

          <button
            type="button"
            className="upload-tile"
            onClick={() => photoInputRef.current?.click()}
            disabled={busy}
          >
            <ImageIcon size={34} />
            <strong>写真を選ぶ</strong>
            <span>端末内の画像を選択</span>
          </button>

          <button
            type="button"
            className="upload-tile"
            onClick={() => pdfInputRef.current?.click()}
            disabled={busy}
          >
            <FileUp size={34} />
            <strong>PDFファイルを登録</strong>
            <span>既製品のPDF書類を選択</span>
          </button>
        </div>

        {/* 隠しファイル入力 */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onSelectPhoto}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onSelectPhoto}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={onSelectPdf}
        />
      </section>

      {statusMsg && <p className="info-banner">{statusMsg}</p>}
      {err && <p className="error-banner">{err}</p>}

      {/* 写真の台形補正＆明るさ・コントラスト自動調整 */}
      {kind === 'photo' && rawPhotoCanvas && !croppedCanvas && (
        <section className="card">
          <PerspectiveCropper
            source={rawPhotoCanvas}
            onConfirm={(res) => setCroppedCanvas(res)}
            onCancel={() => {
              setRawPhotoCanvas(null);
              setKind(null);
            }}
          />
        </section>
      )}

      {/* 写真補正完了後 → 保存アクション */}
      {kind === 'photo' && croppedCanvas && (
        <section className="card stack-form">
          <h2>写真の切り抜き・明るさ調整が完了しました</h2>
          <div className="preview-frame">
            <img
              src={croppedCanvas.toDataURL('image/jpeg', 0.85)}
              alt="補正後プレビュー"
              className="preview-img"
            />
          </div>
          <div className="action-stack">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => handleSaveTemplate('cleanup')}
            >
              <Check size={20} />
              保存して「きれい化（写真補正 / 作り直し）」へ進む（おすすめ）
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => handleSaveTemplate('edit')}
            >
              保存して「入力欄の配置」へ進む
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => setCroppedCanvas(null)}
            >
              台形補正をやり直す
            </button>
          </div>
        </section>
      )}

      {/* PDF選択後 → 保存アクション */}
      {kind === 'pdf' && pdfFile && (
        <section className="card stack-form">
          <h2>PDFを読み込みました（全{pdfPageCount}ページ）</h2>
          {pdfPreviewUrl && (
            <div className="preview-frame">
              <img src={pdfPreviewUrl} alt="PDF 1ページ目プレビュー" className="preview-img" />
            </div>
          )}
          <div className="action-stack">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => handleSaveTemplate('edit')}
            >
              <Check size={20} />
              テンプレートを保存して「入力欄の配置」へ進む
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => handleSaveTemplate('home')}
            >
              空白テンプレートとして保存してホームへ戻る
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
