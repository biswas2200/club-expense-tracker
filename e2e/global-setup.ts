import { execSync } from 'node:child_process';

/** Resets the e2e database to the demo seed before every browser test run. */
export default function globalSetup() {
  execSync('npm run seed -w server', {
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://localhost:27017/nocap_e2e',
      UPLOAD_DIR: '../.e2e-uploads',
    },
  });
}
