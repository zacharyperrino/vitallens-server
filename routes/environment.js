// ─── Environment Route ────────────────────────────────────────
// GET /api/environment?location=Los+Angeles,CA
// Geocodes location, fetches real-time air quality + EPA water data

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// ── Geocode city name → lat/lng via Nominatim ─────────────────
async function geocode(location) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'VitalLens/1.0 (health app)' },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (!data.length) throw new Error('Location not found');
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        country: data[0].address?.country_code || '',
    };
}

// ── Air quality from Open-Meteo ────────────────────────────────
async function fetchAirQuality(lat, lng) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,us_aqi_pm2_5,dust,uv_index,uv_index_clear_sky&hourly=pm2_5,us_aqi&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Air quality API failed');
    const data = await res.json();
    const c = data.current || {};

    // AQI category
    const aqi = c.us_aqi || 0;
    const aqiCategory = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for Sensitive Groups' : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very Unhealthy' : 'Hazardous';
    const aqiColor = aqi <= 50 ? 'green' : aqi <= 100 ? 'yellow' : aqi <= 150 ? 'orange' : aqi <= 200 ? 'red' : 'purple';

    return {
        aqi,
        aqiCategory,
        aqiColor,
        pm2_5: c.pm2_5,
        pm10: c.pm10,
        ozone: c.ozone,
        no2: c.nitrogen_dioxide,
        so2: c.sulphur_dioxide,
        co: c.carbon_monoxide,
        dust: c.dust,
        uv_index: c.uv_index,
        health_implications: getAQIHealthImplications(aqi, c),
    };
}

function getAQIHealthImplications(aqi, c) {
    const implications = [];
    if (aqi > 100) implications.push('Limit outdoor exercise — elevated pollutants');
    if (aqi > 150) implications.push('Sensitive groups should stay indoors');
    if (aqi > 200) implications.push('Avoid all outdoor activity');
    if (c.pm2_5 > 35) implications.push(`PM2.5 elevated (${c.pm2_5?.toFixed(1)} μg/m³) — lung and cardiovascular stress`);
    if (c.ozone > 100) implications.push(`Ozone elevated (${c.ozone?.toFixed(0)} μg/m³) — respiratory irritant`);
    if (c.nitrogen_dioxide > 40) implications.push(`NO2 elevated — traffic/combustion pollution`);
    if (c.uv_index >= 8) implications.push(`UV index very high (${c.uv_index}) — sun protection essential`);
    if (c.uv_index >= 6 && c.uv_index < 8) implications.push(`UV index high (${c.uv_index}) — sunscreen recommended`);
    if (c.dust > 50) implications.push('Dust levels elevated — consider mask outdoors');
    return implications;
}

// ── US Water quality from EPA ECHO ────────────────────────────
async function fetchWaterQuality(lat, lng) {
    try {
        const url = `https://echo.epa.gov/api/services/cwa/2.0/facilities/search?output=json&p_lat=${lat}&p_long=${lng}&p_radius=25&p_act=Y&p_case=Y&responseset=10`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const facilities = data.Results?.Facilities || [];
        const violations = facilities.filter(f => f.CWPSNCStatus === 'SNC' || f.CWPNumPSNCFailures > 0);

        return {
            facilities_checked: facilities.length,
            violations_nearby: violations.length,
            violation_details: violations.slice(0, 3).map(f => ({
                name: f.FacilityName,
                city: f.CityName,
                status: f.CWPSNCStatus,
            })),
            assessment: violations.length === 0
                ? 'No significant water violations detected within 25 miles'
                : `${violations.length} facility violation(s) detected within 25 miles`,
            risk_level: violations.length === 0 ? 'low' : violations.length < 3 ? 'moderate' : 'high',
        };
    } catch {
        return null;
    }
}

// ── GET /api/environment/latest ───────────────────────────────
router.get('/environment/latest', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const { data, error } = await supabase
            .from('environment_logs')
            .select('*')
            .eq('user_id', userId)
            .order('logged_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json({ environment: data || null });
    } catch (err) {
        console.error('[Environment] Latest fetch failed:', err.message);
        sendError(res, err);
    }
});

// ── Main route ─────────────────────────────────────────────────
router.get('/environment', async (req, res) => {
    try {
        const { location, userId } = req.query;
        if (!location) return res.status(400).json({ error: 'location required' });

        console.log(`[Environment] Fetching data for: ${location}`);

        const geo = await geocode(location);
        console.log(`[Environment] Geocoded: ${geo.lat}, ${geo.lng}`);

        const [air, water] = await Promise.allSettled([
            fetchAirQuality(geo.lat, geo.lng),
            fetchWaterQuality(geo.lat, geo.lng),
        ]);

        const airData = air.status === 'fulfilled' ? air.value : { error: air.reason?.message };
        const waterData = water.status === 'fulfilled' ? water.value : null;

        const result = {
            location: geo.displayName,
            coordinates: { lat: geo.lat, lng: geo.lng },
            country: geo.country,
            air: airData,
            water: waterData,
            fetched_at: new Date().toISOString(),
        };

        // Persist to environment_logs if userId provided
        if (userId) {
            try {
                await supabase.from('environment_logs').insert({
                    user_id: userId,
                    location: geo.displayName,
                    aqi: airData.aqi || null,
                    aqi_category: airData.aqiCategory || null,
                    pm2_5: airData.pm2_5 || null,
                    pm10: airData.pm10 || null,
                    ozone: airData.ozone || null,
                    no2: airData.no2 || null,
                    uv_index: airData.uv_index || null,
                    water_risk: waterData?.risk_level || null,
                    water_assessment: waterData?.assessment || null,
                    raw: result,
                });
                console.log(`[Environment] Logged snapshot for user ${userId.slice(0, 8)}`);
            } catch (logErr) {
                console.warn('[Environment] Failed to log snapshot:', logErr.message);
            }
        }

        console.log(`[Environment] AQI: ${airData.aqi} — ${airData.aqiCategory}`);
        res.json(result);

    } catch (err) {
        console.error('[Environment] Failed:', err.message);
        sendError(res, err);
    }
});

export default router;