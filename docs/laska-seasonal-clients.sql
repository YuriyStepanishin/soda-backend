ALTER TABLE public.sales_routes
  ADD COLUMN IF NOT EXISTS is_seasonal boolean NOT NULL DEFAULT false;
