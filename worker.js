// ─── Standalone Worker Process ────────────────────────────────
// Runs the BullMQ workers OUTSIDE the API process so heavy AI jobs
// (correlation + weekly report) don't compete with request handling.
//
// Start with:  npm run worker
//
// This process does NOT start Express and does NOT listen on any port.

import dotenv from 'dotenv';
dotenv.config();

import { startWorkers } from './services/queue.js';

startWorkers();

console.log('[Worker] Standalone worker process started');
