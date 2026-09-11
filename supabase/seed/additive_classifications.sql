-- Reference data: additive_classifications (28 rows, exported from the live
-- project 2026-09-10). Not user data. Re-run after schema-baseline.sql on a
-- fresh project — additiveAnalyzer.js returns 'unknown' for every additive
-- without it. Idempotent.
insert into public.additive_classifications (code, name, category, risk_level, description, concerns) values
  ('E102', 'Tartrazine', 'colorant', 'high', 'Yellow azo dye', array['hyperactivity','allergic reactions']::text[]),
  ('E110', 'Sunset Yellow', 'colorant', 'high', 'Orange-yellow azo dye', array['hyperactivity','allergic reactions']::text[]),
  ('E120', 'Cochineal', 'colorant', 'moderate', 'Red dye from insects', array['allergic reactions']::text[]),
  ('E122', 'Azorubine', 'colorant', 'high', 'Red azo dye', array['hyperactivity','allergic reactions']::text[]),
  ('E124', 'Ponceau 4R', 'colorant', 'high', 'Red azo dye', array['hyperactivity','allergic reactions']::text[]),
  ('E129', 'Allura Red', 'colorant', 'high', 'Red azo dye', array['hyperactivity','allergic reactions']::text[]),
  ('E131', 'Patent Blue V', 'colorant', 'moderate', 'Blue synthetic dye', array['allergic reactions']::text[]),
  ('E133', 'Brilliant Blue', 'colorant', 'low', 'Blue synthetic dye', array['mild sensitivity']::text[]),
  ('E1442', 'Hydroxypropyl Distarch Phosphate', 'thickener', 'low', 'Modified starch', '{}'::text[]),
  ('E150d', 'Sulphite Ammonia Caramel', 'colorant', 'moderate', 'Dark caramel color', array['potential carcinogen 4-MEI']::text[]),
  ('E171', 'Titanium Dioxide', 'colorant', 'high', 'White pigment', array['genotoxicity concerns','banned in EU for food']::text[]),
  ('E210', 'Benzoic Acid', 'preservative', 'moderate', 'Antimicrobial preservative', array['hyperactivity','asthma']::text[]),
  ('E211', 'Sodium Benzoate', 'preservative', 'moderate', 'Common preservative', array['hyperactivity','benzene formation with vitamin C']::text[]),
  ('E220', 'Sulphur Dioxide', 'preservative', 'moderate', 'Antioxidant preservative', array['asthma','allergic reactions']::text[]),
  ('E249', 'Potassium Nitrite', 'preservative', 'high', 'Curing agent', array['nitrosamine formation','potential carcinogen']::text[]),
  ('E250', 'Sodium Nitrite', 'preservative', 'high', 'Curing agent for meats', array['nitrosamine formation','potential carcinogen']::text[]),
  ('E251', 'Sodium Nitrate', 'preservative', 'high', 'Preservative in cured meats', array['nitrosamine formation','potential carcinogen']::text[]),
  ('E320', 'BHA', 'antioxidant', 'high', 'Butylated hydroxyanisole', array['endocrine disruptor','possible carcinogen']::text[]),
  ('E321', 'BHT', 'antioxidant', 'moderate', 'Butylated hydroxytoluene', array['endocrine disruptor']::text[]),
  ('E330', 'Citric Acid', 'acidity regulator', 'low', 'Natural acid found in citrus', '{}'::text[]),
  ('E407', 'Carrageenan', 'thickener', 'moderate', 'Seaweed extract', array['gastrointestinal inflammation']::text[]),
  ('E420', 'Sorbitol', 'sweetener', 'low', 'Sugar alcohol', array['laxative effect at high doses']::text[]),
  ('E621', 'MSG', 'flavor_enhancer', 'moderate', 'Monosodium glutamate', array['headaches in sensitive individuals']::text[]),
  ('E950', 'Acesulfame K', 'sweetener', 'moderate', 'Artificial sweetener', array['insulin response concerns']::text[]),
  ('E951', 'Aspartame', 'sweetener', 'high', 'Artificial sweetener', array['phenylketonuria risk','possible carcinogen (IARC 2B)']::text[]),
  ('E952', 'Cyclamate', 'sweetener', 'high', 'Artificial sweetener', array['banned in US','bladder cancer concerns']::text[]),
  ('E955', 'Sucralose', 'sweetener', 'moderate', 'Artificial sweetener', array['gut microbiome disruption']::text[]),
  ('E960', 'Steviol Glycosides', 'sweetener', 'low', 'Natural sweetener from stevia', '{}'::text[])
on conflict (code) do update set
  name = excluded.name, category = excluded.category, risk_level = excluded.risk_level,
  description = excluded.description, concerns = excluded.concerns;
