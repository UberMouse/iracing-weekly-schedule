/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function versionCheckPlugin(): Plugin {
  const buildVersion =
    execSync("git rev-parse --short HEAD").toString().trim() +
    "-" +
    Date.now();
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

export default defineConfig({
  base: "/iracing-weekly-schedule/",
  plugins: [versionCheckPlugin(), react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
