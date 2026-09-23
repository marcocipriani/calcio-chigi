import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/brand/logos", { recursive: true });
await mkdir("public/brand/icons", { recursive: true });

// Sorgente approvato: nessun ridisegno, sharpening o ingrandimento del bitmap.
const source = sharp("assets/brand/source/circolo-chigi-white.png");
const metadata = await source.metadata();
assert.equal(metadata.width, 780);
assert.equal(metadata.height, 922);

// Bounding box dei pixel non trasparenti, separando la scritta superiore.
const full = await source.clone()
  .extract({ left: 55, top: 72, width: 668, height: 797 }).png().toBuffer();
const mark = await source.clone()
  .extract({ left: 55, top: 216, width: 668, height: 653 }).png().toBuffer();
const { data, info } = await sharp(full).raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < info.width * 128 * 4; i += 4) {
  if (data[i + 3] === 0) continue;
  data[i] = 15;
  data[i + 1] = 23;
  data[i + 2] = 42;
}
const light = await sharp(data, { raw: info }).png().toBuffer();
await sharp(full).webp({ lossless: true }).toFile("public/brand/logos/logo-circolo-chigi.webp");
await sharp(light).webp({ lossless: true }).toFile("public/brand/logos/logo-circolo-chigi-light.webp");
await sharp(mark).webp({ lossless: true }).toFile("public/brand/logos/logo-circolo-chigi-mark.webp");

async function icon(size, artworkSize, background) {
  const artwork = await sharp(mark).resize(artworkSize).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: artwork, gravity: "centre" }]).png().toBuffer();
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
for (const size of [192, 512]) {
  await writeFile(`public/brand/icons/icon-${size}x${size}.png`,
    await icon(size, Math.floor(size * 0.98), transparent));
}
await writeFile("public/teams/chigi.png", await icon(256, 250, transparent));
await writeFile("public/apple-touch-icon.png", await icon(180, 176, "#ffffff"));

// Il logo è centrato sul suo ingombro circolare per ingrandirlo senza tagliare
// il nastro. Tutti i pixel restano nel cerchio sicuro di raggio 40%.
const maskableArtwork = await sharp(mark).resize(337).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: "#ffffff" } })
  .composite([{ input: maskableArtwork, left: 87, top: 84 }])
  .removeAlpha().png().toFile("public/brand/icons/icon-maskable-512x512.png");

// ICO standard con PNG incorporati, senza introdurre un encoder aggiuntivo.
const sizes = [16, 32, 48];
const frames = [];
for (const size of sizes) frames.push(await icon(size, size, transparent));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
await writeFile("public/favicon.ico", Buffer.concat([directory, ...frames]));

// Dimensioni CSS e DPR: iPhone e iPad, entrambe le orientazioni e i temi di sistema.
// Per nuovi formati basta aggiungere una riga e rigenerare gli asset.
const screens = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3],
  [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [393, 852, 3], [402, 874, 3],
  [420, 912, 3], [428, 926, 3], [430, 932, 3], [440, 956, 3],
  [744, 1133, 2], [768, 1024, 2], [810, 1080, 2],
  [820, 1180, 2], [834, 1112, 2], [834, 1194, 2],
  [834, 1210, 2], [1024, 1366, 2], [1032, 1376, 2],
];
const startupImages = [];
await mkdir("public/brand/splash", { recursive: true });
for (const [width, height, scale] of screens) {
  for (const orientation of ["portrait", "landscape"]) {
    for (const theme of ["light", "dark"]) {
      const canvasWidth = (orientation === "portrait" ? width : height) * scale;
      const canvasHeight = (orientation === "portrait" ? height : width) * scale;
      const url = `/brand/splash/${canvasWidth}x${canvasHeight}-${theme}.png`;
      const artwork = await sharp(theme === "light" ? light : full)
        .resize((width >= 744 ? 240 : 176) * scale, undefined, { withoutEnlargement: true })
        .png().toBuffer();
      await sharp({ create: {
        width: canvasWidth, height: canvasHeight, channels: 3,
        background: theme === "light" ? "#ffffff" : "#020617",
      } }).composite([{ input: artwork, gravity: "centre" }])
        .removeAlpha().png({ compressionLevel: 9 }).toFile(`public${url}`);
      startupImages.push({
        url,
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation}) and (prefers-color-scheme: ${theme})`,
      });
    }
  }
}
await writeFile("src/lib/apple-startup-images.json", `${JSON.stringify(startupImages, null, 2)}\n`);
await copyFile("public/manifest.json", "public/site.webmanifest");
console.log(`Asset lossless generati; ${startupImages.length} splash Apple.`);
