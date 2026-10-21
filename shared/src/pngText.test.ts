import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { addPngText, readPngText } from './pngText';

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 1×1 PNG built with Node's own CRC, so the module's CRC is checked against it. */
function tinyPng() {
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk(
        'IDAT',
        Buffer.from([0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]),
      ),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

describe('PNG text chunks', () => {
  it('round-trips a text value under a keyword', () => {
    const png = addPngText(tinyPng(), 'nocap-payment', '{"amountPaise":120000}');
    expect(readPngText(png, 'nocap-payment')).toBe('{"amountPaise":120000}');
    expect(readPngText(png, 'other')).toBeUndefined();
  });

  it('writes a chunk with the CRC Node computes, right after the header', () => {
    const png = Buffer.from(addPngText(tinyPng(), 'k', 'v'));
    const at = 8 + 25; // signature + IHDR chunk
    expect(png.subarray(at + 4, at + 8).toString('latin1')).toBe('tEXt');
    const data = Buffer.from('k\0v', 'latin1');
    expect(png.readUInt32BE(at + 8 + data.length)).toBe(
      crc32(Buffer.concat([Buffer.from('tEXt'), data])),
    );
  });

  it('keeps text that is not Latin-1 readable', () => {
    const png = addPngText(tinyPng(), 'k', 'Paid to अनन्या ₹500');
    expect(readPngText(png, 'k')).toBe('Paid to अनन्या ₹500');
  });

  it('returns undefined for files that are not PNGs or are cut short', () => {
    expect(readPngText(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'k')).toBeUndefined();
    const png = addPngText(tinyPng(), 'k', 'value');
    expect(readPngText(png.subarray(0, 40), 'k')).toBeUndefined();
    expect(() => addPngText(new Uint8Array([1, 2, 3]), 'k', 'v')).toThrow(/not a PNG/);
  });

  it('ignores a chunk whose CRC does not match', () => {
    const png = addPngText(tinyPng(), 'k', 'value');
    const at = 8 + 25 + 8; // a byte inside the text chunk's data
    png[at] = png[at]! ^ 0xff;
    expect(readPngText(png, 'k')).toBeUndefined();
  });
});
