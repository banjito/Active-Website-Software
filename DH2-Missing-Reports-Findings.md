# DH2 Missing Reports

Checked `Links - Missing DH2.xlsx` against the database, 2026-08-27.
All reports live in [Core Scientific DNN4 #26015](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a).

**They are not in [QTS ATL2 DC7 #26078](https://ampos.io/jobs/efcd8fe5-0a15-4495-a2d0-e771138d8ca1).** That job has zero breaker and zero panelboard reports. Nothing was moved between jobs, and nothing is hiding in another job either.

## Recover these two now

| Unit | What happened | Link |
|---|---|---|
| SWBD-RPP-26B-2 | Not missing. Saved as `SWBD-RPP-26-B2*`, so it does not come up in search. Status PASS. Just fix the name. | [open](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/panelboard-assemblies-ats25/eccdf59c-deca-4995-acd5-be5e0a8906ea) |
| SWBD-RPP-9B-4 | Overwritten on 2026-07-10 when someone retyped this report into SWBD-RPP-18B-3. Old data is intact in `backup_reports`, last good state `2026-07-10T17:49:05`. | [open](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/panelboard-assemblies-ats25/4c763f0e-d194-4e5d-b1fe-aec765a7a57b) |

## Breakers tested but labeled wrong

Same label on two reports, but different serial numbers, so these are two real breakers and one is named wrong. The missing data exists, it just needs the right name.

| Panel | Duplicated label | Serials | Sheet says missing |
|---|---|---|---|
| RPP-02B-1 | Main 1 | [...773](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/ada5be08-bb77-47de-8b96-90d9cd634f72) / [...778](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/46b55a71-3e62-4279-933c-a4fcd28130df) | MCB2 |
| RPP-19B-1 | Main 1 | [...893](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/30dda23b-e68c-4b0f-bf13-ffba2175b670) / [...899](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/210c786f-4add-4593-aa3b-d5f4ebcb20d9) | MCB2 |
| SWBD-OPT-17B | C/B#4 | [012245](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/80a16914-b91c-44fc-9dc6-2ca1d3236de9) / [012272](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/de980712-8b95-4c28-bcca-920405f6edb1) | #2, #3 |
| SWBD-OPT-17B | C/B#5 | [012281](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/b93e8546-fce3-4fec-bf91-f7511f5d4e23) / [024742](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/953ba2cd-1071-484c-81f6-e93e196afca8) | (same two) |
| SWBD-OPT-15B | C/B#5 | [004491](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/44146107-a6a4-45b2-9c5f-bf9cca2b86a9) / [004473](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/55d83fca-33cf-4091-8295-d7ae7360b8af) | #1, #2, #4 |

17B is the clean one: two extra breakers, exactly two missing numbers.

Also, serial `CFAA012245` is on both [OPT-7B C/B#4](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/e1695658-36b4-4d66-ae8d-e12285f1a24f) and [OPT-17B C/B#4](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/80a16914-b91c-44fc-9dc6-2ca1d3236de9). One is on the wrong panel, and OPT-7B is missing #1.

## Duplicate saves, delete the copy

Same panel, same label, same serial. One breaker saved twice, no hidden data. This includes the OPT-7B C/B#3 you marked "FIND IN FIELD" on the sheet, so there is nothing to find there.

| Panel | Label | Keep | Delete |
|---|---|---|---|
| SWBD-OPT-7B | C/B#3 | [ae335259](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/ae335259-a963-4b97-a2c7-87eb61ce9da7) | [2e1218ff](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/2e1218ff-53c2-4aee-b171-be81d0568097) |
| SWBD-OPT-9B | C/B#5 | [c59b49f9](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/c59b49f9-aacf-4069-a144-8b11879921f1) | [82db4b9b](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/82db4b9b-2272-4471-b82a-74b1b576fa6b) |
| SWBD-OPT-15B | C/B#3 | [6116965e](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/6116965e-dcd2-4242-bcce-d6abce82b2a2) | [56578a49](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/56578a49-6ad8-478c-98f1-144510ff1b84) |
| SWBD-OPT-24B | C/B#4 | [a55031b4](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/a55031b4-12cb-4293-a467-04634cafaa57) | [22ea4e90](https://ampos.io/jobs/2e0887a1-1a87-4b80-9f94-7e0e8bc85a0a/lv-molded-case-circuit-breaker-ats25/22ea4e90-0157-42cf-8f69-9c3240f7e045) |

## Never entered, needs retest

Nothing in the database, no backup, nowhere.

- **Breakers:** RPP-02B-2 (both mains), all 5 on SWBD-OPT-13B
- **RPP panelboards:** SWBD-RPP-15B-5, 17B-4, 23B-3, 24B-3, 25B-3, 26B-3
- **Switchboards:** SWBD-OPT-1B, 2B, 4B through 13B (the B side only got done from 14B up, plus 3B)

## Gaps your sheet missed

- SWBD-OPT-18B missing C/B#3, SWBD-OPT-25B missing C/B#1
- SWBD-OPT-09B is missing #1 through #4, not just 3 and 4
- SWBD-OPT-10B is missing #2 as well as #3
- Data Hall 1 has gaps too: OPT-14A missing #1/#3/#4/#5, OPT-23A missing #2/#3/#4/#5, OPT-26A missing #3/#4

## Two things to fix in the app

1. **Renaming a saved report overwrites the old unit.** Crews copy a report and retype the identifier, which is fine on a fresh copy but destroys the readings when done on an already-saved report. That is what killed 9B-4. Backup history shows 167 panelboard rows on this job that carried more than one finished identifier. Prompt to save as new instead.
2. **The breaker table has no backup coverage.** `backup_reports` has 42,937 snapshots for this job and zero for `lv_molded_case_circuit_breaker_ats25` in any job. That is why the panelboard was recoverable and none of the breakers are. Add the trigger.
