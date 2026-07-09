-- Tabla para tickets enviados desde Campo a Administración
-- Ejecutar en Supabase SQL editor si se desea crear la tabla

CREATE TABLE IF NOT EXISTS public.field_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_key text,
  subject text NOT NULL,
  message text NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  submitted_by_email text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text,
  status text NOT NULL DEFAULT 'open'
);

ALTER TABLE public.field_tickets
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Indice para consultas por usuario o jornada
CREATE INDEX IF NOT EXISTS idx_field_tickets_user ON public.field_tickets(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_field_tickets_journey ON public.field_tickets(journey_key);

INSERT INTO storage.buckets (id, name, public)
VALUES ('field-ticket-attachments', 'field-ticket-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated field ticket attachment uploads'
  ) THEN
    CREATE POLICY "Allow authenticated field ticket attachment uploads"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'field-ticket-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated field ticket attachment reads'
  ) THEN
    CREATE POLICY "Allow authenticated field ticket attachment reads"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'field-ticket-attachments');
  END IF;
END $$;

-- Recomendacion: añadir políticas RLS para controlar quien puede ver/editar tickets.
