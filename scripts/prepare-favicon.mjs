import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// Reuse the existing Rex artwork. Opaque padding keeps it legible on dark tabs.
async function icon(size) {
  const inset = Math.max(1, Math.round(size / 12));
  return sharp("public/brand/rex-mascote.png").trim()
    .resize(size - inset * 2, size - inset * 2, { fit: "contain", background: "#f1f1f1" })
    .flatten({ background: "#f1f1f1" })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: "#f1f1f1" })
    .png().toBuffer();
}

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(icon));
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((bytes, index) => {
  const start = 6 + 16 * index;
  directory[start] = sizes[index];
  directory[start + 1] = sizes[index];
  directory.writeUInt16LE(1, start + 4);
  directory.writeUInt16LE(32, start + 6);
  directory.writeUInt32LE(bytes.length, start + 8);
  directory.writeUInt32LE(offset, start + 12);
  offset += bytes.length;
});
await writeFile("public/favicon.ico", Buffer.concat([directory, ...images]));
await writeFile("public/brand/rex-favicon.png", await icon(96));
console.log("Rex favicon generated: PNG 96px and ICO 16/32/48px.");
