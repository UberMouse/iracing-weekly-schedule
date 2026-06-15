import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import SeriesBrowser from "./components/SeriesBrowser";
import ScheduleBuilder from "./components/ScheduleBuilder";
import About from "./components/About";
import { useAppStore } from "./store/useAppStore";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-[var(--color-text-secondary)]">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin" />
      <p className="font-display uppercase tracking-widest text-sm">Loading season…</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display uppercase tracking-widest text-sm text-[var(--color-text-primary)]">
        Couldn't load season data
      </p>
      {message && <p className="text-xs text-[var(--color-text-secondary)] font-mono">{message}</p>}
      <button
        onClick={onRetry}
        className="text-xs px-4 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors font-display uppercase tracking-wider"
      >
        Retry
      </button>
    </div>
  );
}

export default function App() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const loadSeasons = useAppStore((s) => s.loadSeasons);

  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);

  if (status === "error") return <ErrorScreen message={error} onRetry={() => void loadSeasons()} />;
  if (status !== "ready") return <LoadingScreen />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/series" element={<SeriesBrowser />} />
          <Route path="/schedule" element={<ScheduleBuilder />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/series" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
