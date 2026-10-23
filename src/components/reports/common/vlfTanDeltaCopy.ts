/**
 * "Save as Tan Delta report" for the MV cable VLF (withstand) ATS report.
 *
 * Tan delta is often run later on a cable that already has a withstand
 * report. The copy keeps every field (nameplate, insulation, withstand
 * readings) so the tech only types the tan delta numbers. The tan delta
 * section itself is left out: the VLF + Tan Delta report fills it with its
 * own defaults on load.
 *
 * The two forms name a few fields differently, so those are mapped across.
 * Withstand checklist items with no slot on the tan delta form (7.3.3.A.1
 * compare data, A.9 identification, A.10 jacket) stay in the data but are
 * not shown there.
 */

type Form = Record<string, any>;

export function buildVlfTanDeltaCopy(withstandForm: Form): Form {
  const vi = withstandForm.visualInspection ?? {};
  const eq = withstandForm.equipment ?? {};
  const { tanDeltaTest, ...rest } = withstandForm;

  return {
    ...rest,
    visualInspection: {
      ...vi,
      inspectCablesAndConnectors: vi.inspectDamage,
      inspectShieldGrounding: vi.inspectGrounding,
      verifyBendRadius: vi.verifyBends,
    },
    equipment: {
      ...eq,
      ohmAmpId: eq.ohmmeterAmpId || eq.ampId || "",
      megohmAmpId: eq.megohmmeterAmpId || "",
      vlfAmpId: eq.vlfAmpId || eq.ampId || "",
    },
  };
}
