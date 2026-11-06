// Vercel entrypoint: the whole app (API + built frontend) is one handler.
// DEPLOY PREP ONLY - not verified against the platform until a real deploy.
// server.js suppresses its local listener when process.env.VERCEL is set.
export { default } from '../server/server.js';
