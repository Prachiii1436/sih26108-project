import { useEffect, useState } from 'react';

import { useSavedStandards } from '@/context/SavedStandardsContext';
import { listStandards } from '@/services/api';
import type { StandardSummary } from '@/types/api';

/**
 * Resolves titles for the standards staged in the comparison tray.
 *
 * The tray holds ids, but `/standards` has no id filter and the knowledge base
 * is small, so a single 100-row page is enough to resolve all 2-4 ids.
 */
export function useCompareTray(): { standards: StandardSummary[]; remove: (id: number) => void } {
  const { compareIds, toggleCompare } = useSavedStandards();
  const [resolved, setResolved] = useState<StandardSummary[]>([]);

  const key = compareIds.join(',');

  useEffect(() => {
    if (compareIds.length === 0) {
      setResolved([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const page = await listStandards({ page: 1, page_size: 100, sort: 'is_number_asc' });
        if (cancelled) return;

        const byId = new Map(page.items.map((item) => [item.id, item]));
        const ordered = compareIds.map((id) => byId.get(id) ?? placeholderFor(id));
        setResolved(ordered);
      } catch {
        // The tray must never break the page if this lookup fails.
        if (!cancelled) setResolved(compareIds.map((id) => placeholderFor(id)));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    standards: resolved,
    remove: (id: number) => toggleCompare(placeholderFor(id)),
  };
}

function placeholderFor(id: number): StandardSummary {
  return {
    id,
    is_number: `#${id}`,
    title: 'Standard record',
    sector: '--',
    category: '--',
    status: 'Unknown',
    is_demonstration: true,
  };
}
