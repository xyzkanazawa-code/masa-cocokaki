import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppHeader, BottomNav } from './components/AppHeader';
import { TeamGate } from './components/TeamGate';
import { AppProvider, useApp } from './context/AppContext';
import { ExportPage } from './pages/ExportPage';
import { HistoryPage } from './pages/HistoryPage';
import { DraftsPage, HomePage } from './pages/HomePage';
import { InputPage } from './pages/InputPage';
import { RegisterPage } from './pages/RegisterPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';

function AppRoutes() {
  const { loading, role, error } = useApp();

  if (loading) {
    return (
      <div className="app-shell">
        <AppHeader />
        <main className="page-container">
          <p className="info-banner">ココカキを起動しています…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader />
      {error && (
        <div className="page-container">
          <p className="error-banner">{error}</p>
        </div>
      )}
      {!role ? (
        <TeamGate />
      ) : (
        <>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/drafts" element={<DraftsPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/edit/:id" element={<TemplateEditorPage />} />
            <Route path="/input/:sessionId" element={<InputPage />} />
            <Route path="/export/:sessionId" element={<ExportPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
