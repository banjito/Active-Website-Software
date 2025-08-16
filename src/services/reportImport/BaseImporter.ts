import { DatabaseSchema, ReportData, ReportImportResult } from './types';
import { supabase } from '../../lib/supabase';

export abstract class BaseImporter {
  protected abstract tableName: string;
  protected abstract requiredColumns: string[];

  protected async getSchema(): Promise<DatabaseSchema> {
    // Force fallback schema for certain tables that have known issues
    if (this.tableName === 'transformer_reports') {
      console.log(`🚀 Using forced fallback schema for ${this.tableName}`);
      const fallbackSchema = this.getFallbackSchema();
      console.log(`📋 Fallback schema for ${this.tableName}:`, fallbackSchema);
      return fallbackSchema;
    }
    
    // Force fallback schema for tandelta_reports to ensure correct schema
    if (this.tableName === 'tandelta_reports') {
      console.log(`🚀 Using forced fallback schema for ${this.tableName}`);
      const fallbackSchema = this.getFallbackSchema();
      console.log(`📋 Fallback schema for ${this.tableName}:`, fallbackSchema);
      return fallbackSchema;
    }

    // Force fallback schema for small dry type xfmr ats to ensure correct schema
    if (this.tableName === 'two_small_dry_type_xfmr_ats_reports') {
      console.log(`🚀 Using forced fallback schema for ${this.tableName}`);
      const fallbackSchema = this.getFallbackSchema();
      console.log(`📋 Fallback schema for ${this.tableName}:`, fallbackSchema);
      return fallbackSchema;
    }
    // Force fallback schema for small dry type xfmr mts to ensure correct schema
    if (this.tableName === 'two_small_dry_type_xfmr_mts_reports') {
      console.log(`🚀 Using forced fallback schema for ${this.tableName}`);
      const fallbackSchema = this.getFallbackSchema();
      console.log(`📋 Fallback schema for ${this.tableName}:`, fallbackSchema);
      return fallbackSchema;
    }

    try {
      console.log(`🔍 Fetching schema for ${this.tableName} from information_schema.columns`);
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_schema', 'neta_ops')
        .eq('table_name', this.tableName);

      if (error) {
        console.warn(`❌ Error fetching schema for ${this.tableName}:`, error);
        // Fallback to common patterns
        console.log(`🔄 Falling back to fallback schema for ${this.tableName}`);
        return this.getFallbackSchema();
      }

      if (data && data.length > 0) {
        const columns = data.map(col => col.column_name);
        const jsonbColumns = data
          .filter(col => col.data_type === 'jsonb')
          .map(col => col.column_name);
        
        console.log(`✅ Schema for ${this.tableName}:`, { columns, jsonbColumns });
    return { columns, jsonbColumns };
      }
    } catch (error) {
      console.warn(`❌ Exception fetching schema for ${this.tableName}:`, error);
    }

    // Fallback to common patterns
    console.log(`🔄 Using fallback schema for ${this.tableName}`);
    return this.getFallbackSchema();
  }

  private getFallbackSchema(): DatabaseSchema {
    // Common patterns based on table names
    if (this.tableName.includes('low_voltage_cable')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
        jsonbColumns: ['data']
      };
    } else if (this.tableName.includes('current_transformer')) {
      if (this.tableName.includes('mts')) {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
          jsonbColumns: ['report_data']
        };
      } else {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'nameplate_data', 'visual_mechanical_inspection', 'electrical_tests', 'test_equipment', 'comments'],
          jsonbColumns: ['report_info', 'nameplate_data', 'visual_mechanical_inspection', 'electrical_tests', 'test_equipment']
        };
      }
    } else if (this.tableName === 'two_small_dry_type_xfmr_ats_reports') {
      // Known schema for Two Small Dry Type Xfmr ATS reports (must come before generic dry_type rule)
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
        jsonbColumns: ['report_data']
      };
    } else if (this.tableName === 'two_small_dry_type_xfmr_mts_reports') {
      // Known schema for Two Small Dry Type Xfmr MTS reports (must come before generic dry_type rule)
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
        jsonbColumns: ['report_data']
      };
    } else if (this.tableName.includes('large_dry_type') || this.tableName.includes('dry_type')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'visual_inspection', 'insulation_resistance', 'turns_ratio', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'visual_inspection', 'insulation_resistance', 'turns_ratio', 'test_equipment']
      };
    } else if (this.tableName === 'transformer_reports') {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
        jsonbColumns: ['report_data']
      };
    } else if (this.tableName === 'liquid_filled_transformer_reports') {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at'],
        jsonbColumns: []
      };
    } else if (this.tableName.includes('liquid_filled_transformer')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'transformer_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'transformer_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
      };
    } else if (this.tableName.includes('switchgear') || this.tableName.includes('panelboard')) {
      if (this.tableName === 'switchgear_panelboard_mts_reports') {
        // Use the actual table structure we know exists
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
          jsonbColumns: ['report_data']
        };
      } else if (this.tableName === 'switchgear_reports') {
        // Use the actual table structure we know exists
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'visual_mechanical', 'insulation_resistance', 'contact_resistance', 'comments', 'overall_status'],
          jsonbColumns: ['report_info', 'visual_mechanical', 'insulation_resistance', 'contact_resistance']
        };
      } else if (this.tableName === 'medium_voltage_vlf_reports') {
        // Use the actual table structure we know exists
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
          jsonbColumns: ['data']
        };
      } else if (this.tableName === 'medium_voltage_vlf_mts_reports') {
        // MTS variant stores entire payload in a single JSONB 'data' column
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
          jsonbColumns: ['data']
        };
      } else {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'nameplate_data', 'visual_mechanical_inspection', 'electrical_tests', 'test_equipment', 'comments'],
          jsonbColumns: ['report_info', 'nameplate_data', 'visual_mechanical_inspection', 'electrical_tests', 'test_equipment']
        };
      }
    } else if (this.tableName.includes('medium_voltage_cable') || this.tableName.includes('medium_voltage_vlf')) {
      // Special known combined VLF + Tan Delta MTS form table
      if (this.tableName === 'medium_voltage_cable_vlf_test') {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
          jsonbColumns: ['data']
        };
      }
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'cable_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'cable_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
      };
    } else if (this.tableName.includes('oil_inspection')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'oil_data', 'test_results', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'oil_data', 'test_results', 'test_equipment']
      };
    } else if (this.tableName === 'medium_voltage_switch_oil_reports') {
      // Use the actual table structure we know exists
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'insulation_resistance_measured', 'contact_resistance', 'dielectric_s1s2', 'dielectric_s1t1', 'dielectric_s1t2', 'dielectric_s1t3', 'vfi_test_rows', 'test_equipment', 'comments', 'status'],
        jsonbColumns: ['report_info', 'insulation_resistance_measured', 'contact_resistance', 'dielectric_s1s2', 'dielectric_s1t1', 'dielectric_s1t2', 'dielectric_s1t3', 'vfi_test_rows', 'test_equipment']
      };
    } else if (this.tableName.includes('medium_voltage_motor_starter')) {
      // MTS implementation uses a single JSONB blob for flexibility
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_data'],
        jsonbColumns: ['report_data']
      };
    } else if (this.tableName.includes('medium_voltage_circuit_breaker')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'breaker_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'breaker_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
      };
    } else if (this.tableName.includes('low_voltage_circuit_breaker')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'breaker_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'breaker_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
      };
    } else if (this.tableName.includes('low_voltage_switch')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'switch_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'switch_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
      };
    } else if (this.tableName.includes('automatic_transfer_switch')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'visual_inspection_items', 'insulation_resistance', 'contact_resistance', 'comments'],
        jsonbColumns: ['report_info', 'visual_inspection_items', 'insulation_resistance', 'contact_resistance']
      };
    } else if (this.tableName === 'automatic_transfer_switch_ats_reports') {
      // Try to match the actual table structure - minimal known-safe columns
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'visual_inspection_items', 'insulation_resistance', 'contact_resistance', 'comments'],
        jsonbColumns: ['report_info', 'visual_inspection_items', 'insulation_resistance', 'contact_resistance']
      };
    } else if (this.tableName.includes('metal_enclosed_busway')) {
      if (this.tableName === 'metal_enclosed_busway_reports') {
        // Use the actual table structure we know exists
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'visual_mechanical', 'contact_resistance', 'insulation_resistance', 'comments', 'visual_mechanical_inspection', 'bus_resistance', 'test_equipment', 'status'],
          jsonbColumns: ['report_info', 'visual_mechanical', 'contact_resistance', 'insulation_resistance', 'visual_mechanical_inspection', 'bus_resistance', 'test_equipment']
        };
      } else {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'busway_data', 'visual_inspection', 'electrical_tests', 'test_equipment', 'comments'],
          jsonbColumns: ['report_info', 'busway_data', 'visual_inspection', 'electrical_tests', 'test_equipment']
        };
      }
    } else if (this.tableName.includes('voltage_potential_transformer')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'transformer_data', 'visual_inspection', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'transformer_data', 'visual_inspection', 'test_equipment']
      };
    } else if (this.tableName === 'tandelta_reports') {
      // Use the actual table structure we know exists - MUST come before tan_delta pattern
      console.log(`🔍 BaseImporter: Using fallback schema for tandelta_reports table`);
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'test_data'],
        jsonbColumns: ['report_info', 'test_data']
      };
    } else if (this.tableName === 'tandelta_mts_reports') {
      // MTS chart table variant storing report_info and test_data
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'test_data'],
        jsonbColumns: ['report_info', 'test_data']
      };
    } else if (this.tableName.includes('tan_delta')) {
      // Special known table that backs the TanDeltaTestMTSForm component
      if (this.tableName === 'tan_delta_test_mts') {
        return {
          columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
          jsonbColumns: ['data']
        };
      }
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'tan_delta_data', 'test_results', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'tan_delta_data', 'test_results', 'test_equipment']
      };
    } else if (this.tableName.includes('liquid_xfmr_visual')) {
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'report_info', 'transformer_data', 'visual_inspection', 'test_equipment', 'comments'],
        jsonbColumns: ['report_info', 'transformer_data', 'visual_inspection', 'test_equipment']
      };
    } else {
      // Default fallback
      return {
        columns: ['id', 'job_id', 'user_id', 'created_at', 'updated_at', 'data'],
        jsonbColumns: ['data']
      };
    }
  }

  protected validateSchema(schema: DatabaseSchema): boolean {
    console.log(`🔍 Validating schema for ${this.tableName}:`, schema);
    console.log(`📋 Required columns:`, this.requiredColumns);
    
    // Check if we have at least one JSONB column (unless this is a table that doesn't need them)
    if ((!schema.jsonbColumns || schema.jsonbColumns.length === 0) && 
        !['liquid_filled_transformer_reports'].includes(this.tableName)) {
      console.error(`❌ No JSONB columns found in schema for ${this.tableName}`);
      return false;
    }

    // Check if we have the required columns
    const missingColumns = this.requiredColumns.filter(col => !schema.columns.includes(col));
    if (missingColumns.length > 0) {
      console.error(`❌ Missing required columns for ${this.tableName}:`, missingColumns);
      return false;
    }

    console.log(`✅ Schema validation passed for ${this.tableName}`);
    return true;
  }

  protected async insertReport(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
    try {
      const schema = await this.getSchema();

      if (!this.validateSchema(schema)) {
        return {
          success: false,
          error: `Invalid schema for table ${this.tableName}`
        };
      }

      const preparedData = this.prepareData(data, jobId, userId, schema);

      // Augment with authoritative job info (customer address and job number)
      try {
        const { data: jobRow } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('job_number, customer_id')
          .eq('id', jobId)
          .single();

        let customerName = '';
        let customerAddress = '';
        if (jobRow?.customer_id) {
          const { data: customerRow } = await supabase
            .schema('common')
            .from('customers')
            .select('company_name, name, address')
            .eq('id', jobRow.customer_id)
            .single();
          if (customerRow) {
            customerName = customerRow.company_name || customerRow.name || '';
            customerAddress = customerRow.address || '';
          }
        }

        // Apply into common payload shapes (always override to ensure authoritative job info)
        if ((preparedData as any).data?.reportInfo) {
          (preparedData as any).data.reportInfo.customer = customerName;
          (preparedData as any).data.reportInfo.address = customerAddress;
          (preparedData as any).data.reportInfo.jobNumber = jobRow?.job_number || '';
        } else if ((preparedData as any).report_info) {
          (preparedData as any).report_info.customer = customerName;
          (preparedData as any).report_info.address = customerAddress;
          (preparedData as any).report_info.jobNumber = jobRow?.job_number || '';
        } else if ((preparedData as any).report_data) {
          // Some legacy importers use a single JSONB "report_data" blob
          const rd = (preparedData as any).report_data;
          if (rd && typeof rd === 'object') {
            if (rd.reportInfo && typeof rd.reportInfo === 'object') {
              rd.reportInfo.customer = customerName;
              rd.reportInfo.address = customerAddress;
              rd.reportInfo.jobNumber = jobRow?.job_number || '';
            } else {
              rd.reportInfo = {
                ...(rd.reportInfo || {}),
                customer: customerName,
                address: customerAddress,
                jobNumber: jobRow?.job_number || ''
              };
            }
          }
        }
      } catch (augmentErr) {
        console.warn('⚠️ Could not augment prepared data with job/customer info:', augmentErr);
      }
      
      console.log(`Inserting into ${this.tableName}:`, preparedData);

      const { data: result, error } = await supabase
        .schema('neta_ops')
        .from(this.tableName)
        .insert(preparedData)
        .select('id')
        .single();

      if (error) {
        console.error(`Error inserting report into ${this.tableName}:`, error);
        throw error;
      }

      // Determine route slug; prefer implementations that accept the original data
      let routeSlug: string;
      try {
        // Call getReportType with data if supported
        const anyThis: any = this as any;
        routeSlug = typeof anyThis.getReportType === 'function' && anyThis.getReportType.length > 0
          ? anyThis.getReportType(data)
          : this.getReportType();
      } catch {
        routeSlug = this.getReportType();
      }

      // Respect the importer-selected route slug; do not apply global overrides for Tan Delta MTS titles.

      return { 
        success: true, 
        reportId: result.id,
        reportType: routeSlug
      };
    } catch (error: any) {
      console.error(`Error inserting report into ${this.tableName}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to insert report'
      };
    }
  }

  protected abstract prepareData(
    data: ReportData,
    jobId: string,
    userId: string,
    schema: DatabaseSchema
  ): Record<string, any>;

  protected abstract getReportType(): string;
} 