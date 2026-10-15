/**
 * "Copy nameplate data to new report" for the medium-voltage cable reports.
 *
 * The four MV cable forms (VLF, VLF MTS, VLF + Tan Delta, Tan Delta MTS 23)
 * share one form shape, so they share one rule for what a copy keeps:
 *
 * - the job, crew, substation, location and temperature: the next run is
 *   tested by the same crew, in the same place, on the same day;
 * - the cable and termination nameplate;
 * - the test set-up: insulation test voltage and units, withstand steps and
 *   kVAC, tan delta system voltage and steps.
 *
 * Everything else comes from the blank report, so From/To, length, test
 * equipment and every reading start empty. Building on the blank (rather than
 * clearing fields off the template) means a reading this list does not know
 * about can never ride along into the copy.
 */

type Form = Record<string, any>;

const clearWithstandPhase = (phase: any) => ({ ...phase, mA: "", nF: "" });

export function buildMvCableNameplateCopy<T extends object>(
  currentForm: T,
  blankForm: T,
): T {
  const current = currentForm as Form;
  const blank = blankForm as Form;
  const copy: Form = {
    ...blank,
    reportInfo: current.reportInfo ?? blank.reportInfo,
    customerName: current.customerName,
    siteAddress: current.siteAddress,
    contactPerson: current.contactPerson,
    contactPhone: current.contactPhone,
    contactEmail: current.contactEmail,
    jobNumber: current.jobNumber,
    testedBy: current.testedBy,
    testDate: new Date().toISOString().split("T")[0],
    location: current.location,
    equipmentLocation: current.equipmentLocation,
    temperature: { ...blank.temperature, ...current.temperature },
    cableType: current.cableType,
    operatingVoltage: current.operatingVoltage,
    // The run itself (where it goes and how long it is) is what changes.
    cableInfo: {
      ...blank.cableInfo,
      ...current.cableInfo,
      testedFrom: "",
      testedTo: "",
      from: "",
      to: "",
      length: "",
    },
    cableLength: "",
    terminationData: { ...blank.terminationData, ...current.terminationData },
    shieldContinuity: {
      ...blank.shieldContinuity,
      unit: current.shieldContinuity?.unit || blank.shieldContinuity?.unit,
    },
    insulationTest: {
      ...blank.insulationTest,
      testVoltage:
        current.insulationTest?.testVoltage || blank.insulationTest?.testVoltage,
      unit: current.insulationTest?.unit || blank.insulationTest?.unit,
    },
    // Same steps at the same voltages; readings cleared.
    withstandTest: {
      ...blank.withstandTest,
      readings: (
        current.withstandTest?.readings ||
        blank.withstandTest?.readings ||
        []
      ).map((reading: any) => ({
        ...reading,
        phaseA: clearWithstandPhase(reading.phaseA),
        phaseB: clearWithstandPhase(reading.phaseB),
        phaseC: clearWithstandPhase(reading.phaseC),
      })),
    },
  };

  // Only the Tan Delta forms have this section.
  if (blank.tanDeltaTest) {
    const blankStep = blank.tanDeltaTest.values?.[0] || {};
    copy.tanDeltaTest = {
      ...blank.tanDeltaTest,
      systemVoltageL2G:
        current.tanDeltaTest?.systemVoltageL2G ||
        blank.tanDeltaTest.systemVoltageL2G,
      testVoltage: current.tanDeltaTest?.testVoltage || "",
      frequency:
        current.tanDeltaTest?.frequency || blank.tanDeltaTest.frequency,
      values: (current.tanDeltaTest?.values || blank.tanDeltaTest.values).map(
        (row: any) => ({
          voltageStep: row.voltageStep,
          kV: row.kV,
          phaseA: { ...blankStep.phaseA },
          phaseB: { ...blankStep.phaseB },
          phaseC: { ...blankStep.phaseC },
        }),
      ),
    };
  }

  return copy as T;
}
