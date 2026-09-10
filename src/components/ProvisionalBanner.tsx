import { useState } from "react";
import { useAppStore, useViewingSeasonIsProvisional } from "../store/useAppStore";

/**
 * Flags a season whose schedule was scraped from iRacing's preliminary PDF.
 *
 * iRacing publishes the next season's schedule as a PDF about a week before the
 * Data API switches over, which is what makes the season pickable early — but
 * details can still move before it opens, so say so.
 */
export default function ProvisionalBanner() {
  const isProvisional = useViewingSeasonIsProvisional();
  const seasonName = useAppStore((s) => {
    const id = s.viewingSeasonId;
    return s.availableSeasons.find((season) => season.id === id)?.name ?? "This season";
  });
  const [dismissed, setDismissed] = useState(false);

  if (!isProvisional || dismissed) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-2.5 sm:px-4"
    >
      <span aria-hidden="true" className="mt-0.5 text-[var(--color-accent)]">
        &#9888;
      </span>
      <p className="flex-1 text-sm text-[var(--color-text-secondary)]">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {seasonName} is preliminary.
        </span>{" "}
        Taken from iRacing&rsquo;s pre-season schedule PDF so you can plan ahead. Tracks and
        cars can still change, and it will be replaced by the official schedule once the
        season opens &mdash; your picks carry over.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss preliminary schedule notice"
        className="shrink-0 rounded px-1.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        &#10005;
      </button>
    </div>
  );
}
