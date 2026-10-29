import { KeyRound, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';

export function TeamGate() {
  const { initialized, setupTeam, joinTeam } = useApp();
  const [memberCode, setMemberCode] = useState('1234');
  const [adminCode, setAdminCode] = useState('9999');
  const [code, setCode] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSetup = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (memberCode.trim().length < 4 || adminCode.trim().length < 4) {
      setErr('コードは4文字以上で設定してください');
      return;
    }
    if (memberCode.trim() === adminCode.trim()) {
      setErr('乗務員用と管理者用は別のコードにしてください');
      return;
    }
    setBusy(true);
    try {
      await setupTeam(memberCode.trim(), adminCode.trim());
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!code.trim()) {
      setErr('チームコードを入力してください');
      return;
    }
    setBusy(true);
    try {
      await joinTeam(code.trim(), asAdmin);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!initialized) {
    return (
      <main className="page-container narrow">
        <section className="card">
          <div className="card-header-icon">
            <ShieldCheck size={32} />
            <h1>ココカキ 初期設定</h1>
          </div>
          <p className="lead-text">
            テンプレートを乗務員みんなで共有するための<strong>チームコード（合言葉）</strong>を最初に決めてください。
          </p>
          <div className="info-box">
            <ul>
              <li>
                <strong>乗務員用コード</strong>：テンプレートを選んで精算書・日報を入力・出力できます。
              </li>
              <li>
                <strong>管理者用コード</strong>：テンプレートの登録・編集・きれい化・削除もできます。
              </li>
            </ul>
          </div>
          <form onSubmit={onSetup} className="stack-form">
            <label className="form-field">
              <span>乗務員用コード（4文字以上）</span>
              <input
                type="text"
                value={memberCode}
                onChange={(e) => setMemberCode(e.target.value)}
                placeholder="例: 1234"
                required
              />
            </label>
            <label className="form-field">
              <span>管理者用コード（4文字以上・乗務員用と別）</span>
              <input
                type="text"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="例: 9999"
                required
              />
            </label>
            {err && <p className="error-banner">{err}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? '設定しています…' : 'このコードでココカキを始める（管理者）'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-container narrow">
      <section className="card">
        <div className="card-header-icon">
          <KeyRound size={32} />
          <h1>チームコード入力</h1>
        </div>
        <p className="lead-text">
          会社のチームコード（合言葉）を入力すると、共有テンプレートを使って精算書・日報を入力できます。
        </p>
        <div className="mode-toggle" role="tablist">
          <button
            type="button"
            className={`mode-tab ${!asAdmin ? 'active' : ''}`}
            onClick={() => setAsAdmin(false)}
          >
            <UserCheck size={20} />
            乗務員として使う
          </button>
          <button
            type="button"
            className={`mode-tab ${asAdmin ? 'active' : ''}`}
            onClick={() => setAsAdmin(true)}
          >
            <ShieldCheck size={20} />
            管理者（登録・編集）
          </button>
        </div>
        <form onSubmit={onJoin} className="stack-form">
          <label className="form-field">
            <span>{asAdmin ? '管理者用コード' : '乗務員用コード'}</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="コードを入力"
              autoFocus
              required
            />
          </label>
          {err && <p className="error-banner">{err}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '確認中…' : '参加する'}
          </button>
        </form>
      </section>
    </main>
  );
}

export function TeamSettingsModal({ onClose }: { onClose: () => void }) {
  const { role, joinTeam, leaveTeam, repos } = useApp();
  const [switchCode, setSwitchCode] = useState('');
  const [newMember, setNewMember] = useState('');
  const [newAdmin, setNewAdmin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleSwitch = async (targetAdmin: boolean) => {
    setErr(null);
    setMsg(null);
    try {
      await joinTeam(switchCode.trim(), targetAdmin);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleChangeCodes = async (e: FormEvent) => {
    e.preventDefault();
    if (!repos) return;
    setErr(null);
    setMsg(null);
    if (newMember.trim().length < 4 || newAdmin.trim().length < 4) {
      setErr('コードは4文字以上で指定してください');
      return;
    }
    if (newMember.trim() === newAdmin.trim()) {
      setErr('乗務員用と管理者用は別のコードにしてください');
      return;
    }
    try {
      await repos.team.changeCodes(newMember.trim(), newAdmin.trim());
      setMsg('チームコードを変更しました');
      setNewMember('');
      setNewAdmin('');
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>モード切替・チーム設定</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            <X size={24} />
          </button>
        </div>

        <p className="status-line">
          現在のモード：
          <strong>{role === 'admin' ? '管理者モード（テンプレートの登録・編集が可能）' : '乗務員モード（入力・出力専用）'}</strong>
        </p>

        <div className="card-sub">
          <h3>{role === 'admin' ? '乗務員モードに切り替える' : '管理者モードに切り替える'}</h3>
          <div className="row-gap">
            <input
              type="text"
              value={switchCode}
              onChange={(e) => setSwitchCode(e.target.value)}
              placeholder={role === 'admin' ? '乗務員用コードを入力' : '管理者用コードを入力'}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSwitch(role !== 'admin')}
            >
              切替
            </button>
          </div>
        </div>

        {role === 'admin' && (
          <form onSubmit={handleChangeCodes} className="card-sub stack-form">
            <h3>チームコードの変更（管理者のみ）</h3>
            <label className="form-field">
              <span>新しい乗務員用コード</span>
              <input
                type="text"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="4文字以上"
              />
            </label>
            <label className="form-field">
              <span>新しい管理者用コード</span>
              <input
                type="text"
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                placeholder="4文字以上"
              />
            </label>
            <button type="submit" className="btn btn-secondary">
              コードを更新する
            </button>
          </form>
        )}

        {err && <p className="error-banner">{err}</p>}
        {msg && <p className="success-banner">{msg}</p>}

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={async () => {
              await leaveTeam();
              onClose();
            }}
          >
            ログアウト（コード入力画面へ戻る）
          </button>
        </div>
      </div>
    </div>
  );
}
