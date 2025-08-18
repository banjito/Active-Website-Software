import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageSwitchMultiDeviceImporter extends BaseImporter implements ReportImporter {
	protected tableName = 'low_voltage_cable_test_3sets';
	protected requiredColumns = ['job_id', 'user_id'];

	canImport(data: ReportData): boolean {
		const t = (data.reportType || data.data?.reportType || '').toLowerCase();
		return t.includes('lowvoltageswitchmultidevice')
			|| t.includes('low-voltage-switch-multi-device')
			|| t.includes('low-voltage-switch-multi-device-test');
	}

	async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
		return this.insertReport(data, jobId, userId);
	}

	protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
		const normalized: any = {
			reportInfo: {},
			visualInspection: { items: [] as any[] },
			enclosure: {},
			switches: [] as any[],
			fuses: [] as any[],
			irTests: { testVoltage: '', units: 'MΩ', rows: [] as any[] },
			contactResistance: { rows: [] as any[] },
			equipment: {},
			status: 'PASS'
		};

		const srcFields: any | undefined = (data as any)?.data?.fields;
		if (srcFields) {
			// Job info
			normalized.reportInfo = {
				customer: srcFields.customer || '',
				address: srcFields.address || '',
				userName: srcFields.user || '',
				date: srcFields.date || '',
				identifier: srcFields.identifier || '',
				jobNumber: srcFields.jobNumber || '',
				technicians: srcFields.technicians || '',
				substation: srcFields.substation || '',
				eqptLocation: srcFields.eqptLocation || '',
				temperature: (() => {
					const fahrenheit = parseFloat(srcFields.temperatureF || srcFields.temperature || '0') || 0;
					const celsius = Math.round((fahrenheit - 32) * 5 / 9);
					return { fahrenheit, celsius, correctionFactor: 1 };
				})(),
				humidity: srcFields.humidity || ''
			};

			// Visual and Mechanical matrix
			if (srcFields['vm-matrix']?.rows) {
				normalized.visualInspection.items = srcFields['vm-matrix'].rows.map((r: any) => ({
					identifier: r.identifier || '',
					values: r.values || {}
				}));
			}
			// Fallback: sometimes provided under sections instead of data.fields
			else if (Array.isArray((data as any)?.sections)) {
				for (const section of (data as any).sections) {
					if (!section?.fields || !section?.title?.toLowerCase().includes('visual and mechanical')) continue;
					for (const field of section.fields) {
						if (field?.type === 'table' && field?.value?.rows && field?.label?.toLowerCase().includes('visual and mechanical tests')) {
							normalized.visualInspection.items = field.value.rows.map((r: any) => ({
								identifier: r.identifier || '',
								values: r.values || {}
							}));
						}
					}
				}
			}

			// Enclosure Data
			normalized.enclosure = {
				manufacturer: srcFields.manufacturer || srcFields['Manufacturer'] || '',
				systemVoltage: srcFields.systemVoltage || srcFields['System Voltage (V)'] || '',
				catalogNo: srcFields.catalogNo || srcFields['Catalog No.'] || '',
				ratedVoltage: srcFields.ratedVoltage || srcFields['Rated Voltage (V)'] || '',
				serialNumber: srcFields.serialNumber || srcFields['Serial Number'] || '',
				ratedCurrent: srcFields.ratedCurrent || srcFields['Rated Current (A)'] || '',
				series: srcFields.series || srcFields['Series'] || '',
				aicRating: srcFields.aicRating || srcFields['AIC Rating (kA)'] || '',
				type: srcFields.type || srcFields['Type'] || '',
				phaseConfiguration: srcFields.phaseConfiguration || srcFields['Phase Configuration'] || ''
			};

			// Switch rows
			if (srcFields.switchRows?.rows) {
				normalized.switches = srcFields.switchRows.rows.map((r: any) => ({
					position: r.position || '',
					manufacturer: r.manufacturer || '',
					catalogNo: r.catalogNo || '',
					serialNo: r.serialNo || '',
					type: r.type || '',
					ratedAmperage: r.ratedAmperage || '',
					ratedVoltage: r.ratedVoltage || ''
				}));
			}

			// Fuse rows
			if (srcFields.fuseRows?.rows) {
				normalized.fuses = srcFields.fuseRows.rows.map((r: any) => ({
					position: r.position || '',
					manufacturer: r.manufacturer || '',
					catalogNo: r.catalogNo || '',
					fuseClass: r.fuseClass || '',
					amperage: r.amperage || '',
					aic: r.aic || '',
					voltage: r.voltage || ''
				}));
			}

			// Insulation Resistance tables
			if (srcFields.switchIrTables) {
				normalized.irTests.testVoltage = srcFields.switchIrTables.testVoltage || '1000V';
				const rows = Array.isArray(srcFields.switchIrTables.rows) ? srcFields.switchIrTables.rows : [];
				normalized.irTests.rows = rows.map((r: any) => ({
					units: r.units || 'MΩ',
					position: r.position || '',
					p1p2: r.p1p2 || '',
					p2p3: r.p2p3 || '',
					p3p1: r.p3p1 || '',
					p1_frame: r.p1_frame || '',
					p2_frame: r.p2_frame || '',
					p3_frame: r.p3_frame || '',
					p1_line: r.p1_line || '',
					p2_line: r.p2_line || '',
					p3_line: r.p3_line || ''
				}));
				// If top-level units are provided in other section variant
				if (rows[0]?.units) normalized.irTests.units = rows[0].units;
			}

			// Contact Resistance
			if (srcFields.switchContact?.rows) {
				normalized.contactResistance.rows = srcFields.switchContact.rows.map((r: any) => ({
					units: r.units || 'µΩ',
					position: r.position || '',
					switchOnly: r.switchOnly || '',
					fuseOnly: r.fuseOnly || '',
					switchPlusFuse: r.switchPlusFuse || ''
				}));
			}

			// Equipment
			normalized.equipment = {
				megger: srcFields.megohmmeter || '',
				meggerSerial: srcFields.megohmmeterSerial || '',
				meggerAmpId: srcFields.megohmmeterAmpId || '',
				lowRes: srcFields.lro || srcFields.lowResistanceOhmmeter || '',
				lowResSerial: srcFields.lroSerial || '',
				lowResAmpId: srcFields.lroAmpId || ''
			};

			// Comments
			if (srcFields.comments) normalized.reportInfo.comments = srcFields.comments;
		} else if (data.sections) {
			// Sections fallback (simple label/value mapping)
			for (const s of data.sections) {
				if (!s?.fields) continue;
				for (const field of s.fields) {
					if (typeof field?.label === 'string') {
						(normalized as any)[field.label] = (field as any).value;
					}
				}
			}
		}

		const payload: any = {
			job_id: jobId,
			user_id: userId,
			data: {
				...normalized,
				reportType: this.getReportType(),
				status: normalized.status || 'PASS'
			}
		};
		return payload;
	}

	protected getReportType(): string {
		return 'low-voltage-switch-multi-device-test';
	}
}
