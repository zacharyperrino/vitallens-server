// ─── Lab Parser Route ─────────────────────────────────────────
// POST /api/parse-labs
// Body: multipart form-data with "pdf" field (PDF file)
//       OR "text" field (raw text from OCR)
//
// Sends lab report text to GPT-4o which extracts all biomarkers
// and returns them in a structured format ready for Supabase.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF, images, and text files accepted.'));
    },
});

const labLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Lab parse rate limit exceeded.' },
});

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const LAB_PARSE_PROMPT = `You are a medical lab report parser. Extract ALL biomarkers and lab values from this text.

Return ONLY valid JSON in this exact format, no other text:
{
  "panel_type": "Blood Panel | Hormone Panel | Thyroid Panel | Gut Test | Vitamin Panel | Other",
  "lab_name": "Name of the lab/clinic if visible, or null",
  "collected_at": "YYYY-MM-DD if date visible, or null",
  "markers": {
    "Marker Name": {
      "value": 45.2,
      "unit": "ng/mL",
      "reference_range": "30-100" or null,
      "status": "normal | low | high | critical" or null
    }
  },
  "notes": "Any important notes, flags, or comments from the report, or null"
}

Rules:
- Extract every single marker you can find — don't skip any
- Use the exact marker names from the report (e.g. "TSH", "Vitamin D 25-OH", "HbA1c")
- Convert all values to numbers (not strings)
- If a value has < or > (e.g. "<0.1"), use 0.1 as the number
- status: "normal" if within range, "low" if below, "high" if above, "critical" if flagged
- If you cannot find any lab markers, return {"panel_type": "Unknown", "markers": {}, "lab_name": null, "collected_at": null, "notes": "No lab markers found"}`;

router.post('/parse-labs', labLimiter, upload.single('pdf'), async (req, res, next) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured.' });

        // ── Usage gate ────────────────────────────────────────
        const userId = req.body?.userId;
        if (userId) {
            const gate = await checkAndIncrementUsage(userId, 'lab_upload');
            if (!gate.allowed) return res.status(429).json({ error: gate.message, upgradeRequired: true });
        }

        let labText = '';

        if (req.file) {
            const file = req.file;

            if (file.mimetype === 'application/pdf') {
                // Extract text from PDF using pdftotext if available, otherwise base64 to GPT-4o vision
                const tmpPath = join(tmpdir(), `lab-${Date.now()}.pdf`);
                writeFileSync(tmpPath, file.buffer);

                try {
                    labText = execSync(`pdftotext "${tmpPath}" -`, { timeout: 10000 }).toString();
                    unlinkSync(tmpPath);
                } catch (pdfErr) {
                    // pdftotext not available — send PDF as image to GPT-4o Vision
                    if (existsSync(tmpPath)) unlinkSync(tmpPath);
                    console.log('[LabParser] pdftotext unavailable, using vision API');
                    return await parsePdfWithVision(file.buffer, file.mimetype, apiKey, res);
                }
            } else if (file.mimetype.startsWith('image/')) {
                // Image of lab report — use vision
                return await parsePdfWithVision(file.buffer, file.mimetype, apiKey, res);
            } else {
                // Plain text
                labText = file.buffer.toString('utf-8');
            }
        } else if (req.body?.text) {
            labText = req.body.text;
        } else {
            return res.status(400).json({ error: 'No file or text provided.' });
        }

        if (!labText.trim()) {
            return res.status(422).json({ error: 'Could not extract text from file.' });
        }

        // Send to GPT-4o for parsing
        const parsed = await parseLabText(labText, apiKey);
        res.json(parsed);

    } catch (err) {
        next(err);
    }
});

async function parseLabText(text, apiKey) {
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: `${LAB_PARSE_PROMPT}\n\nLab report text:\n\n${text.slice(0, 12000)}`,
            }],
        }),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        throw new Error('Failed to parse lab extraction response.');
    }
}

async function parsePdfWithVision(buffer, mimeType, apiKey, res) {
    const base64 = buffer.toString('base64');

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64}`,
                            detail: 'high',
                        },
                    },
                    { type: 'text', text: LAB_PARSE_PROMPT },
                ],
            }],
        }),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(502).json({ error: err.error?.message || `OpenAI error: ${response.status}` });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        res.json(parsed);
    } catch {
        res.status(422).json({ error: 'Failed to parse lab extraction response.' });
    }
}

export default router;