import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useToast } from '@/components/ui/Toast';
import { getSavedStandardIds, listSavedStandards, saveStandard, deleteSavedStandard } from '@/services/api';
import type { ApiError } from '@/services/api';
import type { StandardSummary } from '@/types/api';

interface SavedContextValue {
  /** Ids of every standard on the current officer's shortlist. */
  savedIds: Set<number>;
  isLoading: boolean;
  error: ApiError | null;
  isSaved: (standardId: number) => boolean;
  /** Idempotent toggle used by every "Save" / "Saved" button. */
  toggleSave: (
    standard: StandardSummary,
    context?: { queryId?: number | null; notes?: string | null },
  ) => Promise<boolean>;
  /** Ids currently staged in the comparison tray (session-only, in memory). */
  compareIds: number[];
  compareLimit: number;
  toggleCompare: (standard: StandardSummary) => void;
  clearCompare: () => void;
  isInCompare: (standardId: number) => boolean;
}

const SavedContext = createContext<SavedContextValue | null>(null);

/** Backend caps /compare at 4 standards. */
const COMPARE_LIMIT = 4;

export function SavedStandardsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const refresh = useCallback(async () => {
    try {
      const result = await getSavedStandardIds();
      setSavedIds(new Set(result.standard_ids));
      setError(null);
    } catch (caught) {
      // A shortlist read failure must never block analysis; log via state only.
      setError(caught as ApiError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isSaved = useCallback((standardId: number) => savedIds.has(standardId), [savedIds]);

  const toggleSave = useCallback<SavedContextValue['toggleSave']>(
    async (standard, context) => {
      if (savedIds.has(standard.id)) {
        try {
          // DELETE is keyed by shortlist row id, not standard id.
          const entries = await listSavedStandards({ page_size: 100 });
          const entry = entries.find((item) => item.standard_id === standard.id);
          if (entry) {
            await deleteSavedStandard(entry.id);
          }
          setSavedIds((current) => {
            const next = new Set(current);
            next.delete(standard.id);
            return next;
          });
          toast.success('Removed from shortlist', `${standard.is_number} — ${standard.title}`);
          return false;
        } catch (caught) {
          const apiError = caught as ApiError;
          toast.error('Could not remove standard', apiError.message);
          return true;
        }
      }

      try {
        await saveStandard({
          standard_id: standard.id,
          query_id: context?.queryId ?? null,
          notes: context?.notes ?? null,
        });
        setSavedIds((current) => new Set(current).add(standard.id));
        toast.success('Saved to shortlist', `${standard.is_number} — ${standard.title}`);
        return true;
      } catch (caught) {
        const apiError = caught as ApiError;
        toast.error('Could not save standard', apiError.message);
        return false;
      }
    },
    [savedIds, toast],
  );

  const toggleCompare = useCallback(
    (standard: StandardSummary) => {
      setCompareIds((current) => {
        if (current.includes(standard.id)) {
          const next = current.filter((id) => id !== standard.id);
          toast.info('Removed from comparison', `${standard.is_number} removed from the comparison tray.`);
          return next;
        }
        if (current.length >= COMPARE_LIMIT) {
          toast.error(
            'Comparison limit reached',
            `Compare up to ${COMPARE_LIMIT} standards at a time. Remove one to add ${standard.is_number}.`,
          );
          return current;
        }
        toast.success('Added to comparison', `${standard.is_number} — ${standard.title}`);
        return [...current, standard.id];
      });
    },
    [toast],
  );

  const clearCompare = useCallback(() => setCompareIds([]), []);
  const isInCompare = useCallback((id: number) => compareIds.includes(id), [compareIds]);

  const value = useMemo<SavedContextValue>(
    () => ({
      savedIds,
      isLoading,
      error,
      isSaved,
      toggleSave,
      compareIds,
      compareLimit: COMPARE_LIMIT,
      toggleCompare,
      clearCompare,
      isInCompare,
    }),
    [savedIds, isLoading, error, isSaved, toggleSave, compareIds, toggleCompare, clearCompare, isInCompare],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSavedStandards(): SavedContextValue {
  const context = useContext(SavedContext);
  if (!context) throw new Error('useSavedStandards must be used inside <SavedStandardsProvider>.');
  return context;
}
