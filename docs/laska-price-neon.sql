CREATE TABLE IF NOT EXISTS public.laska_price_versions (
  price_date date PRIMARY KEY,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.laska_price_items (
  price_date date NOT NULL REFERENCES public.laska_price_versions(price_date),
  source_row integer NOT NULL CHECK (source_row > 0),
  article text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  unit text NOT NULL,
  section_path text[] NOT NULL,
  purchase_price numeric,
  base_price numeric,
  PRIMARY KEY (price_date, source_row)
);
