import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Image as ImageIcon,
  Printer,
  Share2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { computeAll, missingRequired } from '../lib/calc';
import {
  download,
  exportImages,
  exportPdf,
  printImages,
  safeFileName,
  shareOrDownload,
} from '../lib/export';
import { renderPage } from '../lib/render';
import type { Session, Template } from '../types';

export function ExportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { repos, refreshLocal } = useApp();

  const [session, setSession] = useState<Session | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [thumbDataUrl, setThumbDataUrl] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!repos || !sessionId) return;
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const s = await repos.sessions.get(sessionId);
      if (!alive || !s) return;
      const t = await repos.templates.get(s.templateId);
      if (!alive || !t) return;
      setSession(s);
      setTemplate(t);

      const vals = computeAll(t.fields, s.values);
      for (let i = 0; i < t.pages.length; i++) {
        const bg = await repos.blobs.get(t.pages[i].bgBlobId);
        const c = await renderPage(t, i, bg, vals);
        if (i === 0) {
          // 履歴用の縮小サムネイルDataURL
          const tc = document.createElement('canvas');
          const scale = 280 / c.width;
          tc.width = 280;
          tc.height = Math.round(c.height * scale);
          tc.getContext('2d')!.drawImage(c, 0, 0, tc.width, tc.height);
          setThumbDataUrl(tc.toDataURL('image/jpeg', 0.78));
        }
        const blob: Blob = await new Promise((res) =>
          c.toBlob((b) => res(b!), 'image/png'),
        );
        urls.push(URL.createObjectURL(blob));
      }
      if (alive) setPreviewUrls(urls);
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [repos, sessionId]);

  if (!session || !template) {
    return (
      <main className="page-container">
        <p className="info-banner">完成版プレビューを作成しています…</p>
      </main>
    );
  }

  const computed = computeAll(template.fields, session.values);
  const missing = missingRequired(template.fields, computed);

  const recordOutput = async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!repos) return;
    await repos.outputs.add({
      sessionId: session.id,
      templateId: template.id,
      templateName: template.name,
      templateSnapshot: structuredClone(template),
      values: computed,
      format,
      thumbDataUrl,
    });
    await repos.sessions.markDone(session.id);
    await refreshLocal();
  };

  const handleDownloadPdf = async (share: boolean) => {
    if (!repos) return;
    setBusy(true);
    setNotice(null);
    try {
      const pdfBlob = await exportPdf(template, session.values, repos.blobs);
      const file = new File([pdfBlob], `${safeFileName(template.name)}.pdf`, {
        type: 'application/pdf',
      });
      await recordOutput('pdf');
      if (share) {
        const res = await shareOrDownload([file], template.name);
        setNotice(
          res === 'shared'
            ? 'PDFを共有しました（出力履歴にも保存しました）'
            : 'PDFを保存しました（出力履歴にも保存しました）',
        );
      } else {
        download(file);
        setNotice('完成版PDFを保存しました（元のテンプレートは空白のまま保たれています）');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadImages = async (fmt: 'png' | 'jpeg', share: boolean) => {
    if (!repos) return;
    setBusy(true);
    setNotice(null);
    try {
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blobs = await exportImages(template, session.values, repos.blobs, mime);
      const ext = fmt === 'png' ? 'png' : 'jpg';
      const files = blobs.map(
        (b, i) =>
          new File(
            [b],
            `${safeFileName(template.name)}${blobs.length > 1 ? `_${i + 1}` : ''}.${ext}`,
            { type: mime },
          ),
      );
      await recordOutput(fmt);
      if (share) {
        const res = await shareOrDownload(files, template.name);
        setNotice(
          res === 'shared'
            ? `画像（${fmt.toUpperCase()}）を共有しました`
            : `画像（${fmt.toUpperCase()}）を保存しました`,
        );
      } else {
        files.forEach(download);
        setNotice(`完成版画像（${fmt.toUpperCase()}）を保存しました`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!repos) return;
    setBusy(true);
    try {
      const blobs = await exportImages(template, session.values, repos.blobs, 'image/png');
      await recordOutput('png');
      await printImages(blobs);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-container">
      <div className="top-back-row">
        <Link to={`/input/${session.id}`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={18} />
          入力画面へ戻る
        </Link>
        <h1>完成版の出力・共有・印刷</h1>
      </div>

      {missing.length > 0 && (
        <div className="caution-banner">
          <AlertTriangle size={22} className="caution-icon" />
          <div>
            <strong>未入力の必須項目があります</strong>
            <p>{missing.map((m) => m.label).join('、')} がまだ入力されていません。</p>
          </div>
        </div>
      )}

      {notice && <p className="success-banner">{notice}</p>}

      <section className="card stack-form">
        <h2>出力・共有メニュー（テンプレートのコピーに重ねて出力します）</h2>
        <div className="export-button-grid">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => handleDownloadPdf(false)}
          >
            <FileText size={22} />
            PDFとして保存
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => handleDownloadPdf(true)}
          >
            <Share2 size={22} />
            PDFを共有（LINE・メール・クラウド等）
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => handleDownloadImages('png', false)}
          >
            <ImageIcon size={22} />
            画像（PNG）で保存
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => handleDownloadImages('jpeg', false)}
          >
            <Download size={22} />
            画像（JPEG）で保存
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => handleDownloadImages('png', true)}
          >
            <Share2 size={22} />
            画像を共有（LINE・メール等）
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={handlePrint}
          >
            <Printer size={22} />
            印刷する
          </button>
        </div>
      </section>

      <section className="card stack-form">
        <h2>完成版プレビュー</h2>
        <div className="preview-pages">
          {previewUrls.map((u, idx) => (
            <div key={idx} className="preview-frame">
              <img src={u} alt={`完成版 ${idx + 1}ページ`} className="preview-img" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
