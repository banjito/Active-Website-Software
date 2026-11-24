-- Default rows a new instance starts with.
-- 02_schema.sql is a schema-only dump, so table contents never carry over.
-- Every insert here must be safe to re-run (ON CONFLICT DO NOTHING).
-- When a migration seeds defaults, copy its insert block here.

-- Project checklist steps (source: database/migrations/job_checklist.sql + job_checklist_steps_nov11.sql)
INSERT INTO neta_ops.job_checklist_steps (key, name, phase, sort_order, due_anchor, due_offset_days, auto_rule)
VALUES
  ('contract_signed',     'Contract signed',          'Sales',    10, NULL,       0,  NULL),
  ('pm_contacted',        'PM contacted customer',    'Setup',    20, 'contract', 2,  NULL),
  ('coi_issued',          'COI issued',               'Setup',    30, 'contract', 5,  NULL),
  ('lead_assigned',       'Lead assigned',            'Setup',    40, 'contract', 5,  'lead_assigned'),
  ('quickbooks_linked',   'Job in QuickBooks',        'Setup',    50, 'contract', 5,  'quickbooks_linked'),
  ('sov_created',         'SOV created',              'Setup',    55, NULL,       0,  'sov_created'),
  ('mobilization_billed', 'Mobilization billed',      'Setup',    57, 'contract', 0,  NULL),
  ('site_visit',          'Initial site visit',       'Field',    60, 'start',    -7, NULL),
  ('reports_sent',        'Reports sent to customer', 'Closeout', 80, 'end',      7,  NULL),
  ('final_invoice',       'Final invoice sent',       'Closeout', 90, NULL,       0,  'job_billed')
ON CONFLICT (key) DO NOTHING;

-- Daily JSA questions, version 1 draft (source: database/migrations/safety_01_questions.sql).
-- Stays a draft until the instance's safety lead approves it.
INSERT INTO neta_ops.safety_question_sets (version, edition, status, steps, notes, created_by_name)
VALUES (1, '2027', 'draft', $json$[
  {"key": "crew", "title": "Who's here",
   "prompt": "Name the person in charge today. Everyone working today joins the list.",
   "help": "The person in charge leads this briefing. Anyone not qualified for a task works under someone who is.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "in_charge", "text": "The person in charge is named.", "when": "always"},
     {"key": "everyone", "text": "Everyone working today is on the list, temps and subs included.", "when": "always"},
     {"key": "unqualified", "text": "Anyone not qualified for a task knows who is watching them.", "when": "always"}
   ]},
  {"key": "work", "title": "Today's work",
   "prompt": "Say what we're doing today, where, and on which gear. Say what changed from the plan.",
   "help": "Starts from the job's JHA and yesterday's JSA.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "tasks", "text": "Today's tasks and equipment are named.", "when": "always"},
     {"key": "changes", "text": "Changes from the JHA or yesterday are said out loud.", "when": "always"},
     {"key": "site_rules", "text": "Today's customer contact and site rules are known.", "when": "always"}
   ]},
  {"key": "hazards", "title": "Hazards",
   "prompt": "Go over each hazard in today's work and how we control it.",
   "help": "Starts from the work type and yesterday. Add anything new on site.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "controls", "text": "Each hazard has a control the crew agrees on.", "when": "always"},
     {"key": "our_gear", "text": "Hazards from our own test gear are covered: test voltage at the far end, stored charge.", "when": "always"},
     {"key": "others", "text": "Other trades and traffic near our work are covered.", "when": "always"}
   ]},
  {"key": "power", "title": "Power off or on",
   "prompt": "Can this be done with the power off? If yes, we make it safe before anyone touches it.",
   "help": "Power off is the goal. Keeping it on needs a reason, and live work needs a permit.",
   "refs": ["120.5", "130.3", "130.2(A)(2)"],
   "checks": [
     {"key": "sources", "text": "Every source found, backfeed included.", "when": "off"},
     {"key": "load_off", "text": "Load off, disconnects open.", "when": "off"},
     {"key": "seen_open", "text": "Blades seen open or breaker racked out.", "when": "off"},
     {"key": "stored", "text": "Stored energy released.", "when": "off"},
     {"key": "locks", "text": "Locks and tags on.", "when": "off"},
     {"key": "tested_dead", "text": "Tested dead at the work spot. Tester checked on a known source before and after.", "when": "off"},
     {"key": "grounds", "text": "Grounds on where needed.", "when": "off"},
     {"key": "why_on", "text": "We said why the power can't be off.", "when": "on"},
     {"key": "permit", "text": "Energized Work Permit signed when one is needed.", "when": "on"},
     {"key": "second_person", "text": "A second person trained in emergency response is named.", "when": "on"},
     {"key": "keep_out", "text": "Barricades or an attendant keep others out.", "when": "on"}
   ]},
  {"key": "shock_arc", "title": "Shock and arc flash",
   "prompt": "Read the label out loud: approach boundaries, arc flash boundary, and incident energy or PPE category.",
   "help": "Copy it from the equipment label. ampOS never works these out. No label or an old label: stop and call the PM. These apply until the gear is tested dead.",
   "refs": ["130.4", "130.5"],
   "checks": [
     {"key": "label", "text": "Label found and read out loud, or the missing label is reported.", "when": "always"},
     {"key": "approach", "text": "Limited and restricted approach boundaries are known.", "when": "always"},
     {"key": "arc_boundary", "text": "Arc flash boundary is marked.", "when": "always"},
     {"key": "qualified_only", "text": "Only qualified people cross the boundaries.", "when": "always"}
   ]},
  {"key": "ppe", "title": "PPE and tools",
   "prompt": "Check each item by eye before we use it.",
   "help": "PPE is the last line of defense, not the plan.",
   "refs": ["130.7"],
   "checks": [
     {"key": "arc_rated", "text": "Arc-rated clothing and face protection meet the label.", "when": "always"},
     {"key": "gloves", "text": "Rubber gloves inside their test date, air-tested today, with leather protectors.", "when": "always"},
     {"key": "meter", "text": "Meter and leads rated for the voltage and checked.", "when": "always"},
     {"key": "tools", "text": "Insulated tools, hot sticks and grounds in good shape.", "when": "always"},
     {"key": "test_set", "text": "Test set grounded and leads routed safely.", "when": "always"}
   ]},
  {"key": "emergency", "title": "Emergency plan",
   "prompt": "Read the plan out loud: who calls 911, where we meet EMS, the nearest hospital, and where the AED and first aid are.",
   "help": "Saved on the site, so it only gets typed once.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "caller", "text": "Who calls 911 and the site address are known.", "when": "always"},
     {"key": "meet_ems", "text": "Where to meet EMS is known.", "when": "always"},
     {"key": "hospital", "text": "Nearest hospital and the route are known.", "when": "always"},
     {"key": "aed", "text": "AED, first aid kit and fire extinguisher locations are known.", "when": "always"},
     {"key": "rescue", "text": "Someone trained in CPR and contact release is on site.", "when": "always"}
   ]},
  {"key": "sign", "title": "Sign",
   "prompt": "Each person signs to say they heard this briefing.",
   "help": "Sign on your own phone or on the lead's phone.",
   "refs": [],
   "checks": [
     {"key": "stop_work", "text": "Everyone knows they can stop the work if something changes.", "when": "always"}
   ]}
]$json$::jsonb,
'First draft, written by ampOS in our own words. Section numbers came from OSHA and training sites, not the book. The safety lead checks every one before approving.',
'ampOS')
ON CONFLICT (version) DO NOTHING;
