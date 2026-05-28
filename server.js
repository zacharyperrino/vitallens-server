// ─── VitalLens API Server ────────────────────────────────────
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import helmet from 'helmet';

import barcodeRoutes from './routes/barcode.js';
import ocrRoutes from './routes/ocr.js';
import healthScoreRoutes from './routes/health-score.js';
import visionRoutes from './routes/vision.js';
import ingestRoutes from './routes/ingest.js';
import correlateRoutes from './routes/correlate.js';
import correlationEngineRoutes from './routes/correlation-engine.js';
import parseLabsRoutes from './routes/parse-labs.js';
import foodCorrectionRoutes from './routes/food-correction.js';
import nutritionRoutes from './routes/nutrition.js';
import restaurantRoutes from './routes/restaurant.js';
import biomarkerRoutes from './routes/biomarker.js';
import biomarkerHistoryRoutes from './routes/biomarker-history.js';
import environmentRoutes from './routes/environment.js';
import supplementsRoutes from './routes/supplements.js';
import userGoalsRoutes from './routes/user-goals.js';
import healthProfileRoutes from './routes/health-profile.js';
import mealMemoryRoutes from './routes/meal-memory.js';
import tcmProfileRoutes from './routes/tcm-profile.js';
import healthCopilotRoutes from './routes/health-copilot.js';
import weeklyReportRoutes from './routes/weekly-report.js';
import predictionEngineRoutes from './routes/prediction-engine.js';
import userDataRoutes from './routes/user-data.js';
import './services/queue.js';
import billingRoutes from './routes/billing.js';
import pushRoutes from './routes/push.js';
import ouraRoutes from './routes/oura.js';
import hygieneRoutes from './routes/hygiene.js';
import usageRoutes from './routes/usage.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(helmet());

// ─── Rate Limiter ────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', globalLimiter);

// ─── Routes ─────────────────────────────────────────────────
app.use('/api', barcodeRoutes);
app.use('/api', ocrRoutes);
app.use('/api', healthScoreRoutes);
app.use('/api', visionRoutes);
app.use('/api', ingestRoutes);
app.use('/api', correlateRoutes);
app.use('/api', correlationEngineRoutes);
app.use('/api', parseLabsRoutes);
app.use('/api', foodCorrectionRoutes);
app.use('/api', nutritionRoutes);
app.use('/api', restaurantRoutes);
app.use('/api', biomarkerRoutes);
app.use('/api', biomarkerHistoryRoutes);
app.use('/api', environmentRoutes);
app.use('/api', supplementsRoutes);
app.use('/api', userGoalsRoutes);
app.use('/api', healthProfileRoutes);
app.use('/api', mealMemoryRoutes);
app.use('/api', tcmProfileRoutes);
app.use('/api', healthCopilotRoutes);
app.use('/api', weeklyReportRoutes);
app.use('/api', predictionEngineRoutes);
app.use('/api', userDataRoutes);
app.use('/api', billingRoutes);
app.use('/api', pushRoutes);
app.use('/api', ouraRoutes);
app.use('/api', hygieneRoutes);
app.use('/api', usageRoutes);
// ─── Health Check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'vitallens-api', uptime: process.uptime() });
});

// ─── Error Handler ──────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error(`[ERROR] ${err.message}`, err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

Sentry.setupExpressErrorHandler(app);

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🔬 VitalLens API running on http://localhost:${PORT}`);
    console.log(`   Routes mounted: ${PORT}`);
});

export default app;
