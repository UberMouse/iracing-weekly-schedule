import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import SeriesBrowser from "./components/SeriesBrowser";
import ScheduleBuilder from "./components/ScheduleBuilder";
import About from "./components/About";

export default function App() {
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
