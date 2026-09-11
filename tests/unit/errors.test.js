import { describe, it, expect, vi, beforeEach } from 'vitest';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/node', () => ({ captureException }));

import { sendError } from '../../utils/errors.js';

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendError', () => {
  it('responds 500 with the error message by default and reports to Sentry', () => {
    const res = mockRes();
    const err = new Error('db exploded');
    sendError(res, err);

    expect(captureException).toHaveBeenCalledWith(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'db exploded' });
    expect(console.error).toHaveBeenCalledWith('[ERROR 500] db exploded');
  });

  it('honours an explicit status code', () => {
    const res = mockRes();
    sendError(res, new Error('nope'), 403);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'nope' });
  });

  it('falls back to a generic message when the error has none', () => {
    const res = mockRes();
    sendError(res, {});
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('still responds when Sentry itself throws', () => {
    captureException.mockImplementation(() => {
      throw new Error('telemetry down');
    });
    const res = mockRes();
    expect(() => sendError(res, new Error('real error'))).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'real error' });
  });
});
