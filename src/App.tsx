import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";

function SeriesBrowserPage() {
  return <div>Series Browser (coming soon)</div>;
}

function ScheduleBuilderPage() {
  return <div>Schedule Builder (coming soon)</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/series" element={<SeriesBrowserPage />} />
          <Route path="/schedule" element={<ScheduleBuilderPage />} />
          <Route path="*" element={<Navigate to="/series" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
