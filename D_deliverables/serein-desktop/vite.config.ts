import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CORE_CODEMIRROR_PACKAGES = [
  "@codemirror/autocomplete",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
];

const MARKDOWN_TRANSFORM_PACKAGES = [
  "bail",
  "ccount",
  "character-entities",
  "comma-separated-tokens",
  "decode-named-character-reference",
  "devlop",
  "entities",
  "hast-",
  "markdown-table",
  "mdast-",
  "micromark",
  "parse-entities",
  "property-information",
  "remark-",
  "space-separated-tokens",
  "stringify-entities",
  "trough",
  "unified",
  "unist-",
  "vfile",
  "zwitch",
];

function includesNodePackage(id: string, packageName: string) {
  return id.includes(`/node_modules/${packageName}/`);
}

function includesNodePackagePrefix(id: string, packagePrefix: string) {
  return id.includes(`/node_modules/${packagePrefix}`);
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return undefined;

          if (
            includesNodePackage(id, "react")
            || includesNodePackage(id, "react-dom")
            || includesNodePackage(id, "scheduler")
          ) {
            return "vendor-react";
          }

          if (id.includes("/node_modules/@tauri-apps/")) return "vendor-tauri";

          if (
            includesNodePackage(id, "clsx")
            || includesNodePackage(id, "lucide-react")
            || includesNodePackage(id, "zustand")
          ) {
            return "vendor-ui";
          }

          if (CORE_CODEMIRROR_PACKAGES.some((packageName) => includesNodePackage(id, packageName))) {
            return "vendor-codemirror";
          }

          if (id.includes("/node_modules/@milkdown/")) return "vendor-milkdown";
          if (id.includes("/node_modules/prosemirror-")) return "vendor-prosemirror";

          if (MARKDOWN_TRANSFORM_PACKAGES.some((packageName) => includesNodePackagePrefix(id, packageName))) {
            return "vendor-markdown";
          }

          return undefined;
        },
      },
    },
  },
});
