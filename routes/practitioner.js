// ─── Practitioner View Route ──────────────────────────────────
// Read-only access for consented practitioners (e.g. nutritionists)
// to a client's data. A client invites a practitioner; the
// practitioner accepts; only then can they read that client's data.
//
// SECURITY: /client-data verifies an ACTIVE practitioner_links row
// between practitioner and client before returning ANY data. All
// routes rely on requireAuth (applied globally in server.js) and
// additionally check req.user.id against the caller-claimed id.

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';
import { daysAgo } from '../utils/dates.js';

const router = Router();

// POST /api/practitioner/invite — client invites a practitioner by email
router.post('/practitioner/invite', async (req, res) => {
    try {
        const { clientId, practitionerEmail } = req.body;
        if (!clientId || !practitionerEmail) return res.status(400).json({ error: 'clientId and practitionerEmail required.' });

        // Only the authenticated client may invite on their own behalf.
        if (req.user?.id !== clientId) return res.status(403).json({ error: 'Forbidden.' });

        // Resolve the practitioner's user id from their email via a
        // security-definer RPC over auth.users (profiles has no email column).
        // The RPC is executable only by the service role, so this cannot be
        // used for email enumeration from the client.
        const { data: practitionerId, error: lookupErr } = await supabase
            .rpc('get_user_id_by_email', { p_email: practitionerEmail.toLowerCase().trim() });

        if (lookupErr || !practitionerId) {
            return res.status(404).json({ error: 'No practitioner account found for that email. Ask them to sign up first.' });
        }
        if (practitionerId === clientId) {
            return res.status(400).json({ error: 'You cannot invite yourself.' });
        }

        const { data, error } = await supabase
            .from('practitioner_links')
            .insert({
                practitioner_id: practitionerId,
                client_id: clientId,
                status: 'pending',
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ invited: true, link: data });
    } catch (err) {
        console.error('[Practitioner] Invite failed:', err.message);
        sendError(res, err);
    }
});

// POST /api/practitioner/accept — practitioner accepts the invite
router.post('/practitioner/accept', async (req, res) => {
    try {
        const { practitionerId, linkId } = req.body;
        if (!practitionerId || !linkId) return res.status(400).json({ error: 'practitionerId and linkId required.' });
        if (req.user?.id !== practitionerId) return res.status(403).json({ error: 'Forbidden.' });

        // Only accept a pending link that belongs to this practitioner.
        const { data, error } = await supabase
            .from('practitioner_links')
            .update({ status: 'active' })
            .eq('id', linkId)
            .eq('practitioner_id', practitionerId)
            .eq('status', 'pending')
            .select()
            .single();

        if (error || !data) return res.status(404).json({ error: 'No pending invite found for this practitioner.' });
        res.json({ accepted: true, link: data });
    } catch (err) {
        console.error('[Practitioner] Accept failed:', err.message);
        sendError(res, err);
    }
});

// POST /api/practitioner/revoke — either party may revoke consent
router.post('/practitioner/revoke', async (req, res) => {
    try {
        const { linkId } = req.body;
        if (!linkId) return res.status(400).json({ error: 'linkId required.' });
        const uid = req.user?.id;
        if (!uid) return res.status(401).json({ error: 'Unauthorized.' });

        // Revoke only if the caller is the client OR the practitioner on the link.
        const { data, error } = await supabase
            .from('practitioner_links')
            .update({ status: 'revoked' })
            .eq('id', linkId)
            .or(`client_id.eq.${uid},practitioner_id.eq.${uid}`)
            .select()
            .single();

        if (error || !data) return res.status(404).json({ error: 'No link found that you can revoke.' });
        res.json({ revoked: true, link: data });
    } catch (err) {
        console.error('[Practitioner] Revoke failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/practitioner/clients?practitionerId=
router.get('/practitioner/clients', async (req, res) => {
    try {
        const { practitionerId } = req.query;
        if (!practitionerId) return res.status(400).json({ error: 'practitionerId required.' });
        if (req.user?.id !== practitionerId) return res.status(403).json({ error: 'Forbidden.' });

        const { data, error } = await supabase
            .from('practitioner_links')
            .select('id, client_id, status, created_at')
            .eq('practitioner_id', practitionerId)
            .eq('status', 'active');

        if (error) throw error;

        const clientIds = (data || []).map(l => l.client_id);
        let profiles = [];
        if (clientIds.length) {
            const { data: profs } = await supabase.from('profiles').select('id, name').in('id', clientIds);
            profiles = profs || [];
        }
        const clients = (data || []).map(l => ({
            linkId: l.id,
            clientId: l.client_id,
            name: profiles.find(p => p.id === l.client_id)?.name || null,
            since: l.created_at,
        }));

        res.json({ clients });
    } catch (err) {
        console.error('[Practitioner] Clients failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/practitioner/client-data?practitionerId=&clientId=
// CRITICAL: verifies an ACTIVE link before returning ANY client data.
router.get('/practitioner/client-data', async (req, res) => {
    try {
        const { practitionerId, clientId } = req.query;
        if (!practitionerId || !clientId) return res.status(400).json({ error: 'practitionerId and clientId required.' });
        if (req.user?.id !== practitionerId) return res.status(403).json({ error: 'Forbidden.' });

        // ── Consent gate — verify an ACTIVE link exists ─────────
        const { data: link, error: linkErr } = await supabase
            .from('practitioner_links')
            .select('id, status')
            .eq('practitioner_id', practitionerId)
            .eq('client_id', clientId)
            .eq('status', 'active')
            .single();

        if (linkErr || !link) {
            return res.status(403).json({ error: 'No active consent link with this client.' });
        }

        // ── Only now do we read the client's data ───────────────
        const since = daysAgo(30).toISOString();
        const sinceDate = since.split('T')[0];

        const [meals, sleep, exercise, nutrition, insights] = await Promise.all([
            supabase.from('meals').select('name, calories, protein, carbs, fat, logged_at').eq('user_id', clientId).gte('logged_at', since).order('logged_at', { ascending: false }),
            supabase.from('sleep_log').select('hours, quality, date').eq('user_id', clientId).gte('date', sinceDate).order('date', { ascending: false }),
            supabase.from('exercise_log').select('type, name, duration, logged_at').eq('user_id', clientId).gte('logged_at', since).order('logged_at', { ascending: false }),
            supabase.from('daily_nutrition').select('date, calories, protein, carbs, fat, fiber').eq('user_id', clientId).gte('date', sinceDate).order('date', { ascending: false }),
            supabase.from('health_correlations').select('correlation_type, description, actionable, generated_at').eq('user_id', clientId).order('generated_at', { ascending: false }).limit(10),
        ]);

        res.json({
            clientId,
            window: '30d',
            meals: meals.data || [],
            sleep: sleep.data || [],
            exercise: exercise.data || [],
            nutrition: nutrition.data || [],
            insights: insights.data || [],
        });
    } catch (err) {
        console.error('[Practitioner] Client-data failed:', err.message);
        sendError(res, err);
    }
});

export default router;
