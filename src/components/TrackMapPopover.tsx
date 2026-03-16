import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { WeekSchedule } from "../types";

interface Props {
  week: WeekSchedule;
  children: React.ReactNode;
}

export default function TrackMapPopover({ week, children }: Props) {
  const [show, setShow] = useState(false);

  if (!week.trackMapLayers && !week.trackMapUrl) {
    return <>{children}</>;
  }

  const layers = week.trackMapLayers;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute bottom-full left-0 mb-2 z-50 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg p-3 shadow-xl shadow-black/40 pointer-events-none"
          >
            <div className="relative w-72 h-72">
              {layers ? (
                <>
                  {layers.inactive && (
                    <img src={layers.inactive} alt="" className="absolute inset-0 w-full h-full object-contain opacity-30" />
                  )}
                  {layers.active && (
                    <img src={layers.active} alt="" className="absolute inset-0 w-full h-full object-contain" />
                  )}
                  {layers.pitroad && (
                    <img src={layers.pitroad} alt="" className="absolute inset-0 w-full h-full object-contain opacity-60" />
                  )}
                  {layers.startFinish && (
                    <img src={layers.startFinish} alt="" className="absolute inset-0 w-full h-full object-contain" />
                  )}
                  {layers.turns && (
                    <img src={layers.turns} alt="" className="absolute inset-0 w-full h-full object-contain opacity-70" />
                  )}
                </>
              ) : (
                <img
                  src={week.trackMapUrl}
                  alt={`${week.trackName} track map`}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] text-center mt-1.5 font-mono">
              {week.trackName}
              {week.trackConfig ? ` — ${week.trackConfig}` : ""}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
