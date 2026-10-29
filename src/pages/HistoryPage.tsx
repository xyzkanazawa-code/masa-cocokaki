import { Download, FileText, Image as ImageIcon, Printer, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  download,
  exportImages,
  exportPdf,
  printImages,
  safeFileName,
  shareOrDownload,
} from '../lib/export';
import { fmtDate } from '../lib/id';
import type { OutputRecord } from '../types';

export function HistoryPage() {
  const { repos, outputs, refreshLocal } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reExportPdf = async (rec: OutputRecord, share: boolean) => {
    if (!repos) return;
    setBusyId(rec.id);
    setMsg(null);
    try {
      const pdf = await exportPdf(rec.templateSnapshot, rec.values, repos.blobs);
      const file = new File([pdf], `${safeFileName(rec.templateName)}.pdf`, {
        type: 'application/pdf',
      });
      if (share) {
        await shareOrDownload([file], rec.templateName);
      } else {
        download(file);
        setMsg(`「${rec.templateName}」のPDFを再出力しました`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const reExportImage = async (rec: OutputRecord, fmt: 'png' | 'jpeg', share: boolean) => {
    if (!repos) return;
    setBusyId(rec.id);
    setMsg(null);
    try {
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blobs = await exportImages(rec.templateSnapshot, rec.values, repos.blobs, mime);
      const ext = fmt === 'png' ? 'png' : 'jpg';
      const files = blobs.map(
        (b, i) =>
          new File(
            [b],
            `${safeFileName(rec.templateName)}${blobs.length > 1 ? `_${i + 1}` : ''}.${ext}`,
            { type: mime },
          ),
      );
      if (share) {
        await shareOrDownload(files, rec.templateName);
      } else {
        files.forEach(download);
        setMsg(`「${rec.templateName}」の画像（${fmt.toUpperCase()}）を再出力しました`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const rePrint = async (rec: OutputRecord) => {
    if (!repos) return;
    setBusyId(rec.id);
    try {
      const blobs = await exportImages(
        rec.templateSnapshot,
        rec.values,
        repos.blobs,
        'image/png',
      );
      await printImages(blobs);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="page-container">
      <div className="section-title-row">
        <h1>出力した完成版の一覧（履歴）</h1>
      </div>
      <p className="sub-note">
        過去に出力した精算書・日報の一覧です。あとからいつでもPDF・画像の再出力や共有、印刷ができます。
      </p>

      {msg && <p className="success-banner">{msg}</p>}

      {outputs.length === 0 ? (
        <div className="empty-state card">
          <p>まだ出力された完成版の履歴はありません。</p>
          <Link to="/" className="btn btn-primary">
            ホーム（テンプレート一覧）へ
          </Link>
        </div>
      ) : (
        <div className="history-grid">
          {outputs.map((rec) => {
            const busy = busyId === rec.id;
            return (
              <article key={rec.id} className="history-card card">
                {rec.thumbDataUrl && (
                  <img
                    src={rec.thumbDataUrl}
                    alt={rec.templateName}
                    className="history-thumb"
                  />
                )}
                <div className="history-body">
                  <h3>{rec.templateName}</h3>
                  <p className="template-meta">出力日時：{fmtDate(rec.createdAt)}</p>

                  <div className="history-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => reExportPdf(rec, false)}
                    >
                      <FileText size={17} />
                      PDF再出力
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => reExportPdf(rec, true)}
                    >
                      <Share2 size={17} />
                      PDF共有
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => reExportImage(rec, 'png', false)}
                    >
                      <ImageIcon size={17} />
                      PNG保存
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => reExportImage(rec, 'jpeg', false)}
                    >
                      <Download size={17} />
                      JPEG保存
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => rePrint(rec)}
                    >
                      <Printer size={17} />
                      印刷
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={busy}
                      onClick={async () => {
                        if (!repos) return;
                        if (!window.confirm('この出力履歴を削除しますか？')) return;
                        await repos.outputs.remove(rec.id);
                        await refreshLocal();
                      }}
                    >
                      <Trash2 size={17} />
                      削除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
