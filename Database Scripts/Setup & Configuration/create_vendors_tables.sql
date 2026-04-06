-- Vendors Management Tables
-- Created for Office Administration Portal
-- Uses common schema

-- Main vendors table
CREATE TABLE IF NOT EXISTS common.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  category TEXT[] DEFAULT '{}',
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'USA',
  phone TEXT,
  email TEXT,
  website TEXT,
  rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Vendor contacts table
CREATE TABLE IF NOT EXISTS common.vendor_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES common.vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vendor contracts table
CREATE TABLE IF NOT EXISTS common.vendor_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES common.vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  value DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'terminated', 'renewal')),
  renewal_terms TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vendors_company_name ON common.vendors(company_name);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON common.vendors(active);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON common.vendors USING GIN(category);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor_id ON common.vendor_contacts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contracts_vendor_id ON common.vendor_contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contracts_status ON common.vendor_contracts(status);

-- Grant permissions
GRANT ALL ON common.vendors TO authenticated;
GRANT ALL ON common.vendor_contacts TO authenticated;
GRANT ALL ON common.vendor_contracts TO authenticated;

-- Comment on tables
COMMENT ON TABLE common.vendors IS 'Main vendor/supplier information';
COMMENT ON TABLE common.vendor_contacts IS 'Contact persons for each vendor';
COMMENT ON TABLE common.vendor_contracts IS 'Contracts and agreements with vendors';
