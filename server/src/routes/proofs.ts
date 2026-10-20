import { Router } from 'express';
import { notFound } from '../lib/http';
import { requireAuth } from '../middleware/auth';

// Only names the server generated itself (UUID + known extension) are ever served.
const PROOF_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/;

export function proofsRouter(opts: { uploadDir: string }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/:fileName', (req, res, next) => {
    const { fileName } = req.params;
    if (!PROOF_NAME.test(fileName)) throw notFound('Proof');
    res.sendFile(
      fileName,
      {
        root: opts.uploadDir,
        dotfiles: 'deny',
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
          'Cache-Control': 'private, max-age=3600',
        },
      },
      (err) => {
        if (err) next((err as NodeJS.ErrnoException).code === 'ENOENT' ? notFound('Proof') : err);
      },
    );
  });

  return router;
}
