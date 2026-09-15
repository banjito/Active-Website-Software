/**
 * Talent Pool normalization and matching checks. No database, no network.
 *
 *   node --import ./scripts/ts-alias-loader.mjs scripts/talent-pool-regression.ts
 */
import assert from "node:assert/strict";
import {
  findDuplicates,
  groupByIdentity,
  mapSheetStatus,
  mapSource,
  nameKey,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  splitName,
} from "../src/lib/talentPool/normalize";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error: any) {
    failures.push(`${name}: ${error.message}`);
  }
}

check("email trims, lowercases, rejects junk", () => {
  assert.equal(normalizeEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
  assert.equal(normalizeEmail("mailto:a@b.co"), "a@b.co");
  assert.equal(normalizeEmail("not an email"), null);
  assert.equal(normalizeEmail(""), null);
});

check("linkedin canonical form", () => {
  const want = "https://www.linkedin.com/in/jane-doe-123";
  assert.equal(normalizeLinkedin("linkedin.com/in/Jane-Doe-123/"), want);
  assert.equal(normalizeLinkedin("http://uk.linkedin.com/in/jane-doe-123?trk=abc#x"), want);
  assert.equal(normalizeLinkedin("https://www.linkedin.com/in/jane-doe-123/details/experience/"), want);
  assert.equal(normalizeLinkedin("https://www.linkedin.com/company/acme"), null);
  assert.equal(normalizeLinkedin("https://example.com/in/jane"), null);
});

check("phone: scientific notation and NANP", () => {
  assert.deepEqual(normalizePhone(3.608886757e9), { value: "360-888-6757" });
  assert.deepEqual(normalizePhone("3.608886757E9"), { value: "360-888-6757" });
  assert.deepEqual(normalizePhone("(360) 888-6757"), { value: "360-888-6757" });
  assert.deepEqual(normalizePhone("+1 360 888 6757"), { value: "360-888-6757" });
});

check("phone: international and extensions preserved", () => {
  assert.equal(normalizePhone("+44 20 7946 0958").value, "+44 20 7946 0958");
  assert.equal(normalizePhone("360-888-6757 ext 12").value, "360-888-6757 ext 12");
});

check("phone: truncated, fractional, invalid flagged not guessed", () => {
  const short = normalizePhone(36088867);
  assert.ok(short.flag);
  assert.equal(short.value, "36088867");
  const frac = normalizePhone(3608886757.5);
  assert.ok(frac.flag);
  assert.equal(frac.value, null);
  assert.ok(normalizePhone("123-456-7890").flag, "area code starting with 1 is not NANP");
});

check("names: single, multi-part, comma", () => {
  assert.deepEqual(splitName("Cher").last_name, null);
  assert.equal(splitName("Cher").flags.length, 1);
  const multi = splitName("Mary Ann Van Dyke");
  assert.equal(multi.first_name, "Mary");
  assert.equal(multi.last_name, "Ann Van Dyke");
  assert.equal(multi.flags.length, 1);
  const comma = splitName("John Smith, PE");
  assert.equal(comma.last_name, "Smith");
  assert.equal(comma.flags.length, 1);
  assert.equal(nameKey("Jóhn", "O'Neil"), "jhn oneil");
});

check("source: LinkedIn URL in SOURCE moves over", () => {
  const s = mapSource("https://www.linkedin.com/in/someone/");
  assert.equal(s.source, "linkedin");
  assert.equal(s.linkedin_url, "https://www.linkedin.com/in/someone");
  assert.equal(mapSource("Job fair").source, "other");
  assert.equal(mapSource("Job fair").original, "Job fair");
  assert.equal(mapSource("Referred by Bob").source, "referral");
});

check("sheet statuses", () => {
  assert.deepEqual(mapSheetStatus(""), { known: true, status: "new" });
  assert.equal(mapSheetStatus("CAN BE CONSIDERED FOR FUTURE ROLES").status, "future_roles");
  assert.equal(mapSheetStatus("existing contact details").status, "contacted");
  assert.equal(mapSheetStatus("TERMS SENT").candidateStage, "offer_sent");
  assert.equal(mapSheetStatus("Maybe later").known, false);
});

const subject = (key: string, first: string, last: string | null, email: string | null, linkedin: string | null) => ({
  key, first_name: first, last_name: last, email, linkedin_url: linkedin,
});

check("duplicates: same name different people is only possible", () => {
  const existing = [subject("p1", "John", "Smith", "john@a.com", null)];
  const r = findDuplicates([subject("r1", "John", "Smith", "js@b.com", null)], existing);
  assert.equal(r.confident.length, 0);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.possible, [{ key: "r1", ids: ["p1"] }], "no identifier hit, so the name is only a review signal");
  const r2 = findDuplicates([subject("r2", "John", "Smith", null, null)], existing);
  assert.deepEqual(r2.possible, [{ key: "r2", ids: ["p1"] }]);
});

check("duplicates: cross-matched email/LinkedIn is a conflict", () => {
  const li = "https://www.linkedin.com/in/x";
  const existing = [subject("p1", "A", "B", "a@b.com", null), subject("p2", "C", "D", null, li)];
  const r = findDuplicates([subject("r", "A", "B", "a@b.com", li)], existing);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(r.conflicts[0].ids, ["p1", "p2"]);
});

check("duplicates: email hit with different LinkedIn is a conflict", () => {
  const existing = [subject("p1", "A", "B", "a@b.com", "https://www.linkedin.com/in/one")];
  const r = findDuplicates([subject("r", "A", "B", "a@b.com", "https://www.linkedin.com/in/two")], existing);
  assert.equal(r.conflicts.length, 1);
});

check("duplicates: agreeing identifiers are confident", () => {
  const li = "https://www.linkedin.com/in/x";
  const existing = [subject("p1", "A", "B", "a@b.com", li)];
  const r = findDuplicates([subject("r", "Al", "B", "A@B.com", li)], existing);
  assert.deepEqual(r.confident, [{ key: "r", id: "p1", via: ["email", "linkedin"] }]);
});

check("grouping: transitive links, conflicts flagged, blanks stay separate", () => {
  const li = "https://www.linkedin.com/in/x";
  const groups = groupByIdentity([
    subject("s1", "A", "B", "a@b.com", null),
    subject("s3", "A", "B", "a@b.com", li),
    subject("s2", "A", "B", "other@b.com", li),
    subject("n1", "No", "Ids", null, null),
    subject("n2", "No", "Ids", null, null),
  ]);
  assert.equal(groups.length, 3);
  const linked = groups.find((g) => g.members.length === 3)!;
  assert.ok(linked.conflict);
  assert.equal(groups.filter((g) => g.members.length === 1).length, 2);
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✖ ${f}`);
process.exit(failures.length ? 1 : 0);
