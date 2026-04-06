-- ============================================================================
-- Import Field Equipment Data
-- ============================================================================
-- This script imports the provided equipment data into the field_equipment table
-- Run this in the Supabase SQL Editor AFTER running create_field_equipment_table.sql
-- and add_notes_to_field_equipment.sql
-- ============================================================================

-- Helper function to parse dates in various formats
-- This is a simplified version - you may need to adjust date parsing based on your data

-- Function to find user by name (searches in user_metadata->name and derives from email)
CREATE OR REPLACE FUNCTION neta_ops.find_user_by_name(search_name TEXT)
RETURNS UUID AS $$
DECLARE
  user_id UUID;
  first_name TEXT;
  last_name TEXT;
  email_pattern TEXT;
BEGIN
  -- Try to find by exact name match in user_metadata
  SELECT id INTO user_id
  FROM auth.users
  WHERE raw_user_meta_data->>'name' ILIKE '%' || search_name || '%'
  LIMIT 1;
  
  -- If not found, try to derive from email (assuming format: firstname.lastname@ampqes.com)
  IF user_id IS NULL THEN
    -- Extract first and last name from search_name (assuming "First Last" format)
    first_name := split_part(search_name, ' ', 1);
    last_name := split_part(search_name, ' ', 2);
    
    IF last_name IS NOT NULL AND last_name != '' THEN
      email_pattern := LOWER(first_name) || '.' || LOWER(last_name) || '@ampqes.com';
      
      SELECT id INTO user_id
      FROM auth.users
      WHERE email = email_pattern
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to parse date from various formats
CREATE OR REPLACE FUNCTION neta_ops.parse_equipment_date(date_str TEXT)
RETURNS DATE AS $$
DECLARE
  parsed_date DATE;
BEGIN
  IF date_str IS NULL OR date_str = '' OR date_str = 'N/A' THEN
    RETURN NULL;
  END IF;
  
  -- Try different date formats
  BEGIN
    -- Format: M/D/YYYY or MM/DD/YYYY
    IF date_str ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      parsed_date := TO_DATE(date_str, 'MM/DD/YYYY');
      RETURN parsed_date;
    END IF;
    
    -- Format: M/YYYY (like "2/2022")
    IF date_str ~ '^\d{1,2}/\d{4}$' THEN
      parsed_date := TO_DATE('01/' || date_str, 'DD/MM/YYYY');
      RETURN parsed_date;
    END IF;
    
    -- Format: YYYY-MM-DD
    IF date_str ~ '^\d{4}-\d{2}-\d{2}$' THEN
      parsed_date := date_str::DATE;
      RETURN parsed_date;
    END IF;
    
    -- Try generic parsing
    parsed_date := date_str::DATE;
    RETURN parsed_date;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql;

-- Insert equipment data
-- Note: This is a template - you'll need to replace the user lookups with actual user IDs
-- or use the find_user_by_name function

-- Unassigned Equipment
INSERT INTO neta_ops.field_equipment (equipment_name, amp_id, serial_number, calibration_date, calibration_due_date, notes)
VALUES
('PA-9 megger', 'N/A', '2562', neta_ops.parse_equipment_date('8/20/2009'), neta_ops.parse_equipment_date('8/20/2010'), 'Needs Update'),
('MJ15 5KV Megger', 'N/A', '101389901', NULL, NULL, 'No Sticker'),
('HVA 28TD', '1-443', 'GH0212.20A067', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), NULL),
('MIT520/2', '1-384', '1080-376/0805', neta_ops.parse_equipment_date('10/7/2025'), neta_ops.parse_equipment_date('10/7/2026'), 'Needs Charger'),
('Megger DLRO10HD', '1-385', '101339243', neta_ops.parse_equipment_date('10/7/2025'), neta_ops.parse_equipment_date('10/7/2026'), 'No Comment'),
('Megger BVM300', 'N/A', '2000404', neta_ops.parse_equipment_date('4/22/2020'), neta_ops.parse_equipment_date('4/22/2021'), 'Needs Update'),
('Megger BVM600', 'N/A', '2000443', neta_ops.parse_equipment_date('10/7/2020'), neta_ops.parse_equipment_date('10/7/2021'), 'Needs Update'),
('Biddle TTR (Single ɸ)', NULL, '15294', neta_ops.parse_equipment_date('9/6/2024'), neta_ops.parse_equipment_date('9/6/2025'), 'Needs Update'),
('PowerSight PS3550', '1-136', '3264', neta_ops.parse_equipment_date('3/31/2024'), neta_ops.parse_equipment_date('3/31/2025'), 'Needs Update'),
('HVI Hipot', 'PFT503CM055', NULL, NULL, NULL, 'Protec Rental/ATL'),
('HVA 28TD', 'N/A', 'GH0212.17C005', NULL, NULL, 'No Sticker'),
('Snap On EECS400A', 'N/A', '103179', NULL, NULL, 'No Sticker'),
('HDE HVA-2000', '1-86', '2KHVA0822101', neta_ops.parse_equipment_date('2/2022'), neta_ops.parse_equipment_date('2/1/2023'), 'Needs Update'),
('HDE DDCIP-136', '1-76', '138KDVIP4319126', neta_ops.parse_equipment_date('5/26/2022'), neta_ops.parse_equipment_date('5/26/2023'), 'Needs Update'),
('HDE DDCIP-136', '1-77', '138KDVIP4319127', neta_ops.parse_equipment_date('5/26/2022'), neta_ops.parse_equipment_date('5/26/2023'), 'Needs Update'),
('Circuit Load Tester', 'N/A', 'CLT050-1', NULL, NULL, 'Calibration in Progress'),
('D02-85 Fiber Optic', 'N/A', 'D025084', neta_ops.parse_equipment_date('11/7/2017'), neta_ops.parse_equipment_date('11/7/2018'), 'Needs Update'),
('L02-13 Fiber Optic', 'N/A', 'L025050', neta_ops.parse_equipment_date('11/7/2017'), neta_ops.parse_equipment_date('11/7/2018'), 'Needs Update'),
('Z0-2 Fiber Optic', 'N/A', 'Z018162', neta_ops.parse_equipment_date('11/7/2017'), neta_ops.parse_equipment_date('11/7/2018'), 'Needs Update'),
('Megger SMRT1', '1-23', '201902070''033', neta_ops.parse_equipment_date('3/26/2024'), neta_ops.parse_equipment_date('3/26/2025'), 'Needs Update'),
('AEMC Model 1950', '1-57', NULL, NULL, NULL, 'Calibration in Progress'),
('Flir E8 Pro', '1-466', '13320463', neta_ops.parse_equipment_date('2/4/2025'), neta_ops.parse_equipment_date('2/4/2026'), 'No Comment'),
('AEMC Model 4630', '1-473', '128603TBDV', neta_ops.parse_equipment_date('7/30/2025'), neta_ops.parse_equipment_date('7/30/2026'), 'No Comment'),
('Franeo 800', '1-72', 'BC044R', neta_ops.parse_equipment_date('4/21/2023'), neta_ops.parse_equipment_date('4/21/2024'), 'Needs Update'),
('Siemens PTS 4', '1-142', NULL, NULL, NULL, 'No Comment'),
('TREX (Emerson Secondary Set)', NULL, NULL, NULL, NULL, 'No Comment'),
('Schneider Secondary Set', 'N/A', '1718433594', NULL, NULL, 'No Comment'),
('ABB Ekip T&P Secondary Set', 'N/A', 'E17002620740W040', NULL, NULL, 'No Comment'),
('ABB Ekip T&P Secondary Set', 'N/A', 'E34003820740W041', NULL, NULL, 'No Comment'),
('Westinghouse DigiTrip PRTAAPM', '1-143', '6505', NULL, NULL, 'No Comment'),
('Square D S33595', '1-140', NULL, NULL, NULL, 'No Comment'),
('EPSP18V VL PS (Secondary Set)', '1-144', 'A804435B02', NULL, NULL, 'No Comment'),
('PowerSight PS5000', '1-115', '50093', neta_ops.parse_equipment_date('2/21/2024'), neta_ops.parse_equipment_date('2/21/2025'), 'No Comment'),
('Megger DLROH200', '1-459', '2300974', neta_ops.parse_equipment_date('11/22/2025'), neta_ops.parse_equipment_date('11/22/2026'), 'No Comment'),
('ET450 Circuit Tracer Receiver', 'N/A', '0723U-C1', neta_ops.parse_equipment_date('11/11/2025'), neta_ops.parse_equipment_date('11/11/2026'), 'No Comment'),
('ET450 Circuit Tracer Transmitter', 'N/A', '0723UB1', NULL, NULL, 'No Comment'),
('Fluke PRV240FS', 'N/A', '58350751', NULL, NULL, 'Never Tested'),
('Fluke PRV240FS', 'N/A', '65910365', NULL, NULL, 'Never Tested'),
('Extech Light Meter SDL400', 'N/A', 'Q649250', NULL, NULL, 'Never Tested'),
('Siemens Secondary Set (Daikin)', 'N/A', 'LQNE20306004720', NULL, NULL, 'Return to Daikin'),
('AEMC Model 5060', '1-464', '504238', neta_ops.parse_equipment_date('4/8/2025'), neta_ops.parse_equipment_date('4/8/2026'), 'No Comment'),
('AEMC Model 6240', '1-465', '32179', neta_ops.parse_equipment_date('4/8/2025'), neta_ops.parse_equipment_date('4/8/2026'), 'No Comment'),
('Fluke 233 Remote Multimeter', '1-365', NULL, neta_ops.parse_equipment_date('10/2/2025'), neta_ops.parse_equipment_date('10/2/2026'), 'No Comment'),
('CB8160 Mac 21', '1-390', 'M68963', neta_ops.parse_equipment_date('10/9/2025'), neta_ops.parse_equipment_date('10/9/2026'), 'No Comment'),
('Megger MIT515', '1-391', '270913', neta_ops.parse_equipment_date('10/9/2025'), neta_ops.parse_equipment_date('10/9/2026'), 'No Comment'),
('AEMC Model 6550', '1-396', '113217ZBDV', neta_ops.parse_equipment_date('10/9/2025'), neta_ops.parse_equipment_date('10/9/2026'), 'No Comment'),
('Omicron CPC 6240', '1-410', 'LC332S', neta_ops.parse_equipment_date('10/22/2025'), neta_ops.parse_equipment_date('10/22/2026'), 'No Comment'),
('Fluke 1587FC', '1-411', '50810068', neta_ops.parse_equipment_date('10/24/2025'), neta_ops.parse_equipment_date('10/24/2026'), 'No Comment'),
('AEMC DTR 8510', '1-422', '102383YCDV', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('Megger DLRO H200', '1-423', '2300973', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('AEMC Model 6240', '1-428', '32171', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('AEMC Model 6240', '1-429', '32398', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('Fluke 1587 FC', '1-435', '10210033', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('Fluke 325 Clamp Meter', '1-436', '57510617WS', neta_ops.parse_equipment_date('10/29/2025'), neta_ops.parse_equipment_date('10/29/2026'), 'No Comment'),
('HVA 28TD', '1-444', 'GHO212.17C005', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Summit PS3550', '1-445', '3264', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Summit eFX6000', '1-446', 'F22150157078', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Summit eFX6000', '1-447', 'F22230173378', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Summit eFX6000', '1-448', 'F22230172578', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Summit eFX6000', '1-449', 'F22230173478', neta_ops.parse_equipment_date('11/4/2025'), neta_ops.parse_equipment_date('11/4/2026'), 'No Comment'),
('Fluke 233 Remote Multimeter', '1-453', NULL, neta_ops.parse_equipment_date('1/10/2025'), neta_ops.parse_equipment_date('1/10/2026'), 'No Comment'),
('Fluke 233 Remote Multimeter', '1-455', NULL, neta_ops.parse_equipment_date('10/2/2025'), neta_ops.parse_equipment_date('10/2/2026'), 'No Comment'),
('Megger SMRT46', '1-458', '201811070046', neta_ops.parse_equipment_date('10/11/2025'), neta_ops.parse_equipment_date('10/11/2026'), 'No Comment'),
('Megger MIT1025', '1-460', '101672420', neta_ops.parse_equipment_date('11/10/2025'), neta_ops.parse_equipment_date('11/10/2026'), 'No Comment'),
('EZCT-2000C', '1-461', '1185821', neta_ops.parse_equipment_date('11/13/2025'), neta_ops.parse_equipment_date('11/13/2026'), 'No Comment'),
('AEMC Model 5060', '1-462', '108330XLDV', neta_ops.parse_equipment_date('11/17/2025'), neta_ops.parse_equipment_date('11/17/2026'), 'No Comment'),
('AEMC Model 6527', '1-94', '11810XDCM', neta_ops.parse_equipment_date('8/4/2025'), neta_ops.parse_equipment_date('8/4/2026'), 'No Comment'),
('Megger DLRO 100H', '1-95', '1300863', neta_ops.parse_equipment_date('8/4/2025'), neta_ops.parse_equipment_date('8/4/2026'), 'No Comment'),
('Megger DLRO 100H', '1-96', '101478874', neta_ops.parse_equipment_date('8/4/2025'), neta_ops.parse_equipment_date('8/4/2026'), 'No Comment'),
('Megger MIT1025', '1-97', '2222389', neta_ops.parse_equipment_date('8/11/2025'), neta_ops.parse_equipment_date('8/11/2026'), 'No Comment'),
('Fluke 1587FC', '1-98', '908440043', neta_ops.parse_equipment_date('8/4/2025'), neta_ops.parse_equipment_date('8/4/2026'), 'No Comment'),
('Fluke 1587 FC', '1-99', '44640040', neta_ops.parse_equipment_date('8/4/2025'), neta_ops.parse_equipment_date('8/4/2026'), 'No Comment'),
('Megger SPI4000', '1-151', '202308040033', neta_ops.parse_equipment_date('9/20/2024'), neta_ops.parse_equipment_date('9/20/2025'), 'No Comment'),
('Fluke 1587 FC', '1-153', '63440124', neta_ops.parse_equipment_date('5/3/2025'), neta_ops.parse_equipment_date('5/3/2026'), 'No Comment'),
('AEMC DTR 8510', '1-152', '107725XLDV', neta_ops.parse_equipment_date('5/13/2025'), neta_ops.parse_equipment_date('5/13/2026'), 'No Comment'),
('Megger DLRO10HD', '1-212', 'MN5930', neta_ops.parse_equipment_date('4/1/2025'), neta_ops.parse_equipment_date('4/1/2026'), 'No Comment'),
('Mitchell MITHD2', '1-133', '2400975', neta_ops.parse_equipment_date('4/29/2025'), neta_ops.parse_equipment_date('4/29/2026'), 'No Comment'),
('Fluke PRV240FS', '1-132', '50721353', neta_ops.parse_equipment_date('4/29/2025'), neta_ops.parse_equipment_date('4/29/2026'), 'No Comment'),
('Fluke 1587 FC', '1-128', '55590021', neta_ops.parse_equipment_date('4/24/2025'), neta_ops.parse_equipment_date('4/24/2026'), 'No Comment'),
('AEMC Model 6240', '1-127', '32371', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('AEMC Model 5060', '1-2004', '113238ZBDV', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-120', '68010011', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-124', '68020015', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587 FC', '1-125', '68020020', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587 FC', '1-119', '68150033', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-121', '68010049', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-126', '68150035', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-123', '68010051', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment'),
('Fluke 1587FC', '1-122', '68040151', neta_ops.parse_equipment_date('4/1/2025'), neta_ops.parse_equipment_date('4/1/2026'), 'No Comment'),
('Fluke 8845A', '1-52', '5774006', neta_ops.parse_equipment_date('2/17/2025'), neta_ops.parse_equipment_date('2/17/2026'), 'No Comment'),
('Megger H200', '1-51', '2300975', neta_ops.parse_equipment_date('2/4/2025'), neta_ops.parse_equipment_date('2/4/2026'), 'No Comment'),
('Hipotronics 100HVT', '1-10', '018467-008804', neta_ops.parse_equipment_date('1/21/2025'), neta_ops.parse_equipment_date('1/21/2026'), 'No Comment'),
('FLIR E8xt', '1-49', '639107061', neta_ops.parse_equipment_date('1/27/2025'), neta_ops.parse_equipment_date('1/27/2026'), 'No Comment'),
('AEMC 6240', '1-214', '240765HLDV', neta_ops.parse_equipment_date('7/30/2025'), neta_ops.parse_equipment_date('7/30/2026'), 'No Comment'),
('Fluke 1587FC', '1-213', '67590137', neta_ops.parse_equipment_date('7/25/2025'), neta_ops.parse_equipment_date('7/25/2026'), 'No Comment'),
('Megger DDA-6000', '1-154', '202411040029', neta_ops.parse_equipment_date('4/4/2025'), neta_ops.parse_equipment_date('4/4/2026'), 'No Comment')
ON CONFLICT DO NOTHING;

-- Assigned Equipment (need to look up user IDs)
-- For "Zechariah Freeborn" - you'll need to find the actual user ID
-- Example: UPDATE neta_ops.field_equipment SET assigned_to = (SELECT id FROM auth.users WHERE ...) WHERE equipment_name = 'Megger MIT1025' AND amp_id = '1-129';

-- For location-based assignments (Atlanta, GA, Dalton, GA, Truck 29), these might be stored in notes or a separate location field
-- For now, we'll add them to notes if they're not user assignments

-- Update assigned equipment with user lookups
-- Note: Replace 'USER_ID_HERE' with actual user IDs from your auth.users table
-- You can use: SELECT id, email, raw_user_meta_data->>'name' FROM auth.users WHERE raw_user_meta_data->>'name' ILIKE '%Zechariah%Freeborn%';

-- Example for Zechariah Freeborn's equipment:
-- UPDATE neta_ops.field_equipment 
-- SET assigned_to = neta_ops.find_user_by_name('Zechariah Freeborn')
-- WHERE equipment_name IN ('Megger MIT1025', 'Fluke 1587FC', 'Fluke 1587FC')
--   AND amp_id IN ('1-129', '1-130', '1-131');

-- For location-based assignments, add to notes:
UPDATE neta_ops.field_equipment 
SET notes = COALESCE(notes || ' | ', '') || 'Location: Atlanta, GA'
WHERE equipment_name = 'Megger TTRU1 Basic' AND amp_id = '1-474';

UPDATE neta_ops.field_equipment 
SET notes = COALESCE(notes || ' | ', '') || 'Location: Dalton, GA'
WHERE equipment_name = 'Megger TTRU1 Basic' AND amp_id = '1-475';

UPDATE neta_ops.field_equipment 
SET notes = COALESCE(notes || ' | ', '') || 'Location: Truck 29'
WHERE equipment_name = 'CDI Torque Products' AND amp_id = '1-469';

-- Fix the date issue for CDI Torque Products (calibration_due_date appears to be before calibration_date)
UPDATE neta_ops.field_equipment 
SET calibration_date = neta_ops.parse_equipment_date('12/2/2025'),
    calibration_due_date = neta_ops.parse_equipment_date('12/2/2026')
WHERE equipment_name = 'CDI Torque Products' AND amp_id = '1-469';

-- Add the remaining assigned equipment
INSERT INTO neta_ops.field_equipment (equipment_name, amp_id, serial_number, calibration_date, calibration_due_date, notes)
VALUES
('Megger MIT1025', '1-129', 'N13117', neta_ops.parse_equipment_date('4/29/2025'), neta_ops.parse_equipment_date('4/29/2026'), 'Assigned: Zechariah Freeborn'),
('Fluke 1587FC', '1-130', '32172', neta_ops.parse_equipment_date('4/29/2025'), neta_ops.parse_equipment_date('4/29/2026'), 'Assigned: Zechariah Freeborn'),
('Fluke 1587FC', '1-131', '50340043', neta_ops.parse_equipment_date('4/29/2025'), neta_ops.parse_equipment_date('4/29/2026'), 'Assigned: Zechariah Freeborn'),
('Megger TTRU1 Basic', '1-474', '12780625', neta_ops.parse_equipment_date('6/2/2025'), neta_ops.parse_equipment_date('6/2/2026'), 'Atlanta, GA'),
('Megger TTRU1 Basic', '1-475', '12800625', neta_ops.parse_equipment_date('6/2/2025'), neta_ops.parse_equipment_date('6/2/2026'), 'Dalton, GA'),
('CDI Torque Products', '1-469', '752MFRMH', neta_ops.parse_equipment_date('12/2/2025'), neta_ops.parse_equipment_date('12/2/2026'), 'Truck 29')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Verification
-- ============================================================================
-- Run this to verify the data was imported:
-- SELECT COUNT(*) FROM neta_ops.field_equipment;
-- SELECT equipment_name, amp_id, notes FROM neta_ops.field_equipment WHERE notes IS NOT NULL LIMIT 10;



