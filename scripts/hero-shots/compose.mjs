// Stack an iOS status-bar strip (background sampled from each shot's top edge)
// above each raw capture, then downscale to the hero format: 762x1652 JPEG q88.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, "raw");
const DEST = "C:\\Users\\faisa\\vellu\\public";
const W = 1170, SB = 141, BODY = 2391; // device px: 390/47/797 @3x

const sbDark = await sharp(join(RAW, "sb-dark.png")).png().toBuffer();
const sbLight = await sharp(join(RAW, "sb-light.png")).png().toBuffer();

for (let i = 1; i <= 7; i++) {
  const raw = join(RAW, `shot-${i}.jpg`);
  const top = await sharp(raw).extract({ left: 0, top: 0, width: W, height: 8 }).stats();
  const [r, g, b] = top.channels.map(c => Math.round(c.mean));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const strip = await sharp({ create: { width: W, height: SB, channels: 3, background: { r, g, b } } })
    .composite([{ input: lum < 140 ? sbLight : sbDark, top: 0, left: 0 }])
    .jpeg({ quality: 98 }).toBuffer();

  await sharp({ create: { width: W, height: SB + BODY, channels: 3, background: "#ffffff" } })
    .composite([{ input: strip, top: 0, left: 0 }, { input: raw, top: SB, left: 0 }])
    .jpeg({ quality: 95 }).toBuffer()
    .then(buf => sharp(buf).resize(762, 1652, { fit: "fill" }).jpeg({ quality: 88, mozjpeg: true }).toFile(join(DEST, `hero-phone-${i}.jpg`)));
  console.log(`hero-phone-${i}.jpg written (top rgb ${r},${g},${b})`);
}
console.log("compose complete");
