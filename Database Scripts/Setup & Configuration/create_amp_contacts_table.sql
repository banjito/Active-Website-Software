-- ============================================================================
-- AMP Internal Phone List (AMP Contacts) Table
-- ============================================================================
-- Stores the internal phone list for quick access from the portal and
-- editing via Office/HR admin. Run in Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS common.amp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_phone VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(500) NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE common.amp_contacts IS 'AMP internal phone list; editable by HR/Office admin, viewable by all authenticated users';

CREATE INDEX IF NOT EXISTS idx_amp_contacts_display_order ON common.amp_contacts(display_order);

ALTER TABLE common.amp_contacts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Authenticated can view amp_contacts" ON common.amp_contacts
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only HR Rep, Office Admin, Admin, Super Admin can insert/update/delete
CREATE POLICY "HR and Office admins can manage amp_contacts" ON common.amp_contacts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM common.profiles
            WHERE id = auth.uid()
            AND role IN ('HR Rep', 'Office Admin', 'Admin', 'Super Admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM common.profiles
            WHERE id = auth.uid()
            AND role IN ('HR Rep', 'Office Admin', 'Admin', 'Super Admin')
        )
    );

-- Reuse common.update_updated_at_column if it exists; otherwise create trigger function
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'common' AND p.proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION common.update_updated_at_column()
        RETURNS TRIGGER AS $fn$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql;
    END IF;
END $$;

DROP TRIGGER IF EXISTS amp_contacts_updated_at ON common.amp_contacts;
CREATE TRIGGER amp_contacts_updated_at
    BEFORE UPDATE ON common.amp_contacts
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

GRANT SELECT ON common.amp_contacts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON common.amp_contacts TO authenticated;

-- ============================================================================
-- Seed data (AMP Phone List revised 01/09/2026) - only when table is empty
-- ============================================================================
INSERT INTO common.amp_contacts (work_phone, name, email, role, display_order)
SELECT * FROM (VALUES
('256-527-4255', 'Brian Rodgers', 'brian.rodgers@ampqes.com', 'Owner & Chief Executive Officer, NETA 4', 1),
('256-476-1221', 'Greg Smith', 'greg.smith@ampqes.com', 'President & Chief Operating Officer', 2),
('256-642-0965', 'Anthony Masters', 'anthony.masters@ampqes.com', 'Director of Field Services', 3),
('256-227-5339', 'John Lyons', 'john.lyons@ampqes.com', 'Director of Business Development', 4),
('256-758-2177', 'Jack Lyons', 'jack.lyons@ampqes.com', 'CEO Assistant & Marketing Coordinator', 5),
('256-227-5835', 'Michael Bland', 'michael.bland@ampqes.com', 'Project Manager - Decatur', 6),
('256-616-7562', 'Dionne Tubby', 'dionne.tubby@ampqes.com', 'Director of Human Resources', 7),
('256-616-2236', 'Jackie Hinz', 'jackie.hinz@ampqes.com', 'Manager of Finance & Administration', 8),
('256-280-6110', 'Kelly Lawton', 'kelly.lawton@ampqes.com', 'Office Administration Specialist', 9),
('938-230-8541', 'Wes Woolf', 'wes.woolf@ampqes.com', 'Scavenger Equipment Sales', 10),
('256-476-3792', 'John Chambers', 'john.chambers@ampqes.com', 'Systems Architect', 11),
('256-476-5713', 'Ethan Thoenes', 'ethan.thoenes@ampqes.com', 'Electrical Engineer, EIT, NETA 3', 12),
('256-479-8360', 'Liam Laidlaw', 'liam.laidlaw@ampqes.com', 'Estimator & Engineer Level I', 13),
('256-476-3040', 'Greg Pellerito', 'greg.pellerito@ampqes.com', 'Project Manager Atlanta', 14),
('256-479-5090', 'Ryan Marthaler', 'ryan.marthaler@ampqes.com', 'Lead Field Technician NETA 3 Georgia', 15),
('938-230-8540', 'Chad Woodard', 'chad.woodard@ampqes.com', 'Lead Field Technician NETA 3 Georgia', 16),
('404-955-9508', 'Gustavo Friere', 'gustavo.freire@ampqes.com', 'Field Technician NETA 2 Georgia', 17),
('615-974-1595', 'Zechariah Freeborn', 'zechariah.freeborn@ampqes.com', 'Lead Field Technician Tennessee', 18),
('256-758-0188', 'Caleb Hipp', 'caleb.hipp@ampqes.com', 'Lead Field Technician North AL', 19),
('256-476-3973', 'Graham Nelson', 'graham.nelson@ampqes.com', 'Field Technician North AL', 20),
('256-479-5267', 'Jerry Burton', 'jerry.burton@ampqes.com', 'Field Technician North AL', 21),
('256-476-1897', 'Alonso Avalos', 'alonso.avalos@ampqes.com', 'Field Technician North AL', 22),
('256-476-1174', 'Jose Marquez', 'jose.marquez@ampqes.com', 'Field Technician Georgia', 23),
('256-224-8507', 'Alejandro Jaimes', 'alejandro.jaimes@ampqes.com', 'Field Technician North AL', 24),
('256-476-6437', 'Marcos Palacios', 'marcos.palacios@ampqes.com', 'Field Technician Georgia', 25),
('256-556-1262', 'Mason Motes', 'mason.motes@ampqes.com', 'Field Technician North AL', 26),
('470-606-7984', 'Josh Palacios', 'josh.palacios@ampqes.com', 'Field Technician Georgia', 27),
('256-616-6336', 'Armadillo', 'sales@armadillosafe.com', 'Rings to Kelly''s Office Phone', 28),
('256-616-6398', 'Scavenger - Wes', 'sales@scavenger.com', 'Equipment Sales', 29),
('815-479-0119', 'Matt Prombo', 'matt.prombo@ampqes.com', 'Director-Government Division', 30),
('770-202-0010', 'Atlanta Office', 'atlanta.office@ampqes.com', '', 31),
('256-513-8255', 'North AL Office', 'north.office@ampqes.com', '', 32),
('629-213-4855', 'Tennessee Office', 'north.office@ampqes.com', '', 33)
) AS v(work_phone, name, email, role, display_order)
WHERE (SELECT COUNT(*) FROM common.amp_contacts) = 0;
