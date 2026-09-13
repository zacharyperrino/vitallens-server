// ─── Additive Analyzer ──────────────────────────────────────
// Looks up additive classifications from the database and provides
// risk analysis for a given set of E-codes.

import { supabase } from '../db/supabase.js';

/**
 * Analyze a list of additive E-codes against the database.
 *
 * @param {string[]} codes — e.g. ["E621", "E951", "E330"]
 * @returns {{ analyzed, riskMap, summary }}
 */
export async function analyzeAdditives(codes) {
    if (!codes || codes.length === 0) {
        return {
            analyzed: [],
            riskMap: {},
            summary: { total: 0, high: 0, moderate: 0, low: 0 },
        };
    }

    // Normalize codes
    const normalized = codes.map(c => c.toUpperCase().trim());

    // Bulk lookup
    let rows = [];
    try {
        const { data, error } = await supabase
            .from('additive_classifications')
            .select('*')
            .in('code', normalized);
        if (error) throw error;
        rows = data || [];
    } catch (err) {
        console.warn('[AdditiveAnalyzer] DB lookup failed, using fallback:', err.message);
    }

    const dbMap = new Map(rows.map(r => [r.code, r]));

    // Build risk map (code → risk_level, code_name → name)
    const riskMap = {};
    const analyzed = [];
    const summary = { total: normalized.length, high: 0, moderate: 0, low: 0 };

    for (const code of normalized) {
        const info = dbMap.get(code);
        const riskLevel = info?.risk_level || 'unknown';

        riskMap[code] = riskLevel;
        if (info?.name) riskMap[`${code}_name`] = info.name;

        analyzed.push({
            code,
            name: info?.name || code,
            category: info?.category || 'unknown',
            risk_level: riskLevel,
            description: info?.description || null,
            concerns: info?.concerns || [],
        });

        if (riskLevel === 'high' || riskLevel === 'banned') summary.high++;
        else if (riskLevel === 'moderate') summary.moderate++;
        else summary.low++;
    }

    return { analyzed, riskMap, summary };
}

/**
 * Fallback additive risk estimation when DB is unavailable.
 * Uses a hardcoded subset of high-risk additives.
 */
export function estimateAdditiveRisk(code) {
    const HIGH_RISK = new Set([
        'E102', 'E110', 'E122', 'E124', 'E129', 'E171',
        'E249', 'E250', 'E251', 'E320', 'E951', 'E952',
    ]);
    const MODERATE_RISK = new Set([
        'E120', 'E131', 'E150D', 'E210', 'E211', 'E220',
        'E321', 'E407', 'E621', 'E950', 'E955',
    ]);

    const upper = code.toUpperCase();
    if (HIGH_RISK.has(upper)) return 'high';
    if (MODERATE_RISK.has(upper)) return 'moderate';
    return 'low';
}
