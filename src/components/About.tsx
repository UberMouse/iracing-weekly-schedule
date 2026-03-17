export default function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wider text-[var(--color-text-primary)] mb-2">
          About iRacing Planner
        </h1>
        <p className="text-[var(--color-text-secondary)] leading-relaxed">
          iRacing Planner is a free tool that helps you browse the current
          iRacing season's official series and plan your racing week by week.
          Schedule data is fetched directly from the iRacing API at build time,
          so the site is always up to date with the latest season.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
          Features
        </h2>
        <ul className="space-y-3 text-[var(--color-text-secondary)] leading-relaxed">
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold shrink-0">Series Browser</span>
            <span>
              Filter and search all official series by category, license class,
              setup type, and more. Favorite the series you care about for quick
              access.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold shrink-0">Schedule Builder</span>
            <span>
              Plan your season across all 12 weeks. Pick series into each week to
              build a personal racing calendar, and see which tracks and cars are
              coming up.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold shrink-0">Export / Import</span>
            <span>
              Save your schedule and favorites as a file to back them up or share
              with friends. Import a saved file to restore your picks on any
              device.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold shrink-0">Season Credits</span>
            <span>
              Track how much content you'd need to purchase for your planned
              schedule, with owned-content detection based on participation data.
            </span>
          </li>
        </ul>
      </div>

      <div className="border-t border-[var(--color-border)] pt-6 text-[var(--color-text-secondary)] text-sm leading-relaxed">
        <p>
          This project is open source.{" "}
          <a
            href="https://github.com/UberMouse/iracing-weekly-schedule"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline"
          >
            View on GitHub
          </a>
        </p>
        <p className="mt-2">
          Not affiliated with or endorsed by iRacing.com Motorsport Simulations.
        </p>
      </div>
    </div>
  );
}
