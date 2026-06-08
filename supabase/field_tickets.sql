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
  source text,
  status text NOT NULL DEFAULT 'open'
);

-- Indice para consultas por usuario o jornada
CREATE INDEX IF NOT EXISTS idx_field_tickets_user ON public.field_tickets(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_field_tickets_journey ON public.field_tickets(journey_key);

-- Recomendacion: añadir políticas RLS para controlar quien puede ver/editar tickets.
