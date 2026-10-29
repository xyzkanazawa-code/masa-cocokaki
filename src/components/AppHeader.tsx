import { FileText, History, Home, KeyRound, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TeamSettingsModal } from './TeamGate';

export function AppHeader() {
  const { role } = useApp();
  const [openRoleModal, setOpenRoleModal] = useState(false);

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand-link" aria-label="ココカキ ホームへ">
          <span className="brand-badge">バス精算・日報</span>
          <span className="brand-title">ココカキ</span>
        </Link>
        {role && (
          <button
            type="button"
            className={`role-chip ${role === 'admin' ? 'role-admin' : 'role-member'}`}
            onClick={() => setOpenRoleModal(true)}
          >
            {role === 'admin' ? <ShieldCheck size={18} /> : <User size={18} />}
            <span>{role === 'admin' ? '管理者モード' : '乗務員モード'}</span>
            <KeyRound size={15} />
          </button>
        )}
      </header>
      {openRoleModal && <TeamSettingsModal onClose={() => setOpenRoleModal(false)} />}
    </>
  );
}

export function BottomNav() {
  const loc = useLocation();
  const { sessions, outputs } = useApp();
  const draftCount = sessions.filter((s) => s.status === 'draft').length;

  // 入力画面やテンプレート編集画面では画面を広く使うため下部ナビを隠す
  if (
    loc.pathname.startsWith('/input/') ||
    loc.pathname.startsWith('/edit/') ||
    loc.pathname.startsWith('/register')
  ) {
    return null;
  }

  return (
    <nav className="bottom-nav" aria-label="メインメニュー">
      <Link to="/" className={`bottom-nav-item ${loc.pathname === '/' ? 'active' : ''}`}>
        <Home size={24} />
        <span>ホーム</span>
      </Link>
      <Link
        to="/drafts"
        className={`bottom-nav-item ${loc.pathname === '/drafts' ? 'active' : ''}`}
      >
        <div className="nav-icon-wrap">
          <FileText size={24} />
          {draftCount > 0 && <span className="nav-badge">{draftCount}</span>}
        </div>
        <span>入力途中</span>
      </Link>
      <Link
        to="/history"
        className={`bottom-nav-item ${loc.pathname.startsWith('/history') ? 'active' : ''}`}
      >
        <div className="nav-icon-wrap">
          <History size={24} />
          {outputs.length > 0 && <span className="nav-badge secondary">{outputs.length}</span>}
        </div>
        <span>出力・履歴</span>
      </Link>
    </nav>
  );
}
