import mongoose from 'mongoose';
import { createApp } from './app';
import { config } from './config';

await mongoose.connect(config.mongoUri);
await mongoose.connection.syncIndexes();

const app = createApp({
  uploadDir: config.uploadDir,
  sessionSecret: config.sessionSecret,
  devLogin: config.devLogin,
  secureCookies: config.isProduction,
});

app.listen(config.port, () => {
  console.log(`NoCap API on http://localhost:${config.port} (db: ${mongoose.connection.name})`);
});
