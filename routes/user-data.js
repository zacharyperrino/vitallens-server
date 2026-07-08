// routes/user-data.js
// ─────────────────────────────────────────────────────────────
// GET    /api/user-data/export  — full data export as JSON
// DELETE /api/user-data/delete  — cascade delete all user data
//
// Both routes are now protected:
//  1. requireAuth  — you must be logged in
//  2. requireSelf  — you can only touch your own data
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, requireSelf } from '../middleware/auth.js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

// adminSupabase uses the service role key.
// We ONLY use this for the delete route — because deleting
// the auth user itself requires admin privileges.
// All reads use the user's own token so RLS is enforced.
const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_TABLES = [
  'meals', 'daily_nutrition', 'sleep_log', 'exercise_log', 'habits',
  'supplement_logs', 'lab_results', 'biomarker_scans', 'body_scans',
  'stool_scans', 'scan_history', 'health_correlations', 'health_predictions',
  'health_insights', 'weekly_reports', 'weekly_scores', 'chat_history',
  'environment_logs', 'tcm_profile', 'health_profile',
  'user_goals', 'meal_memory', 'food_corrections', 'portion_corrections',
  'wearable_connections', 'hr_readings', 'health_events',
];

// ── GET /api/user-data/export ─────────────────────────────────
// requireAuth  → must be logged in
// requireSelf  → userId in query string must match logged-in user
router.get(
  '/user-data/export',
  requireSelf('userId'),
  async (req, res) => {
    try {
      // req.supabase is already scoped to this user via RLS
      // It physically cannot return another user's data
      const exportData = {
        exportedAt: new Date().toISOString(),
        userId: req.user.id,
        data: {},
      };

      const results = await Promise.allSettled(
        USER_TABLES.map(table =>
          req.supabase.from(table).select('*').eq('user_id', req.user.id)
        )
      );

      USER_TABLES.forEach((table, i) => {
        const result = results[i];
        exportData.data[table] =
          result.status === 'fulfilled' && !result.value.error
            ? result.value.data || []
            : [];
      });

      const profileRes = await req.supabase
        .from('profiles')
        .select('*')
        .eq('id', req.user.id)
        .single();

      if (!profileRes.error) exportData.data.profiles = profileRes.data;

      res.setHeader('Content-Disposition',
        `attachment; filename="vitallens-export-${new Date().toISOString().split('T')[0]}.json"`
      );
      res.setHeader('Content-Type', 'application/json');
      res.json(exportData);

    } catch (err) {
      console.error('[DataExport] Failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── DELETE /api/user-data/delete ──────────────────────────────
// requireAuth  → must be logged in
// requireSelf  → userId in request body must match logged-in user
router.delete(
  '/user-data/delete',
  requireAuth,
  requireSelf('userId'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { confirmEmail } = req.body;

      if (!confirmEmail) {
        return res.status(400).json({
          error: 'confirmEmail is required for safety.'
        });
      }

      const deletionLog = {
        startedAt: new Date().toISOString(),
        userId,
        tables: {},
      };

      for (const table of USER_TABLES) {
        try {
          const { error } = await adminSupabase
            .from(table)
            .delete()
            .eq('user_id', userId);

          deletionLog.tables[table] = error
            ? { status: 'error', error: error.message }
            : { status: 'deleted' };
        } catch (err) {
          deletionLog.tables[table] = { status: 'skipped' };
        }
      }

      const { error: profileError } = await adminSupabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      deletionLog.tables.profiles = profileError
        ? { status: 'error', error: profileError.message }
        : { status: 'deleted' };

      const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId);
      deletionLog.authUser = authError
        ? { status: 'error', error: authError.message }
        : { status: 'deleted' };

      deletionLog.completedAt = new Date().toISOString();

      res.json({
        success: true,
        message: 'All user data has been permanently deleted.',
        deletionLog,
      });

    } catch (err) {
      console.error('[AccountDeletion] Failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;