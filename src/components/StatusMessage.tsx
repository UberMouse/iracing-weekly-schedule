/**
 * Shared loading/error placeholders used by both the app-level loading gate
 * (App.tsx, `fullScreen`) and in-page fetches (e.g. TrackUsage.tsx).
 */

function containerClasses(fullScreen: boolean, extra: string) {
  return `${fullScreen ? "min-h-screen" : "py-24"} flex flex-col items-center justify-center gap-4 ${extra}`;
}

export function LoadingState({ label, fullScreen = false }: { label: string; fullScreen?: boolean }) {
  return (
    <div className={containerClasses(fullScreen, "text-[var(--color-text-secondary)]")}>
      <div className="h-8 w-8 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin" />
      <p className="font-display uppercase tracking-widest text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  fullScreen = false,
}: {
  title: string;
  message: string | null;
  onRetry: () => void;
  fullScreen?: boolean;
}) {
  return (
    <div className={containerClasses(fullScreen, "px-6 text-center")}>
      <p className="font-display uppercase tracking-widest text-sm text-[var(--color-text-primary)]">{title}</p>
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
