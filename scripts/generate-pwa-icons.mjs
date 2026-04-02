// Generates PNG PWA icons from the iobt-icon.svg source.
// Run once: node scripts/generate-pwa-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const svgPath = resolve(root, "public/images/iobt-icon.svg");
const svgData = readFileSync(svgPath, "utf-8");

const sizes = [192, 512];

mkdirSync(resolve(root, "public/icons"), { recursive: true });

for (const size of sizes) {
  const resvg = new Resvg(svgData, {
    fitTo: { mode: "width", value: size },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  const outPath = resolve(root, `public/icons/icon-${size}x${size}.png`);
  writeFileSync(outPath, pngBuffer);
  console.log(`Generated: public/icons/icon-${size}x${size}.png`);
}

// Also generate apple-touch-icon (180x180)
const resvgApple = new Resvg(svgData, {
  fitTo: { mode: "width", value: 180 },
});
const appleData = resvgApple.render();
writeFileSync(resolve(root, "public/icons/apple-touch-icon.png"), appleData.asPng());
console.log("Generated: public/icons/apple-touch-icon.png");

console.log("Done.");
