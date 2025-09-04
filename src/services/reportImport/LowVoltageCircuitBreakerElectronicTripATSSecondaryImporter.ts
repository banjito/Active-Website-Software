import { BaseImporter } from './BaseImporter';
import { DatabaseSchema, ReportData, ReportImportResult, ReportImporter } from './types';

export class LowVoltageCircuitBreakerElectronicTripATSSecondaryImporter extends BaseImporter implements ReportImporter {
	protected tableName = 'low_voltage_cable_test_3sets';
	protected requiredColumns = ['job_id', 'user_id'];

	canImport(data: ReportData): boolean {
		const t = (data.reportType || data.data?.reportType || '').toLowerCase();
		return t.includes('lowvoltagecircuitbreakerelectronictripatssecondary')
			|| t.includes('lowvoltagecircuitbreakerelectronictripatssecondaryinjection')
			|| t.includes('low-voltage-circuit-breaker-electronic-trip-ats-secondary');
	}

	async import(data: ReportData, jobId: string, userId: string): Promise<ReportImportResult> {
		return this.insertReport(data, jobId, userId);
	}

	protected prepareData(data: ReportData, jobId: string, userId: string, schema: DatabaseSchema): any {
		const normalized: any = { reportInfo: {}, visualInspection: {}, testEquipment: {} };
		if (data.data && data.data.fields) {
			const f: any = data.data.fields;
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
			// Nameplate
			normalized.nameplateData = {
				manufacturer: f.manufacturer || '',
				catalogNumber: f.catalogNumber || '',
				serialNumber: f.serialNumber || '',
				type: f.type || '',
				frameSize: f.frameSize || '',
				icRating: f.icRating || '',
				tripUnitType: f.tripUnitType || '',
				ratingPlug: f.ratingPlug || '',
				curveNo: f.curveNo || '',
				chargeMotorVoltage: f.chargeMotorVoltage || '',
				operation: f.operation || '',
				mounting: f.mounting || '',
				zoneInterlock: f.zoneInterlock || '',
				thermalMemory: f.thermalMemory || ''
			};
			// Visual / Mechanical
			if (f['vm-table']?.rows) {
				for (const row of f['vm-table'].rows) {
					if (row?.id) normalized.visualInspection[row.id] = row.result || '';
				}
			}
			// Device settings & tests
			if (f.deviceSettings) normalized.deviceSettings = f.deviceSettings;
			if (f.breakerContactResistance) normalized.breakerContactResistance = f.breakerContactResistance;
			if (f.contactorInsulation) normalized.contactorInsulation = f.contactorInsulation;
			if (f.secondaryInjection) normalized.secondaryInjection = f.secondaryInjection;
			// Test equipment
			if (f.testEquipment3) {
				normalized.testEquipment.megohmmeter = f.testEquipment3.megohmmeter || { name: '', serialNumber: '', ampId: '' };
				normalized.testEquipment.lowResistanceOhmmeter = f.testEquipment3.lowResistanceOhmmeter || { name: '', serialNumber: '', ampId: '' };
				normalized.testEquipment.secondaryInjectionTestSet = f.testEquipment3.primaryInjectionTestSet || { name: '', serialNumber: '', ampId: '' };
			} else {
				normalized.testEquipment.megohmmeter = { name: f.megohmmeter || '', serialNumber: f.serialNumber || '', ampId: f.ampId || '' };
			}
			if (f.comments) normalized.reportInfo.comments = f.comments;
		} else if (data.sections) {
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
		return 'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report';
	}
}


