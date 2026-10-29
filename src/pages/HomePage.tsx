import {
  Copy,
  Edit3,
  FilePlus2,
  FileSpreadsheet,
  PenSquare,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { fmtDate } from '../lib/id';
import { createSampleSettlementTemplate } from '../lib/sampleTemplate';
import type { Template } from '../types';

function TemplateCard({
  t,
  isAdmin,
  onStartBlank,
  onDuplicate,
  onDelete,
}: {
  t: Template;
  isAdmin: boolean;
  onStartBlank: (t: Template) => void;
  onDuplicate: (t: Template) => void;
  onDelete: (t: Template) => void;
}) {
  const thumbUrl = useBlobUrl(t.thumbBlobId ?? t.pages[0]?.bgBlobId);
  const kindLabel =
    t.kind === 'pdf' ? 'PDFテンプレート' : t.kind === 'rebuilt' ? '作り直し版（きれい化）' : '写真テンプレート';

  return (
    <article className="template-card">
      <div className="template-thumb-wrap" onClick={() => onStartBlank(t)}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={t.name} className="template-thumb" />
        ) : (
          <div className="template-thumb-placeholder">
            <FileSpreadsheet size={40} />
          </div>
        )}
        <span className={`kind-pill kind-${t.kind}`}>
          {t.variantLabel ?? kindLabel}
        </span>
      </div>

      <div className="template-card-body">
        <h3 className="template-title">{t.name}</h3>
        <p className="template-meta">
          入力欄 {t.fields.length}個 ・ {t.pages.length}ページ
          {t.pages[0]?.widthMm && t.pages[0]?.heightMm
            ? ` ・ ${t.pages[0].paperSizeName && t.pages[0].paperSizeName !== 'custom' ? t.pages[0].paperSizeName : `${Math.round(t.pages[0].widthMm)}×${Math.round(t.pages[0].heightMm)}mm`}`
            : ''}
          {' '}・ 更新 {fmtDate(t.updatedAt)}
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => onStartBlank(t)}
        >
          <PenSquare size={20} />
          空白から新しく入力する
        </button>

        {isAdmin && (
          <div className="template-admin-bar">
            <Link to={`/edit/${t.id}`} className="btn btn-secondary btn-sm">
              <Edit3 size={17} />
              入力欄・文字修正・きれい化
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onDuplicate(t)}
              title="テンプレートを複製"
            >
              <Copy size={17} />
              複製
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => onDelete(t)}
              title="テンプレートを削除"
            >
              <Trash2 size={17} />
              削除
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function HomePage() {
  const { repos, role, templates, sessions, refreshLocal } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const isAdmin = role === 'admin';
  const drafts = sessions.filter((s) => s.status === 'draft');

  // 【最重要ルール3】テンプレート一覧から選んだときは、必ず新しい空白のSessionを作成して入力開始
  const handleStartBlank = async (t: Template) => {
    if (!repos) return;
    const s = await repos.sessions.createBlank(t);
    await refreshLocal();
    nav(`/input/${s.id}`);
  };

  const handleDuplicate = async (t: Template) => {
    if (!repos) return;
    const newName = window.prompt('複製するテンプレートの名前を入力してください', `${t.name}（コピー）`);
    if (!newName?.trim()) return;
    await repos.templates.duplicate(t.id, newName.trim());
  };

  const handleDelete = async (t: Template) => {
    if (!repos) return;
    if (!window.confirm(`テンプレート「${t.name}」を削除しますか？`)) return;
    await repos.templates.remove(t.id);
  };

  const handleAddSample = async (withShadow: boolean) => {
    if (!repos) return;
    setBusy(true);
    try {
      await createSampleSettlementTemplate(repos.blobs, repos.templates, withShadow);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-container">
      {/* 新規テンプレート登録バー（管理者・乗務員ともに撮影・登録可能） */}
      <section className="hero-action-bar">
        <div>
          <h1 className="section-heading">テンプレート管理・入力</h1>
          <p className="sub-note">
            {isAdmin
              ? '登録したテンプレートは常に空白の状態で保管され、乗務員全員に共有されます。'
              : '写真やPDFを撮って新しいテンプレートを登録できます。'}
          </p>
        </div>
        <div className="hero-buttons">
          <Link to="/register" className="btn btn-primary">
            <Plus size={22} />
            写真・PDFから新規登録
          </Link>
        </div>
      </section>

      {/* 入力途中の自動保存データがあればすぐ再開できるセクション */}
      {drafts.length > 0 && (
        <section className="section-block">
          <div className="section-title-row">
            <h2>入力途中の書類（自動保存）</h2>
            <Link to="/drafts" className="text-link">
              すべて見る ({drafts.length}件)
            </Link>
          </div>
          <div className="draft-list">
            {drafts.slice(0, 3).map((d) => (
              <div key={d.id} className="draft-item">
                <div className="draft-info">
                  <strong>{d.templateName}</strong>
                  <span>保存日時: {fmtDate(d.updatedAt)}</span>
                </div>
                <div className="row-gap">
                  <Link to={`/input/${d.id}`} className="btn btn-secondary btn-sm">
                    続きから入力
                  </Link>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={async () => {
                      if (!repos) return;
                      await repos.sessions.remove(d.id);
                      await refreshLocal();
                    }}
                  >
                    破棄
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* テンプレート一覧 */}
      <section className="section-block">
        <div className="section-title-row">
          <h2>テンプレート一覧（タップで空白から入力開始）</h2>
        </div>

        {templates.length === 0 ? (
          <div className="empty-state card">
            <FilePlus2 size={48} />
            <h3>まだテンプレートが登録されていません</h3>
            <p>
              「写真・PDFから新規登録」から精算書・日報の写真を撮るかPDFを登録してください。
              {isAdmin && '下のボタンでサンプル精算書を追加してすぐ試すこともできます。'}
            </p>
            <div className="empty-actions">
              <Link to="/register" className="btn btn-primary">
                <Plus size={20} />
                写真・PDFから新規登録へ
              </Link>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => handleAddSample(false)}
                  >
                    <Sparkles size={20} />
                    {busy ? '作成中…' : 'サンプル「バス乗務精算書・日報」を追加'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => handleAddSample(true)}
                  >
                    <Sparkles size={20} />
                    {busy ? '作成中…' : 'きれい化テスト用の影付き写真サンプルを追加'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="template-grid">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  isAdmin={isAdmin}
                  onStartBlank={handleStartBlank}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            {isAdmin && (
              <div className="sample-helper-bar">
                <span>サンプル追加：</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => handleAddSample(false)}
                >
                  ＋標準の精算書サンプル
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => handleAddSample(true)}
                >
                  ＋影付き写真サンプル（きれい化テスト用）
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export function DraftsPage() {
  const { repos, sessions, refreshLocal } = useApp();
  const drafts = sessions.filter((s) => s.status === 'draft');

  return (
    <main className="page-container">
      <div className="section-title-row">
        <h1>入力途中の書類（自動保存）</h1>
      </div>
      <p className="sub-note">
        入力途中の内容は自動で端末に保存されます。アプリを閉じてもここから再開できます（元のテンプレートは空白のまま保たれます）。
      </p>
      {drafts.length === 0 ? (
        <div className="empty-state card">
          <p>現在、入力途中の書類はありません。</p>
          <Link to="/" className="btn btn-primary">
            ホーム（テンプレート一覧）へ戻る
          </Link>
        </div>
      ) : (
        <div className="draft-list">
          {drafts.map((d) => (
            <div key={d.id} className="draft-item">
              <div className="draft-info">
                <strong>{d.templateName}</strong>
                <span>最終保存: {fmtDate(d.updatedAt)}</span>
              </div>
              <div className="row-gap">
                <Link to={`/input/${d.id}`} className="btn btn-primary btn-sm">
                  続きから入力する
                </Link>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={async () => {
                    if (!repos) return;
                    if (!window.confirm('この入力途中データを破棄しますか？')) return;
                    await repos.sessions.remove(d.id);
                    await refreshLocal();
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
