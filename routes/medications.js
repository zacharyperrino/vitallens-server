// LOGGING ONLY. Never add drug interaction checking, dosage recommendations, or any clinical interpretation to this route — that would cross into medical device / clinical decision support territory.
//
// ─── Medication Logging Route ─────────────────────────────────
// POST  /api/medications      — add a medication
// GET   /api/medications      — list active medications
// PATCH /api/medications/:id  — update or deactivate a medication
// All routes guarded by requireSelf.

import { Router } from 'express';
import { requireSelf } from '../middleware/auth.js';
import { ingest } from '../services/eventIngestion.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// POST /api/medications
router.post('/medications', requireSelf('userId'), async (req, res) => {
    try {
        const { userId, name, dose, frequency, notes } = req.body;
        if (!name) return res.status(400).json({ error: 'name required.' });

        const { data, error } = await supabase
            .from('medication_log')
            .insert({
                user_id: userId,
                name,
                dose: dose || null,
                frequency: frequency || null,
                notes: notes || null,
                active: true,
                started_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;

        // Feed timing into health_events for correlation — name + timing ONLY,
        // never any interpretation. (Non-blocking.)
        try {
            await ingest.medication(userId, { name, started_at: data.started_at }, data.id);
        } catch (e) {
            console.warn('[Medications] Ingest failed:', e.message);
        }

        res.json({ added: true, medication: data });
    } catch (err) {
        console.error('[Medications] Add failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/medications?userId=
router.get('/medications', requireSelf('userId'), async (req, res) => {
    try {
        const { userId } = req.query;
        const { data, error } = await supabase
            .from('medication_log')
            .select('*')
            .eq('user_id', userId)
            .eq('active', true)
            .order('started_at', { ascending: false });

        if (error) throw error;
        res.json({ medications: data || [] });
    } catch (err) {
        console.error('[Medications] List failed:', err.message);
        sendError(res, err);
    }
});

// PATCH /api/medications/:id — update fields or set active:false to deactivate
router.patch('/medications/:id', requireSelf('userId'), async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, name, dose, frequency, notes, active } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (dose !== undefined) updates.dose = dose;
        if (frequency !== undefined) updates.frequency = frequency;
        if (notes !== undefined) updates.notes = notes;
        if (active !== undefined) updates.active = active;
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });

        const { data, error } = await supabase
            .from('medication_log')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId) // scope the write to the owner
            .select()
            .single();

        if (error || !data) return res.status(404).json({ error: 'Medication not found.' });
        res.json({ updated: true, medication: data });
    } catch (err) {
        console.error('[Medications] Update failed:', err.message);
        sendError(res, err);
    }
});

export default router;
