import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import ExportImport from "./ExportImport";

export default function Layout() {
  const location = useLocation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition-all ${
      isActive
        ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
    }`;

  return (
    <div className="min-h-screen">
      {/* Signature top accent line */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
      <nav className="sticky top-0 z-40 bg-[var(--color-surface)]/80 backdrop-blur-xl border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-8">
          <span className="font-display text-lg font-bold uppercase tracking-widest text-[var(--color-text-primary)]">
            iRacing Planner
          </span>
          <div className="flex gap-1">
            <NavLink to="/series" className={linkClass}>Series</NavLink>
            <NavLink to="/schedule" className={linkClass}>Schedule</NavLink>
            <NavLink to="/about" className={linkClass}>About</NavLink>
          </div>
          <div className="ml-auto">
            <ExportImport />
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
