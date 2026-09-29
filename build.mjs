import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all([
  cp("manifest.json", "dist/manifest.json"),
  cp("assets", "dist/assets", { recursive: true }),
  cp("src/popup/popup.html", "dist/popup/popup.html"),
  cp("src/popup/popup.css", "dist/popup/popup.css"),
  cp("src/options/options.html", "dist/options/options.html"),
  cp("src/options/options.css", "dist/options/options.css"),
  cp("src/dashboard/dashboard.html", "dist/dashboard/dashboard.html"),
  cp("src/dashboard/dashboard.css", "dist/dashboard/dashboard.css"),
  cp("src/offscreen/offscreen.html", "dist/offscreen/offscreen.html")
]);

for (const [entry, outfile, format] of [
  ["src/background.js", "dist/background.js", "esm"],
  ["src/content.js", "dist/content.js", "iife"],
  ["src/popup/popup.js", "dist/popup/popup.js", "iife"],
  ["src/options/options.js", "dist/options/options.js", "iife"],
  ["src/dashboard/dashboard.js", "dist/dashboard/dashboard.js", "iife"],
  ["src/offscreen/offscreen.js", "dist/offscreen/offscreen.js", "iife"]
]) {
  await build({
    entryPoints: [entry], outfile, bundle: true, format,
    platform: "browser", target: "chrome121", minify: true,
    sourcemap: true, legalComments: "none"
  });
}

await mkdir("dist/ort", { recursive: true });
for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await cp(`node_modules/onnxruntime-web/dist/${file}`, `dist/ort/${file}`);
}