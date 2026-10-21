import multer from 'multer';

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Keeps one proof file in memory so its bytes can be checked before anything is written. */
export function proofUpload(field = 'proof') {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROOF_MAX_BYTES, files: 1, fields: 20 },
  }).single(field);
}
