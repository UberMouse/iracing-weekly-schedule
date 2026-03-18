import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import ExportImport from "./ExportImport";

export default function Layout() {
  const location = useLocation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 sm:px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition-all ${
      isActive
        ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
    }`;

  return (
    <div className="min-h-screen">
      {/* Signature top accent line */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent" />
      <nav className="sticky top-0 z-40 bg-[var(--color-surface)]/80 backdrop-blur-xl border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 sm:gap-8">
          <span className="font-display text-base sm:text-lg font-bold uppercase tracking-widest text-[var(--color-text-primary)] shrink-0">
            iRacing Planner
          </span>
          <div className="flex gap-1">
            <NavLink to="/series" className={linkClass}>Series</NavLink>
            <NavLink to="/schedule" className={linkClass}>Schedule</NavLink>
            <NavLink to="/about" className={linkClass}>About</NavLink>
          </div>
          <div className="ml-auto hidden sm:block">
            <ExportImport />
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
