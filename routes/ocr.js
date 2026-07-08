// ─── OCR Parse Route ─────────────────────────────────────────
// POST /api/ocr-parse
// Body: { image: base64string }  OR  multipart with "image" field
// Sends to Google Vision API, parses nutrition label text,
// normalizes values to per 100g.

import { Router } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/ocr-parse', upload.single('image'), async (req, res, next) => {
    try {
        let base64Image;

        // Accept either base64 in body or multipart file upload
        if (req.file) {
            base64Image = req.file.buffer.toString('base64');
        } else if (req.body.image) {
            base64Image = req.body.image.replace(/^data:image\/\w+;base64,/, '');
        } else {
            return res.status(400).json({ error: 'No image provided. Send base64 or multipart file.' });
        }

        // ─── Call Google Vision API ──────────────────────────
        const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
        if (!apiKey || apiKey === 'your_google_cloud_api_key') {
            // Dev fallback: return mock OCR result
            console.log('[OCR] No API key configured, returning mock result');
            return res.json(getMockOcrResult());
        }

        const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const visionPayload = {
            requests: [{
                image: { content: base64Image },
                features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            }],
        };

        // IMAGE PRIVACY: image sent directly to provider, never stored locally
        const visionRes = await fetch(visionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visionPayload),
            signal: AbortSignal.timeout(10000),
        });

        if (!visionRes.ok) {
            const errBody = await visionRes.text();
            console.error('[OCR] Vision API error:', errBody);
            return res.status(502).json({ error: 'Google Vision API error', details: errBody });
        }

        const visionData = await visionRes.json();
        const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || '';

        if (!fullText) {
            return res.status(422).json({
                error: 'No text detected in image',
                suggestion: 'Ensure the nutrition label is clearly visible and well-lit.',
            });
        }

        // ─── Parse nutrition from OCR text ───────────────────
        const parsed = parseNutritionLabel(fullText);

        res.json({
            nutrition: parsed.nutrition,
            servingSize: parsed.servingSize,
            rawText: fullText,
            confidence: parsed.confidence,
            warnings: parsed.warnings,
        });

    } catch (err) {
        next(err);
    }
});

/**
 * Parse nutrition values from OCR text.
 * Uses pattern matching to extract common nutrition label fields.
 */
function parseNutritionLabel(text) {
    const lines = text.split('\n').map(l => l.trim().toLowerCase());
    const fullText = lines.join(' ');
    const warnings = [];

    // Serving size detection
    let servingSize = null;
    const servingMatch = fullText.match(/serving\s*size[:\s]*(\d+\.?\d*)\s*(g|ml|oz)/i);
    if (servingMatch) {
        servingSize = { amount: parseFloat(servingMatch[1]), unit: servingMatch[2] };
    }

    // Per-100g detection
    const isPer100g = /per\s*100\s*g/i.test(fullText) || /pour\s*100\s*g/i.test(fullText);

    // Extract values using flexible patterns
    const nutrition = {
        calories: extractNumber(fullText, /(?:calories|energy|kcal|cal)[:\s]*(\d+\.?\d*)/i)
            || extractNumber(fullText, /(\d+\.?\d*)\s*(?:kcal|cal)/i),
        protein: extractNumber(fullText, /protein[s]?[:\s]*(\d+\.?\d*)\s*g/i),
        carbs: extractNumber(fullText, /(?:total\s+)?carbohydrate[s]?[:\s]*(\d+\.?\d*)\s*g/i)
            || extractNumber(fullText, /(?:glucides|carbs)[:\s]*(\d+\.?\d*)\s*g/i),
        sugar: extractNumber(fullText, /(?:total\s+)?sugar[s]?[:\s]*(\d+\.?\d*)\s*g/i)
            || extractNumber(fullText, /(?:sucres|dont sucres)[:\s]*(\d+\.?\d*)\s*g/i),
        fat: extractNumber(fullText, /(?:total\s+)?fat[:\s]*(\d+\.?\d*)\s*g/i)
            || extractNumber(fullText, /(?:matieres grasses|lipides)[:\s]*(\d+\.?\d*)\s*g/i),
        saturated_fat: extractNumber(fullText, /(?:saturated|sat\.?\s*fat)[:\s]*(\d+\.?\d*)\s*g/i)
            || extractNumber(fullText, /(?:dont acides gras satures|saturates)[:\s]*(\d+\.?\d*)\s*g/i),
        fiber: extractNumber(fullText, /(?:dietary\s+)?fibre?[:\s]*(\d+\.?\d*)\s*g/i),
        sodium: extractSodium(fullText),
    };

    // Normalize to per-100g if we have a serving size and values aren't already per-100g
    if (servingSize && !isPer100g && servingSize.unit === 'g' && servingSize.amount > 0) {
        const factor = 100 / servingSize.amount;
        for (const key of Object.keys(nutrition)) {
            if (nutrition[key] !== null) {
                nutrition[key] = Math.round(nutrition[key] * factor * 10) / 10;
            }
        }
        warnings.push(`Values normalized from per-serving (${servingSize.amount}g) to per 100g`);
    }

    // Confidence estimation
    const fieldsFound = Object.values(nutrition).filter(v => v !== null).length;
    const confidence = Math.round((fieldsFound / 8) * 100);
    if (fieldsFound < 4) {
        warnings.push('Low confidence: fewer than 4 nutrition fields detected');
    }

    return { nutrition, servingSize, confidence, warnings };
}

/**
 * Extract a numeric value from text using a regex pattern.
 */
function extractNumber(text, pattern) {
    const match = text.match(pattern);
    return match ? parseFloat(match[1]) : null;
}

/**
 * Extract sodium, handling both mg and g units, also from salt.
 */
function extractSodium(text) {
    // Direct sodium in mg
    const mgMatch = text.match(/sodium[:\s]*(\d+\.?\d*)\s*mg/i);
    if (mgMatch) return parseFloat(mgMatch[1]);

    // Sodium in g → convert to mg
    const gMatch = text.match(/sodium[:\s]*(\d+\.?\d*)\s*g/i);
    if (gMatch) return Math.round(parseFloat(gMatch[1]) * 1000);

    // From salt → sodium ≈ salt × 0.4 → to mg
    const saltMatch = text.match(/salt[:\s]*(\d+\.?\d*)\s*g/i);
    if (saltMatch) return Math.round(parseFloat(saltMatch[1]) * 400);

    return null;
}

/**
 * Mock OCR result for development without a Vision API key.
 */
function getMockOcrResult() {
    return {
        nutrition: {
            calories: 227,
            protein: 4.7,
            carbs: 54.0,
            sugar: 37.0,
            fat: 13.0,
            saturated_fat: 4.5,
            fiber: 1.6,
            sodium: 120,
        },
        servingSize: { amount: 100, unit: 'g' },
        rawText: '[Mock OCR] Nutrition Facts – Calories 227 kcal, Protein 4.7g, Carbohydrates 54g, Sugars 37g, Fat 13g, Saturated Fat 4.5g, Fiber 1.6g, Sodium 120mg',
        confidence: 100,
        warnings: ['Mock data — configure GOOGLE_CLOUD_API_KEY for real OCR'],
    };
}

export default router;
