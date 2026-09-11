// ─── Signed OAuth state ───────────────────────────────────────
// The OAuth `state` parameter must be an opaque, tamper-proof value that maps
// back to the user who started the flow. Encoding the raw user id let anyone
// bind THEIR provider tokens onto a VICTIM's account. This signs it instead.
import crypto from 'node:crypto';

const SECRET = process.env.OAUTH_STATE_SECRET
  || crypto.createHash('sha256').update(process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev').digest('hex');
const MAX_AGE_MS = 10 * 60 * 1000;

function hmac(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function signState(userId, provider) {
  const nonce = crypto.randomBytes(8).toString('base64url');
  const payload = `${provider}.${userId}.${Date.now()}.${nonce}`;
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload)}`;
}

export function verifyState(state, provider) {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const idx = state.lastIndexOf('.');
  const payload = Buffer.from(state.slice(0, idx), 'base64url').toString();
  const sig = state.slice(idx + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [p, userId, ts] = payload.split('.');
  if (p !== provider || !userId) return null;
  if (Date.now() - Number(ts) > MAX_AGE_MS) return null;
  return userId;
}
