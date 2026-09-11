// Preloaded with `node --import ./instrument.js server.js` so Sentry can
// hook Express before it is imported (ESM needs the loader hook in place).
import './env.js';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || undefined,
  // Error capture only. Tracing is not needed for this project, and sampled
  // transactions carry the request URL + query string (user ids, search
  // terms) which beforeSend never sees — so keep it off.
  tracesSampleRate: 0,
  // Health data must never reach a third-party error tracker. Strip request
  // bodies, query strings, and cookies before anything leaves the process.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.query_string;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
  // Defensive: if tracing is ever re-enabled, transaction events get the same
  // request scrubbing, and span data loses any URL/query fields.
  beforeSendTransaction(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.query_string;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    for (const span of event.spans || []) {
      if (!span?.data) continue;
      delete span.data['url.query'];
      delete span.data['url.full'];
      delete span.data['http.query'];
      delete span.data['http.url'];
    }
    return event;
  },
});
