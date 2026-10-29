import type { Template } from '../types';

export function collectBlobIds(t: Template): string[] {
  const ids = t.pages.map((p) => p.bgBlobId);
  if (t.sourceBlobId) ids.push(t.sourceBlobId);
  if (t.thumbBlobId) ids.push(t.thumbBlobId);
  return ids;
}
