import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

export function useBlobUrl(blobId: string | undefined): string | null {
  const { repos } = useApp();
  const [state, setState] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!repos || !blobId) return;
    let alive = true;
    let currentUrl: string | null = null;
    repos.blobs
      .get(blobId)
      .then((b) => {
        if (!alive) return;
        currentUrl = URL.createObjectURL(b);
        setState({ id: blobId, url: currentUrl });
      })
      .catch(() => {
        if (alive) setState(null);
      });
    return () => {
      alive = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [repos, blobId]);

  return blobId && state?.id === blobId ? state.url : null;
}
