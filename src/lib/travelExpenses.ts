import { DEFAULT_ESTIMATING_PRESETS } from "../services/estimatingPresetsService";

/** Standard terminal/ground time (hours) added to a round-trip flight. */
export const AIR_TERMINAL_HOURS = 2;

/** A single "trip group" in the merged Travel section (vehicle miles + drive time). */
export const createEmptyTravelGroup = () => ({
  trips: 1,
  oneWayMiles: 0,
  numVehicles: DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
  numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
  rate: DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
});

export const DEFAULT_TRAVEL_DATA = {
  // Merged vehicle + drive-time section; one entry per trip group (add/remove).
  travel: [createEmptyTravelGroup()],
  perDiem: {
    numDays: 0,
    dailyRate: DEFAULT_ESTIMATING_PRESETS.default_per_diem_rate,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
  },
  lodging: {
    numNights: 0,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
    rate: DEFAULT_ESTIMATING_PRESETS.default_lodging_rate,
  },
  localMiles: {
    numDays: 0,
    numVehicles: DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
    milesPerDay: DEFAULT_ESTIMATING_PRESETS.default_local_miles_per_day,
    rate: DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
  },
  // Merged flights + air-time section.
  airTravel: {
    numMen: DEFAULT_ESTIMATING_PRESETS.default_flight_number_of_men,
    numTrips: 0,
    numFlights: 0,
    flightRate: DEFAULT_ESTIMATING_PRESETS.default_flight_rate,
    luggageFees: DEFAULT_ESTIMATING_PRESETS.default_flight_luggage_fees,
    oneWayHoursInAir: 0,
  },
  rentalCar: {
    numCars: DEFAULT_ESTIMATING_PRESETS.default_rental_number_of_cars,
    numDays: 0,
    rate: DEFAULT_ESTIMATING_PRESETS.default_rental_rate,
  },
};

const toNumOr = (val: any, fallback: number) => {
  const n = typeof val === "string" ? Number(val) : val;
  return Number.isFinite(n) ? n : fallback;
};

/** Normalize loaded quote travel_data to the merged shape, migrating legacy quotes
 *  (separate travelExpense/travelTime/flights/airTravelTime arrays, complex per diem). */
export function normalizeTravelData(parsed: any) {
  const d = DEFAULT_TRAVEL_DATA;
  const freshDefault = () => ({
    travel: [createEmptyTravelGroup()],
    perDiem: { ...d.perDiem },
    lodging: { ...d.lodging },
    localMiles: { ...d.localMiles },
    airTravel: { ...d.airTravel },
    rentalCar: { ...d.rentalCar },
  });

  if (!parsed || typeof parsed !== "object") return freshDefault();

  // --- Travel groups (new shape OR legacy travelExpense + travelTime) ---
  let travel: any[];
  if (Array.isArray(parsed.travel) && parsed.travel.length > 0) {
    travel = parsed.travel.map((g: any) => ({
      trips: toNumOr(g?.trips, 1),
      oneWayMiles: toNumOr(g?.oneWayMiles, 0),
      numVehicles: toNumOr(
        g?.numVehicles,
        DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
      ),
      numMen: toNumOr(
        g?.numMen,
        DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
      ),
      rate: toNumOr(
        g?.rate,
        DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
      ),
    }));
  } else if (
    Array.isArray(parsed.travelExpense) &&
    parsed.travelExpense.length > 0
  ) {
    travel = parsed.travelExpense.map((te: any, i: number) => {
      const tt = Array.isArray(parsed.travelTime) ? parsed.travelTime[i] : null;
      return {
        trips: toNumOr(te?.trips, 1),
        oneWayMiles: toNumOr(te?.oneWayMiles, 0),
        numVehicles: toNumOr(
          te?.numVehicles,
          DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
        ),
        numMen: toNumOr(
          tt?.numMen,
          DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
        ),
        rate: toNumOr(
          te?.rate,
          DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
        ),
      };
    });
  } else {
    travel = [createEmptyTravelGroup()];
  }

  // --- Single-object sections (new shape OR legacy [0]) ---
  const pickObj = (val: any) =>
    Array.isArray(val) ? val[0] : val && typeof val === "object" ? val : null;

  const pd = pickObj(parsed.perDiem) || {};
  const lo = pickObj(parsed.lodging) || {};
  const lm = pickObj(parsed.localMiles) || {};
  const rc = pickObj(parsed.rentalCar) || {};
  // airTravel may be new (object) or legacy (flights[] + airTravelTime[])
  const fl = pickObj(parsed.flights) || {};
  const att = pickObj(parsed.airTravelTime) || {};
  const at =
    parsed.airTravel && typeof parsed.airTravel === "object"
      ? parsed.airTravel
      : null;

  return {
    travel,
    perDiem: {
      numDays: toNumOr(pd.numDays, 0),
      dailyRate: toNumOr(
        pd.dailyRate ?? pd.firstDayRate,
        DEFAULT_ESTIMATING_PRESETS.default_per_diem_rate,
      ),
      numMen: toNumOr(
        pd.numMen,
        DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
      ),
    },
    lodging: {
      numNights: toNumOr(lo.numNights, 0),
      numMen: toNumOr(
        lo.numMen,
        DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
      ),
      rate: toNumOr(lo.rate, DEFAULT_ESTIMATING_PRESETS.default_lodging_rate),
    },
    localMiles: {
      numDays: toNumOr(lm.numDays, 0),
      numVehicles: toNumOr(
        lm.numVehicles,
        DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
      ),
      milesPerDay: toNumOr(
        lm.milesPerDay,
        DEFAULT_ESTIMATING_PRESETS.default_local_miles_per_day,
      ),
      rate: toNumOr(
        lm.rate,
        DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
      ),
    },
    airTravel: {
      numMen: toNumOr(
        at?.numMen ?? fl.numMen,
        DEFAULT_ESTIMATING_PRESETS.default_flight_number_of_men,
      ),
      numTrips: toNumOr(at?.numTrips ?? att.trips, 0),
      numFlights: toNumOr(at?.numFlights ?? fl.numFlights, 0),
      flightRate: toNumOr(
        at?.flightRate ?? fl.rate,
        DEFAULT_ESTIMATING_PRESETS.default_flight_rate,
      ),
      luggageFees: toNumOr(
        at?.luggageFees ?? fl.luggageFees,
        DEFAULT_ESTIMATING_PRESETS.default_flight_luggage_fees,
      ),
      oneWayHoursInAir: toNumOr(
        at?.oneWayHoursInAir ?? att.oneWayHoursInAir,
        0,
      ),
    },
    rentalCar: {
      numCars: toNumOr(
        rc.numCars,
        DEFAULT_ESTIMATING_PRESETS.default_rental_number_of_cars,
      ),
      // Legacy rental had no day count; total was cars*rate, so default days=1 preserves it.
      numDays: toNumOr(rc.numDays, 1),
      rate: toNumOr(rc.rate, DEFAULT_ESTIMATING_PRESETS.default_rental_rate),
    },
  };
}

/** Pure roll-up of all travel sections. Single source of truth for both the UI
 *  badges/totals and the estimate's cost/hours consumers (fixes the old [0]-only bug). */
export function computeTravelTotals(
  td: any,
  speed: number = DEFAULT_ESTIMATING_PRESETS.default_average_speed || 50,
) {
  const data = normalizeTravelData(td);
  const spd = speed > 0 ? speed : 50;

  const groups = data.travel.map((g: any) => {
    const vehicleMiles = g.oneWayMiles * 2 * g.trips * g.numVehicles;
    const vehicleCost = vehicleMiles * g.rate;
    const oneWayHours = g.oneWayMiles / spd;
    const groupHours = oneWayHours * 2 * g.trips * g.numMen;
    return { ...g, vehicleMiles, vehicleCost, oneWayHours, groupHours };
  });
  const travelVehicleMiles = groups.reduce(
    (s: number, g: any) => s + g.vehicleMiles,
    0,
  );
  const travelVehicleCost = groups.reduce(
    (s: number, g: any) => s + g.vehicleCost,
    0,
  );
  const travelHours = groups.reduce((s: number, g: any) => s + g.groupHours, 0);

  const perDiemPerMan = data.perDiem.numDays * data.perDiem.dailyRate;
  const perDiemTotal = perDiemPerMan * data.perDiem.numMen;

  const manNights = data.lodging.numNights * data.lodging.numMen;
  const lodgingTotal = manNights * data.lodging.rate;

  const localTotalMiles =
    data.localMiles.numDays *
    data.localMiles.numVehicles *
    data.localMiles.milesPerDay;
  const localMilesTotal = localTotalMiles * data.localMiles.rate;

  const flightTotal =
    data.airTravel.numFlights *
    data.airTravel.numMen *
    (data.airTravel.flightRate + data.airTravel.luggageFees);
  const airRoundTripTerminal =
    data.airTravel.oneWayHoursInAir * 2 + AIR_TERMINAL_HOURS;
  const airHours =
    airRoundTripTerminal * data.airTravel.numTrips * data.airTravel.numMen;

  const carDays = data.rentalCar.numCars * data.rentalCar.numDays;
  const rentalTotal = carDays * data.rentalCar.rate;

  const nonLaborCost =
    travelVehicleCost +
    perDiemTotal +
    lodgingTotal +
    localMilesTotal +
    flightTotal +
    rentalTotal;
  const laborHours = travelHours + airHours;

  return {
    groups,
    travel: {
      vehicleMiles: travelVehicleMiles,
      cost: travelVehicleCost,
      hours: travelHours,
    },
    perDiem: { perMan: perDiemPerMan, total: perDiemTotal },
    lodging: { manNights, total: lodgingTotal },
    localMiles: { totalMiles: localTotalMiles, total: localMilesTotal },
    airTravel: {
      flightTotal,
      roundTripTerminal: airRoundTripTerminal,
      hours: airHours,
    },
    rentalCar: { carDays, total: rentalTotal },
    nonLaborCost,
    laborHours,
  };
}
