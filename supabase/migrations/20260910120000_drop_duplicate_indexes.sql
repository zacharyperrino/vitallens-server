-- Remove indexes that exactly duplicate another index on the same columns
-- (found by comparing pg_get_indexdef signatures). Each kept index is either
-- the unique/constraint index or the pre-existing one; write amplification
-- on hot tables halves with no read-path change. Applied live 2026-09-10.
drop index if exists public.daily_nutrition_user_date_idx;   -- dup of unique daily_nutrition_user_id_date_key
drop index if exists public.lab_results_user_collected_idx;  -- dup of idx_lab_results_user
drop index if exists public.meals_user_logged_at_idx;        -- dup of idx_meals_user
drop index if exists public.idx_products_barcode;            -- dup of unique products_barcode_key
drop index if exists public.usage_tracking_user_feature;     -- dup of unique usage_tracking_user_feature_window_uidx (needed for ON CONFLICT)
