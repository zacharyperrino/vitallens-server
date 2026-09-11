// ─── Consent Records Route ────────────────────────────────────
// POST /api/consents         — record acceptance of one or more documents
// GET  /api/consents/status  — which required consents the user still owes
//
// The app-wide ownership guard already ensures any userId in the body/query
// matches the caller, so a user can only ever write/read their own consents.

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// Current required documents and their versions. Bumping a version here forces
// every user to re-consent before they can continue using sensitive features.
export const REQUIRED_CONSENTS = {
    terms_of_service: '2026-07-08',
    privacy_policy: '2026-07-08',
    health_data_processing: '2026-07-08',
};

// POST /api/consents  { userId, documents: [{ document, version }] }
router.post('/consents', async (req, res) => {
    try {
        const userId = req.user.id; // trust the token, not the body
        const docs = Array.isArray(req.body?.documents) ? req.body.documents : [];
        if (docs.length === 0) return res.status(400).json({ error: 'No documents provided.' });

        const rows = docs
            .filter(d => d && REQUIRED_CONSENTS[d.document])
            .map(d => ({
                user_id: userId,
                document: d.document,
                version: String(d.version || REQUIRED_CONSENTS[d.document]),
                accepted: true,
                user_agent: (req.headers['user-agent'] || '').slice(0, 300),
            }));
        if (rows.length === 0) return res.status(400).json({ error: 'No valid documents.' });

        // Idempotent: unique (user, document, version) index absorbs re-submits.
        const { error } = await supabase
            .from('user_consents')
            .upsert(rows, { onConflict: 'user_id,document,version', ignoreDuplicates: true });
        if (error) throw error;

        res.json({ recorded: rows.map(r => r.document) });
    } catch (err) {
        console.error('[Consents] record failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/consents/status
router.get('/consents/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase
            .from('user_consents')
            .select('document, version')
            .eq('user_id', userId);
        if (error) throw error;

        const accepted = new Set((data || []).map(r => `${r.document}@${r.version}`));
        const missing = Object.entries(REQUIRED_CONSENTS)
            .filter(([doc, ver]) => !accepted.has(`${doc}@${ver}`))
            .map(([doc]) => doc);

        res.json({ complete: missing.length === 0, missing, required: REQUIRED_CONSENTS });
    } catch (err) {
        console.error('[Consents] status failed:', err.message);
        sendError(res, err);
    }
});

export default router;
