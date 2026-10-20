import { crc32, deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Draws a small receipt-like PNG (coloured header band, ruled lines). Used for seed data and
 * tests so no binary fixtures need to live in the repo.
 */
export function placeholderPng(accent: Rgb = [37, 99, 235], width = 240, height = 320): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // PNG filter type: none
    for (let x = 0; x < width; x++) {
      const ruled = y > 60 && (y - 60) % 24 < 2 && x > 20 && x < width - 20;
      const [r, g, b] = y < 40 ? accent : ruled ? [205, 205, 205] : [250, 250, 248];
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
