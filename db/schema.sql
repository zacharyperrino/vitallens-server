-- ================================================
-- VitalLens Product Scanner — PostgreSQL Schema
-- ================================================

-- Products cache (from Open Food Facts API)
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  barcode       VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(500),
  brand         VARCHAR(300),
  ingredients   TEXT,
  nutrition     JSONB,           -- per 100g values
  additives     JSONB,           -- array of additive codes e.g. ["E621","E330"]
  nutriscore    VARCHAR(1),      -- A–E grade
  nova_group    INT,             -- 1–4 processing level
  image_url     VARCHAR(1000),
  raw_response  JSONB,           -- full Open Food Facts response for audit
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Additive classifications (seeded reference data)
CREATE TABLE IF NOT EXISTS additive_classifications (
  code          VARCHAR(20) PRIMARY KEY,   -- e.g. "E621"
  name          VARCHAR(300) NOT NULL,
  category      VARCHAR(100),              -- preservative, colorant, sweetener, emulsifier, etc.
  risk_level    VARCHAR(20) NOT NULL DEFAULT 'low',  -- low, moderate, high, banned
  description   TEXT,
  concerns      TEXT[]
);

-- Seed common high-risk additives
INSERT INTO additive_classifications (code, name, category, risk_level, description, concerns) VALUES
  ('E102', 'Tartrazine', 'colorant', 'high', 'Yellow azo dye', ARRAY['hyperactivity', 'allergic reactions']),
  ('E110', 'Sunset Yellow', 'colorant', 'high', 'Orange-yellow azo dye', ARRAY['hyperactivity', 'allergic reactions']),
  ('E120', 'Cochineal', 'colorant', 'moderate', 'Red dye from insects', ARRAY['allergic reactions']),
  ('E122', 'Azorubine', 'colorant', 'high', 'Red azo dye', ARRAY['hyperactivity', 'allergic reactions']),
  ('E124', 'Ponceau 4R', 'colorant', 'high', 'Red azo dye', ARRAY['hyperactivity', 'allergic reactions']),
  ('E129', 'Allura Red', 'colorant', 'high', 'Red azo dye', ARRAY['hyperactivity', 'allergic reactions']),
  ('E131', 'Patent Blue V', 'colorant', 'moderate', 'Blue synthetic dye', ARRAY['allergic reactions']),
  ('E133', 'Brilliant Blue', 'colorant', 'low', 'Blue synthetic dye', ARRAY['mild sensitivity']),
  ('E150d', 'Sulphite Ammonia Caramel', 'colorant', 'moderate', 'Dark caramel color', ARRAY['potential carcinogen 4-MEI']),
  ('E171', 'Titanium Dioxide', 'colorant', 'high', 'White pigment', ARRAY['genotoxicity concerns', 'banned in EU for food']),
  ('E210', 'Benzoic Acid', 'preservative', 'moderate', 'Antimicrobial preservative', ARRAY['hyperactivity', 'asthma']),
  ('E211', 'Sodium Benzoate', 'preservative', 'moderate', 'Common preservative', ARRAY['hyperactivity', 'benzene formation with vitamin C']),
  ('E220', 'Sulphur Dioxide', 'preservative', 'moderate', 'Antioxidant preservative', ARRAY['asthma', 'allergic reactions']),
  ('E249', 'Potassium Nitrite', 'preservative', 'high', 'Curing agent', ARRAY['nitrosamine formation', 'potential carcinogen']),
  ('E250', 'Sodium Nitrite', 'preservative', 'high', 'Curing agent for meats', ARRAY['nitrosamine formation', 'potential carcinogen']),
  ('E251', 'Sodium Nitrate', 'preservative', 'high', 'Preservative in cured meats', ARRAY['nitrosamine formation', 'potential carcinogen']),
  ('E320', 'BHA', 'antioxidant', 'high', 'Butylated hydroxyanisole', ARRAY['endocrine disruptor', 'possible carcinogen']),
  ('E321', 'BHT', 'antioxidant', 'moderate', 'Butylated hydroxytoluene', ARRAY['endocrine disruptor']),
  ('E330', 'Citric Acid', 'acidity regulator', 'low', 'Natural acid found in citrus', ARRAY[]::TEXT[]),
  ('E407', 'Carrageenan', 'thickener', 'moderate', 'Seaweed extract', ARRAY['gastrointestinal inflammation']),
  ('E420', 'Sorbitol', 'sweetener', 'low', 'Sugar alcohol', ARRAY['laxative effect at high doses']),
  ('E621', 'MSG', 'flavor_enhancer', 'moderate', 'Monosodium glutamate', ARRAY['headaches in sensitive individuals']),
  ('E950', 'Acesulfame K', 'sweetener', 'moderate', 'Artificial sweetener', ARRAY['insulin response concerns']),
  ('E951', 'Aspartame', 'sweetener', 'high', 'Artificial sweetener', ARRAY['phenylketonuria risk', 'possible carcinogen (IARC 2B)']),
  ('E952', 'Cyclamate', 'sweetener', 'high', 'Artificial sweetener', ARRAY['banned in US', 'bladder cancer concerns']),
  ('E955', 'Sucralose', 'sweetener', 'moderate', 'Artificial sweetener', ARRAY['gut microbiome disruption']),
  ('E960', 'Steviol Glycosides', 'sweetener', 'low', 'Natural sweetener from stevia', ARRAY[]::TEXT[]),
  ('E1442', 'Hydroxypropyl Distarch Phosphate', 'thickener', 'low', 'Modified starch', ARRAY[]::TEXT[])
ON CONFLICT (code) DO NOTHING;

-- User scan history
CREATE TABLE IF NOT EXISTS scan_history (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(100),       -- device ID or authenticated user ID
  barcode       VARCHAR(20),
  product_name  VARCHAR(500),
  health_score  INT,
  scan_type     VARCHAR(20),        -- 'barcode' or 'ocr'
  scanned_at    TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (barcode) REFERENCES products(barcode) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id, scanned_at DESC);
