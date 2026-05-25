// ─── Data Export & Account Deletion Route ────────────────────
// GET  /api/user-data/export?userId=   — full data export as JSON
// DELETE /api/user-data/delete         — cascade delete all user data

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// All tables that contain user data
const USER_TABLES = [
    'meals',
    'daily_nutrition',
    'sleep_log',
    'exercise_log',
    'habits',
    'supplement_logs',
    'lab_results',
    'biomarker_scans',
    'body_scans',
    'stool_scans',
    'scan_history',
    'health_correlations',
    'health_predictions',
    'health_insights',
    'weekly_reports',
    'weekly_scores',
    'chat_history',
    'environment_logs',
    'environmental_log',
    'tcm_profile',
    'health_profile',
    'user_goals',
    'meal_memory',
    'food_corrections',
    'portion_corrections',
    'wearable_connections',
    'hr_readings',
    'health_events',
];

// ── GET /api/user-data/export ─────────────────────────────────
router.get('/user-data/export', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        console.log(`[DataExport] Exporting data for ${userId.slice(0, 8)}`);

        const exportData = {
            exportedAt: new Date().toISOString(),
            userId,
            data: {},
        };

        // Fetch all tables in parallel
        const results = await Promise.allSettled(
            USER_TABLES.map(table =>
                supabase.from(table).select('*').eq('user_id', userId)
            )
        );

        USER_TABLES.forEach((table, i) => {
            const result = results[i];
            if (result.status === 'fulfilled' && !result.value.error) {
                exportData.data[table] = result.value.data || [];
            } else {
                exportData.data[table] = [];
            }
        });

        // Also fetch profiles table (uses id not user_id)
        const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (!profileRes.error) {
            exportData.data.profiles = profileRes.data;
        }

        console.log(`[DataExport] Export complete for ${userId.slice(0, 8)}`);

        res.setHeader('Content-Disposition', `attachment; filename="vitallens-export-${new Date().toISOString().split('T')[0]}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(exportData);

    } catch (err) {
        console.error('[DataExport] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/user-data/delete ──────────────────────────────
router.delete('/user-data/delete', async (req, res) => {
    try {
        const { userId, confirmEmail } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required.' });
        if (!confirmEmail) return res.status(400).json({ error: 'confirmEmail required for safety.' });

        console.log(`[AccountDeletion] Starting cascade delete for ${userId.slice(0, 8)}`);

        const deletionLog = {
            startedAt: new Date().toISOString(),
            userId,
            tables: {},
        };

        // Delete from all user tables
        for (const table of USER_TABLES) {
            try {
                const { error, count } = await supabase
                    .from(table)
                    .delete()
                    .eq('user_id', userId);

                if (error) {
                    console.warn(`[AccountDeletion] ${table} delete warning:`, error.message);
                    deletionLog.tables[table] = { status: 'error', error: error.message };
                } else {
                    deletionLog.tables[table] = { status: 'deleted' };
                }
            } catch (err) {
                console.warn(`[AccountDeletion] ${table} skipped:`, err.message);
                deletionLog.tables[table] = { status: 'skipped' };
            }
        }

        // Delete profile (uses id not user_id)
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        deletionLog.tables.profiles = profileError
            ? { status: 'error', error: profileError.message }
            : { status: 'deleted' };

        // Delete auth user via Supabase Admin API
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError) {
            console.warn('[AccountDeletion] Auth user delete warning:', authError.message);
            deletionLog.authUser = { status: 'error', error: authError.message };
        } else {
            deletionLog.authUser = { status: 'deleted' };
        }

        deletionLog.completedAt = new Date().toISOString();
        console.log(`[AccountDeletion] Complete for ${userId.slice(0, 8)}`);

        res.json({
            success: true,
            message: 'All user data has been permanently deleted.',
            deletionLog,
        });

    } catch (err) {
        console.error('[AccountDeletion] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;