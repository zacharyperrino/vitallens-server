// WELLNESS FRAMING ONLY. No diagnostic claims. No external genomics API. All processing local to avoid IVD classification. Get regulatory sign-off before expanding the SNP list.
//
// ─── Genomics Route (Phase 1) ─────────────────────────────────
// POST /api/genomics/upload — accepts a raw 23andMe / AncestryDNA
// text file (multipart), parses it into rsID -> genotype pairs, and
// returns wellness-framed, non-diagnostic notes for a small hardcoded
// set of well-studied SNPs. The raw genome is parsed in memory and
// never stored — only the wellness-framed trait strings are persisted.

import { Router } from 'express';
import multer from 'multer';
import { requireSelf } from '../middleware/auth.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // raw DNA exports are ~15-25MB
});

// Small, hardcoded panel of wellness-relevant SNPs. Every interpretation
// is a tendency ("commonly associated with", "you may find") — never a
// diagnosis or prediction. Expand ONLY with regulatory sign-off.
const SNP_PANEL = {
    rs762551: {
        trait: 'Caffeine metabolism (CYP1A2)',
        genotypes: {
            AA: 'commonly associated with faster caffeine metabolism — you may find caffeine clears more quickly.',
            AC: 'commonly associated with intermediate caffeine metabolism — you may find caffeine effects moderate.',
            CC: 'commonly associated with slower caffeine metabolism — you may find caffeine lingers longer.',
        },
    },
    rs4988235: {
        trait: 'Lactose tolerance (MCM6/LCT)',
        genotypes: {
            AA: 'commonly associated with lactase persistence — you may find dairy easier to tolerate.',
            AG: 'commonly associated with partial lactase persistence — you may find dairy variably tolerated.',
            GG: 'commonly associated with reduced lactase persistence — you may find dairy less comfortable.',
        },
    },
    rs671: {
        trait: 'Alcohol flush (ALDH2)',
        genotypes: {
            GG: 'commonly associated with typical acetaldehyde processing — you may find little flushing.',
            AG: 'commonly associated with reduced acetaldehyde processing — you may find facial flushing with alcohol.',
            AA: 'commonly associated with markedly reduced acetaldehyde processing — you may find strong flushing with alcohol.',
        },
    },
    rs2282679: {
        trait: 'Vitamin D transport (GC / VDR-related)',
        genotypes: {
            TT: 'commonly associated with typical vitamin D transport — you may find usual vitamin D levels.',
            TG: 'commonly associated with somewhat lower vitamin D transport — you may find supporting vitamin D helpful.',
            GG: 'commonly associated with lower vitamin D transport — you may find monitoring vitamin D worthwhile.',
        },
    },
};

// Normalize genotype so allele order doesn't matter ("GA" === "AG").
function normalizeGenotype(gt) {
    return (gt || '').replace(/[^ACGT]/gi, '').toUpperCase().split('').sort().join('');
}

function lookupInterpretation(snp, genotype) {
    const norm = normalizeGenotype(genotype);
    for (const [key, text] of Object.entries(SNP_PANEL[snp].genotypes)) {
        if (normalizeGenotype(key) === norm) return text;
    }
    return null;
}

// Parse 23andMe / AncestryDNA raw text into { rsID: genotype }.
//   23andMe:  rsid  chrom  pos  genotype
//   Ancestry: rsid  chrom  pos  allele1  allele2
function parseRawDNA(text) {
    const map = {};
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const rsid = parts[0];
        if (!rsid.startsWith('rs')) continue;
        map[rsid] = parts.length >= 5 ? parts[3] + parts[4] : parts[3];
    }
    return map;
}

router.post('/genomics/upload', requireSelf('userId'), upload.single('file'), async (req, res) => {
    try {
        const userId = req.body?.userId;
        let raw;
        if (req.file) raw = req.file.buffer.toString('utf-8');
        else if (req.body?.text) raw = req.body.text;
        else return res.status(400).json({ error: 'No DNA file provided.' });

        const header = raw.slice(0, 2000);
        const source = /ancestry/i.test(header) ? 'AncestryDNA'
            : /23andme/i.test(header) ? '23andMe'
            : 'unknown';

        const genotypes = parseRawDNA(raw);

        const results = [];
        for (const [rsid, def] of Object.entries(SNP_PANEL)) {
            const userGeno = genotypes[rsid];
            if (!userGeno) continue;
            const interpretation = lookupInterpretation(rsid, userGeno);
            if (!interpretation) continue;
            results.push({
                trait: def.trait,
                rsid,
                genotype: normalizeGenotype(userGeno),
                interpretation,
                source,
            });
        }

        // Persist wellness-framed strings only — never the raw genome.
        if (results.length) {
            await supabase.from('genomics_traits').insert(
                results.map(r => ({
                    user_id: userId,
                    trait: r.trait,
                    genotype: r.genotype,
                    interpretation: r.interpretation,
                    source: r.source,
                    created_at: new Date().toISOString(),
                }))
            );
        }

        res.json({
            source,
            snpsFound: results.length,
            traits: results,
            disclaimer: 'Wellness information only. These are common associations, not diagnoses or predictions. Not a substitute for professional genetic counseling.',
        });
    } catch (err) {
        console.error('[Genomics] Upload failed:', err.message);
        sendError(res, err);
    }
});

export default router;
