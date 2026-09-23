import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

// WebP può azzerare l'RGB invisibile: contano alpha e colore dei pixel visibili.
function visiblePixels(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) data.fill(0, i, i + 3);
  }
  return data;
}

test("le varianti lossless conservano scudo, nastro e trasparenza del sorgente", async () => {
  const source = sharp("assets/brand/source/circolo-chigi-white.png");
  const mark = await source.clone()
    .extract({ left: 55, top: 216, width: 668, height: 653 }).raw().toBuffer();
  const actual = await sharp("public/brand/logos/logo-circolo-chigi-mark.webp").raw().toBuffer();
  assert.ok(visiblePixels(mark).equals(visiblePixels(actual)),
    "Scudo e nastro devono conservare tutti i pixel visibili originali");

  const full = await source.clone()
    .extract({ left: 55, top: 72, width: 668, height: 797 }).raw().toBuffer();
  const dark = await sharp("public/brand/logos/logo-circolo-chigi.webp").raw().toBuffer();
  assert.ok(visiblePixels(full).equals(visiblePixels(dark)),
    "Il logo bianco deve essere un ritaglio lossless");

  const light = await sharp("public/brand/logos/logo-circolo-chigi-light.webp").raw().toBuffer();
  assert.equal(light.length, dark.length);
  let recolored = 0;
  for (let i = 0; i < full.length; i += 4) {
    assert.equal(light[i + 3], full[i + 3], "La trasparenza non deve cambiare");
    if (i < 668 * 128 * 4 && full[i + 3] > 0) {
      assert.deepEqual([...light.subarray(i, i + 3)], [15, 23, 42]);
      recolored++;
    } else if (full[i + 3] > 0) {
      assert.ok(light.subarray(i, i + 4).equals(full.subarray(i, i + 4)),
        "Solo la scritta superiore può cambiare colore");
    }
  }
  assert.ok(recolored > 0);
});

test("l'icona Android conserva tutto il nastro nell'area sicura circolare", async () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  const icon = manifest.icons.find(({ purpose }) => purpose === "maskable");
  assert.ok(icon, "Serve un'icona maskable dedicata");
  const { data, info } = await sharp(`public${icon.src.split("?")[0]}`)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
  let artworkPixels = 0;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      assert.equal(data[i + 3], 255, "Le icone installabili devono essere opache");
      if (!data.subarray(i, i + 3).equals(data.subarray(0, 3))) {
        assert.ok(Math.hypot(x + 0.5 - 256, y + 0.5 - 256) <= 204.8,
          `Pixel del logo fuori dall'area sicura: ${x},${y}`);
        artworkPixels++;
      }
    }
  }
  assert.ok(artworkPixels > 50_000, "Il logo non deve diventare vuoto o minuscolo");
});

test("gli splash Apple hanno immagini esistenti e dimensioni coerenti con i media query", async () => {
  const index = "src/lib/apple-startup-images.json";
  assert.ok(existsSync(index), "Mancano gli splash dedicati per iPhone e iPad");
  const images = JSON.parse(readFileSync(index, "utf8"));
  assert.ok(images.some(({ media }) => media.includes("device-width: 390px")));
  assert.ok(images.some(({ media }) => media.includes("device-width: 820px")));
  assert.equal(new Set(images.map(({ media }) => media)).size, images.length);
  for (const { url, media } of images) {
    const width = Number(media.match(/\(device-width: (\d+)px\)/)[1]);
    const height = Number(media.match(/\(device-height: (\d+)px\)/)[1]);
    const scale = Number(media.match(/device-pixel-ratio: (\d+)/)[1]);
    const landscape = media.includes("orientation: landscape");
    const metadata = await sharp(`public${url}`).metadata();
    assert.equal(metadata.width, (landscape ? height : width) * scale);
    assert.equal(metadata.height, (landscape ? width : height) * scale);
    assert.equal(metadata.hasAlpha, false);
    const otherTheme = media.includes("prefers-color-scheme: dark")
      ? media.replace("prefers-color-scheme: dark", "prefers-color-scheme: light")
      : media.replace("prefers-color-scheme: light", "prefers-color-scheme: dark");
    assert.ok(images.some((image) => image.media === otherTheme));
  }
});
