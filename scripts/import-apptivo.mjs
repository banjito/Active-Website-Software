#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPaths = {
	customers: path.resolve(process.cwd(), 'supabase', 'migrations', 'APPTIVO IMPORTS', 'customers_export.csv'),
	contacts: path.resolve(process.cwd(), 'supabase', 'migrations', 'APPTIVO IMPORTS', 'contacts_export.csv'),
	opportunities: path.resolve(process.cwd(), 'supabase', 'migrations', 'APPTIVO IMPORTS', 'opportunities_export.csv')
};

function getArg(flag, fallback = null) {
	const idx = process.argv.indexOf(flag);
	if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
	return fallback;
}

function hasFlag(flag) {
	return process.argv.includes(flag);
}

function getIntArg(flag, fallback = null) {
	const val = getArg(flag, null);
	if (val == null) return fallback;
	const n = parseInt(val, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error('Missing Supabase configuration. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY.');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function readCsv(filePath) {
	if (!fs.existsSync(filePath)) {
		throw new Error(`CSV not found: ${filePath}`);
	}
	const content = fs.readFileSync(filePath, 'utf8');
	return parse(content, {
		columns: true,
		skip_empty_lines: true,
		trim: true,
		bom: true,
		relax_quotes: true,
		relax_column_count: true
	});
}

function normalize(str) {
	return (str || '')
		.toString()
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

function pickAddress(row, prefix) {
	return (
		row[`${prefix} Full Address`]?.toString().trim() ||
		[row[`${prefix} Address Line1`], row[`${prefix} Address Line2`], row[`${prefix} City`], row[`${prefix} State`], row[`${prefix} Zip Code`], row[`${prefix} Country`]]
			.filter(Boolean)
			.join(', ')
	);
}

function parseCurrency(val) {
	if (val == null || val === '') return null;
	const num = Number(String(val).replace(/[^0-9.-]/g, ''));
	return Number.isFinite(num) ? num : null;
}

function parsePercent(val) {
	if (val == null || val === '') return null;
	const num = Number(String(val).replace(/[^0-9.-]/g, ''));
	if (!Number.isFinite(num)) return null;
	const bounded = Math.max(0, Math.min(100, Math.round(num)));
	return bounded;
}

function mapStage(stage) {
	const s = normalize(stage);
	if (s.includes('award')) return 'awarded';
	if (s.includes('lost')) return 'lost';
	if (s.includes('decision')) return 'decision';
	if (s.includes('quote')) return 'quote';
	if (s.includes('no quote')) return 'no quote';
	return s || 'awareness';
}

async function findOrCreateCustomer(row, cacheByName) {
	const rawName = row['Name'] || row['Customer'] || '';
	const key = normalize(rawName);
	if (!key) return null;
	if (cacheByName.has(key)) return cacheByName.get(key);

	// Try to find existing by company_name or name
	let existingId = null;
	{
		const { data, error } = await supabase
			.schema('common')
			.from('customers')
			.select('id, name, company_name')
			.ilike('company_name', rawName)
			.limit(1);
		if (!error && data && data.length > 0) existingId = data[0].id;
	}
	if (!existingId) {
		const { data, error } = await supabase
			.schema('common')
			.from('customers')
			.select('id, name, company_name')
			.ilike('name', rawName)
			.limit(1);
		if (!error && data && data.length > 0) existingId = data[0].id;
	}

	if (existingId) {
		cacheByName.set(key, existingId);
		return existingId;
	}

	const address = pickAddress(row, 'Company Address-1');
	const billingAddr = pickAddress(row, 'Billing Address-1');
	const bestAddress = address || billingAddr || null;
	const phone = row['Phone - Company'] || '';
	const email = row['Email - Company'] || '';
	const status = row['Status'] || 'active';

	const payload = {
		name: rawName,
		company_name: rawName,
		address: bestAddress,
		phone: phone || null,
		email: email || null,
		status: status || 'active'
	};

	const { data: inserted, error: insertErr } = await supabase
		.schema('common')
		.from('customers')
		.insert(payload)
		.select('id')
		.single();

	if (insertErr) {
		console.error('Customer insert error:', insertErr.message, 'payload:', payload);
		throw insertErr;
	}

	cacheByName.set(key, inserted.id);
	return inserted.id;
}

async function importCustomers(csvPath, cacheByName, limit = null) {
	console.log(`Reading customers CSV: ${csvPath}`);
	const rows = readCsv(csvPath);
	const inputRows = limit && rows.length > limit ? rows.slice(0, limit) : rows;
	let created = 0, found = 0, errors = 0;
	for (const row of inputRows) {
		try {
			const key = normalize(row['Name']);
			if (!key) continue;
			if (cacheByName.has(key)) {
				found++;
				continue;
			}
			await findOrCreateCustomer(row, cacheByName);
			created++;
		} catch (e) {
			errors++;
			console.warn('Customer import warning:', e.message);
		}
	}
	console.log(`Customers: created ${created}, existing ${found}, errors ${errors}`);
}

async function importContacts(csvPath, cacheByName, contactCacheByNameAndCustomer, limit = null) {
	console.log(`Reading contacts CSV: ${csvPath}`);
	const rows = readCsv(csvPath);
	const inputRows = limit && rows.length > limit ? rows.slice(0, limit) : rows;
	let created = 0, skipped = 0, errors = 0;
	for (const row of inputRows) {
		try {
			const customerName = row['Customer'] || '';
			const customerKey = normalize(customerName);
			if (!customerKey) { skipped++; continue; }
			const customerId = cacheByName.get(customerKey) || await findOrCreateCustomer({ Name: customerName }, cacheByName);
			if (!customerId) { skipped++; continue; }

			const firstName = (row['First Name'] || '').toString().trim();
			const lastName = (row['Last Name'] || '').toString().trim();
			const fullName = (row['Full Name'] || `${firstName} ${lastName}`).toString().trim();
			const nameKey = `${normalize(fullName)}::${customerId}`;
			if (contactCacheByNameAndCustomer.has(nameKey)) { skipped++; continue; }

			// Try find by email first
			const email = (row['Email - Company'] || row['Email - Personal'] || '').toString().trim();
			let existingId = null;
			if (email) {
				const { data, error } = await supabase
					.schema('common')
					.from('contacts')
					.select('id, first_name, last_name, email, customer_id')
					.eq('customer_id', customerId)
					.ilike('email', email)
					.limit(1);
				if (!error && data && data.length > 0) existingId = data[0].id;
			}
			if (!existingId && fullName) {
				const { data, error } = await supabase
					.schema('common')
					.from('contacts')
					.select('id, first_name, last_name, customer_id')
					.eq('customer_id', customerId)
					.ilike('first_name', firstName || fullName)
					.limit(1);
				if (!error && data && data.length > 0) existingId = data[0].id;
			}
			if (existingId) {
				contactCacheByNameAndCustomer.set(nameKey, existingId);
				skipped++;
				continue;
			}

			const phone = (row['Phone - Company'] || row['Phone - Mobile'] || row['Phone - Personal'] || '').toString().trim() || null;
			const payload = {
				customer_id: customerId,
				first_name: firstName || fullName,
				last_name: lastName || null,
				email: email || null,
				phone
			};

			const { data: inserted, error: insertErr } = await supabase
				.schema('common')
				.from('contacts')
				.insert(payload)
				.select('id')
				.single();
			if (insertErr) throw insertErr;

			contactCacheByNameAndCustomer.set(nameKey, inserted.id);
			created++;
		} catch (e) {
			errors++;
			console.warn('Contact import warning:', e.message);
		}
	}
	console.log(`Contacts: created ${created}, skipped ${skipped}, errors ${errors}`);
}

async function importOpportunities(csvPath, cacheByName, contactCacheByNameAndCustomer, limit = null, userIdForOpp = null) {
	console.log(`Reading opportunities CSV: ${csvPath}`);
	const rows = readCsv(csvPath);
	const inputRows = limit && rows.length > limit ? rows.slice(0, limit) : rows;
	let created = 0, updated = 0, skipped = 0, errors = 0;
	const seenQuoteNumbers = new Set();
	for (const row of inputRows) {
		try {
			const customerName = (row['Customer'] || '').toString().trim();
			const contactName = (row['Contact'] || '').toString().trim();
			const customerKey = normalize(customerName);
			if (!customerKey) { skipped++; continue; }
			const customerId = cacheByName.get(customerKey) || await findOrCreateCustomer({ Name: customerName }, cacheByName);
			if (!customerId) { skipped++; continue; }

			let contactId = null;
			if (contactName) {
				const cnameKey = `${normalize(contactName)}::${customerId}`;
				contactId = contactCacheByNameAndCustomer.get(cnameKey) || null;
				// Fallback DB lookup if not in cache
				if (!contactId) {
					try {
						const { data: contactsDb } = await supabase
							.schema('common')
							.from('contacts')
							.select('id, first_name, last_name, email, customer_id')
							.eq('customer_id', customerId);
						if (contactsDb && contactsDb.length) {
							const target = normalize(contactName);
							const found = contactsDb.find(c => {
								const fn = normalize(c.first_name || '');
								const ln = normalize(c.last_name || '');
								const full = `${fn} ${ln}`.trim();
								return fn === target || ln === target || full === target;
							});
							if (found) {
								contactId = found.id;
								contactCacheByNameAndCustomer.set(cnameKey, found.id);
							}
						}
					} catch {}
				}
			}

			const title = (row['Opportunity Description'] || '').toString().trim();
			const notes = [row['Quote Notes'], row['Additional Details']].filter(Boolean).join('\n').trim() || null;
			const probability = parsePercent(row['Probability (%)']);
			const expectedValue = parseCurrency(row['Quoted Amount']);
			const status = mapStage(row['Sales Stage']);
			const ampDivision = (row['AMP Division'] || '').toString().trim();
			const salesPerson = (row['Sales Person'] || '').toString().trim();
			const quoteNumber = (row['Letter #'] || '').toString().trim();
			const expectedCloseDate = (row['Due Date'] || row['Proposal Date'] || '').toString().trim();

			// Avoid within-run duplicates on unique quote_number
			if (quoteNumber && seenQuoteNumbers.has(quoteNumber)) {
				skipped++;
				continue;
			}

			// Check existing by quote_number+customer or by title+customer
			let existing = null;
			if (quoteNumber) {
				const { data, error } = await supabase
					.schema('business')
					.from('opportunities')
					.select('id, quote_number')
					.eq('customer_id', customerId)
					.eq('quote_number', quoteNumber)
					.limit(1);
				if (!error && data && data.length > 0) existing = data[0];
			}
			if (!existing && title) {
				const { data, error } = await supabase
					.schema('business')
					.from('opportunities')
					.select('id')
					.eq('customer_id', customerId)
					.ilike('title', title)
					.limit(1);
				if (!error && data && data.length > 0) existing = data[0];
			}

			const payload = {
				customer_id: customerId,
				title,
				description: notes,
				status,
				expected_value: expectedValue,
				probability,
				expected_close_date: expectedCloseDate || null,
				notes,
				amp_division: ampDivision || null,
				sales_person: salesPerson || null,
				quote_number: quoteNumber || null
			};
			if (userIdForOpp) payload.user_id = userIdForOpp;
			if (contactId) payload.contact_id = contactId;

			if (existing) {
				const { error: updErr } = await supabase
					.schema('business')
					.from('opportunities')
					.update(payload)
					.eq('id', existing.id);
				if (updErr) throw updErr;
				updated++;
			} else {
				const { error: insErr } = await supabase
					.schema('business')
					.from('opportunities')
					.insert(payload);
				if (insErr) throw insErr;
				created++;
				if (quoteNumber) seenQuoteNumbers.add(quoteNumber);
			}
		} catch (e) {
			errors++;
			console.warn('Opportunity import warning:', e.message);
		}
	}
	console.log(`Opportunities: created ${created}, updated ${updated}, skipped ${skipped}, errors ${errors}`);
}

async function resetApptivoData() {
	console.log('Resetting existing customers/contacts/opportunities...');
	// Delete in dependency-safe order
	try {
		const { error: oppErr } = await supabase
			.schema('business')
			.from('opportunities')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000'); // no-op filter to satisfy API
		if (oppErr) console.warn('Warning deleting opportunities:', oppErr.message);
	} catch (e) {
		console.warn('Warning deleting opportunities:', e.message);
	}
	try {
		const { error: contactErr } = await supabase
			.schema('common')
			.from('contacts')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000');
		if (contactErr) console.warn('Warning deleting contacts:', contactErr.message);
	} catch (e) {
		console.warn('Warning deleting contacts:', e.message);
	}
	try {
		// Prefer server-side SQL to delete only customers not linked to jobs
		const { error: directDelErr } = await supabase.rpc('exec_sql', {
			sql_query: `DELETE FROM common.customers c
					WHERE NOT EXISTS (
					  SELECT 1 FROM neta_ops.jobs j WHERE j.customer_id = c.id
					);`
		});
		if (directDelErr) {
			// Fallback to client-side batching
			const { data: jobRefs, error: jobErr } = await supabase
				.schema('neta_ops')
				.from('jobs')
				.select('customer_id');
			if (jobErr) throw jobErr;
			const refSet = new Set((jobRefs || []).map(r => r.customer_id));
			const { data: allCustomers, error: custListErr } = await supabase
				.schema('common')
				.from('customers')
				.select('id');
			if (custListErr) throw custListErr;
			const deletable = (allCustomers || []).map(r => r.id).filter(id => !refSet.has(id));
			const batchSize = 500;
			for (let i = 0; i < deletable.length; i += batchSize) {
				const batch = deletable.slice(i, i + batchSize);
				if (batch.length === 0) continue;
				const { error: delErr } = await supabase
					.schema('common')
					.from('customers')
					.delete()
					.in('id', batch);
				if (delErr) console.warn('Warning deleting customer batch:', delErr.message);
			}
		}
	} catch (e) {
		console.warn('Warning deleting customers (preserving job-linked):', e.message);
	}
	console.log('Reset complete.');
}

async function maybeResetJobNumberSequence(targetNextVal) {
	try {
		let nextVal = targetNextVal ? Number(targetNextVal) : null;
		if (!Number.isFinite(nextVal)) {
			// Derive from existing max JOB-xxxx
			const { data, error } = await supabase
				.schema('neta_ops')
				.from('jobs')
				.select('job_number')
				.order('job_number', { ascending: false })
				.limit(1);
			if (!error && data && data.length > 0) {
				const match = String(data[0].job_number || '').match(/(\d+)/);
				if (match) nextVal = Number(match[1]) + 1;
			}
		}
		if (!Number.isFinite(nextVal)) return;
		// Use exec_sql RPC if available
		const { error: seqErr } = await supabase.rpc('exec_sql', {
			sql_query: `SELECT setval('job_number_seq', ${Math.max(1, Math.floor(nextVal))});`
		});
		if (seqErr) {
			console.warn('Could not reset job_number_seq via exec_sql:', seqErr.message);
		} else {
			console.log(`job_number_seq set to start from ${nextVal}`);
		}
	} catch (e) {
		console.warn('Sequence reset warning:', e.message);
	}
}

async function main() {
	const customersPath = getArg('--customers', defaultPaths.customers);
	const contactsPath = getArg('--contacts', defaultPaths.contacts);
	const oppsPath = getArg('--opportunities', defaultPaths.opportunities);
	const resetSeq = getArg('--reset-job-seq', null);
	const limit = getIntArg('--limit', null);
    const doReset = hasFlag('--reset');
    const oppUserId = getArg('--opps-user-id', null);

	console.log('Starting Apptivo import...');
	console.log('Paths:');
	console.log('  customers    :', customersPath);
	console.log('  contacts     :', contactsPath);
	console.log('  opportunities:', oppsPath);

	const cacheByName = new Map();
	const contactCacheByNameAndCustomer = new Map();

	if (doReset) {
		await resetApptivoData();
	}

	await importCustomers(customersPath, cacheByName, limit);
	await importContacts(contactsPath, cacheByName, contactCacheByNameAndCustomer, limit);
	await importOpportunities(oppsPath, cacheByName, contactCacheByNameAndCustomer, limit, oppUserId);

	if (hasFlag('--reset-job-seq') || resetSeq) {
		await maybeResetJobNumberSequence(resetSeq);
	}

	console.log('Apptivo import complete.');
}

main().catch(err => {
	console.error('Fatal import error:', err);
	process.exit(1);
});


