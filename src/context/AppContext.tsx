import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getRepos, type Repos } from '../repo';
import type { OutputRecord, Role, Session, Template } from '../types';

interface AppState {
  repos: Repos | null;
  loading: boolean;
  initialized: boolean;
  role: Role | null;
  templates: Template[];
  sessions: Session[];
  outputs: OutputRecord[];
  error: string | null;
  refreshLocal: () => Promise<void>;
  setupTeam: (memberCode: string, adminCode: string) => Promise<void>;
  joinTeam: (code: string, asAdmin: boolean) => Promise<void>;
  leaveTeam: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repos | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [outputs, setOutputs] = useState<OutputRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    const r = await getRepos();
    const [s, o] = await Promise.all([r.sessions.list(), r.outputs.list()]);
    setSessions(s);
    setOutputs(o);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await getRepos();
        if (!active) return;
        setRepos(r);
        await refreshLocal();
        const st = await r.team.init();
        if (!active) return;
        setInitialized(st.initialized);
        setRole(st.role);
      } catch (e) {
        if (active) setError((e as Error).message || '初期化に失敗しました');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshLocal]);

  useEffect(() => {
    if (!repos || !role) return;
    const unsub = repos.templates.subscribe(
      (list) => setTemplates(list),
      (e) => setError(e.message),
    );
    return () => unsub();
  }, [repos, role]);

  const setupTeam = useCallback(
    async (memberCode: string, adminCode: string) => {
      if (!repos) return;
      await repos.team.setup(memberCode, adminCode);
      setInitialized(true);
      setRole('admin');
    },
    [repos],
  );

  const joinTeam = useCallback(
    async (code: string, asAdmin: boolean) => {
      if (!repos) return;
      const r = await repos.team.join(code, asAdmin);
      setRole(r);
      setInitialized(true);
    },
    [repos],
  );

  const leaveTeam = useCallback(async () => {
    if (!repos) return;
    await repos.team.leave();
    setRole(null);
  }, [repos]);

  return (
    <Ctx.Provider
      value={{
        repos,
        loading,
        initialized,
        role,
        templates,
        sessions,
        outputs,
        error,
        refreshLocal,
        setupTeam,
        joinTeam,
        leaveTeam,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider の外で useApp が呼ばれました');
  return v;
}
