import { ArrowLeft, Camera, Check, FileUp, Image as ImageIcon, Lightbulb, Ruler } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PerspectiveCropper } from '../components/PerspectiveCropper';
import { useApp } from '../context/AppContext';
import { canvasToBlob, imageToCanvas, loadImage, makeThumb } from '../lib/image';
import { STANDARD_PAPER_SIZES } from '../lib/paperSize';
import { renderPdf } from '../lib/pdf';
import type { PageDef } from '../types';

export function RegisterPage() {
  const { repos, role } = useApp();
  const nav = useNavigate();
  const isAdmin = role === 'admin';

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

  // 用紙サイズ設定（写真登録用）
  const [paperSizeId, setPaperSizeId] = useState<string>('A4');
  const [customWidthMm, setCustomWidthMm] = useState<number>(210);
  const [customHeightMm, setCustomHeightMm] = useState<number>(297);

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

        let finalWidthMm: number;
        let finalHeightMm: number;
        if (paperSizeId === 'custom') {
          finalWidthMm = customWidthMm || 210;
          finalHeightMm = customHeightMm || 297;
        } else {
          const std = STANDARD_PAPER_SIZES.find((s) => s.id === paperSizeId);
          // 写真の向き（横長か縦長か）に合わせて用紙の向きを決定
          const isLandscape = croppedCanvas.width > croppedCanvas.height;
          const shortSide = std ? Math.min(std.widthMm, std.heightMm) : 210;
          const longSide = std ? Math.max(std.widthMm, std.heightMm) : 297;
          finalWidthMm = isLandscape ? longSide : shortSide;
          finalHeightMm = isLandscape ? shortSide : longSide;
        }

        const created = await repos.templates.create({
          name: trimmedName,
          kind: 'photo',
          pages: [
            {
              index: 0,
              width: croppedCanvas.width,
              height: croppedCanvas.height,
              bgBlobId,
              paperSizeName: paperSizeId,
              widthMm: finalWidthMm,
              heightMm: finalHeightMm,
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

          {/* 用紙サイズ選択・入力 */}
          <div className="card-sub stack-form">
            <div className="row-gap">
              <Ruler size={22} color="var(--navy)" />
              <h3 style={{ margin: 0 }}>用紙サイズの指定</h3>
            </div>
            <p className="sub-note">
              出力（PDF・印刷）時の用紙サイズを設定します。既製品サイズ（A4、A3など）から選ぶか、ない場合はミリ単位（mm）で指定できます。
            </p>

            <label className="form-field">
              <span>用紙サイズを選択</span>
              <select
                value={paperSizeId}
                onChange={(e) => {
                  const val = e.target.value;
                  setPaperSizeId(val);
                  if (val !== 'custom') {
                    const std = STANDARD_PAPER_SIZES.find((s) => s.id === val);
                    if (std) {
                      setCustomWidthMm(std.widthMm);
                      setCustomHeightMm(std.heightMm);
                    }
                  }
                }}
              >
                {(['A判', 'B判（JIS）', 'ビジネス・帳票・伝票', '封筒', '写真・カード', 'その他'] as const).map(
                  (cat) => (
                    <optgroup key={cat} label={`【${cat}】`}>
                      {STANDARD_PAPER_SIZES.filter((s) => s.category === cat).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </label>

            {paperSizeId === 'custom' && (
              <div className="row-gap wrap" style={{ marginTop: 4 }}>
                <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
                  <span>幅 (mm)</span>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value) || 0)}
                    placeholder="例: 210"
                  />
                </label>
                <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
                  <span>高さ (mm)</span>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(Number(e.target.value) || 0)}
                    placeholder="例: 297"
                  />
                </label>
              </div>
            )}
            <p className="sub-note" style={{ fontSize: 14 }}>
              ※縦横の向きは写真の縦横比（{croppedCanvas.width > croppedCanvas.height ? '横長' : '縦長'}）に合わせて自動設定されます。
            </p>
          </div>

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
              onClick={() => handleSaveTemplate(isAdmin ? 'cleanup' : 'home')}
            >
              <Check size={20} />
              {isAdmin
                ? '保存して「きれい化（写真補正 / 作り直し）」へ進む（おすすめ）'
                : '空白テンプレートとして登録してホームへ戻る'}
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={busy}
                onClick={() => handleSaveTemplate('edit')}
              >
                保存して「入力欄の配置」へ進む
              </button>
            )}
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
            {isAdmin ? (
              <>
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
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => handleSaveTemplate('home')}
              >
                <Check size={20} />
                空白テンプレートとして保存してホームへ戻る
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
