export interface ProofFileType {
  ext: 'png' | 'jpg' | 'webp' | 'pdf';
  mime: string;
}

/**
 * Identifies a proof file from its first bytes. The browser-supplied MIME type can't be
 * trusted, and serving an HTML or SVG "image" back to members would open an XSS hole.
 */
export function detectProofType(bytes: Buffer): ProofFileType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return { ext: 'png', mime: 'image/png' };
  if (starts(0xff, 0xd8, 0xff)) return { ext: 'jpg', mime: 'image/jpeg' };
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-')
    return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}
