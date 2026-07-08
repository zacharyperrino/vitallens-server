# Image Data Privacy Audit

**Scope:** Server-side handling of user-submitted image/photo/PDF data.
**Last audited:** 2026-07-04
**Audited routes:** `routes/vision.js`, `routes/ocr.js`, `routes/parse-labs.js`, `routes/hygiene.js`, `routes/biomarker.js` (wellness scans: face/eye/skin/body/tongue/nail), plus the client-side stool scanner.

This document exists to support the Terms of Service / Privacy Policy update. It records **which routes transmit user images to which third parties**, and confirms that no user image is persisted on our servers.

---

## Summary table

| Route | Endpoint | Handles user image? | Third party image is sent to | Stored on disk? | Stored in our DB? | Logged to console? |
|-------|----------|---------------------|------------------------------|-----------------|-------------------|--------------------|
| `vision.js` | `POST /api/vision-scan` | Yes (meal photo, base64/buffer) | **OpenAI** (GPT-4o Vision) | No | No | No |
| `ocr.js` | `POST /api/ocr-parse` | Yes (nutrition label, base64/buffer) | **Google Cloud Vision** | No | No | No |
| `parse-labs.js` | `POST /api/parse-labs` | Yes (lab PDF or image) | **OpenAI** (GPT-4o / Vision) | No¹ | No | No |
| `hygiene.js` | `POST /api/hygiene/scan` | **No** (barcode number only) | None (Open Beauty Facts, barcode only) | No | Product URL only² | No |
| `biomarker.js` | `POST /api/biomarker-scan` | Yes (face/eye/skin/body/tongue/nail photo) | **Anthropic** (Claude Sonnet Vision) | No | No | No |
| stool scanner | client-side only | Yes — **never leaves the browser** | None | No | Derived metrics only³ | No |

¹ **Changed in this audit.** Previously the PDF path wrote the uploaded file to a temp file on disk (`os.tmpdir()`) before running `pdftotext`, then deleted it. It now streams the PDF to `pdftotext` via **stdin**, so nothing touches disk.
² `hygiene.js` stores `image_url` in the `hygiene_scans` table — this is a **URL pointing to Open Beauty Facts' own product catalog image**, not a user-submitted photo.
³ The stool scanner analyzes the photo entirely in-browser (`<canvas>` pixel analysis). Only derived metrics (Bristol type, color, gut score) are saved to `stool_scans` / sent to `/api/ingest`. The image is never uploaded.

---

## Data flow detail

### `vision.js` — Food/meal scanning → OpenAI
- Image arrives as a multipart file (`req.file.buffer`) or a base64 string (`req.body.image`).
- Converted to base64 in memory and sent inline in the request body to `https://api.openai.com/v1/chat/completions` (model `gpt-4o`).
- A barcode-first gate may short-circuit to Open Food Facts before the image is ever read — in that path **no image is sent anywhere** (only the barcode number is used in a URL lookup).
- The image is held only for the lifetime of the request. Not written to disk, not saved to Supabase, not logged.

### `ocr.js` — Nutrition-label OCR → Google Cloud Vision
- Image arrives as multipart file or base64 string.
- Sent inline (base64 `image.content`) to `https://vision.googleapis.com/v1/images:annotate`.
- **Note for ToS:** this is the one route that shares images with **Google**, not OpenAI/Anthropic. Only detected text is returned; the image is discarded after the request.

### `parse-labs.js` — Lab report parsing → OpenAI
- Accepts a PDF, an image, or raw text.
- **PDF:** streamed to `pdftotext` over stdin (in memory, no temp file). Extracted **text only** is sent to OpenAI.
- **Image / scanned PDF fallback:** if `pdftotext` is unavailable, the PDF/image is base64-encoded in memory and sent to OpenAI GPT-4o Vision.
- **Plain text:** sent as-is.
- Lab documents are among the most sensitive user data here — confirm the ToS covers sharing lab **images and extracted text** with OpenAI.

### `hygiene.js` — Hygiene product scanning → (no image)
- Takes a **barcode number only**. No image is uploaded or processed.
- Looks the barcode up via the Open Beauty Facts service.
- Persists scan metadata to `hygiene_scans`, including `image_url` — a link to Open Beauty Facts' hosted product photo, **not** a user image.

### `biomarker.js` — Wellness scans (face/eye/skin/body/tongue/nail) → Anthropic
- Image arrives as multipart file or base64 string; `scanType` selects the analysis prompt.
- Converted to base64 in memory and sent inline to `https://api.anthropic.com/v1/messages` (model `claude-sonnet-4-20250514`).
- These images (faces, bodies, skin) are highly sensitive biometric-adjacent data — the ToS should explicitly disclose that wellness-scan photos are transmitted to **Anthropic** for analysis.
- Not written to disk, not saved to Supabase, not logged.

### Stool scanner — client-side only
- Runs entirely in the browser. Only derived findings are stored/ingested. No third-party image sharing. No server involvement with the image.

---

## Third-party processors receiving user images

| Processor | Routes | Data shared |
|-----------|--------|-------------|
| **OpenAI** | `vision.js`, `parse-labs.js` | Meal photos; lab report images/PDFs and extracted lab text |
| **Anthropic** | `biomarker.js` | Face, eye, skin, body, tongue, and nail photographs |
| **Google Cloud Vision** | `ocr.js` | Nutrition-label photographs |
| **Open Food Facts / Open Beauty Facts** | `vision.js` (barcode path), `hygiene.js` | Barcode numbers only — no images |

**ToS action items:**
1. Disclose OpenAI, Anthropic, and Google as image sub-processors.
2. Call out that lab reports and wellness/biometric-adjacent photos (face/body/skin) are transmitted to third-party AI providers.
3. State that images are processed transiently and not retained on our servers or in our database.

---

## Changes made during this audit
- **`parse-labs.js`:** eliminated the temporary on-disk write of uploaded PDFs; text extraction now streams via stdin. Removed the now-unused `fs`/`path`/`os` imports.
- Added an `// IMAGE PRIVACY:` comment above every external AI/vision fetch call in `vision.js`, `ocr.js`, `parse-labs.js`, and `biomarker.js`.
- Audited all `console.*` statements in the reviewed files: **none print image data or base64 strings**, so none were removed.

## Verification performed
- `grep` confirmed no `console.*` statement in the audited files references `base64`, `buffer`, `imageData`, or `dataURL`.
- `grep` confirmed no `writeFileSync`, `createWriteStream`, `.pipe()`, or `tmpdir` disk-write calls remain in any audited file.
