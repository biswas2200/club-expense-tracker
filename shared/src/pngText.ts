/**
 * Reads and writes PNG tEXt chunks. Sample screenshots in the chat simulator carry their
 * payment details in one, so the mock parser can "read" them the way the AI will in v0.5.
 * Works on Uint8Array so the browser and Node share it.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const isPng = (png: Uint8Array) => SIGNATURE.every((b, i) => png[i] === b);

/** tEXt is Latin-1 only, so anything outside ASCII is stored as a \uXXXX escape. */
const escapeText = (text: string) =>
  text.replace(/[\\\u007f-￿]/g, (c) =>
    c === '\\' ? '\\\\' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
const unescapeText = (text: string) =>
  text.replace(/\\(\\|u([0-9a-f]{4}))/g, (_, all: string, hex?: string) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : all,
  );

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** Returns a copy of the PNG with a tEXt chunk inserted right after the IHDR chunk. */
export function addPngText(
  png: Uint8Array,
  keyword: string,
  text: string,
): Uint8Array<ArrayBuffer> {
  if (!isPng(png) || png.length < 33) throw new Error('This file is not a PNG');
  const body = latin1(`tEXt${keyword}\0${escapeText(text)}`);
  const chunk = new Uint8Array(body.length + 8);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length - 4);
  chunk.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));

  const afterHeader = 8 + 25; // signature + IHDR (length, type, 13 data bytes, CRC)
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, afterHeader), 0);
  out.set(chunk, afterHeader);
  out.set(png.subarray(afterHeader), afterHeader + chunk.length);
  return out;
}

/** The text stored under `keyword`, or undefined if the file has none or is damaged. */
export function readPngText(png: Uint8Array, keyword: string): string | undefined {
  if (!isPng(png)) return undefined;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at + 12 <= png.length;) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > png.length) return undefined;
    const body = png.subarray(at + 4, at + 8 + length);
    const type = String.fromCharCode(...body.subarray(0, 4));
    if (type === 'IEND') return undefined;
    if (type === 'tEXt' && view.getUint32(at + 8 + length) === crc32(body)) {
      const data = String.fromCharCode(...body.subarray(4));
      const split = data.indexOf('\0');
      if (data.slice(0, split) === keyword) return unescapeText(data.slice(split + 1));
    }
    at = end;
  }
  return undefined;
}
