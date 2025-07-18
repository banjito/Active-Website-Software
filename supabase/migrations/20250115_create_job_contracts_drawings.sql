-- Create job_contracts table
CREATE TABLE IF NOT EXISTS neta_ops.job_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('main', 'subcontract', 'amendment', 'change_order')),
    file_url TEXT NOT NULL,
    uploaded_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),
    value NUMERIC,
    start_date DATE,
    end_date DATE,
    description TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create job_drawings table
CREATE TABLE IF NOT EXISTS neta_ops.job_drawings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    last_modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'revision_needed')),
    description TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_job_contracts_job_id ON neta_ops.job_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_status ON neta_ops.job_contracts(status);
CREATE INDEX IF NOT EXISTS idx_job_contracts_type ON neta_ops.job_contracts(type);

CREATE INDEX IF NOT EXISTS idx_job_drawings_job_id ON neta_ops.job_drawings(job_id);
CREATE INDEX IF NOT EXISTS idx_job_drawings_status ON neta_ops.job_drawings(status);
CREATE INDEX IF NOT EXISTS idx_job_drawings_version ON neta_ops.job_drawings(job_id, version);

-- Enable Row Level Security
ALTER TABLE neta_ops.job_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.job_drawings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for job_contracts
CREATE POLICY "Users can view contracts for jobs they have access to" ON neta_ops.job_contracts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_contracts.job_id
            AND (
                j.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM neta_ops.job_assignments ja
                    WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can insert contracts for jobs they have access to" ON neta_ops.job_contracts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_contracts.job_id
            AND (
                j.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM neta_ops.job_assignments ja
                    WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update contracts they uploaded" ON neta_ops.job_contracts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete contracts they uploaded" ON neta_ops.job_contracts
    FOR DELETE USING (user_id = auth.uid());

-- Create RLS policies for job_drawings
CREATE POLICY "Users can view drawings for jobs they have access to" ON neta_ops.job_drawings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_drawings.job_id
            AND (
                j.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM neta_ops.job_assignments ja
                    WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can insert drawings for jobs they have access to" ON neta_ops.job_drawings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_drawings.job_id
            AND (
                j.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM neta_ops.job_assignments ja
                    WHERE ja.job_id = j.id AND ja.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update drawings they uploaded" ON neta_ops.job_drawings
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete drawings they uploaded" ON neta_ops.job_drawings
    FOR DELETE USING (user_id = auth.uid());

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_job_contracts_updated_at BEFORE UPDATE ON neta_ops.job_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_drawings_updated_at BEFORE UPDATE ON neta_ops.job_drawings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 