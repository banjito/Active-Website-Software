-- Add timestamp columns for report lifecycle events
-- Never drop existing columns; only add if missing

-- technical_reports: add approved_at, issued_at, sent_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neta_ops' AND table_name = 'technical_reports' AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE neta_ops.technical_reports
        ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neta_ops' AND table_name = 'technical_reports' AND column_name = 'issued_at'
    ) THEN
        ALTER TABLE neta_ops.technical_reports
        ADD COLUMN issued_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'neta_ops' AND table_name = 'technical_reports' AND column_name = 'sent_at'
    ) THEN
        ALTER TABLE neta_ops.technical_reports
        ADD COLUMN sent_at TIMESTAMPTZ;
    END IF;
END $$;


