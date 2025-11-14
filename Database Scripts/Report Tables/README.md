# Report Tables

SQL scripts for creating and managing report-specific database tables.

## 📋 Contents

### ATS (Acceptance Testing Specifications)
- `automatic_transfer_switch_ats_reports.sql` - Automatic transfer switch reports
- `current_transformer_test_ats_reports.sql` - Current transformer testing
- `create_lv_cb_et_ats_table.sql` - Low voltage circuit breaker tables

### MTS (Maintenance Testing Specifications)
- `current_transformer_test_mts_reports.sql` - Current transformer maintenance
- `medium_voltage_vlf_mts_reports.sql` - Medium voltage VLF testing
- `voltage_potential_transformer_mts_reports.sql` - Voltage/potential transformer tests

### Equipment-Specific
- `low_voltage_panelboard_small_breaker_reports.sql` - LV panelboard/breaker reports
- `medium_voltage_circuit_breaker_reports.sql` - MV circuit breaker reports
- `medium_voltage_cable_vlf_test.sql` - Medium voltage cable testing

## 🎯 Purpose

Each script creates the necessary database tables for storing specific report types and their test data.

## 📝 Usage

These scripts are typically run when:
- Adding a new report type
- Setting up a new division
- Migrating report data
- Creating development/staging environments

## 🔧 Structure

Most report tables include:
- Report metadata (job_id, date, technician, etc.)
- Test results and measurements
- Pass/fail status
- Comments and notes
- JSONB fields for flexible data storage







