-- Vendor Purchase Orders Tables
-- Links to vendors in common.vendors

-- Main vendor POs table
CREATE TABLE IF NOT EXISTS common.vendor_pos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT NOT NULL,
  vendor_id UUID REFERENCES common.vendors(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) DEFAULT 0,
  terms TEXT,
  quote_number TEXT,
  quote_references TEXT,
  ship_to_name TEXT DEFAULT 'AMP Quality Energy Services',
  ship_to_address TEXT DEFAULT '616 Church St. NE',
  ship_to_city TEXT DEFAULT 'Decatur',
  ship_to_state TEXT DEFAULT 'AL',
  ship_to_zip TEXT DEFAULT '35601',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'received', 'cancelled')),
  notes TEXT,
  authorized_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Vendor PO line items table
CREATE TABLE IF NOT EXISTS common.vendor_po_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES common.vendor_pos(id) ON DELETE CASCADE,
  item_number TEXT,
  quantity TEXT,
  description TEXT NOT NULL,
  unit_price TEXT,
  extended_price DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vendor_pos_vendor_id ON common.vendor_pos(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pos_po_number ON common.vendor_pos(po_number);
CREATE INDEX IF NOT EXISTS idx_vendor_pos_status ON common.vendor_pos(status);
CREATE INDEX IF NOT EXISTS idx_vendor_pos_date ON common.vendor_pos(date);
CREATE INDEX IF NOT EXISTS idx_vendor_po_items_po_id ON common.vendor_po_items(po_id);

-- Create sequence for PO numbers
CREATE SEQUENCE IF NOT EXISTS common.vendor_po_number_seq START WITH 1220;

-- Grant permissions
GRANT ALL ON common.vendor_pos TO authenticated;
GRANT ALL ON common.vendor_po_items TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE common.vendor_po_number_seq TO authenticated;

-- Comment on tables
COMMENT ON TABLE common.vendor_pos IS 'Vendor purchase orders';
COMMENT ON TABLE common.vendor_po_items IS 'Line items for vendor purchase orders';

