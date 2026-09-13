/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { buildTrackUsageFile } from "./scripts/track-usage";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = resolve(__dirname, "public/seasons");
const TRACK_CATEGORIES_FILE = resolve(__dirname, "data/track-categories.json");

// Unique per build: short git SHA + timestamp. Drives both the stale-cache
// reload check and the ?v= cache-bust on the mutable current-season.json fetch.
const BUILD_VERSION =
  execSync("git rev-parse --short HEAD").toString().trim() + "-" + Date.now();

function versionCheckPlugin(): Plugin {
  const buildVersion = BUILD_VERSION;
  let basePath = "/";

  return {
    name: "version-check",
    configResolved(config) {
      basePath = config.base;
    },
    transformIndexHtml(html) {
      html = html.replace("<html ", `<html data-version="${buildVersion}" `);

      const script = `
    <script>
      (function () {
        var current = document.documentElement.getAttribute("data-version");
        if (!current) return;
        fetch("${basePath}version.json?t=" + Date.now(), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !data.version) return;
            if (data.version !== current) {
              var url = new URL(location.href);
              url.searchParams.set("_v", Date.now().toString());
              location.replace(url.toString());
            } else {
              var url = new URL(location.href);
              if (url.searchParams.has("_v")) {
                url.searchParams.delete("_v");
                history.replaceState(null, "", url.toString());
              }
            }
          })
          .catch(function () {});
      })();
    </script>`;

      return html.replace("</head>", script + "\n  </head>");
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: buildVersion }),
      });
    },
  };
}

/**
 * Generates `track-usage.json` from committed files only (season archives +
 * `data/track-categories.json`) — never itself committed. Mirrors
 * `versionCheckPlugin`'s `generateBundle` for the production build, plus a
 * `configureServer` middleware so `npm run dev` serves the same file live
 * (recomputed per request, so catalogue/archive edits show up on refresh).
 */
function trackUsagePlugin(): Plugin {
  let basePath = "/";

  return {
    name: "track-usage",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      const usage = buildTrackUsageFile(SEASONS_DIR, TRACK_CATEGORIES_FILE);
      this.emitFile({
        type: "asset",
        fileName: "track-usage.json",
        source: JSON.stringify(usage),
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== `${basePath}track-usage.json`) return next();
        const usage = buildTrackUsageFile(SEASONS_DIR, TRACK_CATEGORIES_FILE);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(usage));
      });
    },
  };
}

export default defineConfig({
  base: "/iracing-weekly-schedule/",
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [versionCheckPlugin(), trackUsagePlugin(), react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
