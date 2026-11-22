CREATE TABLE IF NOT EXISTS public.laska_photo_reports (
  id uuid PRIMARY KEY,
  created_by text NOT NULL,
  report_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  department text NOT NULL,
  agent_name text NOT NULL,
  store_code text NOT NULL,
  store_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('merchandising', 'equipment', 'other')),
  comment text NOT NULL CHECK (length(comment) <= 1000),
  photos jsonb NOT NULL CHECK (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS laska_photo_reports_date_idx
  ON public.laska_photo_reports (report_date DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS laska_photo_reports_agent_date_idx
  ON public.laska_photo_reports (lower(btrim(agent_name)), report_date DESC);

CREATE INDEX IF NOT EXISTS laska_photo_reports_department_date_idx
  ON public.laska_photo_reports (department, report_date DESC);

-- Existing databases: update the photo count constraint to 5 (applied to LASKA Neon).
