-- ─── VitalLens — schema baseline ─────────────────────────────
-- Generated 2026-09-10 from the live project via catalog introspection
-- (pg_class / pg_constraint / pg_indexes / pg_policies / pg_proc).
-- Applying this file to an empty Supabase project reproduces the schema
-- that the migrations in ./migrations/ were written against.
--
-- Order: extensions → sequences → tables → constraints → indexes → RLS → policies → functions

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_stat_statements;

create sequence if not exists public.products_id_seq;
create sequence if not exists public.scan_history_id_seq;

-- ── Tables ────────────────────────────────────────────────────
create table if not exists public.additive_classifications (
  code character varying(20) not null,
  name character varying(300) not null,
  category character varying(100),
  risk_level character varying(20) not null default 'low'::character varying,
  description text,
  concerns text[]
);

create table if not exists public.api_cost_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  route text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  has_image boolean not null default false,
  cost_usd numeric(10,6) not null default 0,
  meta jsonb default '{}'::jsonb,
  logged_at timestamp with time zone not null default now()
);

create table if not exists public.biomarker_scans (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  scan_type text not null,
  score integer,
  risk_tier text,
  result jsonb,
  scanned_at timestamp with time zone default now()
);

create table if not exists public.body_scans (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  scan_type text not null,
  overall_score integer,
  results jsonb,
  recommendations jsonb,
  risk_tier text,
  hr integer,
  hrv numeric,
  confidence integer,
  quality text,
  scanned_at timestamp with time zone default now()
);

create table if not exists public.chat_history (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  role text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.cycle_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  symptom text,
  flow text,
  logged_at timestamp with time zone not null default now(),
  date date not null default CURRENT_DATE
);

create table if not exists public.daily_nutrition (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  date date not null default CURRENT_DATE,
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  fiber numeric default 0
);

create table if not exists public.environment_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  location text,
  aqi integer,
  aqi_category text,
  pm2_5 numeric,
  pm10 numeric,
  ozone numeric,
  no2 numeric,
  uv_index numeric,
  water_risk text,
  water_assessment text,
  raw jsonb,
  logged_at timestamp with time zone default now()
);

create table if not exists public.exercise_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  type text not null,
  name text,
  duration integer,
  intensity text,
  calories integer,
  distance text,
  heart_rate integer,
  source text default 'manual'::text,
  strava_id bigint,
  date date default CURRENT_DATE,
  logged_at timestamp with time zone default now(),
  rpe integer,
  sets text,
  muscle_groups text,
  total_volume_kg numeric,
  reps integer,
  weight numeric
);

create table if not exists public.food_corrections (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  detected_label text not null,
  corrected_label text not null,
  detected_grams integer,
  corrected_grams integer,
  confidence double precision,
  meal_context text,
  created_at timestamp with time zone default now(),
  correction_count integer default 1
);

create table if not exists public.genomics_traits (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  trait text not null,
  genotype text,
  interpretation text,
  source text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.habits (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  date date default CURRENT_DATE,
  water_glasses integer default 0,
  smoking boolean default false,
  alcohol text default 'none'::text,
  caffeine text default 'moderate'::text,
  stress_level integer,
  mood text,
  notes text,
  steps integer
);

create table if not exists public.health_correlations (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  correlation_type text,
  description text,
  confidence numeric,
  data_window_days integer,
  actionable text,
  direction text,
  generated_at timestamp with time zone default now()
);

create table if not exists public.health_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  source_id uuid,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  event_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.health_insights (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  insight_type text,
  title text,
  body text,
  confidence numeric,
  data_sources text[],
  priority text default 'medium'::text,
  read boolean default false,
  generated_at timestamp with time zone default now()
);

create table if not exists public.health_predictions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  overall_trajectory text,
  trajectory_summary text,
  data_sufficiency text,
  trend_extrapolations jsonb,
  lab_predictions jsonb,
  intervention_ranking jsonb,
  minimum_data_needed text,
  generated_at timestamp with time zone default now()
);

create table if not exists public.health_profile (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  sex text,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  goal text,
  activity_level text,
  lifting_frequency text,
  custom_calories integer,
  custom_protein integer,
  tdee integer,
  bmr integer,
  target_calories integer,
  target_protein integer,
  target_carbs integer,
  target_fat integer,
  target_fiber integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  conditions text[],
  allergies text,
  medications_note text,
  goal_weight_kg numeric
);

create table if not exists public.hr_readings (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  hr integer not null,
  hrv numeric,
  confidence integer,
  quality text,
  recorded_at timestamp with time zone default now()
);

create table if not exists public.hygiene_scans (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  barcode text,
  product_name text,
  brand text,
  category text,
  ingredients text,
  concerns jsonb,
  safety_score integer,
  image_url text,
  scanned_at timestamp with time zone default now()
);

create table if not exists public.lab_results (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  panel_type text,
  markers jsonb not null,
  notes text,
  lab_name text,
  collected_at date,
  uploaded_at timestamp with time zone default now()
);

create table if not exists public.meal_memory (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  meal_hash text not null,
  meal_name text,
  foods jsonb,
  avg_calories integer,
  scan_count integer default 1,
  last_scanned_at timestamp with time zone default now()
);

create table if not exists public.meals (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  fiber numeric default 0,
  confidence numeric,
  image_url text,
  foods jsonb,
  health_rating integer,
  digestibility_score integer,
  logged_at timestamp with time zone default now()
);

create table if not exists public.medication_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  dose text,
  frequency text,
  started_at timestamp with time zone not null default now(),
  active boolean not null default true,
  notes text
);

create table if not exists public.portion_corrections (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  food_label text not null,
  original_grams integer,
  corrected_grams integer,
  correction_count integer default 1,
  avg_corrected_grams integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.practitioner_links (
  id uuid not null default gen_random_uuid(),
  practitioner_id uuid not null,
  client_id uuid not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.product_scans (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  barcode text,
  name text,
  brand text,
  health_score integer,
  rating text,
  nutrition jsonb,
  additives jsonb,
  scan_type text default 'barcode'::text,
  scanned_at timestamp with time zone default now()
);

create table if not exists public.products (
  id integer not null default nextval('products_id_seq'::regclass),
  barcode character varying(20) not null,
  name character varying(500),
  brand character varying(300),
  ingredients text,
  nutrition jsonb,
  additives jsonb,
  nutriscore character varying(1),
  nova_group integer,
  image_url character varying(1000),
  raw_response jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid not null,
  name text,
  age integer,
  gender text,
  height numeric,
  weight numeric,
  avatar text default '🧬'::text,
  goals text[],
  dosha text,
  health_score integer default 78,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  subscription_status text default 'free'::text,
  subscription_plan text default 'free'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_end timestamp with time zone,
  current_period_end timestamp with time zone,
  push_subscription jsonb,
  push_enabled boolean default false,
  date_of_birth date,
  onboarding_completed boolean not null default false,
  timezone text
);

create table if not exists public.scan_history (
  id integer not null default nextval('scan_history_id_seq'::regclass),
  user_id uuid not null,
  barcode character varying(20),
  product_name character varying(500),
  health_score integer,
  scan_type character varying(20),
  scanned_at timestamp with time zone default now()
);

create table if not exists public.sleep_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  hours numeric,
  quality text,
  bedtime time without time zone,
  wake_time time without time zone,
  source text default 'manual'::text,
  notes text,
  date date default CURRENT_DATE,
  logged_at timestamp with time zone default now(),
  sleep_latency_min integer,
  wakeups integer,
  dreams text,
  hrv_ms integer
);

create table if not exists public.stool_scans (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  bristol_type integer,
  color text,
  notes text,
  findings jsonb,
  scanned_at timestamp with time zone default now()
);

create table if not exists public.supplement_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  dose text,
  frequency text,
  notes text,
  active boolean default true,
  started_at timestamp with time zone default now(),
  category text default 'supplement'::text
);

create table if not exists public.tcm_profile (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  hot_count integer default 0,
  warm_count integer default 0,
  neutral_count integer default 0,
  cool_count integer default 0,
  cold_count integer default 0,
  damp_count integer default 0,
  dry_count integer default 0,
  moist_count integer default 0,
  sweet_count integer default 0,
  sour_count integer default 0,
  bitter_count integer default 0,
  pungent_count integer default 0,
  salty_count integer default 0,
  total_foods_analyzed integer default 0,
  constitution text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.usage_tracking (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  count integer default 0,
  window_start timestamp with time zone not null,
  window_type text not null,
  updated_at timestamp with time zone default now()
);

create table if not exists public.user_consents (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  document text not null,
  version text not null,
  accepted boolean not null default true,
  accepted_at timestamp with time zone not null default now(),
  user_agent text
);

create table if not exists public.user_goals (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  goals_text text,
  dietary_restrictions text,
  health_concerns text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.water_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  amount_ml integer not null,
  logged_at timestamp with time zone not null default now()
);

create table if not exists public.wearable_connections (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at bigint,
  athlete_id text,
  athlete_name text,
  athlete_avatar text,
  connected boolean default true,
  last_sync timestamp with time zone,
  token_expiry timestamp with time zone,
  connected_at timestamp with time zone
);

create table if not exists public.weekly_reports (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  week_of date,
  headline text,
  week_score integer,
  wins text[],
  gaps text[],
  top_correlation text,
  focus text,
  data_completeness integer,
  report_data jsonb,
  generated_at timestamp with time zone default now(),
  narrative jsonb,
  narrative_generated_at timestamp with time zone
);

create table if not exists public.weekly_scores (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  week_start date not null,
  score integer,
  date date
);

-- ── Constraints (primary keys, uniques, foreign keys, checks) ──
alter table public.additive_classifications add constraint additive_classifications_pkey primary key (code);
alter table public.api_cost_log add constraint api_cost_log_pkey primary key (id);
alter table public.api_cost_log add constraint api_cost_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.biomarker_scans add constraint biomarker_scans_pkey primary key (id);
alter table public.biomarker_scans add constraint biomarker_scans_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.body_scans add constraint body_scans_pkey primary key (id);
alter table public.chat_history add constraint chat_history_pkey primary key (id);
alter table public.cycle_log add constraint cycle_log_pkey primary key (id);
alter table public.cycle_log add constraint cycle_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.cycle_log add constraint cycle_log_event_type_check check (event_type = any (array['period_start','period_end','symptom']));
alter table public.cycle_log add constraint cycle_log_flow_check check (flow is null or flow = any (array['light','medium','heavy']));
alter table public.daily_nutrition add constraint daily_nutrition_pkey primary key (id);
alter table public.daily_nutrition add constraint daily_nutrition_user_id_date_key unique (user_id, date);
alter table public.environment_logs add constraint environment_logs_pkey primary key (id);
alter table public.environment_logs add constraint environment_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.exercise_log add constraint exercise_log_pkey primary key (id);
alter table public.food_corrections add constraint food_corrections_pkey primary key (id);
alter table public.food_corrections add constraint food_corrections_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.genomics_traits add constraint genomics_traits_pkey primary key (id);
alter table public.genomics_traits add constraint genomics_traits_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.habits add constraint habits_pkey primary key (id);
alter table public.habits add constraint habits_user_id_date_key unique (user_id, date);
alter table public.health_correlations add constraint health_correlations_pkey primary key (id);
alter table public.health_correlations add constraint health_correlations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_events add constraint health_events_pkey primary key (id);
alter table public.health_events add constraint health_events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_insights add constraint health_insights_pkey primary key (id);
alter table public.health_predictions add constraint health_predictions_pkey primary key (id);
alter table public.health_predictions add constraint health_predictions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_profile add constraint health_profile_pkey primary key (id);
alter table public.health_profile add constraint health_profile_user_id_key unique (user_id);
alter table public.health_profile add constraint health_profile_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.hr_readings add constraint hr_readings_pkey primary key (id);
alter table public.hygiene_scans add constraint hygiene_scans_pkey primary key (id);
alter table public.hygiene_scans add constraint hygiene_scans_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.lab_results add constraint lab_results_pkey primary key (id);
alter table public.meal_memory add constraint meal_memory_pkey primary key (id);
alter table public.meal_memory add constraint meal_memory_user_id_meal_hash_key unique (user_id, meal_hash);
alter table public.meal_memory add constraint meal_memory_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.meals add constraint meals_pkey primary key (id);
alter table public.medication_log add constraint medication_log_pkey primary key (id);
alter table public.medication_log add constraint medication_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.portion_corrections add constraint portion_corrections_pkey primary key (id);
alter table public.portion_corrections add constraint portion_corrections_user_id_food_label_key unique (user_id, food_label);
alter table public.portion_corrections add constraint portion_corrections_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.practitioner_links add constraint practitioner_links_pkey primary key (id);
alter table public.practitioner_links add constraint practitioner_links_practitioner_id_client_id_key unique (practitioner_id, client_id);
alter table public.practitioner_links add constraint practitioner_links_client_id_fkey foreign key (client_id) references auth.users(id) on delete cascade;
alter table public.practitioner_links add constraint practitioner_links_practitioner_id_fkey foreign key (practitioner_id) references auth.users(id) on delete cascade;
alter table public.practitioner_links add constraint practitioner_links_status_check check (status = any (array['pending','active','revoked']));
alter table public.product_scans add constraint product_scans_pkey primary key (id);
alter table public.products add constraint products_pkey primary key (id);
alter table public.products add constraint products_barcode_key unique (barcode);
alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.scan_history add constraint scan_history_pkey primary key (id);
alter table public.scan_history add constraint scan_history_barcode_fkey foreign key (barcode) references public.products(barcode) on delete set null;
alter table public.scan_history add constraint scan_history_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.sleep_log add constraint sleep_log_pkey primary key (id);
alter table public.stool_scans add constraint stool_scans_pkey primary key (id);
alter table public.supplement_logs add constraint supplement_logs_pkey primary key (id);
alter table public.supplement_logs add constraint supplement_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.tcm_profile add constraint tcm_profile_pkey primary key (id);
alter table public.tcm_profile add constraint tcm_profile_user_id_key unique (user_id);
alter table public.tcm_profile add constraint tcm_profile_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.usage_tracking add constraint usage_tracking_pkey primary key (id);
alter table public.usage_tracking add constraint usage_tracking_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_consents add constraint user_consents_pkey primary key (id);
alter table public.user_consents add constraint user_consents_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_consents add constraint user_consents_document_check check (document = any (array['terms_of_service','privacy_policy','health_data_processing','ai_processing']));
alter table public.user_goals add constraint user_goals_pkey primary key (id);
alter table public.user_goals add constraint user_goals_user_id_key unique (user_id);
alter table public.user_goals add constraint user_goals_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.water_log add constraint water_log_pkey primary key (id);
alter table public.water_log add constraint water_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.wearable_connections add constraint wearable_connections_pkey primary key (id);
alter table public.wearable_connections add constraint wearable_connections_user_id_provider_key unique (user_id, provider);
alter table public.weekly_reports add constraint weekly_reports_pkey primary key (id);
alter table public.weekly_reports add constraint weekly_reports_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.weekly_scores add constraint weekly_scores_pkey primary key (id);
alter table public.weekly_scores add constraint weekly_scores_user_id_week_start_key unique (user_id, week_start);
-- profile-keyed tables (cascade from profiles, which cascades from auth.users)
alter table public.body_scans add constraint body_scans_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.chat_history add constraint chat_history_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.daily_nutrition add constraint daily_nutrition_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.exercise_log add constraint exercise_log_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.habits add constraint habits_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.health_insights add constraint health_insights_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.hr_readings add constraint hr_readings_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.lab_results add constraint lab_results_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.meals add constraint meals_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.product_scans add constraint product_scans_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.sleep_log add constraint sleep_log_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.stool_scans add constraint stool_scans_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.wearable_connections add constraint wearable_connections_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.weekly_scores add constraint weekly_scores_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists api_cost_log_logged_at_idx on public.api_cost_log (logged_at desc);
create index if not exists api_cost_log_route_logged_at_idx on public.api_cost_log (route, logged_at desc);
create index if not exists api_cost_log_user_id_logged_at_idx on public.api_cost_log (user_id, logged_at desc);
create index if not exists api_cost_log_user_logged_idx on public.api_cost_log (user_id, logged_at);
create index if not exists biomarker_scans_user_scanned_idx on public.biomarker_scans (user_id, scanned_at desc);
create index if not exists idx_body_scans_user on public.body_scans (user_id, scanned_at desc);
create index if not exists idx_chat_user on public.chat_history (user_id, created_at);
create index if not exists cycle_log_user_date_idx on public.cycle_log (user_id, date desc);
create index if not exists daily_nutrition_user_date_idx on public.daily_nutrition (user_id, date);
create index if not exists environment_logs_user_logged_idx on public.environment_logs (user_id, logged_at desc);
create index if not exists exercise_log_user_logged_at_idx on public.exercise_log (user_id, logged_at desc);
create index if not exists idx_exercise_user on public.exercise_log (user_id, date desc);
create index if not exists food_corrections_user_id_created_at_idx on public.food_corrections (user_id, created_at desc);
create index if not exists genomics_traits_user_idx on public.genomics_traits (user_id);
create index if not exists habits_user_date_idx on public.habits (user_id, date desc);
create index if not exists health_correlations_user_gen_idx on public.health_correlations (user_id, generated_at desc);
create index if not exists health_events_embedding_idx on public.health_events using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists health_events_event_at_idx on public.health_events (user_id, event_at desc);
create index if not exists health_events_type_idx on public.health_events (user_id, event_type);
create index if not exists health_events_user_id_idx on public.health_events (user_id);
create index if not exists idx_insights_user on public.health_insights (user_id, generated_at desc);
create index if not exists health_predictions_user_gen_idx on public.health_predictions (user_id, generated_at desc);
create index if not exists hr_readings_user_id_idx on public.hr_readings (user_id);
create index if not exists hygiene_scans_user_scanned_idx on public.hygiene_scans (user_id, scanned_at desc);
create index if not exists idx_lab_results_user on public.lab_results (user_id, collected_at desc);
create index if not exists lab_results_user_collected_idx on public.lab_results (user_id, collected_at desc);
create index if not exists idx_meals_user on public.meals (user_id, logged_at desc);
create index if not exists meals_user_logged_at_idx on public.meals (user_id, logged_at desc);
create index if not exists medication_log_user_active_idx on public.medication_log (user_id, active);
create index if not exists practitioner_links_client_id_idx on public.practitioner_links (client_id);
create index if not exists idx_product_scans_user on public.product_scans (user_id, scanned_at desc);
create index if not exists idx_products_barcode on public.products (barcode);
create index if not exists idx_scan_history_user on public.scan_history (user_id, scanned_at desc);
create index if not exists scan_history_barcode_idx on public.scan_history (barcode);
create index if not exists sleep_log_user_id_idx on public.sleep_log (user_id);
create index if not exists stool_scans_user_id_idx on public.stool_scans (user_id);
create index if not exists supplement_logs_user_active_idx on public.supplement_logs (user_id, active);
create index if not exists usage_tracking_user_feature on public.usage_tracking (user_id, feature, window_start);
create unique index if not exists usage_tracking_user_feature_window_uidx on public.usage_tracking (user_id, feature, window_start);
create index if not exists idx_user_consents_user on public.user_consents (user_id);
create unique index if not exists uq_user_consents_latest on public.user_consents (user_id, document, version);
create index if not exists water_log_user_logged_at_idx on public.water_log (user_id, logged_at desc);
create index if not exists weekly_reports_user_week_idx on public.weekly_reports (user_id, week_of desc);

-- ── Row-level security ────────────────────────────────────────
alter table public.additive_classifications enable row level security;
alter table public.api_cost_log enable row level security;
alter table public.biomarker_scans enable row level security;
alter table public.body_scans enable row level security;
alter table public.chat_history enable row level security;
alter table public.cycle_log enable row level security;
alter table public.daily_nutrition enable row level security;
alter table public.environment_logs enable row level security;
alter table public.exercise_log enable row level security;
alter table public.food_corrections enable row level security;
alter table public.genomics_traits enable row level security;
alter table public.habits enable row level security;
alter table public.health_correlations enable row level security;
alter table public.health_events enable row level security;
alter table public.health_insights enable row level security;
alter table public.health_predictions enable row level security;
alter table public.health_profile enable row level security;
alter table public.hr_readings enable row level security;
alter table public.hygiene_scans enable row level security;
alter table public.lab_results enable row level security;
alter table public.meal_memory enable row level security;
alter table public.meals enable row level security;
alter table public.medication_log enable row level security;
alter table public.portion_corrections enable row level security;
alter table public.practitioner_links enable row level security;
alter table public.product_scans enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.scan_history enable row level security;
alter table public.sleep_log enable row level security;
alter table public.stool_scans enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.tcm_profile enable row level security;
alter table public.usage_tracking enable row level security;
alter table public.user_consents enable row level security;
alter table public.user_goals enable row level security;
alter table public.water_log enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.weekly_scores enable row level security;

-- ── Policies (owner-only; auth.uid() evaluated once per query) ──
create policy public_read on public.additive_classifications for select using (true);
create policy api_cost_log_owner on public.api_cost_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy biomarker_scans_owner on public.biomarker_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.body_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.chat_history for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cycle own select" on public.cycle_log for select using ((select auth.uid()) = user_id);
create policy "cycle own insert" on public.cycle_log for insert with check ((select auth.uid()) = user_id);
create policy "cycle own update" on public.cycle_log for update using ((select auth.uid()) = user_id);
create policy "cycle own delete" on public.cycle_log for delete using ((select auth.uid()) = user_id);
create policy user_isolation on public.daily_nutrition for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy environment_logs_owner on public.environment_logs for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.exercise_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy food_corrections_owner on public.food_corrections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "geno own select" on public.genomics_traits for select using ((select auth.uid()) = user_id);
create policy "geno own insert" on public.genomics_traits for insert with check ((select auth.uid()) = user_id);
create policy "geno own update" on public.genomics_traits for update using ((select auth.uid()) = user_id);
create policy "geno own delete" on public.genomics_traits for delete using ((select auth.uid()) = user_id);
create policy user_isolation on public.habits for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_correlations_owner on public.health_correlations for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can read own health events" on public.health_events for select using ((select auth.uid()) = user_id);
create policy "Users can insert own health events" on public.health_events for insert with check ((select auth.uid()) = user_id);
create policy "Users can delete own health events" on public.health_events for delete using ((select auth.uid()) = user_id);
create policy user_isolation on public.health_insights for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_predictions_owner on public.health_predictions for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_profile_owner on public.health_profile for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.hr_readings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.hygiene_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.lab_results for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meal_memory_owner on public.meal_memory for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.meals for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meds own select" on public.medication_log for select using ((select auth.uid()) = user_id);
create policy "meds own insert" on public.medication_log for insert with check ((select auth.uid()) = user_id);
create policy "meds own update" on public.medication_log for update using ((select auth.uid()) = user_id);
create policy "meds own delete" on public.medication_log for delete using ((select auth.uid()) = user_id);
create policy portion_corrections_owner on public.portion_corrections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy practitioner_links_select on public.practitioner_links for select using ((select auth.uid()) = practitioner_id or (select auth.uid()) = client_id);
create policy practitioner_links_insert on public.practitioner_links for insert with check ((select auth.uid()) = client_id);
create policy practitioner_links_update on public.practitioner_links for update using ((select auth.uid()) = practitioner_id or (select auth.uid()) = client_id);
create policy user_isolation on public.product_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy public_read on public.products for select using (true);
create policy authenticated_insert on public.products for insert with check ((select auth.uid()) is not null);
create policy user_isolation on public.profiles for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_isolation on public.scan_history for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.sleep_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.stool_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy supplement_logs_owner on public.supplement_logs for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tcm_profile_owner on public.tcm_profile for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.usage_tracking for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own consents select" on public.user_consents for select using (auth.uid() = user_id);
create policy "own consents insert" on public.user_consents for insert with check (auth.uid() = user_id);
create policy user_goals_owner on public.user_goals for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "water own" on public.water_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.wearable_connections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy weekly_reports_owner on public.weekly_reports for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation on public.weekly_scores for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── Functions ─────────────────────────────────────────────────
create or replace function public.get_user_id_by_email(p_email text)
returns uuid language sql security definer set search_path to '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated, public;
grant  execute on function public.get_user_id_by_email(text) to service_role;

create or replace function public.increment_daily_nutrition(p_user_id uuid, p_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_fiber numeric)
returns void language plpgsql set search_path to 'public' as $$
begin
  insert into daily_nutrition (user_id, date, calories, protein, carbs, fat, fiber)
  values (p_user_id, p_date, p_calories, p_protein, p_carbs, p_fat, p_fiber)
  on conflict (user_id, date) do update set
    calories = daily_nutrition.calories + excluded.calories,
    protein  = daily_nutrition.protein  + excluded.protein,
    carbs    = daily_nutrition.carbs    + excluded.carbs,
    fat      = daily_nutrition.fat      + excluded.fat,
    fiber    = daily_nutrition.fiber    + excluded.fiber;
end;
$$;

create or replace function public.match_health_events(query_embedding vector, match_user_id uuid, match_count integer default 10, match_threshold double precision default 0.3, days_back integer default 90)
returns table(id uuid, event_type text, description text, metadata jsonb, event_at timestamp with time zone, similarity double precision)
language plpgsql set search_path to 'public', 'extensions' as $$
begin
  return query
  select he.id, he.event_type, he.description, he.metadata, he.event_at,
         1 - (he.embedding <=> query_embedding) as similarity
  from health_events he
  where he.user_id = match_user_id
    and he.embedding is not null
    and (days_back = 0 or he.event_at >= now() - (days_back || ' days')::interval)
    and 1 - (he.embedding <=> query_embedding) > match_threshold
  order by he.embedding <=> query_embedding
  limit match_count;
end;
$$;

create or replace function public.sum_ai_spend(p_since timestamp with time zone, p_user uuid default null)
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.api_cost_log
  where logged_at >= p_since and (p_user is null or user_id = p_user);
$$;
revoke execute on function public.sum_ai_spend(timestamptz, uuid) from anon, authenticated, public;
grant  execute on function public.sum_ai_spend(timestamptz, uuid) to service_role;

create or replace function public.increment_usage(p_user uuid, p_feature text, p_window_start timestamp with time zone, p_window_type text, p_limit integer)
returns table(allowed boolean, current_count integer)
language plpgsql set search_path to 'public' as $$
declare v_count int;
begin
  insert into public.usage_tracking (user_id, feature, count, window_start, window_type)
  values (p_user, p_feature, 1, p_window_start, p_window_type)
  on conflict (user_id, feature, window_start) do update
    set count = usage_tracking.count + 1, updated_at = now()
    where usage_tracking.count < p_limit
  returning usage_tracking.count into v_count;
  if v_count is null then
    select ut.count into v_count from public.usage_tracking ut
      where ut.user_id = p_user and ut.feature = p_feature and ut.window_start = p_window_start;
    return query select false, coalesce(v_count, p_limit);
  else
    return query select true, v_count;
  end if;
end $$;
revoke execute on function public.increment_usage(uuid, text, timestamptz, text, int) from anon, authenticated, public;
grant  execute on function public.increment_usage(uuid, text, timestamptz, text, int) to service_role;
