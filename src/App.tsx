import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import SeriesBrowser from "./components/SeriesBrowser";
import ScheduleBuilder from "./components/ScheduleBuilder";
import TrackUsage from "./components/TrackUsage";
import About from "./components/About";
import { LoadingState, ErrorState } from "./components/StatusMessage";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const loadSeasons = useAppStore((s) => s.loadSeasons);

  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);

  if (status === "error") {
    return (
      <ErrorState
        title="Couldn't load season data"
        message={error}
        onRetry={() => void loadSeasons()}
        fullScreen
      />
    );
  }
  if (status !== "ready") return <LoadingState label="Loading season…" fullScreen />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/series" element={<SeriesBrowser />} />
          <Route path="/schedule" element={<ScheduleBuilder />} />
          <Route path="/tracks" element={<TrackUsage />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/series" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
