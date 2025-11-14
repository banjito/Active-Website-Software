import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltagePanelboardSmallBreakerImporter extends BaseImporter implements ReportImporter {
	protected tableName = 'low_voltage_cable_test_3sets';
	protected requiredColumns = ['job_id', 'user_id'];

	canImport(data: ReportData): boolean {
		const t = (data.reportType || data.data?.reportType || '').toLowerCase();
		return t.includes('lowvoltagepanelboardsmallbreakertestats')
			|| t.includes('low-voltage-panelboard-small-breaker-test-ats')
			|| t.includes('low-voltage-panelboard-small-breaker')
			|| t.includes('panelboardsmallbreaker');
	}

	async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
		return this.insertReport(data, jobId, userId);
	}

	protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
		const normalized: any = { reportInfo: {}, nameplateData: {}, visualInspection: {}, electricalTests: {}, testEquipment: {} };

		if (data.data && (data.data as any).fields) {
			const f: any = (data.data as any).fields;
			// Job info
			normalized.reportInfo = {
				customer: f.customer || '',
				address: f.address || '',
				userName: f.user || '',
				date: f.date || '',
				identifier: f.identifier || '',
				jobNumber: f.jobNumber || '',
				technicians: f.technicians || '',
				substation: f.substation || '',
				eqptLocation: f.eqptLocation || '',
				temperature: (() => {
					const fahrenheit = parseFloat(f.temperatureF || f.temperature || '0') || 0;
					const celsius = Math.round((fahrenheit - 32) * 5 / 9);
					return { ambient: fahrenheit, fahrenheit, celsius, correctionFactor: 1 };
				})(),
				humidity: f.humidity || ''
			};

			// Nameplate data
			normalized.nameplateData = {
				panelboardManufacturer: f.panelboardManufacturer || '',
				panelboardTypeCatalog: f.panelboardTypeCat || '',
				panelboardSizeA: f.panelboardSizeA || '',
				panelboardVoltageV: f.panelboardVoltageV || '',
				panelboardSCCRkA: f.panelboardSCCRkA || '',
				mainBreakerManufacturer: f.mainBreakerManufacturer || '',
				mainBreakerType: f.mainBreakerType || '',
				mainBreakerFrameSizeA: f.mainBreakerFrameSizeA || '',
				mainBreakerRatingPlugA: f.mainBreakerRatingPlugA || '',
				mainBreakerICRatingkA: f.mainBreakerICRatingkA || ''
			};

			// Visual & Mechanical
			if (f['vm-table']?.rows) {
				for (const row of f['vm-table'].rows) {
					if (row?.id) normalized.visualInspection[row.id] = row.result || '';
				}
			}

			// Electrical Tests
			normalized.electricalTests = {
				numberOfCircuitSpaces: f.numberOfCircuitSpaces ?? f.panelboardBreakers?.numberOfSpaces ?? '',
				ordering: f.electricalTestOrdering || '',
				tripCurveNumbers: f.tripCurveNumbers || '',
				breakers: (f.panelboardBreakers?.breakers || []).map((b: any) => ({
					circuitNumber: b.circuitNumber || '',
					result: b.result || '',
					poles: b.poles || '',
					manuf: b.manuf || '',
					type: b.type || '',
					frameA: b.frameA || '',
					tripA: b.tripA || '',
					ratedCurrentA: b.ratedCurrentA || '',
					testCurrentA: b.testCurrentA || '',
					tripToleranceMin: b.tripToleranceMin || '',
					tripToleranceMax: b.tripToleranceMax || '',
					tripTime: b.tripTime || '',
					insulationLL: b.insulationLL || '',
					insulationLP: b.insulationLP || '',
					insulationPP: b.insulationPP || ''
				}))
			};

			// Test Equipment
			if (f.testEquipment3) {
				normalized.testEquipment.megohmmeter = f.testEquipment3.megohmmeter || { name: '', serialNumber: '', ampId: '' };
				normalized.testEquipment.lowResistanceOhmmeter = f.testEquipment3.lowResistanceOhmmeter || { name: '', serialNumber: '', ampId: '' };
				normalized.testEquipment.primaryInjectionTestSet = f.testEquipment3.primaryInjectionTestSet || { name: '', serialNumber: '', ampId: '' };
			} else {
				normalized.testEquipment.megohmmeter = { name: f.megohmmeter || '', serialNumber: f.megohmmeterSerial || '', ampId: f.megohmmeterAmpId || '' };
				normalized.testEquipment.lowResistanceOhmmeter = { name: f.lro || '', serialNumber: f.lroSerial || '', ampId: f.lroAmpId || '' };
				normalized.testEquipment.primaryInjectionTestSet = { name: f.piSet || '', serialNumber: f.piSetSerial || '', ampId: f.piSetAmpId || '' };
			}

			if (f.comments) normalized.reportInfo.comments = f.comments;
		} else if (data.sections) {
			// Sections fallback (less structured)
			for (const s of data.sections) {
				if (!s?.fields) continue;
				for (const field of s.fields) {
					if (typeof field?.label === 'string') {
						(normalized as any)[field.label] = field.value;
					}
				}
			}
		}

		const payload: any = {
			job_id: jobId,
			user_id: userId,
			data: {
				...normalized,
				status: 'PASS',
				reportType: this.getReportType()
			}
		};
		return payload;
	}

	protected getReportType(): string {
		return 'low-voltage-panelboard-small-breaker-report';
	}
}
