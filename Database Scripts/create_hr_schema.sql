-- Create HR schema for Frappe HR-style HRMS system
-- This schema will contain all tables for the HR portal

-- Create the hr schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS hr;

-- Enable RLS for all tables in hr schema
ALTER DEFAULT PRIVILEGES IN SCHEMA hr GRANT ALL ON TABLES TO authenticated;

-- Employees table (linked to auth.users)
CREATE TABLE IF NOT EXISTS hr.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  date_of_joining DATE NOT NULL,
  designation TEXT,
  department TEXT,
  branch TEXT,
  company TEXT,
  employee_type TEXT CHECK (employee_type IN ('Regular', 'Contract', 'Intern', 'Temporary')),
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Left')),
  reporting_manager_id UUID REFERENCES hr.employees(id),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',
  zip_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Leave Types table
CREATE TABLE IF NOT EXISTS hr.leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  max_days INTEGER NOT NULL,
  allow_encashment BOOLEAN DEFAULT false,
  is_carry_forward BOOLEAN DEFAULT false,
  is_optional_leave BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Leave Applications table
CREATE TABLE IF NOT EXISTS hr.leave_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  leave_type_id UUID REFERENCES hr.leave_types(id) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  half_day BOOLEAN DEFAULT false,
  half_day_date DATE,
  total_leave_days DECIMAL(5, 2) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Approved', 'Rejected', 'Cancelled')),
  approved_by UUID REFERENCES hr.employees(id),
  approved_on TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Leave Allocations table
CREATE TABLE IF NOT EXISTS hr.leave_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  leave_type_id UUID REFERENCES hr.leave_types(id) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  allocated_leaves DECIMAL(5, 2) NOT NULL,
  used_leaves DECIMAL(5, 2) DEFAULT 0,
  balance_leaves DECIMAL(5, 2) GENERATED ALWAYS AS (allocated_leaves - used_leaves) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(employee_id, leave_type_id, from_date, to_date)
);

-- Attendance table
CREATE TABLE IF NOT EXISTS hr.attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day', 'On Leave', 'Work From Home', 'Holiday')),
  check_in TIME,
  check_out TIME,
  working_hours DECIMAL(5, 2),
  late_entry BOOLEAN DEFAULT false,
  early_exit BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(employee_id, attendance_date)
);

-- Attendance Requests table
CREATE TABLE IF NOT EXISTS hr.attendance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  attendance_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Approved', 'Rejected', 'Cancelled')),
  approved_by UUID REFERENCES hr.employees(id),
  approved_on TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Employee Checkins table
CREATE TABLE IF NOT EXISTS hr.employee_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  log_type TEXT NOT NULL CHECK (log_type IN ('IN', 'OUT')),
  time TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  device_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Expense Claims table
CREATE TABLE IF NOT EXISTS hr.expense_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  expense_claim_number TEXT UNIQUE NOT NULL,
  posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_claimed_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_sanctioned_amount DECIMAL(10, 2),
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Paid')),
  company TEXT,
  expense_approver UUID REFERENCES hr.employees(id),
  approved_on TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Expense Claim Items table
CREATE TABLE IF NOT EXISTS hr.expense_claim_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_claim_id UUID REFERENCES hr.expense_claims(id) ON DELETE CASCADE NOT NULL,
  expense_date DATE NOT NULL,
  expense_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  cost_center TEXT,
  project TEXT,
  billable BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Employee Advances table
CREATE TABLE IF NOT EXISTS hr.employee_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  advance_amount DECIMAL(10, 2) NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT DEFAULT 'Requested' CHECK (status IN ('Requested', 'Approved', 'Rejected', 'Paid', 'Repaid')),
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES hr.employees(id),
  approved_on TIMESTAMP WITH TIME ZONE,
  paid_on TIMESTAMP WITH TIME ZONE,
  repayment_date DATE,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Salary Slips table
CREATE TABLE IF NOT EXISTS hr.salary_slips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES hr.employees(id) ON DELETE CASCADE NOT NULL,
  salary_slip_number TEXT UNIQUE NOT NULL,
  salary_month DATE NOT NULL,
  gross_pay DECIMAL(10, 2) NOT NULL,
  total_deduction DECIMAL(10, 2) DEFAULT 0,
  net_pay DECIMAL(10, 2) GENERATED ALWAYS AS (gross_pay - total_deduction) STORED,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Paid')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(employee_id, salary_month)
);

-- Holidays table
CREATE TABLE IF NOT EXISTS hr.holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT NOT NULL,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON hr.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON hr.employees(status);
CREATE INDEX IF NOT EXISTS idx_leave_applications_employee ON hr.leave_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON hr.leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON hr.attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_expense_claims_employee ON hr.expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON hr.expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee ON hr.employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_employee ON hr.salary_slips(employee_id);

-- Enable RLS on all tables
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.leave_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.employee_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.expense_claim_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.salary_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Employees can view their own data, HR can view all
CREATE POLICY employees_select_own ON hr.employees
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY employees_select_all ON hr.employees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel')
    )
  );

CREATE POLICY employees_insert ON hr.employees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager')
    )
  );

CREATE POLICY employees_update ON hr.employees
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager')
    )
  );

-- Leave Applications policies
CREATE POLICY leave_applications_select_own ON hr.leave_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.leave_applications.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY leave_applications_select_all ON hr.leave_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel', 'manager')
    )
  );

CREATE POLICY leave_applications_insert ON hr.leave_applications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.leave_applications.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY leave_applications_update ON hr.leave_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.leave_applications.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'manager')
    )
  );

-- Simplified policies for other tables - allow authenticated users to access their own data
-- In production, you'd want more granular policies

-- Attendance policies
CREATE POLICY attendance_select_own ON hr.attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.attendance.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel')
    )
  );

CREATE POLICY attendance_insert ON hr.attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.attendance.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager')
    )
  );

-- Expense Claims policies
CREATE POLICY expense_claims_select_own ON hr.expense_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.expense_claims.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel')
    )
  );

CREATE POLICY expense_claims_insert ON hr.expense_claims
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.expense_claims.employee_id AND e.user_id = auth.uid()
    )
  );

-- Employee Advances policies
CREATE POLICY employee_advances_select_own ON hr.employee_advances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.employee_advances.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel')
    )
  );

CREATE POLICY employee_advances_insert ON hr.employee_advances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.employee_advances.employee_id AND e.user_id = auth.uid()
    )
  );

-- Salary Slips policies
CREATE POLICY salary_slips_select_own ON hr.salary_slips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hr.employees e
      WHERE e.id = hr.salary_slips.employee_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (raw_user_meta_data->>'role') IN ('admin', 'hr_manager', 'hr_personnel')
    )
  );

-- Leave Types - everyone can view
CREATE POLICY leave_types_select ON hr.leave_types
  FOR SELECT USING (true);

-- Holidays - everyone can view
CREATE POLICY holidays_select ON hr.holidays
  FOR SELECT USING (true);

-- Insert default leave types
INSERT INTO hr.leave_types (name, max_days, allow_encashment, is_carry_forward) VALUES
  ('Annual Leave', 20, false, true),
  ('Sick Leave', 10, false, false),
  ('Personal Leave', 5, false, false),
  ('Casual Leave', 12, false, false)
ON CONFLICT (name) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION hr.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON hr.employees
  FOR EACH ROW EXECUTE FUNCTION hr.update_updated_at_column();

CREATE TRIGGER update_leave_applications_updated_at BEFORE UPDATE ON hr.leave_applications
  FOR EACH ROW EXECUTE FUNCTION hr.update_updated_at_column();

CREATE TRIGGER update_expense_claims_updated_at BEFORE UPDATE ON hr.expense_claims
  FOR EACH ROW EXECUTE FUNCTION hr.update_updated_at_column();

CREATE TRIGGER update_employee_advances_updated_at BEFORE UPDATE ON hr.employee_advances
  FOR EACH ROW EXECUTE FUNCTION hr.update_updated_at_column();

CREATE TRIGGER update_salary_slips_updated_at BEFORE UPDATE ON hr.salary_slips
  FOR EACH ROW EXECUTE FUNCTION hr.update_updated_at_column();
