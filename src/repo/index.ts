import { LocalOutputRepository, LocalSessionRepository } from './localSessions';
import type { BlobStore, OutputRepository, SessionRepository, TeamService, TemplateRepository } from './types';

export interface Repos {
  blobs: BlobStore;
  templates: TemplateRepository;
  sessions: SessionRepository;
  outputs: OutputRepository;
  team: TeamService;
  mode: 'cloud' | 'local';
}

let repos: Repos | null = null;

/**
 * 保存先を組み立てる。
 * VITE_STORAGE=local のときは端末内だけで動く（テスト用）。通常は Firestore で共有。
 */
export async function getRepos(): Promise<Repos> {
  if (repos) return repos;
  const sessions = new LocalSessionRepository();
  const outputs = new LocalOutputRepository();
  if (import.meta.env.VITE_STORAGE === 'local') {
    const { LocalBlobStore, LocalTemplateRepository } = await import('./localTemplates');
    const { LocalTeamService } = await import('./localTeam');
    const blobs = new LocalBlobStore();
    repos = { blobs, templates: new LocalTemplateRepository(blobs), sessions, outputs, team: new LocalTeamService(), mode: 'local' };
  } else {
    const { FirestoreBlobStore, FirestoreTemplateRepository } = await import('./cloud');
    const { FirestoreTeamService } = await import('./cloudTeam');
    const blobs = new FirestoreBlobStore();
    repos = { blobs, templates: new FirestoreTemplateRepository(blobs), sessions, outputs, team: new FirestoreTeamService(), mode: 'cloud' };
  }
  return repos;
}
