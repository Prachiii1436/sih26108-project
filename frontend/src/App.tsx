import { Suspense, lazy, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

import { AppFooter, AppHeader } from '@/components/layout/AppShell';
import { HelpModal } from '@/components/layout/HelpModal';
import { SavedStandardsProvider } from '@/context/SavedStandardsContext';
import { ToastProvider } from '@/components/ui/Toast';
import { LoadingState } from '@/components/ui/Panel';
import { CompareTray } from '@/components/standards/CompareTray';
import { useCompareTray } from '@/hooks/useCompareTray';

import { HomePage } from '@/pages/HomePage';

// Route-level code splitting: only the landing page is needed up front.
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })));
const ApplicabilityPage = lazy(() => import('@/pages/ApplicabilityPage').then((m) => ({ default: m.ApplicabilityPage })));
const NewQueryPage = lazy(() => import('@/pages/NewQueryPage').then((m) => ({ default: m.NewQueryPage })));
const StandardDetailPage = lazy(() => import('@/pages/StandardDetailPage').then((m) => ({ default: m.StandardDetailPage })));
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })));
const ExplorerPage = lazy(() => import('@/pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage })));
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const SavedPage = lazy(() => import('@/pages/SavedPage').then((m) => ({ default: m.SavedPage })));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const AboutPage = lazy(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = () => setHelpOpen(true);

  return (
    <ToastProvider>
      <SavedStandardsProvider>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <div className="flex min-h-screen flex-col bg-slate-50">
          <AppHeader onHelp={openHelp} />

          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            <Suspense fallback={<LoadingState label="Loading..." />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/applicability" element={<ApplicabilityPage />} />
                <Route path="/new-query" element={<NewQueryPage />} />
                <Route path="/analysis/:queryId" element={<AnalysisPage />} />
                <Route path="/standards/:standardId" element={<StandardDetailPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/explorer" element={<ExplorerPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>

          <AppFooter onHelp={openHelp} />
          <CompareTrayHost />
        </div>

        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </SavedStandardsProvider>
    </ToastProvider>
  );
}

/** Keeps the comparison tray available on every page. */
function CompareTrayHost() {
  const { standards, remove } = useCompareTray();
  return <CompareTray standards={standards} onRemove={remove} />;
}
