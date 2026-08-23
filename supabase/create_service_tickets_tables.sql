-- ======================================================================
-- MÓDULO DE SERVICIOS: TABLAS DE BASE DE DATOS Y RLS
-- ======================================================================

-- 1. Tabla de cabecera de tickets de servicios (Parent Ticket)
CREATE TABLE IF NOT EXISTS public.service_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL, -- 'PULL' o 'ARRANQUE'
    service_type VARCHAR(100), -- p.ej. 'FALLA ELECTRICA'
    well_name VARCHAR(100) NOT NULL,
    campo VARCHAR(100),
    date_start DATE NOT NULL,
    date_end DATE,
    rig VARCHAR(50),
    technicians TEXT[], -- Array de técnicos de guardia
    spooler_band TEXT[], -- Array de spooler banding
    company VARCHAR(150) DEFAULT 'PETROQUIRIQUIRE S.A.',
    additional_comments TEXT,
    failure_cause TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id),
    signatures JSONB -- Firmas y nombres de revisores (UV, PQQ, Repsol)
);

-- 2. Tabla para reporte de operaciones hora a hora (Bitácora diaria)
-- Nota: Incluye 'report_date' para separar los registros de cada día (después de las 0:00 se inicia otra fecha)
CREATE TABLE IF NOT EXISTS public.service_ticket_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.service_tickets(id) ON DELETE CASCADE,
    report_date DATE NOT NULL, -- Fecha específica del reporte diario
    time_start TIME NOT NULL,
    time_end TIME NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Tabla para el desglose del equipo de fondo (Especial para PULL)
CREATE TABLE IF NOT EXISTS public.service_ticket_equipment_pull (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.service_tickets(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- 'PUMP', 'SEPARATOR', 'PROTECTOR', 'MOTOR', 'CABLE', 'VALVE', 'SENSOR'
    item_index INT DEFAULT 1, -- Para distinguir Pump 1, Pump 2, etc.
    manufacturer VARCHAR(150),
    series VARCHAR(100),
    stages INT,
    type VARCHAR(150),
    length DECIMAL(10,2),
    serial_number VARCHAR(100),
    rotation VARCHAR(100), -- 'GIRO LIBRE', 'TRABADO', etc.
    housing VARCHAR(100), -- 'NORMAL', etc.
    comments TEXT,
    status_condition VARCHAR(100), -- 'USADO', 'REPARABLE', 'CHATARRA'
    insulation_mohm DECIMAL(10,2),
    continuity_ohms DECIMAL(10,2),
    reel_number VARCHAR(100)
);

-- Habilitar Seguridad RLS
ALTER TABLE public.service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_equipment_pull ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para service_tickets
DROP POLICY IF EXISTS "Permitir lectura de tickets a usuarios autenticados" ON public.service_tickets;
CREATE POLICY "Permitir lectura de tickets a usuarios autenticados"
    ON public.service_tickets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserción de tickets a técnicos y administradores" ON public.service_tickets;
CREATE POLICY "Permitir inserción de tickets a técnicos y administradores"
    ON public.service_tickets FOR INSERT TO authenticated WITH CHECK (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor', 'servicios')
    );

DROP POLICY IF EXISTS "Permitir actualización de tickets propios o por admin" ON public.service_tickets;
CREATE POLICY "Permitir actualización de tickets propios o por admin"
    ON public.service_tickets FOR UPDATE TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor') OR created_by = auth.uid()
    );

DROP POLICY IF EXISTS "Permitir borrado de tickets propios o por admin" ON public.service_tickets;
CREATE POLICY "Permitir borrado de tickets propios o por admin"
    ON public.service_tickets FOR DELETE TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor') OR created_by = auth.uid()
    );

-- Políticas de RLS para service_ticket_operations
DROP POLICY IF EXISTS "Permitir lectura de operaciones a usuarios autenticados" ON public.service_ticket_operations;
CREATE POLICY "Permitir lectura de operaciones a usuarios autenticados"
    ON public.service_ticket_operations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir gestión de operaciones a técnicos y administradores" ON public.service_ticket_operations;
CREATE POLICY "Permitir gestión de operaciones a técnicos y administradores"
    ON public.service_ticket_operations FOR ALL TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor', 'servicios')
    );

-- Políticas de RLS para service_ticket_equipment_pull
DROP POLICY IF EXISTS "Permitir lectura de equipos a usuarios autenticados" ON public.service_ticket_equipment_pull;
CREATE POLICY "Permitir lectura de equipos a usuarios autenticados"
    ON public.service_ticket_equipment_pull FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir gestión de equipos a técnicos y administradores" ON public.service_ticket_equipment_pull;
CREATE POLICY "Permitir gestión de equipos a técnicos y administradores"
    ON public.service_ticket_equipment_pull FOR ALL TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor', 'servicios')
    );

-- 4. Tabla para documentos y soportes fotográficos del servicio
CREATE TABLE IF NOT EXISTS public.service_ticket_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.service_tickets(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.service_ticket_documents ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para service_ticket_documents
DROP POLICY IF EXISTS "Permitir lectura de documentos a usuarios autenticados" ON public.service_ticket_documents;
CREATE POLICY "Permitir lectura de documentos a usuarios autenticados"
    ON public.service_ticket_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir gestión de documentos a técnicos y administradores" ON public.service_ticket_documents;
CREATE POLICY "Permitir gestión de documentos a técnicos y administradores"
    ON public.service_ticket_documents FOR ALL TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor', 'servicios')
    );

-- 5. Tabla para metadatos diarios del servicio (Técnicos y Spoolers que cambian día a día)
CREATE TABLE IF NOT EXISTS public.service_ticket_daily_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.service_tickets(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    technicians TEXT[], -- Técnicos de guardia específicos para esta fecha
    spooler_band TEXT[], -- Personal de spooler específico para esta fecha
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(ticket_id, report_date)
);

ALTER TABLE public.service_ticket_daily_sheets ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para service_ticket_daily_sheets
DROP POLICY IF EXISTS "Permitir lectura de hojas diarias a usuarios autenticados" ON public.service_ticket_daily_sheets;
CREATE POLICY "Permitir lectura de hojas diarias a usuarios autenticados"
    ON public.service_ticket_daily_sheets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir gestión de hojas diarias a técnicos y administradores" ON public.service_ticket_daily_sheets;
CREATE POLICY "Permitir gestión de hojas diarias a técnicos y administradores"
    ON public.service_ticket_daily_sheets FOR ALL TO authenticated USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'cliente_view') IN ('admin', 'supervisor', 'servicios')
    );


