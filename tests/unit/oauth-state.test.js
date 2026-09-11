import { describe, it, expect, vi, afterEach } from 'vitest';
import { signState, verifyState } from '../../services/oauth-state.js';

const TEN_MINUTES = 10 * 60 * 1000;

afterEach(() => vi.restoreAllMocks());

describe('signed OAuth state', () => {
  it('round-trips the user id for the provider that minted it', () => {
    const state = signState('user-123', 'oura');
    expect(verifyState(state, 'oura')).toBe('user-123');
  });

  it('is opaque and unique: the raw user id is not readable and each call differs', () => {
    const a = signState('user-123', 'oura');
    const b = signState('user-123', 'oura');
    expect(a).not.toContain('user-123');
    expect(a).not.toBe(b);
  });

  it('rejects a tampered signature of the same length', () => {
    const state = signState('user-123', 'oura');
    const idx = state.lastIndexOf('.');
    const sig = state.slice(idx + 1);
    const flipped = sig.slice(0, -1) + (sig.at(-1) === 'A' ? 'B' : 'A');
    expect(verifyState(`${state.slice(0, idx + 1)}${flipped}`, 'oura')).toBeNull();
  });

  it('rejects a payload whose user id was swapped (account-binding attack)', () => {
    const state = signState('victim', 'oura');
    const idx = state.lastIndexOf('.');
    const payload = Buffer.from(state.slice(0, idx), 'base64url').toString();
    const forged = `${Buffer.from(payload.replace('victim', 'attacker')).toString('base64url')}${state.slice(idx)}`;
    expect(verifyState(forged, 'oura')).toBeNull();
  });

  it('rejects a state minted for a different provider', () => {
    const state = signState('user-123', 'oura');
    expect(verifyState(state, 'strava')).toBeNull();
  });

  it('rejects a state older than ten minutes', () => {
    const state = signState('user-123', 'oura');
    const issuedAt = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt + TEN_MINUTES + 1);
    expect(verifyState(state, 'oura')).toBeNull();
  });

  it('accepts a state that is still inside the window', () => {
    const state = signState('user-123', 'oura');
    const issuedAt = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt + TEN_MINUTES - 1000);
    expect(verifyState(state, 'oura')).toBe('user-123');
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of [null, undefined, 123, '', 'no-dot-here', 'a.b', '..', 'x.'.repeat(3)]) {
      expect(verifyState(bad, 'oura')).toBeNull();
    }
  });

  it('returns null (never throws) for a multi-byte signature that matches the expected string length', () => {
    // 43 chars like a real base64url SHA-256, but 86 bytes: a naive string-length
    // guard lets this reach timingSafeEqual, which throws on unequal buffers.
    const state = signState('user-123', 'oura');
    const payloadPart = state.slice(0, state.lastIndexOf('.') + 1);
    expect(() => verifyState(`${payloadPart}${'é'.repeat(43)}`, 'oura')).not.toThrow();
    expect(verifyState(`${payloadPart}${'é'.repeat(43)}`, 'oura')).toBeNull();
  });

  it('returns null (never throws) for a non-base64 payload', () => {
    expect(() => verifyState('not-base64!!.sig', 'oura')).not.toThrow();
    expect(verifyState('not-base64!!.sig', 'oura')).toBeNull();
  });
});
