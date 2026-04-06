import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tab, Dialog } from '@headlessui/react';
import { X, GripHorizontal, Copy, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/AuthContext';
import { getEstimatingPresets, EstimatingPresets, DEFAULT_ESTIMATING_PRESETS } from '../../services/estimatingPresetsService';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { ProposalScopeNotesModal } from './ProposalScopeNotesModal';

// Styles from the original code
const styles = {
  app: {
    fontFamily: 'Arial, sans-serif',
    margin: '0 auto',
    padding: '20px',
  },
  title: {
    textAlign: 'center',
    color: 'var(--text-color)',
    marginBottom: '30px',
  },
  headerSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
    marginBottom: '20px',
  },
  formGroup: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  formLabel: {
    fontWeight: 'bold',
    marginBottom: '5px',
    color: 'var(--text-color)',
  },
  formInput: {
    padding: '8px',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-color)',
  },
  ratesSection: {
    display: 'flex',
    gap: '15px',
    marginBottom: '20px',
  },
  tableContainer: {
    overflowX: 'auto' as const,
    marginBottom: '20px',
  },
  table: {
    width: '100%',
    minWidth: 'max-content',
    tableLayout: 'fixed' as const,
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
    backgroundColor: 'var(--table-bg)',
  },
  tableHeader: {
    backgroundColor: 'var(--header-bg)',
    padding: '10px',
    textAlign: 'center' as const,
    border: '1px solid var(--border-color)',
    fontWeight: 'bold',
    color: 'var(--text-color)',
  },
  tableCell: {
    padding: '5px',
    border: '1px solid var(--border-color)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--cell-bg)',
    color: 'var(--text-color)',
  },
  tableInput: {
    width: '95%',
    padding: '5px',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    textAlign: 'center' as const,
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-color)',
  },
  calculated: {
    backgroundColor: 'var(--calculated-bg)',
    fontWeight: 'bold',
    color: 'var(--text-color)',
  },
  summarySection: {
    marginTop: '20px',
    width: '400px',
    marginLeft: 'auto',
    backgroundColor: 'var(--summary-bg)',
    padding: '15px',
    borderRadius: '4px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-color)',
  },
  summaryLabel: {
    fontWeight: 'bold',
    color: 'var(--text-color)',
  },
  summaryValue: {
    textAlign: 'right' as const,
    minWidth: '120px',
    color: 'var(--text-color)',
  },
  grandTotal: {
    fontSize: '1.2em',
    fontWeight: 'bold',
    borderTop: '2px solid var(--border-color)',
    paddingTop: '10px',
    backgroundColor: 'var(--total-bg)',
  },
  totalLabel: {
    textAlign: 'right',
    fontWeight: 'bold',
  },
  totalValue: {
    fontWeight: 'bold',
    backgroundColor: 'var(--total-bg)',
  },
  tfoot: {
    borderTop: '2px solid var(--border-color)',
  },
  sectionHeader: {
    fontSize: '1.1em',
    fontWeight: 'bold',
    backgroundColor: 'var(--header-bg)',
    padding: '10px',
    marginTop: '20px',
    marginBottom: '10px',
    color: 'var(--text-color)',
  },
};

interface EstimateSheetProps {
  opportunityId: string;
  mode?: 'new' | 'view' | 'letter' | 'letters' | 'combined-letter';
  openSignal?: number;
}

interface OpportunityData {
  title?: string;
  description: string;
  quote_number?: string;
  jobsite_location?: string;
  customer: {
    id: string;
    name: string;
    company_name: string;
    address: string;
  };
}

interface EstimateData {
  // Optional custom title shown in tabs and selectors; falls back to Quote <number>
  title?: string;
  client: string;
  jobDescription: string;
  dateDue: string;
  location: string;
  periodOfPerformance: string;
  estimatedStartDate: string;
  poNumber: string;
  notes: string;
  
  // SOV items (the main items)
  sovItems: {
    item: string;
    quantity: number;
    materialPrice: number;
    expensePrice: number;
    laborMen: number;
    laborHours: number;
    notes: string;
  }[];
  
  // Non-SOV items (reports, shipping, etc.)
  nonSovItems: {
    item: string;
    quantity: number;
    materialPrice: number;
    expensePrice: number;
    laborMen: number;
    laborHours: number;
    notes: string;
  }[];
  
  calculatedValues: {
    subtotalMaterial: number;
    subtotalExpense: number;
    subtotalLabor: number;
    totalMaterial: number;
    totalExpense: number;
    totalLabor: number;
    grandTotal: number;
    
    // New fields for Non-SOV
    nonSovMaterial: number;
    nonSovExpense: number;
    nonSovLabor: number;
    
    // Summary fields
    sovLaborHours: number;
    nonSovLaborHours: number;
    totalLaborHours: number;
  };
  
  // Hours summary section
  hoursSummary: {
    men: number;
    hoursPerDay: number;
    daysOnsite: number;
    workHours: number;
    nonSovHours: number;
    travelHours: number;
    totalHours: number;
    // Labor rate breakdown
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    // Travel hours allocated in labor tracking table
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };

  // Saturday labor hours tracking (alternate scenario)
  saturdayHoursSummary?: {
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };

  // Sunday/Holiday labor hours tracking (alternate scenario)
  sundayHoursSummary?: {
    straightTimeHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    travelStraightTimeHours: number;
    travelOvertimeHours: number;
    travelDoubleTimeHours: number;
  };
}

const DEFAULT_LINE_COUNT = 5;
const EMPTY_LINE_ITEM = {
  item: '',
  quantity: 0,
  materialPrice: 0,
  expensePrice: 0,
  laborMen: 0,
  laborHours: 0,
  notes: ''
};

// Default Non-SOV items
const DEFAULT_NON_SOV_ITEMS = [
  {
    item: 'Reports',
    quantity: 1,
    materialPrice: 0,
    expensePrice: 0,
    laborMen: 0,
    laborHours: 0,
    notes: ''
  },
  {
    item: 'Project Management',
    quantity: 1,
    materialPrice: 0,
    expensePrice: 0,
    laborMen: 0,
    laborHours: 0,
    notes: ''
  },
  {
    item: 'Shipping/ Postage',
    quantity: 1,
    materialPrice: 0,
    expensePrice: 0,
    laborMen: 0,
    laborHours: 0,
    notes: ''
  },
  {
    item: 'Equipment Rental',
    quantity: 1,
    materialPrice: 0,
    expensePrice: 0,
    laborMen: 0,
    laborHours: 0,
    notes: ''
  },
  {
    item: 'Equipment Purchase',
    quantity: 1,
    materialPrice: 0,
    expensePrice: 0,
    laborMen: 0,
    laborHours: 0,
    notes: ''
  }
];

const EMPTY_TRAVEL_ITEM = {
  trips: 1,
  oneWayMiles: 0,
  roundTripMiles: 0,
  totalVehicleMiles: 0,
  numVehicles: DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
  totalMiles: 0,
  rate: DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
  vehicleTravelCost: 0
};

const DEFAULT_TRAVEL_DATA = {
  travelExpense: [{ ...EMPTY_TRAVEL_ITEM, numVehicles: DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles, rate: DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile }],
  travelTime: [{
    trips: 1,
    oneWayHours: 0,
    roundTripHours: 0,
    totalTravelHours: 0,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
    grandTotalTravelHours: 0,
    rate: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    totalTravelLabor: 0
  }],
  perDiem: [{
    numDays: 0,
    firstDayRate: DEFAULT_ESTIMATING_PRESETS.default_per_diem_rate,
    lastDayRate: DEFAULT_ESTIMATING_PRESETS.default_per_diem_rate,
    dailyRate: DEFAULT_ESTIMATING_PRESETS.default_per_diem_rate,
    additionalDays: -2,
    totalPerDiemPerMan: 0,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
    totalPerDiem: 0
  }],
  lodging: [{
    numNights: 0,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
    manNights: 0,
    rate: DEFAULT_ESTIMATING_PRESETS.default_lodging_rate,
    totalAmount: 0
  }],
  localMiles: [{
    numDays: 0,
    numVehicles: DEFAULT_ESTIMATING_PRESETS.default_number_of_vehicles,
    milesPerDay: DEFAULT_ESTIMATING_PRESETS.default_local_miles_per_day,
    totalMiles: 0,
    rate: DEFAULT_ESTIMATING_PRESETS.default_vehicle_cost_per_mile,
    totalLocalMilesCost: 0
  }],
  flights: [{
    numFlights: 0,
    numMen: DEFAULT_ESTIMATING_PRESETS.default_flight_number_of_men,
    rate: DEFAULT_ESTIMATING_PRESETS.default_flight_rate,
    luggageFees: DEFAULT_ESTIMATING_PRESETS.default_flight_luggage_fees,
    totalFlightAmount: 0
  }],
  airTravelTime: [{
    trips: 0,
    oneWayHoursInAir: 0,
    roundTripTerminalTime: 0,
    totalTravelHours: 0,
    numMen: 0,
    grandTotalTravelHours: 0,
    rate: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    totalTravelLabor: 0
  }],
  rentalCar: [{
    numCars: DEFAULT_ESTIMATING_PRESETS.default_rental_number_of_cars,
    rate: DEFAULT_ESTIMATING_PRESETS.default_rental_rate,
    totalAmount: 0
  }],
  /** When true (default), changing # of men in one travel section updates the others. When false, each section keeps its own value. */
  numMenLinked: true
};

/** Ensure loaded quote travel_data has all required arrays so .map() never runs on undefined.
 *  Always clones default arrays to avoid mutating the module-level constant. */
function normalizeTravelData(parsed: any) {
  const d = DEFAULT_TRAVEL_DATA;
  const cloneArr = (arr: any[]) => arr.map(item => ({ ...item }));
  if (!parsed || typeof parsed !== 'object') return {
    ...d,
    travelExpense: cloneArr(d.travelExpense),
    travelTime: cloneArr(d.travelTime),
    perDiem: cloneArr(d.perDiem),
    lodging: cloneArr(d.lodging),
    localMiles: cloneArr(d.localMiles),
    flights: cloneArr(d.flights),
    airTravelTime: cloneArr(d.airTravelTime),
    rentalCar: cloneArr(d.rentalCar)
  };
  return {
    ...d,
    ...parsed,
    travelExpense: Array.isArray(parsed.travelExpense) && parsed.travelExpense.length > 0 ? parsed.travelExpense : cloneArr(d.travelExpense),
    travelTime: Array.isArray(parsed.travelTime) && parsed.travelTime.length > 0 ? parsed.travelTime : cloneArr(d.travelTime),
    perDiem: Array.isArray(parsed.perDiem) && parsed.perDiem.length > 0 ? parsed.perDiem : cloneArr(d.perDiem),
    lodging: Array.isArray(parsed.lodging) && parsed.lodging.length > 0 ? parsed.lodging : cloneArr(d.lodging),
    localMiles: Array.isArray(parsed.localMiles) && parsed.localMiles.length > 0 ? parsed.localMiles : cloneArr(d.localMiles),
    flights: Array.isArray(parsed.flights) && parsed.flights.length > 0 ? parsed.flights : cloneArr(d.flights),
    airTravelTime: Array.isArray(parsed.airTravelTime) && parsed.airTravelTime.length > 0 ? parsed.airTravelTime : cloneArr(d.airTravelTime),
    rentalCar: Array.isArray(parsed.rentalCar) && parsed.rentalCar.length > 0 ? parsed.rentalCar : cloneArr(d.rentalCar),
    numMenLinked: parsed.numMenLinked !== false
  };
}

interface QuoteData {
  id: string;
  created_at: string;
  data: any;
  travel_data: any;
  quote_number?: string;
  status?: 'in_progress' | 'ready_for_review' | 'approved_to_send' | 'sent' | 'no_quote' | null;
}

/** Labor rates from each estimate's saved JSON — combined letters must not use the active tab's rates for every scope. */
function getHourlyRatesForCombinedScope(parsedData: any): {
  straightTime: number;
  overtime: number;
  doubleTime: number;
} {
  const hr = parsedData?.hourlyRates;
  if (hr && typeof hr === 'object') {
    const st = Number(hr.straightTime);
    const ot = Number(hr.overtime);
    const dt = Number(hr.doubleTime);
    return {
      straightTime: Number.isFinite(st) ? st : DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
      overtime: Number.isFinite(ot) ? ot : DEFAULT_ESTIMATING_PRESETS.overtime_rate,
      doubleTime: Number.isFinite(dt) ? dt : DEFAULT_ESTIMATING_PRESETS.double_time_rate,
    };
  }
  return {
    straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
    doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate,
  };
}

export default function EstimateSheet({ opportunityId, mode, openSignal }: EstimateSheetProps) {
  const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const [isOpen, setIsOpen] = useState(true);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [selectedQuoteIndex, setSelectedQuoteIndex] = useState<number>(-1);
  const [isNewQuote, setIsNewQuote] = useState(true);
  const [hasQuote, setHasQuote] = useState(false);
  const [estimateStatus, setEstimateStatus] = useState<'in_progress' | 'ready_for_review' | 'approved_to_send' | 'sent' | 'no_quote' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [isGettingData, setIsGettingData] = useState(true);
  const [opportunityData, setOpportunityData] = useState<OpportunityData | null>(null);
  const [isManualLaborHours, setIsManualLaborHours] = useState(false);
  const [isManualTravelLaborHours, setIsManualTravelLaborHours] = useState(false);
  const [showSaturdayHours, setShowSaturdayHours] = useState(false);
  const [showSundayHours, setShowSundayHours] = useState(false);
  const [isManualSaturdayHours, setIsManualSaturdayHours] = useState(false);
  const [isManualSundayHours, setIsManualSundayHours] = useState(false);
  const [letterPaymentTerm, setLetterPaymentTerm] = useState<'net30' | 'net60' | 'net90'>('net30');
  const [letterShowAllTerms, setLetterShowAllTerms] = useState(true);
  const [letterIncludeMF, setLetterIncludeMF] = useState(true);
  const [letterIncludeSaturday, setLetterIncludeSaturday] = useState(false);
  const [letterIncludeSunday, setLetterIncludeSunday] = useState(false);
  const [linkLocalTravelToDays, setLinkLocalTravelToDays] = useState(false);
  const [linkOutOfTownTravelToDays, setLinkOutOfTownTravelToDays] = useState(false);
  const { user } = useAuth(); // Get user at component level
  const { preferences, updatePreference, deletePreference } = useUserPreferences();

  // State for the travel data object - uses DEFAULT_TRAVEL_DATA so all arrays are always defined
  const [travelData, setTravelData] = useState({ ...DEFAULT_TRAVEL_DATA });

  // State for the main data object
  const [data, setData] = useState<EstimateData>(() => {
    const defaults: EstimateData = {
      title: '',
      client: '',
      jobDescription: '',
      dateDue: '',
      location: '',
      periodOfPerformance: '',
      estimatedStartDate: '',
      poNumber: '',
      notes: '',
      sovItems: Array(DEFAULT_LINE_COUNT).fill(null).map(() => ({ ...EMPTY_LINE_ITEM })),
      nonSovItems: [...DEFAULT_NON_SOV_ITEMS],
      calculatedValues: {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0
      },
      hoursSummary: {
        men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
        hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
        daysOnsite: 0,
        workHours: 0,
        nonSovHours: 0,
        travelHours: 0,
        totalHours: 0,
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0
      }
    };
    // Initial data is loaded from Supabase preferences in useEffect below
    return defaults;
  });

  // Track fields temporarily displayed as blank (for backspace over 0)
  const [blankingKeys, setBlankingKeys] = useState<Set<string>>(new Set());
  const makeKey = (section: 'sov' | 'nonSov', index: number, field: string) => `${section}:${index}:${field}`;
  
  // Drag and drop state
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [draggedItemType, setDraggedItemType] = useState<'sov' | 'nonSov' | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Tab drag and drop state
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
  const isDraggingTabRef = useRef<boolean>(false);
  
  // Payment term factors state
  const [paymentTermFactors, setPaymentTermFactors] = useState({
    net30: 1.00,
    net60: 1.06,
    net90: 1.09
  });
  
  // Mobilization factors state (threshold-based)
  // base: <= 100,000; over100k: > 100,000; over500k: > 500,000; over1m: > 1,000,000
  const [mobilizationFactors, setMobilizationFactors] = useState({
    base: 0.00,
    over100k: 0.10,
    over500k: 0.05,
    over1m: 0.05
  });
  // Quantity for this estimate when included in a combined letter proposal (default 1)
  const [combinedLetterQuantity, setCombinedLetterQuantity] = useState<number>(1);
  const draftKey = `estimate-draft-${opportunityId}`;
  const skipNextFocusRef = React.useRef<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  const DEFAULT_ITEM_COL_WIDTH = 240;
  const MAX_ITEM_COL_WIDTH = 1200; // clamp so columns never render "really long" (e.g. Windows/cross-browser)
  const estimateColWidthKey = 'estimateItemColWidth';

  const clampColWidth = (w: number) => Math.max(1, Math.min(MAX_ITEM_COL_WIDTH, Number(w) || DEFAULT_ITEM_COL_WIDTH));
  const toPx = (w: number) => `${clampColWidth(w)}px`;

  const [itemColWidth, setItemColWidth] = useState<number>(() => {
    const saved = preferences?.ui?.[estimateColWidthKey];
    return typeof saved === 'number' && saved > 0 ? clampColWidth(saved) : DEFAULT_ITEM_COL_WIDTH;
  });
  const [nonSovItemColWidth, setNonSovItemColWidth] = useState<number>(() => {
    const saved = preferences?.ui?.[estimateColWidthKey];
    return typeof saved === 'number' && saved > 0 ? clampColWidth(saved) : DEFAULT_ITEM_COL_WIDTH;
  });

  // Apply saved column width once when preferences first load (clamped so huge saved values don't break layout)
  const appliedSavedColWidthRef = useRef(false);
  useEffect(() => {
    if (appliedSavedColWidthRef.current) return;
    if (preferences?.ui === undefined) return; // prefs not loaded yet
    appliedSavedColWidthRef.current = true;
    const saved = preferences.ui[estimateColWidthKey];
    if (typeof saved === 'number' && saved > 0) {
      const w = clampColWidth(saved);
      setItemColWidth(w);
      setNonSovItemColWidth(w);
    }
  }, [preferences?.ui]);

  // Persist column width when user resizes (debounced) so it sticks across sessions and devices
  useEffect(() => {
    if (!appliedSavedColWidthRef.current) return;
    const t = setTimeout(() => {
      const w = clampColWidth(itemColWidth);
      updatePreference(`ui.${estimateColWidthKey}`, w);
    }, 1000);
    return () => clearTimeout(t);
  }, [itemColWidth, updatePreference]);

  const itemHeaderRef = useRef<HTMLTableCellElement>(null);
  const nonSovItemHeaderRef = useRef<HTMLTableCellElement>(null);
  const isResizingItemRef = useRef(false);
  const isResizingNonSovRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const startNonSovWidthRef = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const onItemMouseDown = (e: React.MouseEvent) => {
    if (!itemHeaderRef.current) return;
    isResizingItemRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = itemColWidth;
    setIsResizing(true);
    e.preventDefault();
  };

  const onNonSovItemMouseDown = (e: React.MouseEvent) => {
    if (!nonSovItemHeaderRef.current) return;
    isResizingNonSovRef.current = true;
    startXRef.current = e.clientX;
    startNonSovWidthRef.current = nonSovItemColWidth;
    setIsResizing(true);
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isResizingItemRef.current) {
      const delta = e.clientX - startXRef.current;
      setItemColWidth(Math.max(1, startWidthRef.current + delta));
    } else if (isResizingNonSovRef.current) {
      const delta = e.clientX - startXRef.current;
      setNonSovItemColWidth(Math.max(1, startNonSovWidthRef.current + delta));
    }
    e.preventDefault();
  };

  const onMouseUp = () => {
    if (isResizingItemRef.current) {
      isResizingItemRef.current = false;
    }
    if (isResizingNonSovRef.current) {
      isResizingNonSovRef.current = false;
    }
    setIsResizing(false);
  };

  // Document-level listeners so resize keeps working when cursor leaves the table (e.g. small window)
  useEffect(() => {
    if (!isResizing) return;
    const moveHandler = (e: MouseEvent) => {
      if (isResizingItemRef.current) {
        const delta = e.clientX - startXRef.current;
        setItemColWidth(Math.max(1, startWidthRef.current + delta));
      } else if (isResizingNonSovRef.current) {
        const delta = e.clientX - startXRef.current;
        setNonSovItemColWidth(Math.max(1, startNonSovWidthRef.current + delta));
      }
      e.preventDefault();
    };
    const upHandler = () => {
      isResizingItemRef.current = false;
      isResizingNonSovRef.current = false;
      setIsResizing(false);
    };
    document.addEventListener('mousemove', moveHandler, true);
    document.addEventListener('mouseup', upHandler, true);
    return () => {
      document.removeEventListener('mousemove', moveHandler, true);
      document.removeEventListener('mouseup', upHandler, true);
    };
  }, [isResizing]);
  
  // Fetch opportunity data
  useEffect(() => {
    async function fetchOpportunityData() {
      try {
        // 1. Fetch Opportunity from business schema
        const opportunityColumns = 'id, title, description, customer_id, contact_id, quote_number, jobsite_location';
        const { data: oppData, error: oppError } = await supabase
          .schema('business')
          .from('opportunities')
          .select(opportunityColumns)
          .eq('id', opportunityId)
          .single();

        if (oppError) {
          console.error('Error fetching opportunity data:', oppError);
          throw oppError;
        }

        if (!oppData) {
          console.error('Opportunity not found:', opportunityId);
          return;
        }

        // 2. Fetch Customer from common schema if customer_id exists
        let customerInfo: OpportunityData['customer'] | null = null;
        if (oppData.customer_id) {
          const { data: custData, error: custError } = await supabase
            .schema('common')
            .from('customers')
            .select('id, name, company_name, address')
            .eq('id', oppData.customer_id)
            .single<OpportunityData['customer']>();
          if (!custError && custData) {
            customerInfo = custData;
          }
          // Fetch the specific contact linked to the opportunity, not the customer's primary contact
          if (oppData.contact_id) {
            const { data: contactInfo, error: contactError } = await supabase
              .schema('common')
              .from('contacts')
              .select('first_name, last_name')
              .eq('id', oppData.contact_id)
              .single();
            if (!contactError && contactInfo) {
              setContactData(contactInfo);
            } else {
              console.warn('Could not fetch opportunity contact, falling back to customer primary contact');
              // Fallback to customer primary contact if opportunity contact not found
              const { data: contactList, error: fallbackError } = await supabase
                .schema('common')
                .from('contacts')
                .select('first_name, last_name, is_primary')
                .eq('customer_id', oppData.customer_id)
                .order('is_primary', { ascending: false });
              if (!fallbackError && contactList && contactList.length > 0) {
                const primary = contactList.find((c: any) => c.is_primary);
                setContactData(primary || contactList[0]);
              } else {
                setContactData(null);
              }
            }
          } else {
            console.warn('No contact_id on opportunity, using customer primary contact');
            // No contact_id on opportunity, use customer primary contact
            const { data: contactList, error: contactError } = await supabase
              .schema('common')
              .from('contacts')
              .select('first_name, last_name, is_primary')
              .eq('customer_id', oppData.customer_id)
              .order('is_primary', { ascending: false });
            if (!contactError && contactList && contactList.length > 0) {
              const primary = contactList.find((c: any) => c.is_primary);
              setContactData(primary || contactList[0]);
            } else {
              setContactData(null);
            }
          }
        } else {
          setContactData(null);
        }

        // 3. Combine data and set state
        const transformedData = {
          title: oppData.title,
          description: oppData.description || '',
          quote_number: (oppData as any).quote_number || '',
          jobsite_location: oppData.jobsite_location,
          customer: customerInfo || {
            id: '',
            name: '',
            company_name: '',
            address: ''
          }
        };
        setOpportunityData(transformedData);
        const customerName = transformedData.customer.company_name || transformedData.customer.name || '';
        setData(prev => ({
          ...prev,
          client: customerName,
          jobDescription: transformedData.description,
          location: transformedData.customer.address || ''
        }));
      } catch (error) {
        console.error('Error in fetchOpportunityData useEffect:', error);
      }
    }
    if (opportunityId) {
      fetchOpportunityData();
    }
  }, [opportunityId]);

  // Only fetch existing estimates automatically when not actively editing a new quote
  useEffect(() => {
    if (!isOpen || !isNewQuote) {
      fetchEstimateData();
    }
  }, [opportunityId, isOpen, isNewQuote]);

  // Restore draft from Supabase preferences when opening 'new' estimate for this opportunity
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      const savedDraft = preferences.drafts?.[draftKey];
      if (savedDraft && typeof savedDraft === 'object') {
        // Extract payment term factors if they exist
        const { paymentTermFactors: savedFactors, mobilizationFactors: savedMobilization, ...restData } = savedDraft;
        
        // Restore data
        setData((prev) => ({ ...prev, ...restData }));
        
        // Restore payment term factors if they exist
        if (savedFactors && typeof savedFactors === 'object') {
          setPaymentTermFactors(prev => ({ ...prev, ...savedFactors }));
        }
        // Restore mobilization factors if they exist
        if (savedMobilization && typeof savedMobilization === 'object') {
          setMobilizationFactors(prev => ({ ...prev, ...savedMobilization }));
        }
        // Restore quantity for combined letter if in draft
        if (savedDraft.combinedLetterQuantity !== undefined && savedDraft.combinedLetterQuantity !== null) {
          const qty = Math.max(1, Math.floor(Number(savedDraft.combinedLetterQuantity)) || 1);
          setCombinedLetterQuantity(qty);
        } else {
          setCombinedLetterQuantity(1);
        }
        
        setDraftRestored(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNewQuote, opportunityId, preferences.drafts]);

  // Persist draft to Supabase preferences on changes while editing a new quote
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      const draftData = {
        ...data,
        paymentTermFactors,
        mobilizationFactors,
        combinedLetterQuantity
      };
      // Save to Supabase (debounced by the service)
      updatePreference(`drafts.${draftKey}`, draftData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, paymentTermFactors, mobilizationFactors, combinedLetterQuantity, isOpen, isNewQuote, opportunityId]);

  // Function to get saved tab order from Supabase preferences
  const getSavedTabOrder = useCallback((): string[] | null => {
    const tabOrderKey = `estimate-tab-order-${opportunityId}`;
    const saved = preferences.ui?.[tabOrderKey];
    return Array.isArray(saved) ? saved : null;
  }, [opportunityId, preferences.ui]);

  // Function to save tab order to Supabase preferences
  const saveTabOrder = useCallback((quoteIds: string[]) => {
    const tabOrderKey = `estimate-tab-order-${opportunityId}`;
    updatePreference(`ui.${tabOrderKey}`, quoteIds);
  }, [opportunityId, updatePreference]);

  // Letter proposal preference keys
  const letterDraftKey = `letter-proposal-draft-${opportunityId}`;
  const letterOpenKey = `letter-proposal-open-${opportunityId}`;
  const letterQuoteIndexKey = `letter-quote-index-${opportunityId}`;
  const letterNetaStandardKey = `letter-neta-standard-${opportunityId}`;

  // Helper to get letter proposal state from Supabase preferences
  const getLetterProposalState = useCallback(() => {
    return {
      html: preferences.drafts?.[letterDraftKey] as string | null,
      isOpen: preferences.ui?.[letterOpenKey] === true || preferences.ui?.[letterOpenKey] === 'true',
      quoteIndex: preferences.ui?.[letterQuoteIndexKey] as number | null,
      netaStandard: preferences.ui?.[letterNetaStandardKey] as string | null
    };
  }, [preferences.drafts, preferences.ui, letterDraftKey, letterOpenKey, letterQuoteIndexKey, letterNetaStandardKey]);

  // Helper to save letter proposal HTML to Supabase (debounced by service)
  const saveLetterProposalHtml = useCallback((html: string) => {
    updatePreference(`drafts.${letterDraftKey}`, html);
  }, [updatePreference, letterDraftKey]);

  // Helper to save letter proposal open state
  const saveLetterProposalOpen = useCallback((isOpen: boolean) => {
    updatePreference(`ui.${letterOpenKey}`, isOpen);
  }, [updatePreference, letterOpenKey]);

  // Helper to save letter quote index
  const saveLetterQuoteIndex = useCallback((index: number | null) => {
    if (index !== null) {
      updatePreference(`ui.${letterQuoteIndexKey}`, index);
    }
  }, [updatePreference, letterQuoteIndexKey]);

  // Helper to save letter NETA standard
  const saveLetterNetaStandard = useCallback((standard: string) => {
    if (standard) {
      updatePreference(`ui.${letterNetaStandardKey}`, standard);
    }
  }, [updatePreference, letterNetaStandardKey]);

  // Helper to clear all letter proposal state from Supabase
  const clearLetterProposalState = useCallback(async () => {
    await Promise.all([
      deletePreference(`drafts.${letterDraftKey}`),
      deletePreference(`ui.${letterOpenKey}`),
      deletePreference(`ui.${letterQuoteIndexKey}`),
      deletePreference(`ui.${letterNetaStandardKey}`)
    ]);
  }, [deletePreference, letterDraftKey, letterOpenKey, letterQuoteIndexKey, letterNetaStandardKey]);

  // Function to apply saved order to quotes
  const applySavedOrder = (quotes: QuoteData[]): QuoteData[] => {
    const savedOrder = getSavedTabOrder();
    if (!savedOrder || savedOrder.length === 0) {
      return quotes;
    }

    // Create a map for quick lookup
    const quoteMap = new Map(quotes.map(q => [q.id, q]));
    
    // Reorder based on saved order, then append any new quotes not in saved order
    const ordered: QuoteData[] = [];
    const usedIds = new Set<string>();
    
    for (const id of savedOrder) {
      if (quoteMap.has(id)) {
        ordered.push(quoteMap.get(id)!);
        usedIds.add(id);
      }
    }
    
    // Add any quotes that weren't in the saved order (new quotes)
    for (const quote of quotes) {
      if (!usedIds.has(quote.id)) {
        ordered.push(quote);
      }
    }
    
    return ordered;
  };

  async function fetchEstimateData(preserveSelection: boolean = false) {
    try {
      const { data: quoteData, error } = await supabase
        .schema('business')
        .from('estimates')
        .select('id, created_at, data, travel_data, status')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching estimates:', error);
        return;
      }

      if (quoteData && quoteData.length > 0) {
        // Apply saved tab order if it exists
        const orderedQuotes = applySavedOrder(quoteData);
        
        // Determine which index to select
        let indexToSelect = 0;
        if (preserveSelection && quotes.length > 0) {
          // Try to find the currently selected quote in the new list
          const currentQuoteId = quotes[selectedQuoteIndex]?.id;
          if (currentQuoteId) {
            const foundIndex = orderedQuotes.findIndex(q => q.id === currentQuoteId);
            if (foundIndex !== -1) {
              indexToSelect = foundIndex;
            }
          }
        }
        
        // Load the selected quote
        loadQuoteData(orderedQuotes[indexToSelect]);
        setQuotes(orderedQuotes);
        setSelectedQuoteIndex(indexToSelect);
        setIsNewQuote(false);
        setHasQuote(true);
      } else {
        // No existing quotes, set up for a new one
        setHasQuote(false);
        setIsNewQuote(true);
        setEstimateStatus(null); // Reset status for new quote
      }
    } catch (err) {
        console.error('Catch block error fetching estimates:', err);
    }
  }

  async function checkExistingQuote() {
    // This function might be redundant if fetchEstimateData handles the logic
    // Keeping it for now, but ensure it uses the schema
    try {
      const { count, error } = await supabase
        .schema('business')
        .from('estimates')
        .select('* ', { count: 'exact', head: true })
        .eq('opportunity_id', opportunityId);

      if (error) {
        console.error('Error checking existing quote count:', error);
        setHasQuote(false); // Assume no quote on error
        return;
      }
      
      setHasQuote(count !== null && count > 0);
      
    } catch (err) {
        console.error('Catch block error checking quote count:', err);
        setHasQuote(false);
    }
  }

  async function fetchQuotes() {
    // This might also be redundant if fetchEstimateData is the primary load point
    try {
      const { data, error } = await supabase
        .schema('business')
        .from('estimates')
        .select('id, created_at, data, travel_data, status')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching quotes list:', error);
        setQuotes([]);
        return;
      }

      // Apply saved tab order if it exists
      const orderedQuotes = applySavedOrder(data || []);
      setQuotes(orderedQuotes);
      if (data && data.length > 0 && selectedQuoteIndex >= data.length) {
        // Adjust selected index if it becomes invalid after refetch
        setSelectedQuoteIndex(0);
      }
      
    } catch (err) {
        console.error('Catch block error fetching quotes list:', err);
        setQuotes([]);
    }
  }

  // Load specific quote data
  // Helper to safely convert to number for calculateDefaultLaborHours
  const parseNum = (value: number | string | undefined | null): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    return parseFloat(value) || 0;
  };
  
  // Function to calculate default labor hours using the formula
  const calculateDefaultLaborHours = (data: any) => {
    const men = parseNum(data.hoursSummary.men) || 2;
    const hoursPerDay = parseNum(data.hoursSummary.hoursPerDay) || 8;
    
    // Calculate total SOV labor hours from the SOV items
    let sovLaborHours = 0;
    if (data.sovItems) {
      sovLaborHours = data.sovItems.reduce((total: number, item: any) => {
        return total + (calculateLaborUnit(item.laborMen, item.laborHours) * item.quantity);
      }, 0);
    }
    
    // Calculate total non-SOV labor hours from the non-SOV items
    let nonSovLaborHours = 0;
    if (data.nonSovItems) {
      nonSovLaborHours = data.nonSovItems.reduce((total: number, item: any) => {
        return total + (calculateLaborUnit(item.laborMen, item.laborHours) * item.quantity);
      }, 0);
    }
    
    // Calculate total labor hours (SOV + non-SOV)
    const totalLaborHours = sovLaborHours + nonSovLaborHours;
    
    // Calculate days onsite from SOV labor hours only (excludes non-SOV hours like PM/reports)
    // This is used to calculate travel trips to the site
    const daysOnsite = men > 0 && hoursPerDay > 0 
      ? sovLaborHours / (men * hoursPerDay) 
      : 0;
    
    // Calculate total work hours
    const totalWorkHours = men * hoursPerDay * daysOnsite;
    
    // New formula based on hours per day:
    // 0-8 hours/day: all straight time
    // 8-12 hours/day: first 8 hours straight, rest overtime
    // 12+ hours/day: first 8 hours straight, next 4 hours overtime, rest double time
    let straightTime = 0;
    let overtime = 0;
    let doubleTime = 0;
    
    if (totalWorkHours > 0 && hoursPerDay > 0) {
      const totalDays = Math.ceil(totalWorkHours / hoursPerDay);
      
      for (let day = 0; day < totalDays; day++) {
        const hoursThisDay = Math.min(hoursPerDay, totalWorkHours - (day * hoursPerDay));
        
        if (hoursThisDay <= 8) {
          // All hours are straight time
          straightTime += hoursThisDay;
        } else if (hoursThisDay <= 12) {
          // First 8 hours are straight time, rest is overtime
          straightTime += 8;
          overtime += (hoursThisDay - 8);
        } else {
          // First 8 hours are straight time, next 4 are overtime, rest is double time
          straightTime += 8;
          overtime += 4;
          doubleTime += (hoursThisDay - 12);
        }
      }
    }
    
    return {
      straightTime,
      overtime,
      doubleTime
    };
  };

  const loadQuoteData = (quote: QuoteData) => {
    // Prevent the async presets loader from overwriting saved data
    presetsAppliedRef.current = true;
    try {
      // Parse the JSON data if it's a string
      let parsedData = quote.data;
      if (typeof quote.data === 'string') {
        parsedData = JSON.parse(quote.data);
      }
      
      // Ensure the data has the required calculatedValues structure
      const defaultCalculatedValues = {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0
      };
      
      // Merge the loaded data with defaults to ensure all required properties exist
      const completeData = {
        title: parsedData.title || '',
        client: parsedData.client || '',
        jobDescription: parsedData.jobDescription || '',
        dateDue: parsedData.dateDue || '',
        location: parsedData.location || '',
        periodOfPerformance: parsedData.periodOfPerformance || '',
        estimatedStartDate: parsedData.estimatedStartDate || '',
        poNumber: parsedData.poNumber || '',
        notes: parsedData.notes || '',
        sovItems: (parsedData.sovItems && parsedData.sovItems.length > 0) ? parsedData.sovItems : Array(DEFAULT_LINE_COUNT).fill(null).map(() => ({...EMPTY_LINE_ITEM})),
        nonSovItems: (parsedData.nonSovItems && parsedData.nonSovItems.length > 0) ? parsedData.nonSovItems : [...DEFAULT_NON_SOV_ITEMS],
        calculatedValues: {
          ...defaultCalculatedValues,
          ...(parsedData.calculatedValues || {})
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          travelStraightTimeHours: 0,
          travelOvertimeHours: 0,
          travelDoubleTimeHours: 0,
          ...(parsedData.hoursSummary || {})
        },
        saturdayHoursSummary: parsedData.saturdayHoursSummary || undefined,
        sundayHoursSummary: parsedData.sundayHoursSummary || undefined
        };
        
        setData(completeData);
        
        // Load status from quote
        setEstimateStatus(quote.status || null);
        
        // Debug: Log what's being loaded
        console.log('Loading quote data:', {
          hoursSummary: completeData.hoursSummary,
          parsedHoursSummary: parsedData.hoursSummary
        });
        
        // Handle hourly rates
        if (parsedData.hourlyRates) {
          setHourlyRates(parsedData.hourlyRates);
        } else {
          // Set default rates from presets if not found
          setHourlyRates({
            straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
            overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
            doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate
          });
        }
        
        // Handle payment term factors
        if (parsedData.paymentTermFactors) {
          setPaymentTermFactors(parsedData.paymentTermFactors);
        } else {
          // Set default factors if not found
          setPaymentTermFactors({
            net30: 1.00,
            net60: 1.06,
            net90: 1.09
          });
        }
        
        // Handle mobilization factors
        if (parsedData.mobilizationFactors) {
          setMobilizationFactors(prev => ({
            ...prev,
            ...parsedData.mobilizationFactors
          }));
        }
        
        if (parsedData.isManualLaborHours !== undefined) {
          setIsManualLaborHours(parsedData.isManualLaborHours);
        }
        if (parsedData.isManualTravelLaborHours !== undefined) {
          setIsManualTravelLaborHours(parsedData.isManualTravelLaborHours);
        }
        
        // Restore material markup if saved
        if (parsedData.materialMarkup !== undefined && parsedData.materialMarkup !== null) {
          const parsedMarkup = Number(parsedData.materialMarkup);
          if (!Number.isNaN(parsedMarkup) && parsedMarkup > 0) {
            setMaterialMarkup(parsedMarkup);
          }
        }
        
        // Restore quantity for combined letter proposal (default 1)
        if (parsedData.combinedLetterQuantity !== undefined && parsedData.combinedLetterQuantity !== null) {
          const qty = Math.max(1, Math.floor(Number(parsedData.combinedLetterQuantity)) || 1);
          setCombinedLetterQuantity(qty);
        } else {
          setCombinedLetterQuantity(1);
        }
        
        // Restore Saturday/Sunday labor hours visibility and flags
        if (parsedData.showSaturdayHours) setShowSaturdayHours(true);
        if (parsedData.showSundayHours) setShowSundayHours(true);
        if (parsedData.isManualSaturdayHours) setIsManualSaturdayHours(true);
        if (parsedData.isManualSundayHours) setIsManualSundayHours(true);
        if (parsedData.letterPaymentTerm) setLetterPaymentTerm(parsedData.letterPaymentTerm);
        
        // Set default labor hours using formula if not already set AND not manually edited
        if ((!parsedData.hoursSummary || 
            (parsedData.hoursSummary.straightTimeHours === 0 && 
             parsedData.hoursSummary.overtimeHours === 0 && 
             parsedData.hoursSummary.doubleTimeHours === 0)) &&
            !parsedData.isManualLaborHours) {
          // Calculate default hours using the formula
          const defaultHours = calculateDefaultLaborHours(completeData);
          setData(prev => ({
            ...prev,
            hoursSummary: {
              ...prev.hoursSummary,
              straightTimeHours: defaultHours.straightTime,
              overtimeHours: defaultHours.overtime,
              doubleTimeHours: defaultHours.doubleTime
            }
          }));
        }
        
        // Handle travel data
      if (quote.travel_data) {
        let parsedTravelData = quote.travel_data;
        if (typeof quote.travel_data === 'string') {
          parsedTravelData = JSON.parse(quote.travel_data);
        }
        // Restore the travel linking toggle states
        if (parsedTravelData.linkLocalTravelToDays !== undefined) {
          setLinkLocalTravelToDays(parsedTravelData.linkLocalTravelToDays);
        } else {
          setLinkLocalTravelToDays(false);
        }
        if (parsedTravelData.linkOutOfTownTravelToDays !== undefined) {
          setLinkOutOfTownTravelToDays(parsedTravelData.linkOutOfTownTravelToDays);
        } else {
          setLinkOutOfTownTravelToDays(false);
        }
        setTravelData(normalizeTravelData(parsedTravelData));
        setShowTravel(true);
      } else {
        setShowTravel(false);
        setLinkLocalTravelToDays(false);
        setLinkOutOfTownTravelToDays(false);
        setTravelData({ ...DEFAULT_TRAVEL_DATA,
          travelExpense: DEFAULT_TRAVEL_DATA.travelExpense.map(item => ({ ...item })),
          travelTime: DEFAULT_TRAVEL_DATA.travelTime.map(item => ({ ...item })),
          perDiem: DEFAULT_TRAVEL_DATA.perDiem.map(item => ({ ...item })),
          lodging: DEFAULT_TRAVEL_DATA.lodging.map(item => ({ ...item })),
          localMiles: DEFAULT_TRAVEL_DATA.localMiles.map(item => ({ ...item })),
          flights: DEFAULT_TRAVEL_DATA.flights.map(item => ({ ...item })),
          airTravelTime: DEFAULT_TRAVEL_DATA.airTravelTime.map(item => ({ ...item })),
          rentalCar: DEFAULT_TRAVEL_DATA.rentalCar.map(item => ({ ...item }))
        });
      }
    } catch (error) {
      console.error('Error loading quote data:', error);
      // Fallback to default data structure if parsing fails
      setData({
        client: '',
        jobDescription: '',
        dateDue: '',
        location: '',
        periodOfPerformance: '',
        estimatedStartDate: '',
        poNumber: '',
        notes: '',
        sovItems: Array(DEFAULT_LINE_COUNT).fill(null).map(() => ({...EMPTY_LINE_ITEM})),
        nonSovItems: [...DEFAULT_NON_SOV_ITEMS],
        calculatedValues: {
          subtotalMaterial: 0,
          subtotalExpense: 0,
          subtotalLabor: 0,
          totalMaterial: 0,
          totalExpense: 0,
          totalLabor: 0,
          grandTotal: 0,
          nonSovMaterial: 0,
          nonSovExpense: 0,
          nonSovLabor: 0,
          sovLaborHours: 0,
          nonSovLaborHours: 0,
          totalLaborHours: 0
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          travelStraightTimeHours: 0,
          travelOvertimeHours: 0,
          travelDoubleTimeHours: 0
        }
      });
      setShowTravel(false);
      setShowSaturdayHours(false);
      setShowSundayHours(false);
    }
  };

  // Handle closing the dialog with unsaved changes confirmation
  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to exit?');
      if (!confirmed) {
        return; // Don't close if user cancels
      }
    }
    setIsOpen(false);
    // Reset mode to allow immediate reopening
    if (mode === 'new' || mode === 'view') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('resetEstimateMode'));
      }, 100);
    }
  };

  // Handle closing the letter proposal dialog with unsaved changes confirmation
  const handleCloseLetterProposal = () => {
    if (isLetterDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to exit?');
      if (!confirmed) {
        return; // Don't close if user cancels
      }
    }
    setIsLetterProposalOpen(false);
    setLetterProposalName(''); // Clear the letter name
    // Clear letter proposal state when deliberately closing
    clearLetterProposalState();
    // Reset mode to allow immediate reopening
    if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('resetEstimateMode'));
      }, 100);
    }
  };

  // Modified save function to handle new quotes
  async function saveQuote() {
    if (!user) {
        alert('You must be logged in to save a quote.');
        return;
    }
    
    // Ensure opportunityId is valid
    if (!opportunityId) {
        alert('Cannot save quote: Opportunity ID is missing.');
        return;
    }
    
    const generateQuoteVersion = () => {
      // Get the next version number based on existing quotes
      const existingVersions = quotes.map(q => {
        const match = q.quote_number?.match(/v(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const nextVersion = Math.max(...existingVersions, 0) + 1;
      return `v${nextVersion}`;
    };

     // Always persist travel data regardless of toggle visibility
     const safeTravelData = travelData ? {
       ...travelData,
       linkLocalTravelToDays: linkLocalTravelToDays,
       linkOutOfTownTravelToDays: linkOutOfTownTravelToDays
     } : {};
     const dataWithEmbeddedTravel = { 
       ...(data as any), 
       travel_data: safeTravelData,
       hourlyRates: hourlyRates,
       paymentTermFactors: paymentTermFactors,
       mobilizationFactors: mobilizationFactors,
       isManualLaborHours: isManualLaborHours,
       isManualTravelLaborHours: isManualTravelLaborHours,
       materialMarkup: materialMarkup,
       combinedLetterQuantity: Math.max(1, Math.floor(Number(combinedLetterQuantity)) || 1),
       showSaturdayHours: showSaturdayHours,
       showSundayHours: showSundayHours,
       isManualSaturdayHours: isManualSaturdayHours,
       isManualSundayHours: isManualSundayHours,
       letterPaymentTerm: letterPaymentTerm
     };
     
     // Debug: Log what's being saved
     console.log('Saving quote data:', {
       hoursSummary: data.hoursSummary,
       hourlyRates: hourlyRates
     });
    const quoteRecord = {
      opportunity_id: opportunityId,
      // Embed travel into the main data blob for consumers that read from data
      data: JSON.stringify(dataWithEmbeddedTravel),
      // Also save a dedicated travel_data column for direct access
      travel_data: JSON.stringify(safeTravelData),
      quote_number: generateQuoteVersion(),
      user_id: user.id, // Track who created this estimate
      status: estimateStatus || null // Save the estimate status
    };
    
    try {
      setIsSaving(true);
      let result;
      
      // Determine if we are updating an existing selected quote or inserting a new one
      const isUpdating = !isNewQuote && quotes.length > 0 && selectedQuoteIndex < quotes.length;
      const quoteIdToUpdate = isUpdating ? quotes[selectedQuoteIndex]?.id : null;

      if (isUpdating && quoteIdToUpdate) {
        // Update existing quote
        console.log(`Updating estimate with ID: ${quoteIdToUpdate}`);
        // Preserve existing quote number when updating, but include status
        const updatePayload = { ...quoteRecord } as any;
        delete updatePayload.quote_number;
        // Ensure status is included in update
        updatePayload.status = estimateStatus || null;
        result = await supabase
          .schema('business') // Specify schema
          .from('estimates')
          .update(updatePayload)
          .eq('id', quoteIdToUpdate)
          .select()
          .single(); // Expect a single record back
          
        if (result.data) {
            const updatedQuote = result.data;
            // Update the specific quote in the local state
            setQuotes(prev => 
                prev.map((q, index) => index === selectedQuoteIndex ? updatedQuote : q)
            );
            alert('Quote updated successfully!');
            // Clear any draft from Supabase after a successful save
            deletePreference(`drafts.${draftKey}`);
            setIsDirty(false);
            setDraftRestored(false);
            
            // Update prepared_by on the opportunity to include current user's email
            if (opportunityId && user?.email) {
              try {
                const { data: opp, error: oppErr } = await supabase
                  .schema('business')
                  .from('opportunities')
                  .select('prepared_by')
                  .eq('id', opportunityId)
                  .maybeSingle();
                if (!oppErr) {
                  const existing = (opp?.prepared_by as string | null) || '';
                  const parts = existing.split(',').map(s => s.trim()).filter(Boolean);
                  if (!parts.includes(user.email)) parts.push(user.email);
                  const newPreparedBy = parts.join(', ');
                  await supabase
                    .schema('business')
                    .from('opportunities')
                    .update({ prepared_by: newPreparedBy })
                    .eq('id', opportunityId);
                }
              } catch (e) {
                console.error('Failed to update prepared_by after quote update:', e);
              }
              // Notify listeners to refresh
              window.dispatchEvent(new CustomEvent('estimateSaved', { detail: { opportunityId } }));
            }
        } else {
             console.warn('Update operation did not return data.');
             // Refetch to be sure state is correct, preserving selection
             await fetchEstimateData(true); 
        }
      } else {
        // Insert new quote
        console.log('Inserting new estimate record.');
        result = await supabase
          .schema('business') // Specify schema
          .from('estimates')
          .insert(quoteRecord)
          .select()
          .single(); // Expect a single record back
        
        if (result.data) {
            const newQuote = result.data;
            // Add the new quote to the beginning of the list and select it
            setQuotes(prev => [newQuote, ...prev]);
            setSelectedQuoteIndex(0);
            setIsNewQuote(false); // It's no longer a new quote conceptually
            setHasQuote(true);
            alert('New quote saved successfully!');
            // Clear draft from Supabase after successful creation
            deletePreference(`drafts.${draftKey}`);
            setIsDirty(false);
            setDraftRestored(false);
            
            // Trigger prepared_by update for the opportunity
            if (opportunityId) {
              // First, directly update prepared_by to include current user's email
              if (user?.email) {
                try {
                  const { data: opp, error: oppErr } = await supabase
                    .schema('business')
                    .from('opportunities')
                    .select('prepared_by')
                    .eq('id', opportunityId)
                    .maybeSingle();
                  if (!oppErr) {
                    const existing = (opp?.prepared_by as string | null) || '';
                    const parts = existing.split(',').map(s => s.trim()).filter(Boolean);
                    if (!parts.includes(user.email)) parts.push(user.email);
                    const newPreparedBy = parts.join(', ');
                    await supabase
                      .schema('business')
                      .from('opportunities')
                      .update({ prepared_by: newPreparedBy })
                      .eq('id', opportunityId);
                  }
                } catch (e) {
                  console.error('Failed to update prepared_by after new quote:', e);
                }
              }
              // Then notify listeners to refresh
              window.dispatchEvent(new CustomEvent('estimateSaved', { 
                detail: { opportunityId } 
              }));
            }
        } else {
            console.error('Insert operation did not return data.');
            alert('Quote saved, but failed to retrieve confirmation. Please refresh.');
            // Refetch to ensure we have the latest data
            await fetchEstimateData(true);
        }
      }
      
      if (result.error) throw result.error;
      
    } catch (error: any) {
      console.error('Error saving quote:', error);
      alert(`Error saving quote: ${error.message}`);
    } finally {
      setIsSaving(false);
      // Allow global refreshes again after save/close
      try { localStorage.removeItem('AMP_SUSPEND_REFRESH'); } catch {}
    }
  }

  async function deleteQuoteById(quoteId: string) {
    if (!quoteId) return;
    if (!confirm('Delete this estimate? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .schema('business')
        .from('estimates')
        .delete()
        .eq('id', quoteId);
      if (error) throw error;
      // Update local state
      setQuotes(prev => prev.filter(q => q.id !== quoteId));
      // Adjust selected index if needed
      setSelectedQuoteIndex((prevIdx) => {
        const nextLen = quotes.length - 1;
        if (nextLen <= 0) {
          setIsNewQuote(true);
        setEstimateStatus(null); // Reset status for new quote
          return -1;
        }
        return Math.max(0, Math.min(prevIdx, nextLen - 1));
      });
      alert('Estimate deleted');
    } catch (e) {
      console.error('Error deleting estimate:', e);
      alert('Failed to delete estimate');
    }
  }

  // Duplicate an existing quote
  async function duplicateQuote(quoteId: string) {
    if (!quoteId || !user) return;
    
    const quoteToDuplicate = quotes.find(q => q.id === quoteId);
    if (!quoteToDuplicate) {
      alert('Could not find estimate to duplicate.');
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Parse existing data to add "(Copy)" to the title
      let duplicatedData = quoteToDuplicate.data;
      try {
        const parsed = typeof duplicatedData === 'string' ? JSON.parse(duplicatedData) : duplicatedData;
        const originalTitle = parsed?.title?.trim() || '';
        parsed.title = originalTitle ? `${originalTitle} (Copy)` : 'Copy';
        duplicatedData = JSON.stringify(parsed);
      } catch (e) {
        console.warn('Could not parse quote data for title update:', e);
      }
      
      // Generate new quote version number
      const existingVersions = quotes.map(q => {
        const match = q.quote_number?.match(/v(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const nextVersion = Math.max(...existingVersions, 0) + 1;
      const newQuoteNumber = `v${nextVersion}`;
      
      // Create new quote record
      const duplicateRecord = {
        opportunity_id: opportunityId,
        data: duplicatedData,
        travel_data: quoteToDuplicate.travel_data,
        quote_number: newQuoteNumber,
        user_id: user.id,
        status: null // Reset status for duplicated quote
      };
      
      const { data: newQuote, error } = await supabase
        .schema('business')
        .from('estimates')
        .insert(duplicateRecord)
        .select()
        .single();
      
      if (error) throw error;
      
      if (newQuote) {
        // Add the new quote to the beginning of the list and select it
        setQuotes(prev => [newQuote, ...prev]);
        setSelectedQuoteIndex(0);
        loadQuoteData(newQuote);
        setIsNewQuote(false);
        setHasQuote(true);
        alert('Estimate duplicated successfully!');
        
        // Notify listeners to refresh
        window.dispatchEvent(new CustomEvent('estimateSaved', { detail: { opportunityId } }));
      }
    } catch (e) {
      console.error('Error duplicating estimate:', e);
      alert('Failed to duplicate estimate');
    } finally {
      setIsSaving(false);
    }
  }

  // Reset data for new quote
  const handleGenerateNewQuote = () => {
    setIsNewQuote(true);
    setCombinedLetterQuantity(1);
    setData({
      client: opportunityData?.customer.company_name || opportunityData?.customer.name || '',
      jobDescription: opportunityData?.description || '',
      dateDue: '',
      location: opportunityData?.customer.address || '',
      periodOfPerformance: '',
      estimatedStartDate: '',
      poNumber: '',
      notes: '',
      sovItems: Array(DEFAULT_LINE_COUNT).fill(null).map(() => ({...EMPTY_LINE_ITEM})),
      nonSovItems: [...DEFAULT_NON_SOV_ITEMS],
      calculatedValues: {
        subtotalMaterial: 0,
        subtotalExpense: 0,
        subtotalLabor: 0,
        totalMaterial: 0,
        totalExpense: 0,
        totalLabor: 0,
        grandTotal: 0,
        nonSovMaterial: 0,
        nonSovExpense: 0,
        nonSovLabor: 0,
        sovLaborHours: 0,
        nonSovLaborHours: 0,
        totalLaborHours: 0
      },
      hoursSummary: {
        men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
        hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
        daysOnsite: 0,
        workHours: 0,
        nonSovHours: 0,
        travelHours: 0,
        totalHours: 0,
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        travelStraightTimeHours: 0,
        travelOvertimeHours: 0,
        travelDoubleTimeHours: 0
      }
    });
    setShowTravel(false);
    setShowSaturdayHours(false);
    setShowSundayHours(false);
    setIsOpen(true);
  };

  // Function to calculate material extension - handles both string and number inputs
  const calculateMaterialExtension = (quantity: number | string, price: number | string) => {
    const qtyNum = typeof quantity === 'string' ? parseFloat(quantity) || 0 : (quantity || 0);
    const priceNum = typeof price === 'string' ? parseFloat(price) || 0 : (price || 0);
    return qtyNum * priceNum;
  };
  
  // Function to calculate expense extension - handles both string and number inputs
  const calculateExpenseExtension = (quantity: number | string, price: number | string) => {
    const qtyNum = typeof quantity === 'string' ? parseFloat(quantity) || 0 : (quantity || 0);
    const priceNum = typeof price === 'string' ? parseFloat(price) || 0 : (price || 0);
    return qtyNum * priceNum;
  };
  
  // Function to calculate labor unit - handles both string and number inputs
  const calculateLaborUnit = (men: number | string, hours: number | string) => {
    const menNum = typeof men === 'string' ? parseFloat(men) || 0 : (men || 0);
    const hoursNum = typeof hours === 'string' ? parseFloat(hours) || 0 : (hours || 0);
    return menNum * hoursNum;
  };
  
  // Function to calculate labor total - handles both string and number inputs
  const calculateLaborTotal = (quantity: number | string, men: number | string, hours: number | string) => {
    const qtyNum = typeof quantity === 'string' ? parseFloat(quantity) || 0 : (quantity || 0);
    return qtyNum * calculateLaborUnit(men, hours);
  };

  // Helper function to safely convert string or number to number for calculations
  const toNum = (value: number | string | undefined | null): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    return parseFloat(value) || 0;
  };

  // Helper function to format numbers with commas
  const formatCurrency = (amount: number | string) => {
    const numAmount = toNum(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numAmount);
  };

  // Helper function to format numbers with commas (no currency symbol)
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };
  
  // Travel non-labor costs (vehicle, per diem, lodging, etc. — excludes travel labor which is now in the Labor Hours Tracking table)
  const getTravelNonLaborCost = () => {
    try {
      const td: any = travelData as any;
      const sum =
        (td?.travelExpense?.[0]?.vehicleTravelCost ?? 0) +
        (td?.perDiem?.[0]?.totalPerDiem ?? 0) +
        (td?.lodging?.[0]?.totalAmount ?? 0) +
        (td?.localMiles?.[0]?.totalLocalMilesCost ?? 0) +
        (td?.flights?.[0]?.totalFlightAmount ?? 0) +
        (td?.rentalCar?.[0]?.totalAmount ?? 0);
      return Number.isFinite(sum) ? sum : 0;
    } catch {
      return 0;
    }
  };

  // Travel labor cost from the Labor Hours Tracking table
  const getTravelLaborCost = () => {
    return (toNum(data.hoursSummary.travelStraightTimeHours) * hourlyRates.straightTime) +
           (toNum(data.hoursSummary.travelOvertimeHours) * hourlyRates.overtime) +
           (toNum(data.hoursSummary.travelDoubleTimeHours) * hourlyRates.doubleTime);
  };

  // Total travel cost (for display): travel labor from tracking table + non-labor from travel section
  const getTotalTravelCost = () => {
    return getTravelLaborCost() + getTravelNonLaborCost();
  };
  
  // Shared material + expense base used by all day-type scenarios
  const getMaterialExpenseBase = () => {
    return (data.calculatedValues.totalMaterial * 1.09 * materialMarkup) +
           (data.calculatedValues.totalExpense * 1.09) +
           (data.calculatedValues.nonSovExpense * 1.00);
  };

  // Work labor cost from the M-F Labor Hours Tracking table
  const getWorkLaborCost = () => {
    return (toNum(data.hoursSummary.straightTimeHours) * hourlyRates.straightTime) +
           (toNum(data.hoursSummary.overtimeHours) * hourlyRates.overtime) +
           (toNum(data.hoursSummary.doubleTimeHours) * hourlyRates.doubleTime);
  };

  // Helper function to get the exact FINAL value (G54) as shown in UI — Monday-Friday scenario
  const getFinalValue = () => {
    return Math.ceil((
      getMaterialExpenseBase() +
      getWorkLaborCost() +
      getTravelLaborCost() +
      getTravelNonLaborCost()
    ) / 0.96);
  };

  // FINAL value for Saturday scenario
  const getSaturdayFinalValue = () => {
    const sat = data.saturdayHoursSummary;
    if (!sat) return getFinalValue();
    const workLabor = (toNum(sat.straightTimeHours) * hourlyRates.straightTime) +
                      (toNum(sat.overtimeHours) * hourlyRates.overtime) +
                      (toNum(sat.doubleTimeHours) * hourlyRates.doubleTime);
    const travelLabor = (toNum(sat.travelStraightTimeHours) * hourlyRates.straightTime) +
                        (toNum(sat.travelOvertimeHours) * hourlyRates.overtime) +
                        (toNum(sat.travelDoubleTimeHours) * hourlyRates.doubleTime);
    return Math.ceil((getMaterialExpenseBase() + workLabor + travelLabor + getTravelNonLaborCost()) / 0.96);
  };

  // FINAL value for Sunday/Holiday scenario
  const getSundayFinalValue = () => {
    const sun = data.sundayHoursSummary;
    if (!sun) return getFinalValue();
    const workLabor = (toNum(sun.straightTimeHours) * hourlyRates.straightTime) +
                      (toNum(sun.overtimeHours) * hourlyRates.overtime) +
                      (toNum(sun.doubleTimeHours) * hourlyRates.doubleTime);
    const travelLabor = (toNum(sun.travelStraightTimeHours) * hourlyRates.straightTime) +
                        (toNum(sun.travelOvertimeHours) * hourlyRates.overtime) +
                        (toNum(sun.travelDoubleTimeHours) * hourlyRates.doubleTime);
    return Math.ceil((getMaterialExpenseBase() + workLabor + travelLabor + getTravelNonLaborCost()) / 0.96);
  };

  // Function to calculate SOV item price
  // Formula: =($G$54/$K$44*I10) 
  // G54 = Final (G54), K44 = Work/SOV hrs (from Hours Summary), I10 = Labor Unit (for this row)
  const calculateSOVItemPrice = (materialExtension: number, expenseExtension: number, laborUnit: number) => {
    // Get FINAL (G54) - the value after subtotal markup
    const final = getFinalValue();
    
    // Get Work/SOV hrs (K44) from Hours Summary table
    const workSovHours = data.hoursSummary.workHours;
    
    // Calculate the formula: (Final / Work/SOV hrs) * Labor Unit
    const laborAllocation = workSovHours > 0 ? (final / workSovHours) * laborUnit : 0;
    
    // Debug: Log the values being used
    console.log('SOV Item Price Calculation:', {
      final: final,
      workSovHours: workSovHours,
      laborUnit: laborUnit,
      laborAllocation: laborAllocation,
      result: laborAllocation
    });
    
    // SOV item price should ONLY include the labor allocation (no materials or expenses)
    return laborAllocation;
  };

  // Arrow-key cell navigation for estimate tables (avoids global nav's position heuristic which skips rows / jumps on Windows)
  const SOV_FOCUSABLE_COLS = [0, 1, 2, 3, 6, 7, 11, 12];
  const NON_SOV_FOCUSABLE_COLS = [0, 1, 2, 3, 6, 7, 10, 11];

  const handleEstimateCellKeyDown = (
    e: React.KeyboardEvent,
    tableId: 'sov' | 'nonSov',
    rowIndex: number,
    colIndex: number,
    rowCount: number
  ) => {
    const key = e.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
    const focusableCols = tableId === 'sov' ? SOV_FOCUSABLE_COLS : NON_SOV_FOCUSABLE_COLS;
    const colIdx = focusableCols.indexOf(colIndex);
    if (colIdx === -1) return;

    // Always consume arrow keys in estimate cells so global position-based nav doesn't run (avoids skip/jump on Windows)
    e.preventDefault();
    e.stopPropagation();

    let nextRow = rowIndex;
    let nextCol = colIndex;
    if (key === 'ArrowRight') {
      if (colIdx >= focusableCols.length - 1) return;
      nextCol = focusableCols[colIdx + 1];
    } else if (key === 'ArrowLeft') {
      if (colIdx <= 0) return;
      nextCol = focusableCols[colIdx - 1];
    } else if (key === 'ArrowDown') {
      if (rowIndex >= rowCount - 1) return;
      nextRow = rowIndex + 1;
    } else if (key === 'ArrowUp') {
      if (rowIndex <= 0) return;
      nextRow = rowIndex - 1;
    }

    const next = document.querySelector(
      `[data-estimate-table="${tableId}"][data-estimate-row="${nextRow}"][data-estimate-col="${nextCol}"]`
    ) as HTMLElement | null;
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.select();
      }
    }
  };

  // Handle input changes
  const handleItemChange = (section: 'sov' | 'nonSov', index: number, field: string, value: string | number) => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    const newItems = [...data[itemsKey]];
    
    // For numeric fields, parse value but preserve trailing decimal point for typing
    let parsedValue: string | number = value;
    if (field !== 'item' && field !== 'notes') {
      const strValue = String(value);
      // If user is still typing a decimal (ends with . or has trailing zeros after decimal)
      if (strValue === '' || strValue === '.' || strValue.endsWith('.') || /\.\d*0+$/.test(strValue)) {
        // Keep as string to preserve decimal point during typing, but use 0 for empty
        parsedValue = strValue === '' ? 0 : strValue;
      } else {
        // Convert to number for completed values
        parsedValue = parseFloat(strValue) || 0;
      }
    }
    
    newItems[index] = {
      ...newItems[index],
      [field]: parsedValue
    };
    
    setData(prev => {
      const newData = {
        ...prev,
        [itemsKey]: newItems
      };
      
      // Apply formula automatically when SOV or non-SOV item labor data changes
      if ((section === 'sov' || section === 'nonSov') && (field === 'laborMen' || field === 'laborHours' || field === 'quantity')) {
        setIsManualLaborHours(false); // Reset manual flag when labor data changes
        const defaultHours = calculateDefaultLaborHours(newData);
        newData.hoursSummary = {
          ...newData.hoursSummary,
          straightTimeHours: defaultHours.straightTime,
          overtimeHours: defaultHours.overtime,
          doubleTimeHours: defaultHours.doubleTime
        };
      }
      
      return newData;
    });
    setIsDirty(true);
    // Clear blanking state for this field when user types something
    const key = makeKey(section, index, field);
    if (blankingKeys.has(key)) {
      const copy = new Set(blankingKeys);
      copy.delete(key);
      setBlankingKeys(copy);
    }
  };

  const handleGeneralChange = (field: string, value: string) => {
    setData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number, type: 'sov' | 'nonSov') => {
    if (isViewMode) return;
    setDraggedItemIndex(index);
    setDraggedItemType(type);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', (e.currentTarget as HTMLElement).outerHTML);
    
    // Find the table row and set its opacity
    const dragHandle = e.currentTarget as HTMLElement;
    const tableRow = dragHandle.closest('tr');
    if (tableRow) {
      tableRow.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Find the table row and reset its opacity
    const dragHandle = e.currentTarget as HTMLElement;
    const tableRow = dragHandle.closest('tr');
    if (tableRow) {
      tableRow.style.opacity = '1';
    }
    
    setDraggedItemIndex(null);
    setDraggedItemType(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number, dropType: 'sov' | 'nonSov') => {
    e.preventDefault();
    
    if (draggedItemIndex === null || draggedItemType === null || draggedItemType !== dropType) {
      return;
    }

    if (draggedItemIndex === dropIndex) {
      return;
    }

    const itemsKey = dropType === 'sov' ? 'sovItems' : 'nonSovItems';
    const items = [...data[itemsKey]];
    const draggedItem = items[draggedItemIndex];
    
    // Remove the dragged item
    items.splice(draggedItemIndex, 1);
    
    // Insert at the new position
    const insertIndex = draggedItemIndex < dropIndex ? dropIndex - 1 : dropIndex;
    items.splice(insertIndex, 0, draggedItem);
    
    setData(prev => ({
      ...prev,
      [itemsKey]: items
    }));
    
    setIsDirty(true);
    setDraggedItemIndex(null);
    setDraggedItemType(null);
    setDragOverIndex(null);
  };

  // Tab drag and drop handlers
  const handleTabDragStart = (e: React.DragEvent, index: number) => {
    isDraggingTabRef.current = true;
    setDraggedTabIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'tab', index }));
    // Add visual feedback
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
    // Prevent text selection
    e.dataTransfer.setDragImage(target, 0, 0);
  };

  const handleTabDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    // Use setTimeout to allow drag to complete before allowing clicks
    setTimeout(() => {
      isDraggingTabRef.current = false;
    }, 200);
    setDraggedTabIndex(null);
    setDragOverTabIndex(null);
  };

  const handleTabDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTabIndex !== index) {
      setDragOverTabIndex(index);
    }
  };

  const handleTabDragLeave = () => {
    setDragOverTabIndex(null);
  };

  const handleTabDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedTabIndex === null || draggedTabIndex === dropIndex) {
      setDraggedTabIndex(null);
      setDragOverTabIndex(null);
      return;
    }

    // Reorder quotes
    const newQuotes = [...quotes];
    const draggedQuote = newQuotes[draggedTabIndex];
    
    // Remove the dragged item
    newQuotes.splice(draggedTabIndex, 1);
    
    // Calculate the new drop index after removal
    let adjustedDropIndex = dropIndex;
    if (draggedTabIndex < dropIndex) {
      adjustedDropIndex = dropIndex - 1;
    }
    
    // Insert at new position
    newQuotes.splice(adjustedDropIndex, 0, draggedQuote);
    
    // Update selected index
    let newSelectedIndex = selectedQuoteIndex;
    if (selectedQuoteIndex === draggedTabIndex) {
      // If we dragged the selected tab, it moves to the new position
      newSelectedIndex = adjustedDropIndex;
    } else {
      // Adjust selected index based on where items moved
      if (draggedTabIndex < selectedQuoteIndex && adjustedDropIndex >= selectedQuoteIndex) {
        // Dragged item moved from left to right, past the selected item
        newSelectedIndex = selectedQuoteIndex - 1;
      } else if (draggedTabIndex > selectedQuoteIndex && adjustedDropIndex <= selectedQuoteIndex) {
        // Dragged item moved from right to left, past the selected item
        newSelectedIndex = selectedQuoteIndex + 1;
      }
    }
    
    // Update quotes array
    setQuotes(newQuotes);
    
    // Update selected index and load the quote if it changed
    if (newSelectedIndex !== selectedQuoteIndex) {
      setSelectedQuoteIndex(newSelectedIndex);
      if (newSelectedIndex >= 0 && newSelectedIndex < newQuotes.length) {
        loadQuoteData(newQuotes[newSelectedIndex]);
      }
    }
    
    // Save the new order
    saveTabOrder(newQuotes.map(q => q.id));
    
    setDraggedTabIndex(null);
    setDragOverTabIndex(null);
  };



  // Handler for Saturday labor hours changes
  const handleSaturdayHoursChange = (field: string, value: string) => {
    setIsManualSaturdayHours(true);
    let parsedValue: number | string;
    if (value === '' || value === '.' || value.endsWith('.') || /\.\d*0+$/.test(value)) {
      parsedValue = value === '' ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    setData(prev => ({
      ...prev,
      saturdayHoursSummary: {
        straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0,
        travelStraightTimeHours: 0, travelOvertimeHours: 0, travelDoubleTimeHours: 0,
        ...(prev.saturdayHoursSummary || {}),
        [field]: parsedValue
      }
    }));
    setIsDirty(true);
  };

  // Handler for Sunday/Holiday labor hours changes
  const handleSundayHoursChange = (field: string, value: string) => {
    setIsManualSundayHours(true);
    let parsedValue: number | string;
    if (value === '' || value === '.' || value.endsWith('.') || /\.\d*0+$/.test(value)) {
      parsedValue = value === '' ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    setData(prev => ({
      ...prev,
      sundayHoursSummary: {
        straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0,
        travelStraightTimeHours: 0, travelOvertimeHours: 0, travelDoubleTimeHours: 0,
        ...(prev.sundayHoursSummary || {}),
        [field]: parsedValue
      }
    }));
    setIsDirty(true);
  };

  const handleHoursSummaryChange = (field: string, value: string) => {
    console.log('handleHoursSummaryChange called:', { field, value });
    
    if (['straightTimeHours', 'overtimeHours', 'doubleTimeHours'].includes(field)) {
      setIsManualLaborHours(true);
    }
    if (['travelStraightTimeHours', 'travelOvertimeHours', 'travelDoubleTimeHours'].includes(field)) {
      setIsManualTravelLaborHours(true);
    }
    
    // Preserve decimal point during typing
    let parsedValue: number | string;
    if (value === '' || value === '.' || value.endsWith('.') || /\.\d*0+$/.test(value)) {
      // Keep as string to preserve decimal point during typing
      parsedValue = value === '' ? 0 : value;
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    
    setData(prev => {
      const newData = {
        ...prev,
        hoursSummary: {
          ...prev.hoursSummary,
          [field]: parsedValue
        }
      };
      
      // Apply formula automatically when men or hoursPerDay changes
      if (field === 'men' || field === 'hoursPerDay') {
        setIsManualLaborHours(false); // Reset manual flag when formula inputs change
        const defaultHours = calculateDefaultLaborHours(newData);
        newData.hoursSummary = {
          ...newData.hoursSummary,
          straightTimeHours: defaultHours.straightTime,
          overtimeHours: defaultHours.overtime,
          doubleTimeHours: defaultHours.doubleTime
        };
      }
      
      return newData;
    });
    setIsDirty(true);
  };

  // Recalculate all values when data changes
  useEffect(() => {
    console.log('Recalculation useEffect triggered with data:', {
      straightTimeHours: data.hoursSummary.straightTimeHours,
      overtimeHours: data.hoursSummary.overtimeHours,
      doubleTimeHours: data.hoursSummary.doubleTimeHours
    });
    const newCalculated = { ...data.calculatedValues };
    
    // SOV totals
    let sovMaterialTotal = 0;
    let sovExpenseTotal = 0;
    let sovLaborTotal = 0;
    let sovLaborHours = 0;
    
    data.sovItems.forEach(item => {
      const materialExtension = calculateMaterialExtension(item.quantity, item.materialPrice);
      const expenseExtension = calculateExpenseExtension(item.quantity, item.expensePrice);
      const laborItemTotal = calculateLaborTotal(item.quantity, item.laborMen, item.laborHours);
      
      sovMaterialTotal += materialExtension;
      sovExpenseTotal += expenseExtension;
      sovLaborTotal += laborItemTotal;
      sovLaborHours += calculateLaborUnit(item.laborMen, item.laborHours) * item.quantity;
    });

    // Non-SOV totals
    let nonSovMaterialTotal = 0;
    let nonSovExpenseTotal = 0;
    let nonSovLaborTotal = 0;
    let nonSovLaborHours = 0;
    
    data.nonSovItems.forEach(item => {
      const materialExtension = calculateMaterialExtension(item.quantity, item.materialPrice);
      const expenseExtension = calculateExpenseExtension(item.quantity, item.expensePrice);
      const laborItemTotal = calculateLaborTotal(item.quantity, item.laborMen, item.laborHours);
      
      nonSovMaterialTotal += materialExtension;
      nonSovExpenseTotal += expenseExtension;
      nonSovLaborTotal += laborItemTotal;
      nonSovLaborHours += calculateLaborUnit(item.laborMen, item.laborHours) * item.quantity;
    });
    
    // Update calculated values
    newCalculated.subtotalMaterial = sovMaterialTotal + nonSovMaterialTotal;
    newCalculated.subtotalExpense = sovExpenseTotal + nonSovExpenseTotal;
    newCalculated.subtotalLabor = sovLaborTotal + nonSovLaborTotal;
    newCalculated.nonSovMaterial = nonSovMaterialTotal;
    newCalculated.nonSovExpense = nonSovExpenseTotal;
    newCalculated.nonSovLabor = nonSovLaborTotal;
    newCalculated.sovLaborHours = sovLaborHours;
    newCalculated.nonSovLaborHours = nonSovLaborHours;
    newCalculated.totalLaborHours = sovLaborHours + nonSovLaborHours;
    
    newCalculated.totalMaterial = newCalculated.subtotalMaterial;
    newCalculated.totalExpense = newCalculated.subtotalExpense;
    newCalculated.totalLabor = newCalculated.subtotalLabor;
    
    newCalculated.grandTotal = 
      newCalculated.totalMaterial + 
      newCalculated.totalExpense + 
      newCalculated.totalLabor;
    
    // Calculate hours summary
    const totalWorkHours = sovLaborHours + nonSovLaborHours;
    // Days onsite calculated from SOV hours only (excludes non-SOV hours like PM/reports)
    // This is used to calculate travel trips to the site
    const menNum = toNum(data.hoursSummary.men);
    const hoursPerDayNum = toNum(data.hoursSummary.hoursPerDay);
    const daysOnsite = menNum > 0 && hoursPerDayNum > 0 
      ? sovLaborHours / (menNum * hoursPerDayNum) 
      : 0;
    
    // Calculate labor rate breakdown based on hours per day
    // 0-8 hours per day = straight time, >8-12 = overtime, >12 = double time
    const hoursPerDay = hoursPerDayNum;
    let straightTimeHours = 0;
    let overtimeHours = 0;
    let doubleTimeHours = 0;
    
    if (totalWorkHours > 0 && hoursPerDay > 0) {
      const totalDays = Math.ceil(totalWorkHours / hoursPerDay);
      
      for (let day = 0; day < totalDays; day++) {
        const hoursThisDay = Math.min(hoursPerDay, totalWorkHours - (day * hoursPerDay));
        
        if (hoursThisDay <= 8) {
          // All hours are straight time
          straightTimeHours += hoursThisDay;
        } else if (hoursThisDay <= 12) {
          // First 8 hours are straight time, rest is overtime
          straightTimeHours += 8;
          overtimeHours += (hoursThisDay - 8);
        } else {
          // First 8 hours are straight time, next 4 are overtime, rest is double time
          straightTimeHours += 8;
          overtimeHours += 4;
          doubleTimeHours += (hoursThisDay - 12);
        }
      }
    }
    
    // Calculate travel hours from travel data
    let totalTravelHours = 0;
    if (showTravel) {
      totalTravelHours = (travelData?.travelTime ?? []).reduce((sum, item) => sum + item.grandTotalTravelHours, 0) +
                        (travelData?.airTravelTime ?? []).reduce((sum, item) => sum + item.grandTotalTravelHours, 0);
    }
    
    const totalHours = totalWorkHours + totalTravelHours;
    
    setData(prev => ({
      ...prev,
      calculatedValues: newCalculated,
      hoursSummary: {
        ...prev.hoursSummary,
        daysOnsite: daysOnsite,
        workHours: sovLaborHours,
        nonSovHours: nonSovLaborHours,
        travelHours: totalTravelHours,
        totalHours: totalHours,
        straightTimeHours: isManualLaborHours ? prev.hoursSummary.straightTimeHours : straightTimeHours,
        overtimeHours: isManualLaborHours ? prev.hoursSummary.overtimeHours : overtimeHours,
        doubleTimeHours: isManualLaborHours ? prev.hoursSummary.doubleTimeHours : doubleTimeHours,
        travelStraightTimeHours: isManualTravelLaborHours ? prev.hoursSummary.travelStraightTimeHours : totalTravelHours,
        travelOvertimeHours: isManualTravelLaborHours ? prev.hoursSummary.travelOvertimeHours : 0,
        travelDoubleTimeHours: isManualTravelLaborHours ? prev.hoursSummary.travelDoubleTimeHours : 0
      }
    }));
  }, [data.sovItems, data.nonSovItems, data.hoursSummary.men, data.hoursSummary.hoursPerDay, showTravel, travelData, isManualLaborHours, isManualTravelLaborHours]);

  // Sync travel values with days onsite when toggles are enabled
  useEffect(() => {
    if (!showTravel) return;
    
    const daysOnsite = data.hoursSummary.daysOnsite;
    const roundedDays = Math.ceil(daysOnsite);
    
    if (roundedDays <= 0) return;
    
    setTravelData(prev => {
      const newData = { ...prev };
      
      // Toggle #1: Link Local Travel (Travel Expense trips & Travel Time trips) to Days Onsite
      if (linkLocalTravelToDays) {
        // Update Travel Expense trips
        if (newData.travelExpense[0]) {
          newData.travelExpense = [{
            ...newData.travelExpense[0],
            trips: roundedDays
          }];
          // Recalculate travel expense totals
          const item = newData.travelExpense[0];
          item.roundTripMiles = item.oneWayMiles * 2;
          item.totalVehicleMiles = item.trips * item.roundTripMiles;
          item.totalMiles = item.totalVehicleMiles * item.numVehicles;
          item.vehicleTravelCost = item.totalMiles * item.rate;
        }
        
        // Update Travel Time trips
        if (newData.travelTime[0]) {
          newData.travelTime = [{
            ...newData.travelTime[0],
            trips: roundedDays
          }];
          // Recalculate travel time totals
          const item = newData.travelTime[0];
          item.roundTripHours = item.oneWayHours * 2;
          item.totalTravelHours = item.trips * item.roundTripHours;
          item.grandTotalTravelHours = item.totalTravelHours * item.numMen;
          item.totalTravelLabor = item.grandTotalTravelHours * item.rate;
        }
      }
      
      // Toggle #2: Link Out-of-Town Travel (Per Diem, Lodging, Local Miles) to Days Onsite
      if (linkOutOfTownTravelToDays) {
        // Update Per Diem # of days
        if (newData.perDiem[0]) {
          newData.perDiem = [{
            ...newData.perDiem[0],
            numDays: roundedDays
          }];
          // Recalculate per diem totals
          const item = newData.perDiem[0];
          item.totalPerDiemPerMan = item.numDays * item.dailyRate;
          item.totalPerDiem = item.totalPerDiemPerMan * item.numMen;
        }
        
        // Update Lodging # of nights
        if (newData.lodging[0]) {
          newData.lodging = [{
            ...newData.lodging[0],
            numNights: roundedDays
          }];
          // Recalculate lodging totals
          const item = newData.lodging[0];
          item.manNights = item.numNights * item.numMen;
          item.totalAmount = item.manNights * item.rate;
        }
        
        // Update Local Miles # of days
        if (newData.localMiles[0]) {
          newData.localMiles = [{
            ...newData.localMiles[0],
            numDays: roundedDays
          }];
          // Recalculate local miles totals
          const item = newData.localMiles[0];
          item.totalMiles = item.numDays * item.milesPerDay * item.numVehicles;
          item.totalLocalMilesCost = item.totalMiles * item.rate;
        }
      }
      
      return newData;
    });
  }, [data.hoursSummary.daysOnsite, linkLocalTravelToDays, linkOutOfTownTravelToDays, showTravel]);

  const handleAddLine = (section: 'sov' | 'nonSov') => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    setData(prev => ({
      ...prev,
      [itemsKey]: [...prev[itemsKey], {...EMPTY_LINE_ITEM}]
    }));
  };

  const handleClearRow = (section: 'sov' | 'nonSov', index: number) => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    const newItems = data[itemsKey].filter((_, i) => i !== index);
    setData(prev => ({
      ...prev,
      [itemsKey]: newItems
    }));
  };

  const toggleTravel = () => {
    setShowTravel(!showTravel);
  };

  const handleTravelChange = (section: string, index: number, field: string, value: string | number) => {
    setTravelData(prev => {
      const newData = { ...prev };
      const numValue = typeof value === 'string' ? Number(value) : value;
      
      // Update the specified field
      newData[section][index] = {
        ...newData[section][index],
        [field]: numValue
      };
      
      // Calculate derived values based on the section
      const item = newData[section][index];
      
      switch (section) {
        case 'travelExpense':
          item.roundTripMiles = item.oneWayMiles * 2;
          item.totalVehicleMiles = item.trips * item.roundTripMiles;
          item.totalMiles = item.totalVehicleMiles * item.numVehicles;
          item.vehicleTravelCost = item.totalMiles * item.rate;
          
          // Auto-calculate one way hours in travelTime section based on one way miles (miles/50)
          if (newData.travelTime[index]) {
            newData.travelTime[index] = {
              ...newData.travelTime[index],
              oneWayHours: item.oneWayMiles / 50
            };
            // Recalculate travel time totals
            const travelTimeItem = newData.travelTime[index];
            travelTimeItem.roundTripHours = travelTimeItem.oneWayHours * 2;
            travelTimeItem.totalTravelHours = travelTimeItem.trips * travelTimeItem.roundTripHours;
            travelTimeItem.grandTotalTravelHours = travelTimeItem.totalTravelHours * travelTimeItem.numMen;
            travelTimeItem.totalTravelLabor = travelTimeItem.grandTotalTravelHours * travelTimeItem.rate;
          }
          
          // Sync numVehicles with Local Miles when linked
          if (field === 'numVehicles' && newData.numMenLinked && newData.localMiles[index]) {
            newData.localMiles[index] = {
              ...newData.localMiles[index],
              numVehicles: item.numVehicles
            };
            const localMilesItem = newData.localMiles[index];
            localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
            localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
          }
          
          // Sync trips with travelTime section
          if (field === 'trips' && newData.travelTime[index]) {
            newData.travelTime[index] = {
              ...newData.travelTime[index],
              trips: item.trips
            };
            // Recalculate travel time totals with new trips value
            const travelTimeItem = newData.travelTime[index];
            travelTimeItem.roundTripHours = travelTimeItem.oneWayHours * 2;
            travelTimeItem.totalTravelHours = travelTimeItem.trips * travelTimeItem.roundTripHours;
            travelTimeItem.grandTotalTravelHours = travelTimeItem.totalTravelHours * travelTimeItem.numMen;
            travelTimeItem.totalTravelLabor = travelTimeItem.grandTotalTravelHours * travelTimeItem.rate;
          }
          break;
          
        case 'travelTime':
          // Only allow manual entry if not being auto-calculated from travelExpense
          if (field === 'oneWayHours') {
            // Manual override - keep the entered value
            item.roundTripHours = item.oneWayHours * 2;
          } else {
            // For other fields, recalculate based on current oneWayHours
            item.roundTripHours = item.oneWayHours * 2;
          }
          item.totalTravelHours = item.trips * item.roundTripHours;
          item.grandTotalTravelHours = item.totalTravelHours * item.numMen;
          item.totalTravelLabor = item.grandTotalTravelHours * item.rate;
          
          // Sync numMen with other travel sections (except flights and air travel) when linked
          if (field === 'numMen' && newData.numMenLinked) {
            // Update per diem
            if (newData.perDiem[index]) {
              newData.perDiem[index] = {
                ...newData.perDiem[index],
                numMen: item.numMen
              };
              // Recalculate per diem totals
              const perDiemItem = newData.perDiem[index];
              perDiemItem.totalPerDiemPerMan = perDiemItem.numDays * perDiemItem.dailyRate;
              perDiemItem.totalPerDiem = perDiemItem.totalPerDiemPerMan * perDiemItem.numMen;
            }
            
            // Update lodging
            if (newData.lodging[index]) {
              newData.lodging[index] = {
                ...newData.lodging[index],
                numMen: item.numMen
              };
              // Recalculate lodging totals
              const lodgingItem = newData.lodging[index];
              lodgingItem.manNights = lodgingItem.numNights * lodgingItem.numMen;
              lodgingItem.totalAmount = lodgingItem.manNights * lodgingItem.rate;
            }
            
            // Sync local miles vehicles with Travel Expense vehicles
            if (newData.localMiles[index] && newData.travelExpense[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: newData.travelExpense[index].numVehicles
              };
              // Recalculate local miles totals
              const localMilesItem = newData.localMiles[index];
              localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
              localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
            }
          }
          break;
          
        case 'perDiem':
          // Update per diem calculations
          item.totalPerDiemPerMan = item.numDays * item.dailyRate;
          item.totalPerDiem = item.totalPerDiemPerMan * item.numMen;
          
          // Sync lodging nights and local miles days with per diem days
          if (field === 'numDays') {
            // Update lodging
            newData.lodging[index] = {
              ...newData.lodging[index],
              numNights: item.numDays
            };
            // Recalculate lodging totals
            const lodgingItem = newData.lodging[index];
            lodgingItem.manNights = lodgingItem.numNights * lodgingItem.numMen;
            lodgingItem.totalAmount = lodgingItem.manNights * lodgingItem.rate;
            
            // Update local miles
            if (newData.localMiles[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numDays: item.numDays
              };
              // Recalculate local miles totals
              const localMilesItem = newData.localMiles[index];
              localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
              localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
            }
          }
          
          // Sync numMen with other travel sections (except flights and air travel) when linked
          if (field === 'numMen' && newData.numMenLinked) {
            // Update travel time
            if (newData.travelTime[index]) {
              newData.travelTime[index] = {
                ...newData.travelTime[index],
                numMen: item.numMen
              };
              // Recalculate travel time totals
              const travelTimeItem = newData.travelTime[index];
              travelTimeItem.grandTotalTravelHours = travelTimeItem.totalTravelHours * travelTimeItem.numMen;
              travelTimeItem.totalTravelLabor = travelTimeItem.grandTotalTravelHours * travelTimeItem.rate;
            }
            
            // Update lodging
            if (newData.lodging[index]) {
              newData.lodging[index] = {
                ...newData.lodging[index],
                numMen: item.numMen
              };
              // Recalculate lodging totals
              const lodgingItem = newData.lodging[index];
              lodgingItem.manNights = lodgingItem.numNights * lodgingItem.numMen;
              lodgingItem.totalAmount = lodgingItem.manNights * lodgingItem.rate;
            }
            
            // Sync local miles vehicles with Travel Expense vehicles
            if (newData.localMiles[index] && newData.travelExpense[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: newData.travelExpense[index].numVehicles
              };
              // Recalculate local miles totals
              const localMilesItem = newData.localMiles[index];
              localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
              localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
            }
          }
          break;
          
        case 'lodging':
          item.manNights = item.numNights * item.numMen;
          item.totalAmount = item.manNights * item.rate;
          
          // Sync per diem days and local miles days with lodging nights
          if (field === 'numNights') {
            // Update per diem
            if (newData.perDiem[index]) {
              newData.perDiem[index] = {
                ...newData.perDiem[index],
                numDays: item.numNights
              };
              // Recalculate per diem totals
              const perDiemItem = newData.perDiem[index];
              perDiemItem.totalPerDiemPerMan = perDiemItem.numDays * perDiemItem.dailyRate;
              perDiemItem.totalPerDiem = perDiemItem.totalPerDiemPerMan * perDiemItem.numMen;
            }
            
            // Update local miles
            if (newData.localMiles[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numDays: item.numNights
              };
              // Recalculate local miles totals
              const localMilesItem = newData.localMiles[index];
              localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
              localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
            }
          }
          
          // Sync numMen with other travel sections (except flights and air travel) when linked
          if (field === 'numMen' && newData.numMenLinked) {
            // Update travel time
            if (newData.travelTime[index]) {
              newData.travelTime[index] = {
                ...newData.travelTime[index],
                numMen: item.numMen
              };
              // Recalculate travel time totals
              const travelTimeItem = newData.travelTime[index];
              travelTimeItem.grandTotalTravelHours = travelTimeItem.totalTravelHours * travelTimeItem.numMen;
              travelTimeItem.totalTravelLabor = travelTimeItem.grandTotalTravelHours * travelTimeItem.rate;
            }
            
            // Update per diem
            if (newData.perDiem[index]) {
              newData.perDiem[index] = {
                ...newData.perDiem[index],
                numMen: item.numMen
              };
              // Recalculate per diem totals
              const perDiemItem = newData.perDiem[index];
              perDiemItem.totalPerDiemPerMan = perDiemItem.numDays * perDiemItem.dailyRate;
              perDiemItem.totalPerDiem = perDiemItem.totalPerDiemPerMan * perDiemItem.numMen;
            }
            
            // Sync local miles vehicles with Travel Expense vehicles
            if (newData.localMiles[index] && newData.travelExpense[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: newData.travelExpense[index].numVehicles
              };
              // Recalculate local miles totals
              const localMilesItem = newData.localMiles[index];
              localMilesItem.totalMiles = localMilesItem.numDays * localMilesItem.milesPerDay * localMilesItem.numVehicles;
              localMilesItem.totalLocalMilesCost = localMilesItem.totalMiles * localMilesItem.rate;
            }
          }
          break;
          
        case 'localMiles':
          item.totalMiles = item.numDays * item.milesPerDay * item.numVehicles;
          item.totalLocalMilesCost = item.totalMiles * item.rate;
          
          // Sync per diem days and lodging nights with local miles days
          if (field === 'numDays') {
            // Update per diem
            if (newData.perDiem[index]) {
              newData.perDiem[index] = {
                ...newData.perDiem[index],
                numDays: item.numDays
              };
              // Recalculate per diem totals
              const perDiemItem = newData.perDiem[index];
              perDiemItem.totalPerDiemPerMan = perDiemItem.numDays * perDiemItem.dailyRate;
              perDiemItem.totalPerDiem = perDiemItem.totalPerDiemPerMan * perDiemItem.numMen;
            }
            
            // Update lodging
            if (newData.lodging[index]) {
              newData.lodging[index] = {
                ...newData.lodging[index],
                numNights: item.numDays
              };
              // Recalculate lodging totals
              const lodgingItem = newData.lodging[index];
              lodgingItem.manNights = lodgingItem.numNights * lodgingItem.numMen;
              lodgingItem.totalAmount = lodgingItem.manNights * lodgingItem.rate;
            }
          }
          break;
          
        case 'flights':
          item.totalFlightAmount = (item.numFlights * item.numMen * item.rate) + 
            (item.numFlights * item.numMen * item.luggageFees);
          
          // Sync numMen with air travel time section when linked (flights and air travel stay in sync with each other)
          if (field === 'numMen' && newData.numMenLinked && newData.airTravelTime[index]) {
            newData.airTravelTime[index] = {
              ...newData.airTravelTime[index],
              numMen: item.numMen
            };
            // Recalculate air travel time totals
            const airTravelItem = newData.airTravelTime[index];
            airTravelItem.roundTripTerminalTime = airTravelItem.oneWayHoursInAir * 2;
            airTravelItem.totalTravelHours = airTravelItem.trips * airTravelItem.roundTripTerminalTime;
            airTravelItem.grandTotalTravelHours = airTravelItem.totalTravelHours * airTravelItem.numMen;
            airTravelItem.totalTravelLabor = airTravelItem.grandTotalTravelHours * airTravelItem.rate;
          }
          break;
          
        case 'airTravelTime':
          // Update air travel time calculations
          item.roundTripTerminalTime = item.oneWayHoursInAir * 2;
          // Total travel hours is trips * round trip terminal time
          item.totalTravelHours = item.trips * item.roundTripTerminalTime;
          // Grand total travel hours is total travel hours * number of men
          item.grandTotalTravelHours = item.totalTravelHours * item.numMen;
          item.totalTravelLabor = item.grandTotalTravelHours * item.rate;
          
          // Sync numMen with flights section when linked (flights and air travel stay in sync with each other)
          if (field === 'numMen' && newData.numMenLinked && newData.flights[index]) {
            newData.flights[index] = {
              ...newData.flights[index],
              numMen: item.numMen
            };
            // Recalculate flights totals
            const flightsItem = newData.flights[index];
            flightsItem.totalFlightAmount = (flightsItem.numFlights * flightsItem.numMen * flightsItem.rate) + 
              (flightsItem.numFlights * flightsItem.numMen * flightsItem.luggageFees);
          }
          break;
          
        case 'rentalCar':
          item.totalAmount = item.numCars * item.rate;
          break;
      }
      
      return newData;
    });
    setIsDirty(true);
  };

  // Function to update theme variables
  const updateThemeVariables = () => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    
    if (isDark) {
      root.style.setProperty('--text-color', '#E4E6EB');
      root.style.setProperty('--border-color', '#3A3B3D');
      root.style.setProperty('--input-bg', '#242526');
      root.style.setProperty('--header-bg', '#1C1E21');
      root.style.setProperty('--cell-bg', '#242526');
      root.style.setProperty('--calculated-bg', '#1C1E21');
      root.style.setProperty('--table-bg', '#1C1E21');
      root.style.setProperty('--summary-bg', '#242526');
      root.style.setProperty('--total-bg', '#1C1E21');
      root.style.setProperty('--input-text', '#E4E6EB');
      root.style.setProperty('--input-placeholder', '#6B7280');
      root.style.setProperty('--input-border-focus', '#f26722');
    } else {
      root.style.setProperty('--text-color', '#333333');
      root.style.setProperty('--border-color', '#E5E7EB');
      root.style.setProperty('--input-bg', '#FFFFFF');
      root.style.setProperty('--header-bg', '#F9FAFB');
      root.style.setProperty('--cell-bg', '#FFFFFF');
      root.style.setProperty('--calculated-bg', '#F9FAFB');
      root.style.setProperty('--table-bg', '#FFFFFF');
      root.style.setProperty('--summary-bg', '#F9FAFB');
      root.style.setProperty('--total-bg', '#F3F4F6');
      root.style.setProperty('--input-text', '#111827');
      root.style.setProperty('--input-placeholder', '#9CA3AF');
      root.style.setProperty('--input-border-focus', '#f26722');
    }
  };

  // Set up theme observer
  useEffect(() => {
    // Initial theme setup
    updateThemeVariables();

    // Create observer to watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          updateThemeVariables();
        }
      });
    });

    // Start observing the HTML element for class changes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Cleanup observer on component unmount
    return () => observer.disconnect();
  }, []);

  // Add global styles for inputs with !important
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .estimate-form input,
      .estimate-form textarea,
      .estimate-form select {
        background-color: var(--input-bg) !important;
        color: var(--input-text) !important;
        border-color: var(--border-color) !important;
        transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease !important;
      }
      
      .estimate-form input:focus,
      .estimate-form textarea:focus,
      .estimate-form select:focus {
        border-color: var(--input-border-focus) !important;
        outline: none !important;
        box-shadow: 0 0 0 2px rgba(242, 103, 34, 0.2) !important;
      }
      
      .estimate-form input::placeholder,
      .estimate-form textarea::placeholder {
        color: var(--input-placeholder) !important;
      }
      
      .estimate-form input:disabled,
      .estimate-form textarea:disabled,
      .estimate-form select:disabled {
        background-color: var(--calculated-bg) !important;
        cursor: not-allowed;
      }

      .estimate-form table {
        transition: background-color 0.2s ease !important;
      }

      .estimate-form td,
      .estimate-form th {
        transition: background-color 0.2s ease, border-color 0.2s ease !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Add this above the return statement in the EstimateSheet component
  function handleGenerateLetterProposal() {
    setLetterIncludeMF(true);
    setLetterIncludeSaturday(showSaturdayHours);
    setLetterIncludeSunday(showSundayHours);
    setIsQuoteSelectOpen(true);
  }

  function handleGenerateCombinedLetterProposal() {
    setLetterIncludeMF(true);
    setLetterIncludeSaturday(showSaturdayHours);
    setLetterIncludeSunday(showSundayHours);
    setSelectedQuotesForCombined([]);
    setIsCombinedQuoteSelectOpen(true);
  }

  const [isQuoteSelectOpen, setIsQuoteSelectOpen] = useState(false);
  const [isCombinedQuoteSelectOpen, setIsCombinedQuoteSelectOpen] = useState(false);
  const [isLetterProposalOpen, setIsLetterProposalOpen] = useState(false);
  const [isLettersListOpen, setIsLettersListOpen] = useState(false);
  const [letters, setLetters] = useState<Array<{ id: string; html: string; created_at: string; quote_number?: string; neta_standard?: string; title?: string }>>([]);
  const [selectedLetterIndex, setSelectedLetterIndex] = useState<number>(-1);
  const [currentLetterId, setCurrentLetterId] = useState<string | null>(null);
  const [selectedQuotesForCombined, setSelectedQuotesForCombined] = useState<number[]>([]);
  const [scopeQuantities, setScopeQuantities] = useState<Record<number, number>>({});
  const [singleLetterScopeQuantity, setSingleLetterScopeQuantity] = useState<number>(1);
  const [showIndividualPricing, setShowIndividualPricing] = useState<boolean>(true);
  const [showGrandTotalPricing, setShowGrandTotalPricing] = useState<boolean>(true);
  const [includeMobilizationWhenZero, setIncludeMobilizationWhenZero] = useState<boolean>(false);
  const [isScopeNotesModalOpen, setIsScopeNotesModalOpen] = useState(false);
  const [hourlyRates, setHourlyRates] = useState({
    straightTime: DEFAULT_ESTIMATING_PRESETS.default_hourly_rate,
    overtime: DEFAULT_ESTIMATING_PRESETS.overtime_rate,
    doubleTime: DEFAULT_ESTIMATING_PRESETS.double_time_rate
    });
    
  const [materialMarkup, setMaterialMarkup] = useState(DEFAULT_ESTIMATING_PRESETS.default_markup_factor);
  
  // Track if presets have been loaded and applied (for new estimates only)
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const presetsAppliedRef = useRef(false);
  
  // Fetch and apply estimating presets for new estimates
  useEffect(() => {
    async function loadAndApplyPresets() {
      // Only apply presets once, and only for new estimates (no saved quote data)
      if (presetsAppliedRef.current) return;
      
      try {
        const presets = await getEstimatingPresets();
        
        // Re-check after async gap — loadQuoteData may have run while we awaited
        if (presetsAppliedRef.current) return;
        
        // Check if this is a new estimate (no existing quote selected)
        const hasExistingData = quotes.length > 0 && selectedQuoteIndex >= 0;
        
        if (!hasExistingData && presets) {
          presetsAppliedRef.current = true;
          
          // Apply hourly rates from presets
          setHourlyRates({
            straightTime: presets.default_hourly_rate,
            overtime: presets.overtime_rate,
            doubleTime: presets.double_time_rate
          });
          
          // Apply material markup from presets
          setMaterialMarkup(presets.default_markup_factor);
          
          // Apply defaults to data (men, hoursPerDay)
          setData(prev => ({
            ...prev,
            hoursSummary: {
              ...prev.hoursSummary,
              men: presets.default_number_of_men,
              hoursPerDay: presets.default_hours_per_day
            }
          }));
          
          // Apply travel data presets
          setTravelData(prev => ({
            ...prev,
            travelExpense: [{
              ...prev.travelExpense[0],
              numVehicles: presets.default_number_of_vehicles,
              rate: presets.default_vehicle_cost_per_mile
            }],
            travelTime: [{
              ...prev.travelTime[0],
              numMen: presets.default_number_of_men,
              rate: presets.default_hourly_rate
            }],
            perDiem: [{
              ...prev.perDiem[0],
              dailyRate: presets.default_per_diem_rate,
              firstDayRate: presets.default_per_diem_rate,
              lastDayRate: presets.default_per_diem_rate,
              numMen: presets.default_number_of_men
            }],
            lodging: [{
              ...prev.lodging[0],
              numMen: presets.default_number_of_men,
              rate: presets.default_lodging_rate
            }],
            localMiles: [{
              ...prev.localMiles[0],
              numVehicles: presets.default_number_of_vehicles,
              milesPerDay: presets.default_local_miles_per_day,
              rate: presets.default_vehicle_cost_per_mile
            }],
            flights: [{
              ...prev.flights[0],
              numMen: presets.default_flight_number_of_men,
              rate: presets.default_flight_rate,
              luggageFees: presets.default_flight_luggage_fees
            }],
            airTravelTime: [{
              ...prev.airTravelTime[0],
              numMen: presets.default_flight_number_of_men,
              rate: presets.default_hourly_rate
            }],
            rentalCar: [{
              ...prev.rentalCar[0],
              numCars: presets.default_rental_number_of_cars,
              rate: presets.default_rental_rate
            }]
          }));
          
          console.log('Estimating presets applied:', presets);
        }
        
        setPresetsLoaded(true);
      } catch (error) {
        console.error('Error loading estimating presets:', error);
        setPresetsLoaded(true); // Continue with hardcoded defaults on error
      }
    }
    
    loadAndApplyPresets();
  }, [quotes.length, selectedQuoteIndex]);
    
    // Trigger recalculation when hourly rates change
    useEffect(() => {
      // This will cause the component to re-render and recalculate getFinalValue()
      // The getFinalValue function now uses hourlyRates, so changing rates will update totals
    }, [hourlyRates]);
    
    const letterUpdateSourceRef = useRef<'user' | 'programmatic'>('programmatic');
  const letterEditorRef = useRef<HTMLDivElement | null>(null);
  const draggedScopeNotesRef = useRef<HTMLElement | null>(null);
  const [selectedLetterQuoteIndex, setSelectedLetterQuoteIndex] = useState<number | null>(null);
  const [letterHtml, setLetterHtml] = useState<string>("");
  const [isLetterDirty, setIsLetterDirty] = useState<boolean>(false);
  const savedLetterHtmlRef = useRef<string>("");
  const [contactData, setContactData] = useState<{ first_name: string; last_name: string } | null>(null);
  const [isViewMode, setIsViewMode] = useState<boolean>(false);
  const [netaStandard, setNetaStandard] = useState<string>('');
  const [letterProposalName, setLetterProposalName] = useState<string>('');

  const NETA_OPTIONS = [
    { value: '', text: '-- Select --' },
    { value: 'mts', text: 'All tests will be performed in accordance with ANSI/NETA MTS 2023 - Standard for Maintenance Testing Specifications for Electrical power Equipment and Systems.' },
    { value: 'ats', text: 'All tests will be performed in accordance with ANSI/NETA ATS 2025 - Standard for Acceptance Testing Specifications for Electrical Power Equipment and Systems' },
    { value: 'both', text: 'All work will be performed in accordance with the applicable ANSI/NETA ATS/MTS & IEEE 81 Standards.' }
  ];

  // Fix duplicate/bolded label bug in Pricing & Terms
  function normalizePricingTermsHtml(html: string): string {
    if (!html || !html.includes('Pricing & Terms')) return html;
    let out = html;
    const opt1Label = 'Option 1: Where NET 30 Terms are applicable and agreed upon:';
    const opt2Label = 'Option 2: Where NET 60 Terms are applicable and agreed upon:';
    const opt3Label = 'Option 3: Where NET 90 Terms are applicable and agreed upon:';
    // Fix plain-text duplicated label (no <b>): "Option 1: ... agreed upon: Option 1: ... agreed upon: 42,541.00"
    out = out.replace(new RegExp(`(${opt1Label})\\s*${opt1Label.replace(/[()]/g, '\\$&')}\\s*`, 'g'), '$1 ');
    out = out.replace(new RegExp(`(${opt2Label})\\s*${opt2Label.replace(/[()]/g, '\\$&')}\\s*`, 'g'), '$1 ');
    out = out.replace(new RegExp(`(${opt3Label})\\s*${opt3Label.replace(/[()]/g, '\\$&')}\\s*`, 'g'), '$1 ');
    out = out.replace(/Mobilization costs of\s+Mobilization costs of\s+/g, 'Mobilization costs of ');
    // Fix duplicated label inside <b> followed by amount outside
    out = out.replace(new RegExp(`(${opt1Label})\\s*<b[^>]*>\\s*${opt1Label.replace(/[()]/g, '\\$&')}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`, 'gi'), '$1 <b>$$$2</b>');
    out = out.replace(new RegExp(`(${opt2Label})\\s*<b[^>]*>\\s*${opt2Label.replace(/[()]/g, '\\$&')}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`, 'gi'), '$1 <b>$$$2</b>');
    out = out.replace(new RegExp(`(${opt3Label})\\s*<b[^>]*>\\s*${opt3Label.replace(/[()]/g, '\\$&')}\\s*</b>\\s*\\$([\\d,]+\\.\\d{2})`, 'gi'), '$1 <b>$$$2</b>');
    // Fix duplicated label + amount inside <b>
    out = out.replace(new RegExp(`(${opt1Label})\\s*<b[^>]*>\\s*${opt1Label.replace(/[()]/g, '\\$&')}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`, 'gi'), '$1 <b>$$$2</b>');
    out = out.replace(new RegExp(`(${opt2Label})\\s*<b[^>]*>\\s*${opt2Label.replace(/[()]/g, '\\$&')}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`, 'gi'), '$1 <b>$$$2</b>');
    out = out.replace(new RegExp(`(${opt3Label})\\s*<b[^>]*>\\s*${opt3Label.replace(/[()]/g, '\\$&')}\\s*\\$([\\d,]+\\.\\d{2})\\s*</b>`, 'gi'), '$1 <b>$$$2</b>');
    // Fix "Mobilization costs of <b>Mobilization costs of 2,959.00</b>"
    out = out.replace(/Mobilization costs of\s*<b[^>]*>\s*Mobilization costs of\s*\$([\d,]+\.\d{2})\s*<\/b>/gi, 'Mobilization costs of <b>$$$1</b>');
    return out;
  }

  // Update only the NETA standard span via string replace so the rest of the letter HTML is never parsed/serialized (avoids corrupting Pricing & Terms).
  function replaceNetaSpanInHtml(html: string, newText: string): string {
    const escaped = (newText || '[Select NETA Standard]')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return html.replace(/<span id="neta-standard-text">[^<]*<\/span>/g, `<span id="neta-standard-text">${escaped}</span>`);
  }

  function applyNetaTextByValue(value: string) {
    try {
      const option = NETA_OPTIONS.find(o => o.value === value);
      const newText = option?.text || '[Select NETA Standard]';

      // 1) Update the visible text in the editor DOM — nothing else
      const editor = letterEditorRef.current;
      if (editor) {
        const span = editor.querySelector('#neta-standard-text') as HTMLElement | null;
        if (span) span.textContent = newText;
      }

      // 2) Update letterHtml state via string-only replacement, marked as 'user'
      //    so the programmatic-write effect does NOT rewrite editor.innerHTML
      if (letterHtml.includes('neta-standard-text')) {
        letterUpdateSourceRef.current = 'user';
        setLetterHtml(replaceNetaSpanInHtml(letterHtml, newText));
      }

      // 3) Persist the dropdown value
      setNetaStandard(value);
    } catch {}
  }

  // When letterHtml changes due to programmatic updates, write it into the editor
  useEffect(() => {
    if (letterUpdateSourceRef.current !== 'programmatic') return;
    const editor = letterEditorRef.current;
    if (!editor) return;

    // Don't interfere if user is actively editing (has focus)
    if (document.activeElement === editor) return;
    // Skip forcing focus/selection if we're re-rendering after a move to preserve scroll
    if (skipNextFocusRef.current) { skipNextFocusRef.current = false; return; }

    try {
      // Write HTML without triggering React re-render of contentEditable
      if (editor.innerHTML !== letterHtml) {
        editor.innerHTML = letterHtml;
      }

      // Only set focus and cursor if the editor doesn't already have focus
      if (document.activeElement !== editor) {
        editor.focus();
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection.addRange(range);
        }
      }
    } catch {}
  }, [letterHtml]);

  // Restore letter proposal state from Supabase preferences if needed (but not for fresh generation)
  useEffect(() => {
    console.log('Restoration useEffect triggered:', { mode, isLetterProposalOpen, isQuoteSelectOpen });
    // Only restore if we're not in a fresh generation mode and there's persisted state
    // Allow restoration when mode is undefined (normal state) or other modes except 'letter'
    // IMPORTANT: Don't run this during active letter generation to prevent interference
    if (mode !== 'letter' && !isLetterProposalOpen && !isQuoteSelectOpen && selectedLetterQuoteIndex === null) {
      const savedState = getLetterProposalState();
      
      console.log('Checking restoration conditions:', { savedOpen: savedState.isOpen, hasSavedHtml: !!savedState.html });
      
      if (savedState.isOpen && savedState.html) {
        console.log('Restoring letter proposal from Supabase preferences');
        setIsLetterProposalOpen(true);
        const normalized = normalizePricingTermsHtml(savedState.html);
        setLetterHtml(normalized);
        savedLetterHtmlRef.current = normalized;
        setIsLetterDirty(false);
        if (savedState.quoteIndex !== null) {
          setSelectedLetterQuoteIndex(savedState.quoteIndex);
        }
        if (savedState.netaStandard) {
          setNetaStandard(savedState.netaStandard);
        }
      }
    } else {
      console.log('Skipping restoration due to conditions:', { mode, isLetterProposalOpen, isQuoteSelectOpen, selectedLetterQuoteIndex });
    }
  }, [opportunityId, mode, isQuoteSelectOpen, selectedLetterQuoteIndex, getLetterProposalState]);

  // When letter proposal FIRST opens, make sure editor is populated
  const letterEditorPopulatedRef = useRef(false);
  useEffect(() => {
    if (!isLetterProposalOpen) {
      letterEditorPopulatedRef.current = false;
      return;
    }
    if (isLetterProposalOpen && letterHtml && letterEditorRef.current) {
      // Small delay to ensure editor is fully rendered
      setTimeout(() => {
        const editor = letterEditorRef.current;
        if (!editor) return;

        // Only populate editor once when it first opens or is empty; never re-write on subsequent letterHtml changes
        if (!letterEditorPopulatedRef.current || editor.innerHTML.trim() === '') {
          letterEditorPopulatedRef.current = true;
          letterUpdateSourceRef.current = 'programmatic';
          editor.innerHTML = letterHtml;
          // Cleanup legacy blocks that should no longer appear
          try {
            editor.querySelectorAll('.amp-combined-summary').forEach(el => el.remove());
          } catch {}
        }

        // Bind up/down arrow controls for combined-letter scope blocks
        try {
          const blocks = Array.from(editor.querySelectorAll('.amp-scope-block')) as HTMLElement[];
          if (blocks.length) {
            blocks.forEach((block) => {
              if ((block as any)._ampArrowsBound) return;
              const upBtn = block.querySelector('.amp-scope-controls .move-up') as HTMLButtonElement | null;
              const downBtn = block.querySelector('.amp-scope-controls .move-down') as HTMLButtonElement | null;
              const moveUp = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const parent = block.parentElement;
                if (!parent) return;
                const prevViewportTop = block.getBoundingClientRect().top;
                const prevWindowScrollY = window.scrollY || document.documentElement.scrollTop;
                const prevEditorScrollTop = (editor as HTMLElement).scrollTop;
                try { const sel = window.getSelection(); sel && sel.removeAllRanges(); } catch {}
                const prev = block.previousElementSibling as HTMLElement | null;
                if (prev && prev.classList.contains('amp-scope-block')) {
                  parent.insertBefore(block, prev);
                  try {
                    const html = editor.innerHTML;
                    skipNextFocusRef.current = true;
                    const st = prevEditorScrollTop;
                    setLetterHtml(html);
                    setTimeout(() => {
                      try {
                        const newTop = block.getBoundingClientRect().top;
                        const delta = newTop - prevViewportTop;
                        if (Number.isFinite(delta)) {
                          window.scrollTo({ top: prevWindowScrollY + delta, behavior: 'instant' as any });
                        }
                        (editor as HTMLElement).scrollTop = st;
                      } catch {}
                    }, 0);
                    // Save to Supabase (debounced by service)
                    saveLetterProposalHtml(html);
                  } catch {}
                }
              };
              const moveDown = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const parent = block.parentElement;
                if (!parent) return;
                const prevViewportTop = block.getBoundingClientRect().top;
                const prevWindowScrollY = window.scrollY || document.documentElement.scrollTop;
                const prevEditorScrollTop = (editor as HTMLElement).scrollTop;
                try { const sel = window.getSelection(); sel && sel.removeAllRanges(); } catch {}
                const next = block.nextElementSibling as HTMLElement | null;
                if (next && next.classList.contains('amp-scope-block')) {
                  parent.insertBefore(next, block);
                  try {
                    const html = editor.innerHTML;
                    skipNextFocusRef.current = true;
                    const st = prevEditorScrollTop;
                    setLetterHtml(html);
                    setTimeout(() => {
                      try {
                        const newTop = block.getBoundingClientRect().top;
                        const delta = newTop - prevViewportTop;
                        if (Number.isFinite(delta)) {
                          window.scrollTo({ top: prevWindowScrollY + delta, behavior: 'instant' as any });
                        }
                        (editor as HTMLElement).scrollTop = st;
                      } catch {}
                    }, 0);
                    // Save to Supabase (debounced by service)
                    saveLetterProposalHtml(html);
                  } catch {}
                }
              };
              upBtn?.addEventListener('click', moveUp as any);
              downBtn?.addEventListener('click', moveDown as any);
              (block as any)._ampArrowsBound = true;
            });
          }
        } catch {}

        // Scope quantity controls have been moved to the quote selection modal
        // No longer needed here since quantities are set before letter generation
      }, 100);
    }
  }, [isLetterProposalOpen, letterHtml]);

  // Drag-and-drop for scope notes: allow moving the scope notes block anywhere in the letter
  useEffect(() => {
    if (!isLetterProposalOpen) return;
    const editor = letterEditorRef.current;
    if (!editor) return;

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('scope-notes-drag-handle') && !target.closest('.scope-notes-drag-handle')) return;
      const section = target.closest('.scope-notes-section');
      if (!section) return;
      e.stopPropagation();
      draggedScopeNotesRef.current = section as HTMLElement;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/amp-scope-notes', '1');
        e.dataTransfer.setData('text/plain', 'Scope Notes');
      }
    };

    const handleDragEnd = () => {
      draggedScopeNotesRef.current = null;
    };

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/amp-scope-notes')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dragged = draggedScopeNotesRef.current;
      if (!dragged || !letterEditorRef.current) return;
      const dropTarget = e.target as Node;
      const dropEl = (dropTarget.nodeType === Node.TEXT_NODE ? dropTarget.parentElement : dropTarget) as HTMLElement;
      if (!dropEl) return;
      if (dragged.contains(dropEl) || dragged === dropEl) return;

      const letterRoot = letterEditorRef.current.querySelector('#letter-proposal') || letterEditorRef.current;
      if (!letterRoot.contains(dropEl)) return;

      // Insert before the section-level block that contains the drop target
      const block = dropEl.closest('.amp-section, .amp-scope-block, .scope-notes-section, table.amp-section, div[style*="margin"]');
      const insertBefore: Node = block && letterRoot.contains(block) ? block : dropEl;
      if (insertBefore === dragged) return; // avoid no-op
      const parent = insertBefore.parentNode;
      if (!parent) return;
      parent.insertBefore(dragged, insertBefore);

      letterUpdateSourceRef.current = 'programmatic';
      setLetterHtml(letterEditorRef.current.innerHTML);
      setIsLetterDirty(true);
      draggedScopeNotesRef.current = null;
    };

    editor.addEventListener('dragstart', handleDragStart, true);
    editor.addEventListener('dragend', handleDragEnd, true);
    editor.addEventListener('dragover', handleDragOver, true);
    editor.addEventListener('drop', handleDrop, true);
    return () => {
      editor.removeEventListener('dragstart', handleDragStart, true);
      editor.removeEventListener('dragend', handleDragEnd, true);
      editor.removeEventListener('dragover', handleDragOver, true);
      editor.removeEventListener('drop', handleDrop, true);
    };
  }, [isLetterProposalOpen]);

  // Function to format address for letter proposal
  function formatAddressForLetter(address: string): string {
    if (!address) return 'Address';
    
    // Remove "United States" from the address
    const formattedAddress = address.replace(/,?\s*United States\s*$/i, '');
    
    // Split by commas and format each part
    const parts = formattedAddress.split(',').map(part => part.trim()).filter(part => part);
    
    if (parts.length === 0) return 'Address';
    if (parts.length === 1) return parts[0];
    
    // Format as: "Street Address," on first line, "City, State, Zip" on second line
    const streetAddress = parts[0] + ',';
    const cityStateZip = parts.slice(1).join(', ');
    
    return `${streetAddress}<br/>${cityStateZip}`;
  }

  function handleSelectQuoteForLetter(index: number) {
    console.log('handleSelectQuoteForLetter called with index:', index);
    setSelectedLetterQuoteIndex(index);
    setIsQuoteSelectOpen(false);
    
    // Prevent AuthContext refresh while letter proposal is open
    try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    
    // Generate letter immediately
    console.log('Generating letter proposal immediately');
    generateLetterProposal(index);
  }

  // Function to preload assets before generating letter
  const preloadAssets = () => {
    return new Promise((resolve) => {
      let loadedCount = 0;
      const totalAssets = 2;
      
      const checkComplete = () => {
        loadedCount++;
        if (loadedCount >= totalAssets) {
          resolve(true);
        }
      };
      
      const logo = new Image();
      const signature = new Image();
      
      // Handle both success and error cases for logo
      logo.onload = checkComplete;
      logo.onerror = () => {
        console.warn('Failed to load logo image, continuing anyway');
        checkComplete();
      };
      
      // Handle both success and error cases for signature
      signature.onload = checkComplete;
      signature.onerror = () => {
        console.warn('Failed to load signature image, continuing anyway');
        checkComplete();
      };
      
      // Start loading images
      logo.src = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png';
      signature.src = (window as any)?.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
      
      // Fallback timeout in case images take too long
      setTimeout(() => {
        console.warn('Asset preloading timed out, continuing anyway');
        resolve(true);
      }, 5000); // 5 second timeout
    });
  };

  function generateLetterProposal(index: number) {
    console.log('generateLetterProposal called with index:', index);
    // Preload assets first, then generate the letter
    preloadAssets().then(() => {
      console.log('Assets preloaded successfully, calling generateLetterContent');
      generateLetterContent(index);
    }).catch((error) => {
      console.error('Error preloading assets:', error);
      // Continue with letter generation even if asset loading fails
      console.log('Continuing with letter generation despite asset loading error');
      generateLetterContent(index);
    });
  }

  // Function to update letter_proposal_created_date when saving letter proposal
  async function updateLetterProposalCreatedDate() {
    console.log('updateLetterProposalCreatedDate called - updating date and dispatching event');
    
    try {
      // Set letter proposal created date to today at noon UTC to prevent timezone shifts
      const today = new Date().toISOString().substring(0, 10);
      const letterProposalCreatedDate = today + 'T12:00:00.000Z';
      
      console.log('Updating letter_proposal_date to:', letterProposalCreatedDate);
      
      const { error: updateError } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ letter_proposal_date: letterProposalCreatedDate })
        .eq('id', opportunityId);
        
      if (updateError) {
        console.warn('Failed to update letter_proposal_created_date:', updateError);
      } else {
        console.log('Successfully updated letter_proposal_date, dispatching event');
        // Notify OpportunityDetail after letter is saved
        window.dispatchEvent(new CustomEvent('letterProposalGenerated', { 
          detail: { opportunityId } 
        }));
      }
    } catch (error) {
      console.error('Error updating letter proposal created date:', error);
    }
  }

  function generateLetterContent(index: number) {
    console.log('generateLetterContent called with index:', index);
    console.log('Current isLetterProposalOpen state:', isLetterProposalOpen);
    
    // Generate the letter HTML template with data from quotes[index] and opportunityData
    const quote = quotes[index];
    const today = new Date();
    const dateStr = today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const customer: { name: string; company_name: string; address: string } =
      (opportunityData?.customer as any) || { name: '', company_name: '', address: '' };
    // --- FIX: Always parse quote.data if it's a string, then pull sovItems from the parsed object ---
    let parsedData = quote.data;
    if (typeof parsedData === 'string') {
      try {
        parsedData = JSON.parse(parsedData);
      } catch (e) {
        parsedData = {};
      }
    }
    let sovItems: any[] = [];
    if (Array.isArray(parsedData.sovItems) && parsedData.sovItems.length > 0) {
      // Filter out placeholder/empty rows so only real items appear in the letter
      sovItems = parsedData.sovItems.filter((it: any) => {
        const name = (it?.item ?? '').toString().trim();
        const hasQty = Number(it?.quantity) > 0;
        const hasAnyCost = [it?.materialPrice, it?.expensePrice, it?.laborMen, it?.laborHours]
          .some((v: any) => Number(v) > 0);
        return name.length > 0 || hasQty || hasAnyCost;
      });
    }
    // --- Build the material + expense base (shared across all day-type scenarios) ---
    function getMaterialExpenseBaseParsed(parsed: any) {
      const cv = parsed.calculatedValues || {};
      return (
        ((cv.totalMaterial || 0) * 1.09 * materialMarkup) +
        ((cv.totalExpense || 0) * 1.09) +
        ((cv.nonSovExpense || 0) * 1.00)
      );
    }
    // Work labor cost for a given hours summary
    function getWorkLaborCostParsed(hs: any) {
      return ((hs?.straightTimeHours || 0) * hourlyRates.straightTime) +
             ((hs?.overtimeHours || 0) * hourlyRates.overtime) +
             ((hs?.doubleTimeHours || 0) * hourlyRates.doubleTime);
    }
    // Travel labor cost from hours summary (now tracked in labor table)
    function getTravelLaborCostParsed(hs: any) {
      return ((hs?.travelStraightTimeHours || 0) * hourlyRates.straightTime) +
             ((hs?.travelOvertimeHours || 0) * hourlyRates.overtime) +
             ((hs?.travelDoubleTimeHours || 0) * hourlyRates.doubleTime);
    }
    function formatCurrency(amount: number) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    // Include travel non-labor cost from the most reliable source
    const parsedTravel = (() => {
      let source: any = (quote as any)?.travel_data ?? null;
      if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch { source = null; }
      }
      if (!source && parsedData?.travel_data) {
        source = typeof parsedData.travel_data === 'string'
          ? (() => { try { return JSON.parse(parsedData.travel_data); } catch { return null; } })()
          : parsedData.travel_data;
      }
      if (!source && travelData) {
        source = travelData;
      }
      return source || {};
    })();
    const getParsedTravelNonLaborCost = () => {
      const td: any = parsedTravel as any;
      return (
        (td?.travelExpense?.[0]?.vehicleTravelCost ?? 0) +
        (td?.perDiem?.[0]?.totalPerDiem ?? 0) +
        (td?.lodging?.[0]?.totalAmount ?? 0) +
        (td?.localMiles?.[0]?.totalLocalMilesCost ?? 0) +
        (td?.flights?.[0]?.totalFlightAmount ?? 0) +
        (td?.rentalCar?.[0]?.totalAmount ?? 0)
      );
    };
    const hs = parsedData.hoursSummary || {};
    const matExpBase = getMaterialExpenseBaseParsed(parsedData);
    const travelNonLabor = getParsedTravelNonLaborCost();
    const baseFinalValue = Math.ceil((matExpBase + getWorkLaborCostParsed(hs) + getTravelLaborCostParsed(hs) + travelNonLabor) / 0.96);
    const finalValue = baseFinalValue * (singleLetterScopeQuantity || 1);

    // Saturday/Sunday final values (if applicable)
    const satHS = parsedData.saturdayHoursSummary;
    const sunHS = parsedData.sundayHoursSummary;
    const hasSaturdayPricing = !!parsedData.showSaturdayHours && !!satHS;
    const hasSundayPricing = !!parsedData.showSundayHours && !!sunHS;
    const satBaseFinalValue = hasSaturdayPricing
      ? Math.ceil((matExpBase + getWorkLaborCostParsed(satHS) + getTravelLaborCostParsed(satHS) + travelNonLabor) / 0.96)
      : baseFinalValue;
    const satFinalValue = satBaseFinalValue * (singleLetterScopeQuantity || 1);
    const sunBaseFinalValue = hasSundayPricing
      ? Math.ceil((matExpBase + getWorkLaborCostParsed(sunHS) + getTravelLaborCostParsed(sunHS) + travelNonLabor) / 0.96)
      : baseFinalValue;
    const sunFinalValue = sunBaseFinalValue * (singleLetterScopeQuantity || 1);
    const mobilizationRaw = (() => {
      const factor = getMobilizationFactor(finalValue);
      return Math.ceil(finalValue * factor);
    })();
    const mobilization = formatCurrency(mobilizationRaw);
    const showMobilizationInLetter = mobilizationRaw > 0 || includeMobilizationWhenZero;

    // Use letter controls for which day-types to show (still require data to exist)
    const showMFInLetter = letterIncludeMF;
    const showSatInLetter = letterIncludeSaturday && hasSaturdayPricing;
    const showSunInLetter = letterIncludeSunday && hasSundayPricing;

    // Mobilization amounts per scenario
    const satMobRaw = hasSaturdayPricing ? Math.ceil(satFinalValue * getMobilizationFactor(satFinalValue)) : mobilizationRaw;
    const sunMobRaw = hasSundayPricing ? Math.ceil(sunFinalValue * getMobilizationFactor(sunFinalValue)) : mobilizationRaw;

    // Determine which payment terms to render
    const termsToRender: { key: string; label: string; factor: number }[] = letterShowAllTerms
      ? [
          { key: 'net30', label: 'NET 30', factor: paymentTermFactors.net30 },
          { key: 'net60', label: 'NET 60', factor: paymentTermFactors.net60 },
          { key: 'net90', label: 'NET 90', factor: paymentTermFactors.net90 },
        ]
      : [
          { key: letterPaymentTerm, label: letterPaymentTerm === 'net30' ? 'NET 30' : letterPaymentTerm === 'net60' ? 'NET 60' : 'NET 90', factor: paymentTermFactors[letterPaymentTerm] },
        ];

    // Build the pricing HTML block dynamically
    const hasMultipleDayTypes = (showMFInLetter ? 1 : 0) + (showSatInLetter ? 1 : 0) + (showSunInLetter ? 1 : 0) > 1;
    const pricingHtml = (() => {
      // Classic format: M-F only (or single day-type) with all terms → single list with Option 1/2/3
      if (!hasMultipleDayTypes && letterShowAllTerms) {
        const baseValue = showSatInLetter ? satFinalValue : showSunInLetter ? sunFinalValue : finalValue;
        const baseMob = showSatInLetter ? satMobRaw : showSunInLetter ? sunMobRaw : mobilizationRaw;
        const option1 = formatCurrency(Math.ceil(baseValue * paymentTermFactors.net30) + baseMob);
        const option2 = formatCurrency(Math.ceil(baseValue * paymentTermFactors.net60) + baseMob);
        const option3 = formatCurrency(Math.ceil(baseValue * paymentTermFactors.net90) + baseMob);
        return `<ul style="margin: 4px 0;">
          <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b>${option1}</b></li>
          <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b>${option2}</b></li>
          <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b>${option3}</b></li>
        </ul>`;
      }
      // Multi day-type or single term: show per-term blocks with day-type line items
      return termsToRender.map((term, termIdx) => {
        const lines: string[] = [];
        if (showMFInLetter) {
          lines.push(`<li>Work performed Monday - Friday: <b>${formatCurrency(Math.ceil(finalValue * term.factor) + mobilizationRaw)}</b></li>`);
        }
        if (showSatInLetter) {
          lines.push(`<li>Work performed on Saturday: <b>${formatCurrency(Math.ceil(satFinalValue * term.factor) + satMobRaw)}</b></li>`);
        }
        if (showSunInLetter) {
          lines.push(`<li>Work performed on Sunday / Holiday: <b>${formatCurrency(Math.ceil(sunFinalValue * term.factor) + sunMobRaw)}</b></li>`);
        }
        if (lines.length === 0) {
          lines.push(`<li>Total: <b>${formatCurrency(Math.ceil(finalValue * term.factor) + mobilizationRaw)}</b></li>`);
        }
        // Single term selected (no "all"): use simpler header without "Option N"
        const header = !letterShowAllTerms
          ? `<div class="amp-section" style="margin:4px 0;"><b>Where ${term.label} Terms are applicable and agreed upon:</b></div>`
          : `<div class="amp-section" style="margin:4px 0;"><b>Option ${termIdx + 1}: Where ${term.label} Terms are applicable and agreed upon:</b></div>`;
        return `${header}\n<ul style="margin: 4px 0;">${lines.join('\n')}</ul>`;
      }).join('\n');
    })();
    
    // Get scope title for display
    const scopeTitle = (parsedData?.title && String(parsedData.title).trim()) ? String(parsedData.title).trim() : 'Scope';
    const sovTableRows = sovItems && sovItems.length > 0
      ? sovItems.map((item: any) => {
          const name = (item.item || '').toString();
          const qty = item.quantity ?? item.qty ?? 1;
          return `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>${name}</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>${qty}</td></tr>`;
        }).join('')
      : `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>24-hour Power Study</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>1</td></tr>`;

    const contactName = contactData ? `${contactData.first_name} ${contactData.last_name}`.trim() : (customer.name || 'Contact Name');
    // Prefer opportunity's quote_number for the letter number
    const letterQuoteNumber = (opportunityData as any)?.quote_number || quote.id?.slice(0,6) || (index + 1);

    const signatureUrl = (window as any)?.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
    const newLetterHtml = `
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.2;">
        <div style="display:flex;align-items:center;padding-bottom:6px;margin-bottom:12px;border-bottom:1px solid #ccc;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 24px; margin-right: 8px;" />
          <span style="font-size: 1em; font-weight: bold; color: #333;">AMP Quality Energy Services</span>
        </div>
        <div class="amp-section"><b>${dateStr}</b></div>
        <div class="amp-section" style="margin-bottom: 8px;"><b>Letter # ${letterQuoteNumber}</b></div>
        <div>
          ${contactName}<br/>
          ${customer.company_name || 'Company'}<br/>
          ${formatAddressForLetter(customer.address)}<br/>
        </div>
        <div class="amp-section" style="margin: 8px 0;">Dear ${contactName},</div>
        <div class="amp-section">AMP LLC is pleased to offer the following proposal for your consideration.</div>
        <div class="amp-section" style="margin: 8px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at ${(opportunityData?.title || 'Project Title')}${opportunityData?.jobsite_location ? ', ' + opportunityData.jobsite_location : ''}.</div>
        <div class="amp-section" style="margin: 8px 0;">
          <span id="neta-standard-text">${NETA_OPTIONS.find(o => o.value === netaStandard)?.text || '[Select NETA Standard]'}</span>
        </div>
        <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <b>Scope</b>
        </div>
        <table class="amp-section" style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
          <thead>
            <tr><th style='border:1px solid #ccc;padding:4px 12px;text-align:left;'>Item</th><th style='border:1px solid #ccc;padding:4px 12px;text-align:center;'>Quantity</th></tr>
          </thead>
          <tbody>
            ${sovTableRows}
          </tbody>
        </table>
        <div class="amp-section" style="margin-top: 12px;"><b>Pricing & Terms</b></div>
        ${(singleLetterScopeQuantity || 1) > 1 ? `
        <div class="amp-section" style="margin:4px 0;">
          <div style="margin-bottom:4px;"><b>The following price is based upon the scope quantities listed below:</b></div>
          <div><b>${scopeTitle}</b> to be performed <b>${singleLetterScopeQuantity}</b> ${singleLetterScopeQuantity === 1 ? 'time' : 'times'}</div>
        </div>
        ` : ''}
        ${pricingHtml}
        ${showMobilizationInLetter ? `<div class="amp-section">Mobilization costs of ${mobilization} shall be paid out of the above agreed upon price before the first day of work.</div>` : ''}
        <div class="amp-section">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div class="amp-section" style="margin-top: 8px;">This price is based upon the following:</div>
        <ol class="amp-section" style="margin: 4px 0 4px 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.${showSatInLetter || showSunInLetter ? ' Alternate rates apply for Saturday and Sunday/Holiday work as noted above.' : ''}</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services ${new Date().getFullYear()} T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>
        <div style="margin-top: 12px;"><b>Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 8px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 8px;"><b><i>Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</i></b></div>
        <div style="margin-top: 8px;">Should you have any questions please contact the undersigned.</div>
        <div style="margin-top: 12px;">Sincerely,</div>
        <div style="margin: 4px 0 2px 0;">
          <img src="${signatureUrl}" alt="Signature" style="height: 40px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>Brian Rodgers</div>
        <div>Chief Executive Officer</div>
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        <div style="width:100%;font-size:0.85em;color:#555;border-top:1px solid #ccc;padding:4px 0;text-align:center;margin-top:12px;">P.O. Box 1725 | Decatur, Alabama 35602 | (256) 513-8255</div>
        <div style="margin-top: 80px;">
          <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 4px; margin-bottom: 8px;">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 32px; margin-right: 8px;" />
            <span style="font-size: 1.0em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
          </div>
          <div style="font-size: 1.0em; font-weight: bold; margin-bottom: 6px;">Safety Policy on Jobsites</div>
          <div style="font-weight: bold; margin-bottom: 4px;">LOCKOUT / TAGOUT</div>
          <div>On a jobsite where the customer has an established Lockout program or there is a lockout procedure already established, AMP employees will follow local Lockout program provided that it does not expose the employee to greater risk than the AMP procedure below.</div>
          <div style="margin-top: 4px;">In the absence of a local lockout procedure, AMP employees will follow the following procedure.</div>
          <ul style="margin: 4px 0 4px 16px;">
            <li>The employees shall be notified that a lockout (tagout) system is going to be implemented and the reason therefore. The qualified employee implementing the lockout (tagout) shall know the disconnecting means location for all sources of electrical energy and the location of all sources of potential energy. The qualified person shall be knowledgeable of hazards associated with all energy sources.</li>
            <li>If the electrical supply is energized, the qualified person shall deenergize and disconnect the electric supply and relieve all stored energy.</li>
            <li>Lockout (tagout) all disconnecting means with lockout (tagout) devices.</li>
            <li>For tagout, one additional safety measure must be employed, such as opening, blocking, or removing an additional circuit element.</li>
            <li>Attempt to operate the disconnecting means to determine that operation is prohibited.</li>
            <li>A voltage-detecting instrument shall be used.  Inspect the instrument for visible damage. Do not proceed if there is an indication of damage to the instrument until an undamaged device is available.</li>
            <li>Verify proper instrument operation and then test for absence of voltage.</li>
            <li>Verify proper instrument operation after testing for absence of voltage.</li>
            <li>Where required, install grounding equipment/conductor device on the phase conductors or circuit parts, to eliminate induced voltage or stored energy, before touching them. Where it has been determined that contact with other exposed energized conductors or circuit parts is possible, apply ground connecting devices rated for the available fault duty.</li>
            <li>The equipment and/or electrical source is now locked out (tagged out).</li>
          </ul>
          <div style="margin-top: 6px; font-weight: bold;">Procedure Involving More Than One Person.</div>
          <div>For a simple lockout/tagout and where more than one person is involved in the job or task, each person shall install his or her own personal lockout (tagout) device.</div>
          <div style="margin-top: 8px;">Safety is the utmost priority at AMP Quality Energy Services and we reserve the right to stop work on any project that our technicians deem as unsafe. AMP Quality Energy Services technicians follow NFPA 70E, ANSI, NETA, and OSHA safety guidelines. Lock out/Tag out of all energy sources is required prior to working on an electrical system. Any exceptions to the above-mentioned specifications will need to be made in writing prior to shut-down for our safety officer's evaluation. Drop hazard mitigation shall be implemented while working at heights.</div>
          <div style="margin-top: 12px; font-size: 1.0em; font-weight: bold; text-align: center;">END OF SAFETY POLICY</div>
        </div>
      </div>
    `;
    setLetterHtml(newLetterHtml);
    savedLetterHtmlRef.current = newLetterHtml;
    setIsLetterDirty(false);
    setIsLetterProposalOpen(true);
    // Prevent AuthContext refresh while letter proposal is open
    try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
  }

  function handleSelectQuotesForCombinedLetter() {
    if (selectedQuotesForCombined.length === 0) return;
    
    setIsCombinedQuoteSelectOpen(false);
    
    // Prevent AuthContext refresh while letter proposal is open
    try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    
    
    // Generate the combined letter HTML template with data from selected quotes
    const selectedQuotes = selectedQuotesForCombined.map(idx => quotes[idx]);
    const today = new Date();
    const dateStr = today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const customer: { name: string; company_name: string; address: string } =
      (opportunityData?.customer as any) || { name: '', company_name: '', address: '' };
    
    // Process all selected quotes
    const processedQuotes = selectedQuotes.map((quote, quoteIndex) => {
      const originalQuoteIndex = selectedQuotesForCombined[quoteIndex];
      let parsedData = quote.data;
      if (typeof parsedData === 'string') {
        try {
          parsedData = JSON.parse(parsedData);
        } catch (e) {
          parsedData = {};
        }
      }
      
      let sovItems: any[] = [];
      if (Array.isArray(parsedData.sovItems) && parsedData.sovItems.length > 0) {
        sovItems = parsedData.sovItems.filter((it: any) => {
          const name = (it?.item ?? '').toString().trim();
          const hasQty = Number(it?.quantity) > 0;
          const hasAnyCost = [it?.materialPrice, it?.expensePrice, it?.laborMen, it?.laborHours]
            .some((v: any) => Number(v) > 0);
          return name.length > 0 || hasQty || hasAnyCost;
        });
      }

      // Per-scope rates from saved quote data; use live form state only for the estimate tab currently open
      const quoteHourlyRates =
        originalQuoteIndex === selectedQuoteIndex && selectedQuoteIndex >= 0
          ? hourlyRates
          : getHourlyRatesForCombinedScope(parsedData);
      
      // Calculate final value for this quote
      function getFinalNumeratorWithoutTravel(parsed: any) {
        const cv = parsed.calculatedValues || {};
        const hs = parsed.hoursSummary || {};
        const totalMaterial = cv.totalMaterial || 0;
        const totalExpense = cv.totalExpense || 0;
        const nonSovExpense = cv.nonSovExpense || 0;
        const straightTimeHours = hs.straightTimeHours || 0;
        const overtimeHours = hs.overtimeHours || 0;
        const doubleTimeHours = hs.doubleTimeHours || 0;
        return (
          (totalMaterial * 1.09 * materialMarkup) +
          (totalExpense * 1.09) +
          (nonSovExpense * 1.00) +
          (straightTimeHours * quoteHourlyRates.straightTime) +
          (overtimeHours * quoteHourlyRates.overtime) +
          (doubleTimeHours * quoteHourlyRates.doubleTime)
        );
      }
      
      // Get travel cost
      const parsedTravel = (() => {
        let source: any = (quote as any)?.travel_data ?? null;
        if (typeof source === 'string') {
          try { source = JSON.parse(source); } catch { source = null; }
        }
        if (!source && parsedData?.travel_data) {
          source = typeof parsedData.travel_data === 'string'
            ? (() => { try { return JSON.parse(parsedData.travel_data); } catch { return null; } })()
            : parsedData.travel_data;
        }
        return source || {};
      })();
      
      const getParsedTotalTravelCost = () => {
        const td: any = parsedTravel as any;
        return (
          (td?.travelExpense?.[0]?.vehicleTravelCost ?? 0) +
          (td?.travelTime?.[0]?.totalTravelLabor ?? 0) +
          (td?.perDiem?.[0]?.totalPerDiem ?? 0) +
          (td?.lodging?.[0]?.totalAmount ?? 0) +
          (td?.localMiles?.[0]?.totalLocalMilesCost ?? 0) +
          (td?.flights?.[0]?.totalFlightAmount ?? 0) +
          (td?.airTravelTime?.[0]?.totalTravelLabor ?? 0) +
          (td?.rentalCar?.[0]?.totalAmount ?? 0)
        );
      };
      
      // Material/expense base (shared across day-type scenarios)
      const cv = parsedData.calculatedValues || {};
      const matExpBase = (
        ((cv.totalMaterial || 0) * 1.09 * materialMarkup) +
        ((cv.totalExpense || 0) * 1.09) +
        ((cv.nonSovExpense || 0) * 1.00)
      );

      const hs = parsedData.hoursSummary || {};
      const workLabor = (hs.straightTimeHours || 0) * quoteHourlyRates.straightTime +
                        (hs.overtimeHours || 0) * quoteHourlyRates.overtime +
                        (hs.doubleTimeHours || 0) * quoteHourlyRates.doubleTime;
      const travelLabor = (hs.travelStraightTimeHours || 0) * quoteHourlyRates.straightTime +
                          (hs.travelOvertimeHours || 0) * quoteHourlyRates.overtime +
                          (hs.travelDoubleTimeHours || 0) * quoteHourlyRates.doubleTime;
      const travelNonLabor = getParsedTotalTravelCost() - (
        ((parsedTravel as any)?.travelTime?.[0]?.totalTravelLabor ?? 0) +
        ((parsedTravel as any)?.airTravelTime?.[0]?.totalTravelLabor ?? 0)
      );
      const travelNonLaborSafe = Math.max(0, travelNonLabor);

      const finalValue = Math.ceil((matExpBase + workLabor + travelLabor + travelNonLaborSafe) / 0.96);
      const validFinalValue = (isNaN(finalValue) || !isFinite(finalValue)) ? 0 : finalValue;

      // Saturday / Sunday final values
      const satHS = parsedData.saturdayHoursSummary;
      const sunHS = parsedData.sundayHoursSummary;
      const hasSat = !!parsedData.showSaturdayHours && !!satHS;
      const hasSun = !!parsedData.showSundayHours && !!sunHS;

      const calcDayValue = (dayHS: any) => {
        const wl = (dayHS?.straightTimeHours || 0) * quoteHourlyRates.straightTime +
                   (dayHS?.overtimeHours || 0) * quoteHourlyRates.overtime +
                   (dayHS?.doubleTimeHours || 0) * quoteHourlyRates.doubleTime;
        const tl = (dayHS?.travelStraightTimeHours || 0) * quoteHourlyRates.straightTime +
                   (dayHS?.travelOvertimeHours || 0) * quoteHourlyRates.overtime +
                   (dayHS?.travelDoubleTimeHours || 0) * quoteHourlyRates.doubleTime;
        return Math.ceil((matExpBase + wl + tl + travelNonLaborSafe) / 0.96);
      };

      const satFinalValue = hasSat ? calcDayValue(satHS) : validFinalValue;
      const sunFinalValue = hasSun ? calcDayValue(sunHS) : validFinalValue;

      return {
        quote,
        parsedData,
        sovItems,
        finalValue: validFinalValue,
        satFinalValue,
        sunFinalValue,
        hasSat,
        hasSun,
        quoteNumber: (opportunityData as any)?.quote_number || quote.id?.slice(0,6) || (selectedQuotesForCombined[quoteIndex] + 1),
        displayTitle: (parsedData?.title && String(parsedData.title).trim()) ? String(parsedData.title).trim() : ''
      };
    });
    
    // Calculate combined totals - ALWAYS calculated regardless of display toggles
    // This ensures grand total is always accurate even when individual pricing is hidden
    // IMPORTANT: These calculations happen BEFORE any display logic, so they always include all quotes
    // NOTE: showIndividualPricing and showGrandTotalPricing only affect DISPLAY, not calculations
    // Scope quantities are applied to the final values for grand total calculation
    const combinedFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const value = Number(q.finalValue) || 0;
      if (isNaN(value) || !isFinite(value)) {
        console.warn('Invalid finalValue in processedQuote:', q);
        return sum;
      }
      return sum + (value * scopeQty);
    }, 0);
    
    const combinedMobilizationFactor = getMobilizationFactor(combinedFinalValue);
    const combinedMobilizationRaw = Math.ceil(combinedFinalValue * combinedMobilizationFactor);
    const combinedMobilization = formatCurrency(combinedMobilizationRaw);

    // Saturday combined final value
    const combinedSatFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      return sum + ((q.satFinalValue || q.finalValue) * scopeQty);
    }, 0);
    const combinedSatMobRaw = Math.ceil(combinedSatFinalValue * getMobilizationFactor(combinedSatFinalValue));

    // Sunday combined final value
    const combinedSunFinalValue = processedQuotes.reduce((sum, q, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      return sum + ((q.sunFinalValue || q.finalValue) * scopeQty);
    }, 0);
    const combinedSunMobRaw = Math.ceil(combinedSunFinalValue * getMobilizationFactor(combinedSunFinalValue));

    const anyScopeHasSat = processedQuotes.some(q => q.hasSat);
    const anyScopeHasSun = processedQuotes.some(q => q.hasSun);
    const grandShowMF = letterIncludeMF;
    const grandShowSat = letterIncludeSaturday && anyScopeHasSat;
    const grandShowSun = letterIncludeSunday && anyScopeHasSun;
    
    // Generate SOV tables for each quote
    // NOTE: Individual pricing calculations always happen here (for grand total accuracy)
    // but display is conditional based on showIndividualPricing toggle
    const sovTablesHtml = processedQuotes.map((processedQuote, index) => {
      const originalQuoteIndex = selectedQuotesForCombined[index];
      const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
      const scopeNumber = index + 1;
      const headingText = processedQuote.displayTitle || `Scope ${scopeNumber}`;
      const sovTableRows = processedQuote.sovItems && processedQuote.sovItems.length > 0
        ? processedQuote.sovItems.map((item: any) => {
            const name = (item.item || '').toString();
            const qty = item.quantity ?? item.qty ?? 1;
            return `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>${name}</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>${qty}</td></tr>`;
          }).join('')
        : `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>24-hour Power Study</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>1</td></tr>`;
      
      const scopeMobilizationRaw = (() => {
        const factor = getMobilizationFactor(processedQuote.finalValue);
        return Math.ceil(processedQuote.finalValue * factor);
      })();
      const showScopeMobilization = scopeMobilizationRaw > 0 || includeMobilizationWhenZero;
      const showScopesMF = letterIncludeMF;
      const showScopesSat = letterIncludeSaturday && processedQuote.hasSat;
      const showScopesSun = letterIncludeSunday && processedQuote.hasSun;

      const satScopeMobRaw = processedQuote.hasSat ? Math.ceil(processedQuote.satFinalValue * getMobilizationFactor(processedQuote.satFinalValue)) : scopeMobilizationRaw;
      const sunScopeMobRaw = processedQuote.hasSun ? Math.ceil(processedQuote.sunFinalValue * getMobilizationFactor(processedQuote.sunFinalValue)) : scopeMobilizationRaw;

      const scopeTermsToRender = letterShowAllTerms
        ? [
            { key: 'net30', label: 'NET 30', factor: paymentTermFactors.net30 },
            { key: 'net60', label: 'NET 60', factor: paymentTermFactors.net60 },
            { key: 'net90', label: 'NET 90', factor: paymentTermFactors.net90 },
          ]
        : [
            { key: letterPaymentTerm, label: letterPaymentTerm === 'net30' ? 'NET 30' : letterPaymentTerm === 'net60' ? 'NET 60' : 'NET 90', factor: paymentTermFactors[letterPaymentTerm] },
          ];

      const scopeHasMultipleDayTypes = (showScopesMF ? 1 : 0) + (showScopesSat ? 1 : 0) + (showScopesSun ? 1 : 0) > 1;
      const scopePricingLines = (() => {
        // Classic format: single day-type with all terms → Option 1/2/3 list
        if (!scopeHasMultipleDayTypes && letterShowAllTerms) {
          const baseVal = showScopesSat ? processedQuote.satFinalValue : showScopesSun ? processedQuote.sunFinalValue : processedQuote.finalValue;
          const baseMob = showScopesSat ? satScopeMobRaw : showScopesSun ? sunScopeMobRaw : scopeMobilizationRaw;
          const o1Raw = Math.ceil(baseVal * paymentTermFactors.net30) + baseMob;
          const o2Raw = Math.ceil(baseVal * paymentTermFactors.net60) + baseMob;
          const o3Raw = Math.ceil(baseVal * paymentTermFactors.net90) + baseMob;
          return `<ul style="margin: 4px 0;">
            <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o1Raw}" data-kind="net30">${formatCurrency(o1Raw)}</b></li>
            <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o2Raw}" data-kind="net60">${formatCurrency(o2Raw)}</b></li>
            <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b class="scope-price" data-base="${o3Raw}" data-kind="net90">${formatCurrency(o3Raw)}</b></li>
          </ul>`;
        }
        // Multi day-type or single term: per-term blocks with day-type line items
        return scopeTermsToRender.map((term, termIdx) => {
          const lines: string[] = [];
          if (showScopesMF) {
            const val = Math.ceil(processedQuote.finalValue * term.factor) + scopeMobilizationRaw;
            lines.push(`<li>Work performed Monday - Friday: <b class="scope-price" data-base="${val}" data-kind="${term.key}">${formatCurrency(val)}</b></li>`);
          }
          if (showScopesSat) {
            const val = Math.ceil(processedQuote.satFinalValue * term.factor) + satScopeMobRaw;
            lines.push(`<li>Work performed on Saturday: <b>${formatCurrency(val)}</b></li>`);
          }
          if (showScopesSun) {
            const val = Math.ceil(processedQuote.sunFinalValue * term.factor) + sunScopeMobRaw;
            lines.push(`<li>Work performed on Sunday / Holiday: <b>${formatCurrency(val)}</b></li>`);
          }
          if (lines.length === 0) {
            const val = Math.ceil(processedQuote.finalValue * term.factor) + scopeMobilizationRaw;
            lines.push(`<li>Total: <b class="scope-price" data-base="${val}" data-kind="${term.key}">${formatCurrency(val)}</b></li>`);
          }
          const hdr = !letterShowAllTerms
            ? `<b>Where ${term.label} Terms are applicable and agreed upon:</b>`
            : `<b>Option ${termIdx + 1}: Where ${term.label} Terms are applicable and agreed upon:</b>`;
          return `<div class="amp-section" style="margin:4px 0;">${hdr}</div>
            <ul style="margin: 4px 0;">${lines.join('\n')}</ul>`;
        }).join('\n');
      })();

      const individualPricingHtml = `
        <div class="amp-individual-pricing" style="${showIndividualPricing ? '' : 'display: none;'}">
          <div class="amp-section" style="margin-top: 8px;"><b>Pricing & Terms</b></div>
          ${scopePricingLines}
          ${showScopeMobilization ? `<div class="amp-section">Mobilization costs of <b class="scope-price" data-base="${scopeMobilizationRaw}" data-kind="mobilization">${formatCurrency(scopeMobilizationRaw)}</b> shall be paid out of the above agreed upon price before the first day of work.</div>` : ''}
        </div>
      `;
      
      return `
        <div class="amp-scope-block" style="margin-bottom:12px;border:1px solid #f0c8b3;border-left:4px solid #f26722;border-radius:8px;padding:10px;background:#fff7f2;">
          <div class="amp-scope-controls print-hidden" contenteditable="false" style="display:flex;gap:6px;justify-content:flex-end;margin:-4px -4px 4px -4px;">
            <button class="move-up" aria-label="Move scope up" title="Move up" style="border:1px solid #e5e7eb;background:#fff;border-radius:9999px;padding:2px 8px;cursor:pointer;">▲</button>
            <button class="move-down" aria-label="Move scope down" title="Move down" style="border:1px solid #e5e7eb;background:#fff;border-radius:9999px;padding:2px 8px;cursor:pointer;">▼</button>
          </div>
          <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff0e6;padding:6px 8px;border-radius:6px;margin-bottom:6px;">
            <b>${headingText}</b>
          </div>
        <table class="amp-section" style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
            <thead>
            <tr><th style='border:1px solid #ccc;padding:4px 12px;text-align:left;'>Item</th><th style='border:1px solid #ccc;padding:4px 12px;text-align:center;'>Quantity</th></tr>
            </thead>
            <tbody>
              ${sovTableRows}
            </tbody>
          </table>
        ${individualPricingHtml}
        </div>
      `;
    }).join('');
    
    const contactName = contactData ? `${contactData.first_name} ${contactData.last_name}`.trim() : (customer.name || 'Contact Name');
    const signatureUrl = (window as any)?.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
    
    const newCombinedLetterHtml = `
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.2;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 6px; margin-bottom: 12px;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 36px; margin-right: 10px;" />
          <span style="font-size: 1.1em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
        </div>
        <div><b>${dateStr}</b></div>
        <div style="margin-bottom: 8px;"><b>Letter # ${(opportunityData as any)?.quote_number || 'Multiple'}</b></div>
        <div>
          ${contactName}<br/>
          ${customer.company_name || 'Company'}<br/>
          ${formatAddressForLetter(customer.address)}<br/>
        </div>
        <div style="margin: 8px 0;">Dear ${contactName},</div>
        <div>AMP LLC is pleased to offer the following proposal for your consideration.</div>
        <div style="margin: 8px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at ${(opportunityData?.title || 'Project Title')}${opportunityData?.jobsite_location ? ', ' + opportunityData.jobsite_location : ''}.</div>
        <div style="margin: 8px 0;">
          <span id="neta-standard-text">${NETA_OPTIONS.find(o => o.value === netaStandard)?.text || '[Select NETA Standard]'}</span>
        </div>
        <div><b>Combined Scope of Work</b></div>
        ${sovTablesHtml}
        ${showGrandTotalPricing ? `
        <div class="amp-scope-block" style="margin-bottom:12px;border:1px solid #f0c8b3;border-left:4px solid #f26722;border-radius:8px;padding:10px;background:#fff7f2;">
          <div class="amp-section amp-keep-with-next" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff0e6;padding:6px 8px;border-radius:6px;margin-bottom:6px;">
            <b>Grand Total Pricing</b>
          </div>
          ${(() => {
            // Only show if at least one scope has quantity > 1
            const hasQuantityGreaterThanOne = processedQuotes.some((processedQuote, index) => {
              const originalQuoteIndex = selectedQuotesForCombined[index];
              const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
              return scopeQty > 1;
            });
            
            if (!hasQuantityGreaterThanOne) return '';
            
            const scopeQuantityLines = processedQuotes.map((processedQuote, index) => {
              const originalQuoteIndex = selectedQuotesForCombined[index];
              const scopeQty = scopeQuantities[originalQuoteIndex] || 1;
              const scopeNumber = index + 1;
              const headingText = processedQuote.displayTitle || `Scope ${scopeNumber}`;
              const timeText = scopeQty === 1 ? 'time' : 'times';
              return `${headingText} to be performed <b>${scopeQty}</b> ${timeText}`;
            }).join('<br/>');
            return scopeQuantityLines ? `<div class="amp-section" style="margin:4px 0;"><div style="margin-bottom:4px;"><b>The following price is based upon the scope quantities listed below:</b></div>${scopeQuantityLines}</div>` : '';
          })()}
          ${(() => {
            const grandHasMultipleDayTypes = (grandShowMF ? 1 : 0) + (grandShowSat ? 1 : 0) + (grandShowSun ? 1 : 0) > 1;
            const grandTerms = letterShowAllTerms
              ? [
                  { key: 'net30', label: 'NET 30', factor: paymentTermFactors.net30 },
                  { key: 'net60', label: 'NET 60', factor: paymentTermFactors.net60 },
                  { key: 'net90', label: 'NET 90', factor: paymentTermFactors.net90 },
                ]
              : [
                  { key: letterPaymentTerm, label: letterPaymentTerm === 'net30' ? 'NET 30' : letterPaymentTerm === 'net60' ? 'NET 60' : 'NET 90', factor: paymentTermFactors[letterPaymentTerm] },
                ];
            // Classic format: single day-type with all terms → Option 1/2/3 list
            if (!grandHasMultipleDayTypes && letterShowAllTerms) {
              const baseVal = grandShowSat ? combinedSatFinalValue : grandShowSun ? combinedSunFinalValue : combinedFinalValue;
              const baseMob = grandShowSat ? combinedSatMobRaw : grandShowSun ? combinedSunMobRaw : combinedMobilizationRaw;
              const o1Raw = Math.ceil(baseVal * paymentTermFactors.net30) + baseMob;
              const o2Raw = Math.ceil(baseVal * paymentTermFactors.net60) + baseMob;
              const o3Raw = Math.ceil(baseVal * paymentTermFactors.net90) + baseMob;
              return '<ul style="margin: 16px 0 4px 16px;">'
                + '<li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net30" data-base="' + o1Raw + '">' + formatCurrency(o1Raw) + '</b></li>'
                + '<li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net60" data-base="' + o2Raw + '">' + formatCurrency(o2Raw) + '</b></li>'
                + '<li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b class="grand-price" data-kind="net90" data-base="' + o3Raw + '">' + formatCurrency(o3Raw) + '</b></li>'
                + '</ul>';
            }
            // Multi day-type or single term: per-term blocks with day-type line items
            return grandTerms.map(function(term, termIdx) {
              const lines: string[] = [];
              if (grandShowMF) {
                const val = Math.ceil(combinedFinalValue * term.factor) + combinedMobilizationRaw;
                lines.push('<li>Work performed Monday - Friday: <b class="grand-price" data-kind="' + term.key + '" data-base="' + val + '">' + formatCurrency(val) + '</b></li>');
              }
              if (grandShowSat) {
                const val = Math.ceil(combinedSatFinalValue * term.factor) + combinedSatMobRaw;
                lines.push('<li>Work performed on Saturday: <b>' + formatCurrency(val) + '</b></li>');
              }
              if (grandShowSun) {
                const val = Math.ceil(combinedSunFinalValue * term.factor) + combinedSunMobRaw;
                lines.push('<li>Work performed on Sunday / Holiday: <b>' + formatCurrency(val) + '</b></li>');
              }
              if (lines.length === 0) {
                const val = Math.ceil(combinedFinalValue * term.factor) + combinedMobilizationRaw;
                lines.push('<li>Total: <b class="grand-price" data-kind="' + term.key + '" data-base="' + val + '">' + formatCurrency(val) + '</b></li>');
              }
              const hdr = !letterShowAllTerms
                ? '<b>Where ' + term.label + ' Terms are applicable and agreed upon:</b>'
                : '<b>Option ' + (termIdx + 1) + ': Where ' + term.label + ' Terms are applicable and agreed upon:</b>';
              return '<div class="amp-section" style="margin:4px 0;">' + hdr + '</div><ul style="margin: 4px 0;">' + lines.join('\n') + '</ul>';
            }).join('\n');
          })()}
          ${(combinedMobilizationRaw > 0 || includeMobilizationWhenZero) ? `<div class="amp-section" style="margin:4px 0;">Mobilization costs of <b class="grand-price" data-kind="mobilization" data-base="${combinedMobilizationRaw}">${combinedMobilization}</b> shall be paid out of the above agreed upon price before the first day of work.</div>` : ''}
        </div>
        ` : ''}
        <div style="margin-top: 12px;">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div style="margin-top: 12px;">This price is based upon the following:</div>
        <ol style="margin-left: 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.${grandShowSat || grandShowSun ? ' Alternate rates apply for Saturday and Sunday/Holiday work as noted above.' : ''}</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services ${new Date().getFullYear()} T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>
        <div style="margin-top: 24px;"><b>Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 16px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 16px;"><b><i>Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</i></b></div>
        <div style="margin-top: 16px;">Should you have any questions please contact the undersigned.</div>
        <div style="margin-top: 20px;">Sincerely,</div>
        <div style="margin: 4px 0 2px 0;">
          <img src="${signatureUrl}" alt="Signature" style="height: 40px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>Brian Rodgers</div>
        <div>Chief Executive Officer</div>
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        <div class="safety-policy-section" style="margin-top: 20px;">
          <div style="font-size: 1.3em; font-weight: bold; color: #333; margin: 10px 0 12px 0; text-align: center;">Safety Policy on Jobsites</div>
          <div style="font-weight: bold; margin-bottom: 4px;">LOCKOUT / TAGOUT</div>
          <div>On a jobsite where the customer has an established Lockout program or there is a lockout procedure already established, AMP employees will follow local Lockout program provided that it does not expose the employee to greater risk than the AMP procedure below.</div>
          <div style="margin-top: 4px;">In the absence of a local lockout procedure, AMP employees will follow the following procedure.</div>
          <ul style="margin: 4px 0 4px 16px;">
            <li>The employees shall be notified that a lockout (tagout) system is going to be implemented and the reason therefore. The qualified employee implementing the lockout (tagout) shall know the disconnecting means location for all sources of electrical energy and the location of all sources of potential energy. The qualified person shall be knowledgeable of hazards associated with all energy sources.</li>
            <li>If the electrical supply is energized, the qualified person shall deenergize and disconnect the electric supply and relieve all stored energy.</li>
            <li>Lockout (tagout) all disconnecting means with lockout (tagout) devices.</li>
            <li>For tagout, one additional safety measure must be employed, such as opening, blocking, or removing an additional circuit element.</li>
            <li>Attempt to operate the disconnecting means to determine that operation is prohibited.</li>
            <li>A voltage-detecting instrument shall be used.  Inspect the instrument for visible damage. Do not proceed if there is an indication of damage to the instrument until an undamaged device is available.</li>
            <li>Verify proper instrument operation and then test for absence of voltage.</li>
            <li>Verify proper instrument operation after testing for absence of voltage.</li>
            <li>Where required, install grounding equipment/conductor device on the phase conductors or circuit parts, to eliminate induced voltage or stored energy, before touching them. Where it has been determined that contact with other exposed energized conductors or circuit parts is possible, apply ground connecting devices rated for the available fault duty.</li>
            <li>The equipment and/or electrical source is now locked out (tagged out).</li>
          </ul>
          <div style="margin-top: 6px; font-weight: bold;">Procedure Involving More Than One Person.</div>
          <div>For a simple lockout/tagout and where more than one person is involved in the job or task, each person shall install his or her own personal lockout (tagout) device.</div>
          <div style="margin-top: 8px;">Safety is the utmost priority at AMP Quality Energy Services and we reserve the right to stop work on any project that our technicians deem as unsafe. AMP Quality Energy Services technicians follow NFPA 70E, ANSI, NETA, and OSHA safety guidelines. Lock out/Tag out of all energy sources is required prior to working on an electrical system. Any exceptions to the above-mentioned specifications will need to be made in writing prior to shut-down for our safety officer's evaluation. Drop hazard mitigation shall be implemented while working at heights.</div>
          <div style="margin-top: 12px; font-size: 1.0em; font-weight: bold; text-align: center;">END OF SAFETY POLICY</div>
        </div>
      </div>
    `;
    setLetterHtml(newCombinedLetterHtml);
    savedLetterHtmlRef.current = newCombinedLetterHtml;
    setIsLetterDirty(false);
    setIsLetterProposalOpen(true);
    // Prevent AuthContext refresh while letter proposal is open
    try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
  }

  function handlePrintLetter() {
    // Open print dialog for the letter proposal
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const currentContent = (letterEditorRef.current?.innerHTML || '').trim();
      let bodyHtml = currentContent || letterHtml || '';
      if (!bodyHtml) {
        alert('Nothing to print. Please generate the letter first.');
        try { printWindow.close(); } catch {}
        return;
      }
      
      // Clean up empty list items that cause extra bullets in print
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = bodyHtml;
        // Remove empty <li> elements
        tempDiv.querySelectorAll('li').forEach(li => {
          if (!li.textContent?.trim() && !li.querySelector('img')) {
            li.remove();
          }
        });
        // Remove empty <ul> elements
        tempDiv.querySelectorAll('ul').forEach(ul => {
          if (!ul.textContent?.trim() && !ul.querySelector('li')) {
            ul.remove();
          }
        });
        bodyHtml = tempDiv.innerHTML;
      } catch {}
      
      const html = `<!DOCTYPE html><html><head><title>Letter Proposal</title><style>
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { font-family: Arial, sans-serif; }
          #letter-proposal.print-content { padding-bottom: 35mm; }
          .amp-footer {
            position: fixed !important;
            left: 0; right: 0; bottom: 0;
            width: 100%;
            font-size: 0.9em;
            color: #555;
            border-top: 1px solid #ccc;
            padding: 8px 0;
            text-align: center;
            background: white;
          }
          /* Hide the dropdown, keep the sentence */
          #neta-standard-select { display: none !important; }
          /* Hide scope reordering controls in print */
          .amp-scope-controls { display: none !important; }
          /* Hide quantity input in print but keep label */
          .scope-qty { display: none !important; }
          .scope-qty-tag { display: inline !important; }
          /* Reasonable widows/orphans to reduce awkward splits */
          p { orphans: 2; widows: 2; }
          /* Ensure images scale properly */
          img { max-width: 100%; height: auto; }
          /* Prevent extra bullets - ensure div.amp-section elements don't get list styling */
          div.amp-section { list-style: none !important; }
          div.amp-section::before,
          div.amp-section::after { content: none !important; display: none !important; }
          /* Hide empty list items that might cause extra bullets */
          li:empty { display: none !important; }
          li:empty::before,
          li:empty::after { content: none !important; display: none !important; }
          /* Ensure ul elements don't show extra bullets after the last li */
          ul { list-style-position: inside !important; }
          ul::after { content: none !important; display: none !important; }
        }
        /* Signature should render well */
        img[alt="Signature"] { max-height: 60px; }
      </style></head><body>${bodyHtml}</body></html>`;
      try { printWindow.document.open(); } catch {}
      printWindow.document.write(html);
      printWindow.document.close();
      // Wait for the new window to fully render before printing
      const trigger = () => {
        setTimeout(() => {
          try { printWindow.focus(); } catch {}
          try { printWindow.print(); } catch {}
        }, 100);
      };
      // Some browsers fire load on document, others on window
      try { printWindow.addEventListener('load', trigger); } catch { setTimeout(trigger, 150); }
    }
  }

  // When opening the saved estimates modal, auto-select the first quote if available
  useEffect(() => {
    if (isOpen && !isNewQuote && quotes.length > 0 && selectedQuoteIndex === -1) {
      setSelectedQuoteIndex(0);
      loadQuoteData(quotes[0]);
    }
  }, [isOpen, isNewQuote, quotes, selectedQuoteIndex]);

  // Respond to mode prop
  useEffect(() => {
    if (mode === 'new') {
      setIsOpen(true);
      setIsNewQuote(true);
      setIsViewMode(false);
      setShowTravel(false);
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
      // Always start with fresh data when explicitly generating a new estimate
      // Clear any existing draft to ensure fresh start
      deletePreference(`drafts.${draftKey}`).catch(() => {});
      setIsDirty(false);
      setData({
        client: opportunityData?.customer.company_name || opportunityData?.customer.name || '',
        jobDescription: opportunityData?.description || '',
        dateDue: '',
        location: opportunityData?.customer.address || '',
        periodOfPerformance: '',
        estimatedStartDate: '',
        poNumber: '',
        notes: '',
        sovItems: Array(DEFAULT_LINE_COUNT).fill(null).map(() => ({...EMPTY_LINE_ITEM})),
        nonSovItems: [...DEFAULT_NON_SOV_ITEMS],
        calculatedValues: {
          subtotalMaterial: 0,
          subtotalExpense: 0,
          subtotalLabor: 0,
          totalMaterial: 0,
          totalExpense: 0,
          totalLabor: 0,
          grandTotal: 0,
          nonSovMaterial: 0,
          nonSovExpense: 0,
          nonSovLabor: 0,
          sovLaborHours: 0,
          nonSovLaborHours: 0,
          totalLaborHours: 0
        },
        hoursSummary: {
          men: DEFAULT_ESTIMATING_PRESETS.default_number_of_men,
          hoursPerDay: DEFAULT_ESTIMATING_PRESETS.default_hours_per_day,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0
        }
      });
    } else if (mode === 'view') {
      setIsNewQuote(false);
      setIsOpen(true);
      setIsViewMode(true);
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    } else if (mode === 'letter') {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      clearLetterProposalState();
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsQuoteSelectOpen(false);
      setLetterHtml("");
      savedLetterHtmlRef.current = "";
      setIsLetterDirty(false);
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateLetterProposal();
      }, 50);
    } else if (mode === 'combined-letter') {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      clearLetterProposalState();
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsCombinedQuoteSelectOpen(false);
      setSelectedQuotesForCombined([]);
      setLetterHtml("");
      savedLetterHtmlRef.current = "";
      setIsLetterDirty(false);
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateCombinedLetterProposal();
      }, 50);
    } else if (mode === 'letters') {
      setIsOpen(false);
      setIsLetterProposalOpen(false);
      setIsLetterDirty(false);
      (async () => {
        try {
          const { data, error } = await supabase
            .schema('business')
            .from('letter_proposals')
            .select('id, title, html, created_at, quote_number, neta_standard')
            .eq('opportunity_id', opportunityId)
            .order('created_at', { ascending: false });
          if (!error && data) {
            setLetters(data as any);
          } else {
            setLetters([]);
          }
        } catch {
          setLetters([]);
        }
        setIsLettersListOpen(true);
      })();
    }
    // If mode is undefined, do nothing (default behavior)
  }, [mode]);

  // If the estimate modal closes, re-enable global refreshes
  useEffect(() => {
    if (!isOpen) {
      try { localStorage.removeItem('AMP_SUSPEND_REFRESH'); } catch {}
    }
  }, [isOpen]);

  // If the letter proposal closes, re-enable global refreshes
  // Only remove the flag if we're sure the user deliberately closed it
  useEffect(() => {
    if (!isLetterProposalOpen) {
      // Check if we have persisted letter content - if we do, don't remove the flag
      // as the user might just be switching tabs and we want to preserve their work
      const savedState = getLetterProposalState();
      
      // Only remove suspend refresh if there's no saved content and no saved open state
      // This indicates the user deliberately closed and cleared the proposal
      if (!savedState.html && !savedState.isOpen) {
        try { localStorage.removeItem('AMP_SUSPEND_REFRESH'); } catch {}
      }
    }
  }, [isLetterProposalOpen, opportunityId, getLetterProposalState]);

  // Save letter content to Supabase whenever it changes (debounced by service)
  useEffect(() => {
    if (!letterHtml) return;
    // Service handles debouncing, so we can call directly
    saveLetterProposalHtml(letterHtml);
  }, [letterHtml, saveLetterProposalHtml]);

  // Save letter proposal open state to Supabase
  useEffect(() => {
    saveLetterProposalOpen(isLetterProposalOpen);
    if (isLetterProposalOpen) {
      // Set suspend refresh when opening (keep in localStorage for cross-tab coordination)
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    }
  }, [isLetterProposalOpen, saveLetterProposalOpen]);

  // Immediate restoration on component mount and ensure suspend refresh is set
  useEffect(() => {
    const savedState = getLetterProposalState();
    
    // If there's saved letter content or the proposal was open, restore it immediately
    if (savedState.isOpen && savedState.html && !isLetterProposalOpen) {
        console.log('Immediate restoration on mount');
        setIsLetterProposalOpen(true);
        const normalized = normalizePricingTermsHtml(savedState.html);
        setLetterHtml(normalized);
        savedLetterHtmlRef.current = normalized;
        setIsLetterDirty(false);
        if (savedState.quoteIndex !== null) {
          setSelectedLetterQuoteIndex(savedState.quoteIndex);
        }
        if (savedState.netaStandard) {
          setNetaStandard(savedState.netaStandard);
        }
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    } else if (savedState.html || savedState.isOpen || isLetterProposalOpen) {
      // Even if not restoring, ensure suspend refresh is set
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    }
  }, [opportunityId, getLetterProposalState]); // Run on mount and when opportunityId changes

  // Add visibility change listener to restore letter proposal and ensure suspend refresh stays set
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const savedState = getLetterProposalState();
        
        // If there's saved content and the proposal should be open but isn't, restore it
        if (savedState.isOpen && savedState.html && !isLetterProposalOpen) {
          console.log('Restoring letter proposal on visibility change');
          setIsLetterProposalOpen(true);
          const normalized = normalizePricingTermsHtml(savedState.html);
          setLetterHtml(normalized);
          savedLetterHtmlRef.current = normalized;
          setIsLetterDirty(false);
          if (savedState.quoteIndex !== null) {
            setSelectedLetterQuoteIndex(savedState.quoteIndex);
          }
          if (savedState.netaStandard) {
            setNetaStandard(savedState.netaStandard);
          }
        }
        
        // Always re-set the suspend refresh flag when tab becomes visible if there's saved content
        if (savedState.html || savedState.isOpen || isLetterProposalOpen) {
          try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [opportunityId, isLetterProposalOpen, getLetterProposalState]);

  // Save selected letter quote index to Supabase
  useEffect(() => {
    if (selectedLetterQuoteIndex !== null) {
      saveLetterQuoteIndex(selectedLetterQuoteIndex);
    }
  }, [selectedLetterQuoteIndex, saveLetterQuoteIndex]);

  // Save NETA standard to Supabase
  useEffect(() => {
    if (netaStandard) {
      saveLetterNetaStandard(netaStandard);
    }
  }, [netaStandard, saveLetterNetaStandard]);

  // When the parent triggers an openSignal change for the same mode, just bring modal to front without resetting state
  useEffect(() => {
    if (!openSignal) return;
    if (mode === 'new' || mode === 'view') {
      setIsOpen(true);
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
      // Do not touch isNewQuote/isViewMode/data here to preserve the form state
    }
  }, [openSignal]);

  // If opportunityData loads after modal is open and mode is 'new', reset the form with the new data
  useEffect(() => {
    if (mode === 'new' && isOpen && opportunityData) {
      setIsNewQuote(true);
      setData(prev => ({
        ...prev,
        client: opportunityData.customer.company_name || opportunityData.customer.name || '',
        jobDescription: opportunityData.description || '',
        location: opportunityData.customer.address || ''
      }));
    }
  }, [opportunityData, mode, isOpen]);

  // Mobilization factor based on threshold cost (now adjustable)
  function getMobilizationFactor(finalValue: number) {
    if (finalValue > 1000000) return mobilizationFactors.over1m;
    if (finalValue > 500000) return mobilizationFactors.over500k;
    if (finalValue > 100000) return mobilizationFactors.over100k;
    return mobilizationFactors.base;
  }

  // When mobilization or payment-term factors change, update the letter/proposal HTML so the
  // "Pricing & Terms" and "Copy paste below into quote" amounts stay in sync with the estimate.
  // NOTE: letterHtml is intentionally NOT in the dependency array — this should only run when the
  // factors themselves change, not on every HTML edit (which would corrupt dollar amounts via re-processing).
  const letterHtmlRef = useRef(letterHtml);
  letterHtmlRef.current = letterHtml;
  useEffect(() => {
    const html = letterHtmlRef.current;
    if (!isLetterProposalOpen || !html || !html.includes('Mobilization costs of')) return;
    const option1Match = html.match(/Option 1:\s*Where NET 30[^<]*<b>\$([\d,]+\.\d{2})<\/b>/i);
    if (!option1Match) return;
    const option1Raw = parseFloat(option1Match[1].replace(/,/g, ''));
    if (!Number.isFinite(option1Raw) || option1Raw <= 0) return;
    const mobMatch = html.match(/Mobilization costs of[^$]*\$([\d,]+\.\d{2})/i);
    const mobilizationRawFromLetter = mobMatch ? parseFloat(mobMatch[1].replace(/,/g, '')) : 0;
    const isInclusiveFormat = Number.isFinite(mobilizationRawFromLetter) && mobilizationRawFromLetter > 0 && option1Raw > mobilizationRawFromLetter;
    const finalValue = isInclusiveFormat
      ? (option1Raw - mobilizationRawFromLetter) / paymentTermFactors.net30
      : option1Raw / paymentTermFactors.net30;
    if (!Number.isFinite(finalValue) || finalValue <= 0) return;
    const newMobilizationRaw = Math.ceil(finalValue * getMobilizationFactor(finalValue));
    const newMobilization = formatCurrency(newMobilizationRaw);
    const newOption1 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net30) + newMobilizationRaw);
    const newOption2 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net60) + newMobilizationRaw);
    const newOption3 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net90) + newMobilizationRaw);
    let updated = html
      .replace(/(Mobilization costs of )(\$[\d,]+\.\d{2})/, (_m, g1) => `${g1}${newMobilization}`)
      .replace(/(Option 1:\s*Where NET 30[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i, (_m, g1, _g2, g3) => `${g1}${newOption1}${g3}`)
      .replace(/(Option 2:\s*Where NET 60[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i, (_m, g1, _g2, g3) => `${g1}${newOption2}${g3}`)
      .replace(/(Option 3:\s*Where NET 90[^<]*<b>)(\$[\d,]+\.\d{2})(<\/b>)/i, (_m, g1, _g2, g3) => `${g1}${newOption3}${g3}`);
    if (updated !== html) {
      letterUpdateSourceRef.current = 'programmatic';
      setLetterHtml(updated);
      if (savedLetterHtmlRef.current) savedLetterHtmlRef.current = updated;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobilizationFactors, paymentTermFactors, isLetterProposalOpen]);

  useEffect(() => {
    // If the HTML update was programmatic, try to preserve caret and scroll
    if (letterUpdateSourceRef.current === 'programmatic') {
      try {
        // Restore previous selection if possible; otherwise keep caret at end
        const editor = letterEditorRef.current;
        if (!editor) return;
        editor.focus();
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.addRange(range);
      } catch {}
    }
  }, [letterHtml]);

  return (
    <div className="flex space-x-4">
      {typeof mode === 'undefined' && (
        <>
          <Button
            onClick={handleGenerateNewQuote}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Estimate
          </Button>
          <Button
            onClick={() => {
              setIsNewQuote(false);
              setIsOpen(true);
            }}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Show Estimates
          </Button>
          <Button
            onClick={handleGenerateLetterProposal}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Letter Proposal
          </Button>
          <Button
            onClick={handleGenerateCombinedLetterProposal}
            className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors flex items-center"
          >
            Generate Combined Letter Proposal
          </Button>
        </>
      )}

      <Dialog
        open={isOpen}
        onClose={handleClose}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg w-[98%] h-[95vh] mx-auto p-6 shadow-xl my-4 estimate-form">
            <div className="absolute top-0 right-0 pt-4 pr-4 flex space-x-2">
              {isViewMode && quotes.length === 0 && isNewQuote ? null : isNewQuote ? (
                <Button
                  onClick={saveQuote}
                  disabled={isSaving}
                  className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Quote'}
                </Button>
              ) : (
                isViewMode ? (
                  <>
                    <Button
                      onClick={() => setIsViewMode(false)}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                    >
                      Edit
                    </Button>
                    {selectedQuoteIndex >= 0 && quotes[selectedQuoteIndex] && (
                      <>
                        <Button
                          onClick={() => duplicateQuote(quotes[selectedQuoteIndex].id)}
                          disabled={isSaving}
                          className="bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm('Delete this estimate? This cannot be undone.')) {
                              deleteQuoteById(quotes[selectedQuoteIndex].id);
                            }
                          }}
                          className="bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      onClick={saveQuote}
                      disabled={isSaving}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    {selectedQuoteIndex >= 0 && quotes[selectedQuoteIndex] && (
                      <>
                        <Button
                          onClick={() => duplicateQuote(quotes[selectedQuoteIndex].id)}
                          disabled={isSaving}
                          className="bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm('Delete this estimate? This cannot be undone.')) {
                              deleteQuoteById(quotes[selectedQuoteIndex].id);
                            }
                          }}
                          className="bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </>
                )
              )}
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-dark-400 dark:hover:text-dark-300"
                onClick={handleClose}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-dark-900 mb-6">
              {isViewMode && quotes.length === 0 && isNewQuote ? 'Saved Estimates' : isNewQuote ? 'New Estimate' : 'Saved Estimates'}
            </Dialog.Title>

            {/* Prompt when user opened "Show Estimates" but none exist */}
            {isViewMode && quotes.length === 0 && isNewQuote ? (
              <div className="h-[calc(95vh-120px)] flex items-center justify-center">
                <div className="text-center max-w-md">
                  <FileText className="mx-auto h-16 w-16 text-gray-300 dark:text-dark-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-dark-800 mb-2">
                    No Estimates Saved
                  </h3>
                  <p className="text-gray-500 dark:text-dark-500 mb-6">
                    No estimates have been saved for this opportunity yet. Would you like to create one?
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button
                      onClick={() => {
                        setIsViewMode(false);
                        handleGenerateNewQuote();
                      }}
                      className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors px-6 py-2"
                    >
                      Generate Estimate
                    </Button>
                    <Button
                      onClick={handleClose}
                      className="bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-dark-200 dark:text-dark-700 dark:hover:bg-dark-300 transition-colors px-6 py-2"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="h-[calc(95vh-120px)] overflow-y-auto">
              {!isNewQuote && quotes.length > 0 ? (
                <Tab.Group>
                  <div className="mb-4">
                    <Tab.List className="flex space-x-2 border-b border-gray-200">
                      {quotes.map((quote, index) => (
                        <div
                          key={quote.id}
                          className={`flex flex-col items-center ${
                            dragOverTabIndex === index ? 'ring-2 ring-[#f26722] ring-offset-2 rounded-t-lg' : ''
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            handleTabDragOver(e, index);
                          }}
                          onDragLeave={handleTabDragLeave}
                          onDrop={(e) => handleTabDrop(e, index)}
                        >
                          {/* Grip icon above tab */}
                          <div
                            draggable
                            onDragStart={(e) => {
                              handleTabDragStart(e, index);
                            }}
                            onDragEnd={(e) => {
                              handleTabDragEnd(e);
                            }}
                            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 mb-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripHorizontal size={16} />
                          </div>
                          {/* Tab itself */}
                          <Tab
                            className={({ selected }) =>
                              `px-4 py-2 text-sm font-medium rounded-t-lg focus:outline-none transition-all ${
                                selected
                                  ? 'bg-[#f26722] text-white'
                                  : 'bg-gray-100 dark:bg-dark-150 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                              } ${
                                draggedTabIndex === index ? 'opacity-50' : ''
                              }`
                            }
                            onClick={(e) => {
                              // Prevent click if we're dragging
                              if (isDraggingTabRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              setSelectedQuoteIndex(index);
                              loadQuoteData(quote);
                            }}
                          >
                            {(function(){
                              try {
                                const parsed = typeof quote.data === 'string' ? JSON.parse(quote.data) : quote.data || {};
                                const customTitle = parsed?.title?.trim();
                                if (customTitle) return customTitle;
                              } catch {}
                              return `Quote ${(opportunityData as any)?.quote_number || quote.id?.slice(0,6) || index + 1}`;
                            })()}
                          </Tab>
                        </div>
                      ))}
                    </Tab.List>
                  </div>
                </Tab.Group>
              ) : null}

              <div className="mt-4">
                <div style={styles.app}>
                  {/* Status and Page Numbering Row */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    gap: '20px'
                  }}>
                    {/* Status Selector - Show for both new and existing estimates */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <label style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: 'var(--text-color)',
                        whiteSpace: 'nowrap'
                      }}>
                        Status:
                      </label>
                      <select
                        value={estimateStatus || ''}
                        onChange={(e) => {
                          const newStatus = e.target.value || null;
                          setEstimateStatus(newStatus as any);
                          // Auto-save status change for existing estimates
                          if (!isNewQuote && quotes[selectedQuoteIndex]?.id) {
                            supabase
                              .schema('business')
                              .from('estimates')
                              .update({ status: newStatus })
                              .eq('id', quotes[selectedQuoteIndex].id)
                              .then(({ error }) => {
                                if (error) {
                                  console.error('Failed to update status:', error);
                                } else {
                                  // Update local state
                                  setQuotes(prev => 
                                    prev.map((q, idx) => 
                                      idx === selectedQuoteIndex 
                                        ? { ...q, status: newStatus as any }
                                        : q
                                    )
                                  );
                                }
                              });
                          }
                          // For new quotes, status will be saved when the quote is saved
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-color)',
                          color: 'var(--text-color)',
                          cursor: isViewMode ? 'not-allowed' : 'pointer',
                          minWidth: '180px'
                        }}
                        disabled={isViewMode}
                      >
                        <option value="">-- Select Status --</option>
                        <option value="in_progress" title="Working on the estimate">In Progress — working on estimate</option>
                        <option value="ready_for_review">Ready for Review</option>
                        <option value="approved_to_send">Approved to Send</option>
                        <option value="sent">Sent</option>
                        <option value="no_quote" title="Not submitting a quote">No Quote — not submitting</option>
                      </select>
                    </div>
                    {/* Page Numbering */}
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: 'var(--text-color)',
                      marginLeft: 'auto'
                    }}>
                      SHEET {isNewQuote ? '1' : (selectedQuoteIndex + 1)} OF {isNewQuote ? '1' : Math.max(quotes.length, 1)}
                    </div>
                  </div>

                  {/* Improved Header Layout */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '30px',
                    marginBottom: '20px'
                  }}>
                    {/* First Row - Client and Quote Title */}
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Client:</label>
                      <input 
                        type="text" 
                        style={styles.formInput}
                        value={data.client} 
                        onChange={(e) => handleGeneralChange('client', e.target.value)}
                        readOnly={isViewMode}
                      />
                    </div>
                    
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Quote Title (optional):</label>
                      <input 
                        type="text" 
                        style={styles.formInput}
                        value={data.title || ''}
                        onChange={(e) => handleGeneralChange('title', e.target.value)}
                        readOnly={isViewMode}
                        placeholder="E.g. Switchgear Testing Scope A"
                      />
                    </div>
                  </div>

                  {/* Second Row - Notes and Additional Notes */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '30px',
                    marginBottom: '20px',
                    alignItems: 'start'
                  }}>
                    {/* Notes Section */}
                    <div style={{
                      backgroundColor: 'var(--summary-bg)',
                      padding: '15px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: 'var(--text-color)',
                        marginBottom: '10px'
                      }}>
                        Notes:
                      </div>
                      <ul style={{
                        margin: '0',
                        paddingLeft: '20px',
                        color: 'var(--text-color)',
                        fontSize: '12px',
                        lineHeight: '1.4'
                      }}>
                        <li style={{ marginBottom: '5px' }}>• fields highlighted in light gray are calculated automatically</li>
                        <li style={{ marginBottom: '5px' }}>• "Material" columns for costs to receive tax & mark-up</li>
                        <li style={{ marginBottom: '5px' }}>• "Expense" columns for costs with no mark-up or different mark-up from materials</li>
                      </ul>
                    </div>
                    
                    {/* Additional Notes */}
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Additional Notes:</label>
                      <textarea 
                        style={{
                          ...styles.formInput,
                          minHeight: '80px',
                          resize: 'vertical'
                        }}
                        value={data.notes} 
                        onChange={(e) => handleGeneralChange('notes', e.target.value)}
                        placeholder="Enter any additional notes or special instructions..."
                      />
                    </div>
                  </div>
                  

                  
                  {/* SOV Quote Items */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={styles.sectionHeader}>SOV QUOTE ITEMS</div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setItemColWidth(DEFAULT_ITEM_COL_WIDTH);
                        setNonSovItemColWidth(DEFAULT_ITEM_COL_WIDTH);
                        updatePreference(`ui.${estimateColWidthKey}`, DEFAULT_ITEM_COL_WIDTH, true);
                      }}
                    >
                      Default column width
                    </Button>
                  </div>
                  <div style={styles.tableContainer} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th ref={itemHeaderRef} style={{...styles.tableHeader, width: toPx(itemColWidth), minWidth: toPx(itemColWidth), position: 'relative'}}>
                            ITEM
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              title="Drag to resize column"
                              onMouseDown={(e) => { e.stopPropagation(); onItemMouseDown(e); }}
                              style={{
                                position: 'absolute',
                                right: -4,
                                top: 0,
                                height: '100%',
                                width: 12,
                                minHeight: 24,
                                cursor: 'col-resize',
                                userSelect: 'none',
                                zIndex: 10,
                              }}
                            />
                          </th>
                          <th style={styles.tableHeader}>QUANTITY</th>
                          <th style={styles.tableHeader}>MATERIAL PRICE</th>
                          <th style={styles.tableHeader}>EXPENSE PRICE</th>
                          <th style={styles.tableHeader}>MATERIAL EXTENSION</th>
                          <th style={styles.tableHeader}>EXPENSE EXTENSION</th>
                          <th style={styles.tableHeader}>LABOR (MEN)</th>
                          <th style={styles.tableHeader}>LABOR (HOURS)</th>
                          <th style={styles.tableHeader}>LABOR UNIT</th>
                          <th style={styles.tableHeader}>LABOR TOTAL</th>
                          <th style={styles.tableHeader}>SOV ITEM PRICE</th>
                          <th style={styles.tableHeader}>NOTES</th>
                          <th style={styles.tableHeader}>CLEAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sovItems.map((item, index) => {
                          const materialExtension = calculateMaterialExtension(item.quantity, item.materialPrice);
                          const expenseExtension = calculateExpenseExtension(item.quantity, item.expensePrice);
                          const laborUnit = calculateLaborUnit(item.laborMen, item.laborHours);
                          const laborTotal = calculateLaborTotal(item.quantity, item.laborMen, item.laborHours);
                          
                          // Debug: Log the item values
                          console.log('SOV Item Debug:', {
                            index: index,
                            item: item.item,
                            laborMen: item.laborMen,
                            laborHours: item.laborHours,
                            calculatedLaborUnit: laborUnit,
                            rawLaborMen: item.laborMen,
                            rawLaborHours: item.laborHours,
                            typeOfLaborMen: typeof item.laborMen,
                            typeOfLaborHours: typeof item.laborHours
                          });
                          
                          const sovItemPrice = calculateSOVItemPrice(materialExtension, expenseExtension, laborUnit);
                          
                          return (
                            <tr 
                              key={index}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, index, 'sov')}
                              style={{
                                backgroundColor: dragOverIndex === index && draggedItemType === 'sov' ? '#f3f4f6' : 'transparent',
                                borderTop: dragOverIndex === index && draggedItemType === 'sov' ? '2px solid #f26722' : 'none'
                              }}
                            >
                              <td style={{...styles.tableCell, width: toPx(itemColWidth), minWidth: toPx(itemColWidth)}}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {!isViewMode && (
                                    <div 
                                      draggable={true}
                                      onDragStart={(e) => handleDragStart(e, index, 'sov')}
                                      onDragEnd={handleDragEnd}
                                      onMouseEnter={(e) => {
                                        (e.target as HTMLElement).style.color = '#374151';
                                        (e.target as HTMLElement).style.cursor = 'grab';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.target as HTMLElement).style.color = '#6b7280';
                                      }}
                                      onMouseDown={(e) => {
                                        (e.target as HTMLElement).style.cursor = 'grabbing';
                                      }}
                                      onMouseUp={(e) => {
                                        (e.target as HTMLElement).style.cursor = 'grab';
                                      }}
                                      style={{ 
                                        cursor: 'grab', 
                                        color: '#6b7280', 
                                        fontSize: '14px',
                                        userSelect: 'none',
                                        padding: '2px',
                                        borderRadius: '2px',
                                        transition: 'color 0.2s ease'
                                      }}
                                      title="Drag to reorder"
                                    >
                                      ⋮⋮
                                    </div>
                                  )}
                                  <input 
                                    type="text" 
                                    style={{...styles.tableInput, flex: 1}}
                                    value={item.item} 
                                    onChange={(e) => handleItemChange('sov', index, 'item', e.target.value)}
                                    onKeyDown={(e) => handleEstimateCellKeyDown(e, 'sov', index, 0, data.sovItems.length)}
                                    data-estimate-table="sov"
                                    data-estimate-row={index}
                                    data-estimate-col={0}
                                    readOnly={isViewMode}
                                  />
                                </div>
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'quantity')) ? '' : String(item.quantity ?? '')}
                                  onChange={(e) => handleItemChange('sov', index, 'quantity', e.target.value)}
                                  onKeyDown={(e) => {
                                    handleEstimateCellKeyDown(e, 'sov', index, 1, data.sovItems.length);
                                    if (e.key === 'Backspace' && String(item.quantity) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'quantity'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'quantity', '');
                                    }
                                  }}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={1}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal" 
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'materialPrice')) ? '' : String(item.materialPrice ?? '')}
                                  onChange={(e) => handleItemChange('sov', index, 'materialPrice', e.target.value)}
                                  onKeyDown={(e) => {
                                    handleEstimateCellKeyDown(e, 'sov', index, 2, data.sovItems.length);
                                    if (e.key === 'Backspace' && String(item.materialPrice) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'materialPrice'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'materialPrice', '');
                                    }
                                  }}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={2}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal" 
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'expensePrice')) ? '' : String(item.expensePrice ?? '')}
                                  onChange={(e) => handleItemChange('sov', index, 'expensePrice', e.target.value)}
                                  onKeyDown={(e) => {
                                    handleEstimateCellKeyDown(e, 'sov', index, 3, data.sovItems.length);
                                    if (e.key === 'Backspace' && String(item.expensePrice) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'expensePrice'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'expensePrice', '');
                                    }
                                  }}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={3}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatCurrency(materialExtension)}
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatCurrency(expenseExtension)}
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'laborMen')) ? '' : (isNaN(item.laborMen) ? '' : String(item.laborMen ?? ''))}
                                  onChange={(e) => handleItemChange('sov', index, 'laborMen', e.target.value)}
                                  onKeyDown={(e) => {
                                    handleEstimateCellKeyDown(e, 'sov', index, 6, data.sovItems.length);
                                    if (e.key === 'Backspace' && String(item.laborMen) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'laborMen'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'laborMen', '');
                                    }
                                  }}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={6}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'laborHours')) ? '' : (isNaN(item.laborHours) ? '' : String(item.laborHours ?? ''))}
                                  onChange={(e) => handleItemChange('sov', index, 'laborHours', e.target.value)}
                                  onKeyDown={(e) => {
                                    handleEstimateCellKeyDown(e, 'sov', index, 7, data.sovItems.length);
                                    if (e.key === 'Backspace' && String(item.laborHours) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'laborHours'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'laborHours', '');
                                    }
                                  }}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={7}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatNumber(laborUnit)}
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatNumber(laborTotal)}
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatCurrency(sovItemPrice)}
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text" 
                                  style={styles.tableInput}
                                  value={item.notes} 
                                  onChange={(e) => handleItemChange('sov', index, 'notes', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'sov', index, 11, data.sovItems.length)}
                                  data-estimate-table="sov"
                                  data-estimate-row={index}
                                  data-estimate-col={11}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                {!isViewMode && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearRow('sov', index)}
                                    onKeyDown={(e) => handleEstimateCellKeyDown(e, 'sov', index, 12, data.sovItems.length)}
                                    data-estimate-table="sov"
                                    data-estimate-row={index}
                                    data-estimate-col={12}
                                    style={{
                                      backgroundColor: '#f87171',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '4px 8px',
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      fontWeight: '500'
                                    }}
                                    title="Delete this row"
                                  >
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={() => handleAddLine('sov')}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        Add SOV Line
                      </Button>
                    </div>
                  </div>

                  {/* Non-SOV Quote Items */}
                  <div style={styles.sectionHeader}>NON-SOV QUOTE ITEMS</div>
                  <div style={styles.tableContainer} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th ref={nonSovItemHeaderRef} style={{...styles.tableHeader, width: toPx(nonSovItemColWidth), minWidth: toPx(nonSovItemColWidth), position: 'relative'}}>
                            ITEM
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              title="Drag to resize column"
                              onMouseDown={(e) => { e.stopPropagation(); onNonSovItemMouseDown(e); }}
                              style={{
                                position: 'absolute',
                                right: -4,
                                top: 0,
                                height: '100%',
                                width: 12,
                                minHeight: 24,
                                cursor: 'col-resize',
                                userSelect: 'none',
                                zIndex: 10,
                              }}
                            />
                          </th>
                          <th style={styles.tableHeader}>QUANTITY</th>
                          <th style={styles.tableHeader}>MATERIAL PRICE</th>
                          <th style={styles.tableHeader}>EXPENSE PRICE</th>
                          <th style={styles.tableHeader}>MATERIAL EXTENSION</th>
                          <th style={styles.tableHeader}>EXPENSE EXTENSION</th>
                          <th style={styles.tableHeader}>LABOR (MEN)</th>
                          <th style={styles.tableHeader}>LABOR (HOURS)</th>
                          <th style={styles.tableHeader}>LABOR UNIT</th>
                          <th style={styles.tableHeader}>LABOR TOTAL</th>
                          <th style={styles.tableHeader}>NOTES</th>
                          <th style={styles.tableHeader}>CLEAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.nonSovItems.map((item, index) => {
                          const materialExtension = calculateMaterialExtension(item.quantity, item.materialPrice);
                          const expenseExtension = calculateExpenseExtension(item.quantity, item.expensePrice);
                          const laborUnit = calculateLaborUnit(item.laborMen, item.laborHours);
                          const laborTotal = calculateLaborTotal(item.quantity, item.laborMen, item.laborHours);
                          
                          return (
                            <tr 
                              key={index}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, index, 'nonSov')}
                              style={{
                                backgroundColor: dragOverIndex === index && draggedItemType === 'nonSov' ? '#f3f4f6' : 'transparent',
                                borderTop: dragOverIndex === index && draggedItemType === 'nonSov' ? '2px solid #f26722' : 'none'
                              }}
                            >
                              <td style={{...styles.tableCell, width: toPx(nonSovItemColWidth), minWidth: toPx(nonSovItemColWidth)}}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {!isViewMode && (
                                    <div 
                                      draggable={true}
                                      onDragStart={(e) => handleDragStart(e, index, 'nonSov')}
                                      onDragEnd={handleDragEnd}
                                      onMouseEnter={(e) => {
                                        (e.target as HTMLElement).style.color = '#374151';
                                        (e.target as HTMLElement).style.cursor = 'grab';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.target as HTMLElement).style.color = '#6b7280';
                                      }}
                                      onMouseDown={(e) => {
                                        (e.target as HTMLElement).style.cursor = 'grabbing';
                                      }}
                                      onMouseUp={(e) => {
                                        (e.target as HTMLElement).style.cursor = 'grab';
                                      }}
                                      style={{ 
                                        cursor: 'grab', 
                                        color: '#6b7280', 
                                        fontSize: '14px',
                                        userSelect: 'none',
                                        padding: '2px',
                                        borderRadius: '2px',
                                        transition: 'color 0.2s ease'
                                      }}
                                      title="Drag to reorder"
                                    >
                                      ⋮⋮
                                    </div>
                                  )}
                                  <input 
                                    type="text" 
                                    style={{...styles.tableInput, flex: 1}}
                                    value={item.item} 
                                    onChange={(e) => handleItemChange('nonSov', index, 'item', e.target.value)}
                                    onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 0, data.nonSovItems.length)}
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={0}
                                    readOnly={isViewMode}
                                  />
                                </div>
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  style={styles.tableInput}
                                  value={item.quantity} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'quantity', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 1, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={1}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.materialPrice} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'materialPrice', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 2, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={2}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.expensePrice} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'expensePrice', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 3, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={3}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatCurrency(materialExtension)}
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatCurrency(expenseExtension)}
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  style={styles.tableInput}
                                  value={isNaN(item.laborMen) ? '' : item.laborMen} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'laborMen', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 6, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={6}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  style={styles.tableInput}
                                  value={isNaN(item.laborHours) ? '' : item.laborHours} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'laborHours', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 7, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={7}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatNumber(laborUnit)}
                              </td>
                              <td style={{...styles.tableCell, ...styles.calculated}}>
                                {formatNumber(laborTotal)}
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text" 
                                  style={styles.tableInput}
                                  value={item.notes} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'notes', e.target.value)}
                                  onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 10, data.nonSovItems.length)}
                                  data-estimate-table="nonSov"
                                  data-estimate-row={index}
                                  data-estimate-col={10}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                {!isViewMode && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearRow('nonSov', index)}
                                    onKeyDown={(e) => handleEstimateCellKeyDown(e, 'nonSov', index, 11, data.nonSovItems.length)}
                                    data-estimate-table="nonSov"
                                    data-estimate-row={index}
                                    data-estimate-col={11}
                                    style={{
                                      backgroundColor: '#f87171',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '4px 8px',
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      fontWeight: '500'
                                    }}
                                    title="Delete this row"
                                  >
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    <div className="mt-4 flex justify-end space-x-4">
                      <Button
                        onClick={() => handleAddLine('nonSov')}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        Add Non-SOV Line
                      </Button>
                      <Button
                        onClick={toggleTravel}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        {showTravel ? 'Hide Travel' : 'Add Travel'}
                      </Button>
                    </div>
                  </div>
                  
                  {showTravel && (
                    <div className="mt-8">
                      <h3 className="text-xl font-semibold mb-4">Travel Expenses</h3>
                      
                      {/* Travel Linking Toggles */}
                      <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200">
                        <div className="flex flex-wrap gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={linkLocalTravelToDays}
                              onChange={(e) => setLinkLocalTravelToDays(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-[#f26722] focus:ring-[#f26722]"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Link Local Travel to Days Onsite
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                (Travel Expense & Travel Time Trips = {Math.ceil(data.hoursSummary.daysOnsite) || 0})
                              </span>
                            </span>
                          </label>
                          
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={linkOutOfTownTravelToDays}
                              onChange={(e) => setLinkOutOfTownTravelToDays(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-[#f26722] focus:ring-[#f26722]"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Link Out-of-Town Travel to Days Onsite
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                (Per Diem, Lodging, Local Miles = {Math.ceil(data.hoursSummary.daysOnsite) || 0} days)
                              </span>
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={travelData?.numMenLinked !== false}
                              onChange={(e) => setTravelData(prev => ({ ...prev, numMenLinked: e.target.checked }))}
                              className="w-4 h-4 rounded border-gray-300 text-[#f26722] focus:ring-[#f26722]"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Link # of men across travel sections
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                (Uncheck to enter different crew sizes per section)
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>
                      
                      <div style={styles.tableContainer}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}>TRIPS</th>
                              <th style={styles.tableHeader}>ONE WAY MILES</th>
                              <th style={styles.tableHeader}>ROUND TRIP MILES</th>
                              <th style={styles.tableHeader}>TOTAL VEHICLE MILES</th>
                              <th style={styles.tableHeader}># OF VEHICLES</th>
                              <th style={styles.tableHeader}>TOTAL MILES</th>
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>VEHICLE TRAVEL COST</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.travelExpense ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.trips}
                                    onChange={(e) => handleTravelChange('travelExpense', index, 'trips', e.target.value)}
                                    disabled={linkLocalTravelToDays}
                                    title={linkLocalTravelToDays ? "Linked to Days Onsite - value will update automatically" : ""}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.oneWayMiles}
                                    onChange={(e) => handleTravelChange('travelExpense', index, 'oneWayMiles', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.roundTripMiles}
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.totalVehicleMiles}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numVehicles}
                                    onChange={(e) => handleTravelChange('travelExpense', index, 'numVehicles', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.totalMiles}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('travelExpense', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.vehicleTravelCost.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Add the rest of the travel sections (Travel Time, Per Diem, etc.) here */}
                      
                      {/* Travel Time Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Travel Time</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}>TRIPS</th>
                              <th style={styles.tableHeader}>ONE WAY HOURS</th>
                              <th style={styles.tableHeader}>ROUND TRIP HOURS</th>
                              <th style={styles.tableHeader}>TOTAL TRAVEL HOURS</th>
                              <th style={styles.tableHeader}># OF MEN</th>
                              <th style={styles.tableHeader}>GRAND TOTAL TRAVEL HOURS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.travelTime ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.trips}
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.oneWayHours.toFixed(2)}
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.roundTripHours}
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.totalTravelHours}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numMen}
                                    onChange={(e) => handleTravelChange('travelTime', index, 'numMen', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.grandTotalTravelHours}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Per Diem Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Per Diem</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}># OF DAYS</th>
                              <th style={styles.tableHeader}>FIRST DAY RATE</th>
                              <th style={styles.tableHeader}>LAST DAY RATE</th>
                              <th style={styles.tableHeader}>DAILY RATE</th>
                              <th style={styles.tableHeader}>ADDITIONAL DAYS</th>
                              <th style={styles.tableHeader}>TOTAL PER DIEM PER MAN</th>
                              <th style={styles.tableHeader}># OF MEN</th>
                              <th style={styles.tableHeader}>TOTAL PER DIEM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.perDiem ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numDays}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'numDays', e.target.value)}
                                    disabled={linkOutOfTownTravelToDays}
                                    title={linkOutOfTownTravelToDays ? "Linked to Days Onsite - value will update automatically" : ""}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.firstDayRate}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'firstDayRate', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.lastDayRate}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'lastDayRate', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.dailyRate}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'dailyRate', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.additionalDays}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'additionalDays', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalPerDiemPerMan.toFixed(2)}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numMen}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'numMen', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalPerDiem.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Lodging Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Lodging</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}># OF NIGHTS</th>
                              <th style={styles.tableHeader}># OF MEN</th>
                              <th style={styles.tableHeader}># OF MAN NIGHTS</th>
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>TOTAL AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.lodging ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numNights}
                                    onChange={(e) => handleTravelChange('lodging', index, 'numNights', e.target.value)}
                                    disabled={linkOutOfTownTravelToDays}
                                    title={linkOutOfTownTravelToDays ? "Linked to Days Onsite - value will update automatically" : ""}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numMen}
                                    onChange={(e) => handleTravelChange('lodging', index, 'numMen', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.manNights}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('lodging', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalAmount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Local Miles Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Local Miles</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}># OF DAYS</th>
                              <th style={styles.tableHeader}># OF VEHICLES</th>
                              <th style={styles.tableHeader}>MILES PER DAY</th>
                              <th style={styles.tableHeader}>TOTAL MILES</th>
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>TOTAL LOCAL MILES COST</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.localMiles ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numDays}
                                    onChange={(e) => handleTravelChange('localMiles', index, 'numDays', e.target.value)}
                                    disabled={linkOutOfTownTravelToDays}
                                    title={linkOutOfTownTravelToDays ? "Linked to Days Onsite - value will update automatically" : ""}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numVehicles}
                                    onChange={(e) => handleTravelChange('localMiles', index, 'numVehicles', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.milesPerDay}
                                    onChange={(e) => handleTravelChange('localMiles', index, 'milesPerDay', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.totalMiles}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('localMiles', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalLocalMilesCost.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Flights Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Flights</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}># OF FLIGHTS</th>
                              <th style={styles.tableHeader}># OF MEN</th>
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>LUGGAGE FEES</th>
                              <th style={styles.tableHeader}>TOTAL FLIGHT AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.flights ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numFlights}
                                    onChange={(e) => handleTravelChange('flights', index, 'numFlights', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numMen}
                                    onChange={(e) => handleTravelChange('flights', index, 'numMen', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('flights', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.luggageFees}
                                    onChange={(e) => handleTravelChange('flights', index, 'luggageFees', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalFlightAmount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Air Travel Time Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Air Travel Time</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}>TRIPS</th>
                              <th style={styles.tableHeader}>ONE WAY HOURS IN AIR</th>
                              <th style={styles.tableHeader}>ROUND TRIP + TERMINAL TIME</th>
                              <th style={styles.tableHeader}>TOTAL TRAVEL HOURS</th>
                              <th style={styles.tableHeader}># OF MEN</th>
                              <th style={styles.tableHeader}>GRAND TOTAL TRAVEL HOURS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.airTravelTime ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.trips}
                                    onChange={(e) => handleTravelChange('airTravelTime', index, 'trips', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.oneWayHoursInAir}
                                    onChange={(e) => handleTravelChange('airTravelTime', index, 'oneWayHoursInAir', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.roundTripTerminalTime}
                                    onChange={(e) => handleTravelChange('airTravelTime', index, 'roundTripTerminalTime', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.totalTravelHours}
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numMen}
                                    onChange={(e) => handleTravelChange('airTravelTime', index, 'numMen', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  {item.grandTotalTravelHours}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Rental Car Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Rental Car</h4>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.tableHeader}># OF CARS</th>
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>TOTAL AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(travelData?.rentalCar ?? []).map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numCars}
                                    onChange={(e) => handleTravelChange('rentalCar', index, 'numCars', e.target.value)}
                                  />
                                </td>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('rentalCar', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalAmount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Travel Summary Section */}
                      <div className="mt-8">
                        <h4 className="text-lg font-semibold mb-4">Travel Summary</h4>
                        <div style={styles.summarySection}>
                          <div style={styles.summaryRow}>
                            <div style={styles.summaryLabel}>Total Travel Expenses:</div>
                            <div style={styles.summaryValue}>
                              ${(
                                (travelData?.travelExpense?.[0]?.vehicleTravelCost ?? 0) +
                                (travelData?.travelTime?.[0]?.totalTravelLabor ?? 0) +
                                (travelData?.perDiem?.[0]?.totalPerDiem ?? 0) +
                                (travelData?.lodging?.[0]?.totalAmount ?? 0) +
                                (travelData?.localMiles?.[0]?.totalLocalMilesCost ?? 0) +
                                (travelData?.flights?.[0]?.totalFlightAmount ?? 0) +
                                (travelData?.airTravelTime?.[0]?.totalTravelLabor ?? 0) +
                                (travelData?.rentalCar?.[0]?.totalAmount ?? 0)
                              ).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Summary Sections Container - Side by Side (wraps on narrow viewports) */}
                  <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '20px', marginTop: '20px', minWidth: 0}}>
                    {/* Financial Summary Table - Left Side */}
                    <div style={{...styles.summarySection, flex: '1 1 400px', minWidth: 0, maxWidth: '700px'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>Financial Summary</h3>
                      <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                        <thead>
                          <tr>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}></th>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}>AMOUNT</th>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}>TAX FACTOR</th>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}>COST</th>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}>MARK-UP</th>
                            <th style={{...styles.tableHeader, padding: '12px 8px'}}>TOTALS</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>MATERIAL TOTAL:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalMaterial)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1.09</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalMaterial * 1.09)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={materialMarkup}
                                onChange={(e) => {
                                  const markup = parseFloat(e.target.value) || DEFAULT_ESTIMATING_PRESETS.default_markup_factor;
                                  setMaterialMarkup(markup);
                                }}
                                step="0.1"
                                min="0"
                                readOnly={isViewMode}
                                placeholder="1.3"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalMaterial * 1.09 * materialMarkup)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>EXPENSE TOTAL:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1.09</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense * 1.09)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense * 1.09)}</td>
                          </tr>
                          <tr style={{...styles.tfoot}}>
                            <td colSpan={5} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatCurrency(
                                (data.calculatedValues.totalMaterial * 1.09 * materialMarkup) +
                                (data.calculatedValues.totalExpense * 1.09) +
                                (data.calculatedValues.nonSovExpense * 1.00)
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                                      </div>
                  
                  {/* Labor Calculation Table - Under Financial Summary */}
                  <div style={{...styles.summarySection, flex: '1 1 400px', minWidth: 0, maxWidth: '700px', marginTop: '20px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: 0}}>Labor Hours Tracking — Monday-Friday</h3>
                      <div style={{display: 'flex', gap: '6px'}}>
                        <button
                          onClick={() => { setShowSaturdayHours(!showSaturdayHours); setIsDirty(true); }}
                          style={{
                            padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
                            backgroundColor: showSaturdayHours ? '#f26722' : '#6c757d', color: 'white', border: 'none'
                          }}
                        >
                          {showSaturdayHours ? 'Hide Saturday' : 'Show Saturday'}
                        </button>
                        <button
                          onClick={() => { setShowSundayHours(!showSundayHours); setIsDirty(true); }}
                          style={{
                            padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
                            backgroundColor: showSundayHours ? '#f26722' : '#6c757d', color: 'white', border: 'none'
                          }}
                        >
                          {showSundayHours ? 'Hide Sunday/Holiday' : 'Show Sunday/Holiday'}
                        </button>
                      </div>
                    </div>
                    
                    {/* Hours Counter */}
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6'}}>
                      <div style={{fontWeight: 'bold', color: '#495057'}}>
                        Work Hours Quoted: {toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours)}
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <div style={{fontWeight: 'bold', color: (() => {
                          const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                          const actualHours = toNum(data.hoursSummary.straightTimeHours) + toNum(data.hoursSummary.overtimeHours) + toNum(data.hoursSummary.doubleTimeHours);
                          const difference = actualHours - quotedHours;
                          if (difference > 0) return '#dc3545';
                          if (difference < 0) return '#28a745';
                          return '#6c757d';
                        })()}}>
                          {(() => {
                            const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                            const actualHours = toNum(data.hoursSummary.straightTimeHours) + toNum(data.hoursSummary.overtimeHours) + toNum(data.hoursSummary.doubleTimeHours);
                            const difference = actualHours - quotedHours;
                            if (difference > 0) return `${difference} hours over`;
                            if (difference < 0) return `${Math.abs(difference)} hours remaining`;
                            return 'Hours exact';
                          })()}
                        </div>
                        <button
                          onClick={() => {
                            setIsManualLaborHours(false);
                            const defaultHours = calculateDefaultLaborHours(data);
                            setData(prev => ({
                              ...prev,
                              hoursSummary: {
                                ...prev.hoursSummary,
                                straightTimeHours: defaultHours.straightTime,
                                overtimeHours: defaultHours.overtime,
                                doubleTimeHours: defaultHours.doubleTime
                              }
                            }));
                            setIsDirty(true);
                          }}
                          style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Reset to Formula
                        </button>
                      </div>
                    </div>
                    <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                      <thead>
                        <tr>
                          <th style={{...styles.tableHeader, padding: '12px 8px'}}></th>
                          <th style={{...styles.tableHeader, padding: '12px 8px'}}>HOURS</th>
                          <th style={{...styles.tableHeader, padding: '12px 8px'}}>RATE</th>
                          <th style={{...styles.tableHeader, padding: '12px 8px'}}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ STRAIGHT TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.straightTimeHours || ''} onChange={(e) => handleHoursSummaryChange('straightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" style={{...styles.tableInput, width: '100%'}} value={hourlyRates.straightTime || ''} onChange={(e) => { setHourlyRates(prev => ({...prev, straightTime: parseFloat(e.target.value) || 0})); }} step="0.01" min="0" readOnly={isViewMode} placeholder="240.00" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.straightTimeHours) * hourlyRates.straightTime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ OVERTIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.overtimeHours || ''} onChange={(e) => handleHoursSummaryChange('overtimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" style={{...styles.tableInput, width: '100%'}} value={hourlyRates.overtime || ''} onChange={(e) => { setHourlyRates(prev => ({...prev, overtime: parseFloat(e.target.value) || 0})); }} step="0.01" min="0" readOnly={isViewMode} placeholder="360.00" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.overtimeHours) * hourlyRates.overtime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ DOUBLE TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.doubleTimeHours || ''} onChange={(e) => handleHoursSummaryChange('doubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" style={{...styles.tableInput, width: '100%'}} value={hourlyRates.doubleTime || ''} onChange={(e) => { setHourlyRates(prev => ({...prev, doubleTime: parseFloat(e.target.value) || 0})); }} step="0.01" min="0" readOnly={isViewMode} placeholder="480.00" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.doubleTimeHours) * hourlyRates.doubleTime)}</td>
                          </tr>
                          {showTravel && (<>
                          <tr><td colSpan={4} style={{...styles.tableCell, padding: '6px 8px', backgroundColor: 'var(--header-bg)', fontWeight: 'bold', textAlign: 'left', fontSize: '12px'}}>TRAVEL LABOR</td></tr>
                          <tr><td colSpan={4} style={{padding: '0'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 8px', backgroundColor: (() => {
                              const quotedTravel = toNum(data.hoursSummary.travelHours);
                              const allocatedTravel = toNum(data.hoursSummary.travelStraightTimeHours) + toNum(data.hoursSummary.travelOvertimeHours) + toNum(data.hoursSummary.travelDoubleTimeHours);
                              const diff = Math.abs(allocatedTravel - quotedTravel);
                              if (diff < 0.01) return '#d4edda';
                              return '#fff3cd';
                            })(), borderRadius: '4px', margin: '4px 0', border: (() => {
                              const quotedTravel = toNum(data.hoursSummary.travelHours);
                              const allocatedTravel = toNum(data.hoursSummary.travelStraightTimeHours) + toNum(data.hoursSummary.travelOvertimeHours) + toNum(data.hoursSummary.travelDoubleTimeHours);
                              const diff = Math.abs(allocatedTravel - quotedTravel);
                              if (diff < 0.01) return '1px solid #c3e6cb';
                              return '1px solid #ffc107';
                            })()}}>
                              <div style={{fontSize: '12px', fontWeight: 'bold', color: '#495057'}}>
                                Travel Hours from Travel Section: {toNum(data.hoursSummary.travelHours).toFixed(2)}
                              </div>
                              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <div style={{fontSize: '12px', fontWeight: 'bold', color: (() => {
                                  const quotedTravel = toNum(data.hoursSummary.travelHours);
                                  const allocatedTravel = toNum(data.hoursSummary.travelStraightTimeHours) + toNum(data.hoursSummary.travelOvertimeHours) + toNum(data.hoursSummary.travelDoubleTimeHours);
                                  const diff = Math.abs(allocatedTravel - quotedTravel);
                                  if (diff < 0.01) return '#28a745';
                                  return '#dc3545';
                                })()}}>
                                  {(() => {
                                    const quotedTravel = toNum(data.hoursSummary.travelHours);
                                    const allocatedTravel = toNum(data.hoursSummary.travelStraightTimeHours) + toNum(data.hoursSummary.travelOvertimeHours) + toNum(data.hoursSummary.travelDoubleTimeHours);
                                    const diff = allocatedTravel - quotedTravel;
                                    if (Math.abs(diff) < 0.01) return 'Travel hours match';
                                    if (diff > 0) return `${diff.toFixed(2)} hours over`;
                                    return `${Math.abs(diff).toFixed(2)} hours not allocated — will not be charged!`;
                                  })()}
                                </div>
                                {isManualTravelLaborHours && (
                                  <button
                                    onClick={() => {
                                      setIsManualTravelLaborHours(false);
                                      const totalTravel = toNum(data.hoursSummary.travelHours);
                                      setData(prev => ({
                                        ...prev,
                                        hoursSummary: {
                                          ...prev.hoursSummary,
                                          travelStraightTimeHours: totalTravel,
                                          travelOvertimeHours: 0,
                                          travelDoubleTimeHours: 0
                                        }
                                      }));
                                      setIsDirty(true);
                                    }}
                                    style={{ padding: '2px 6px', fontSize: '11px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Reset Travel Hours
                                  </button>
                                )}
                              </div>
                            </div>
                          </td></tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ STRAIGHT TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.travelStraightTimeHours || ''} onChange={(e) => handleHoursSummaryChange('travelStraightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.straightTime)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.travelStraightTimeHours) * hourlyRates.straightTime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ OVERTIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.travelOvertimeHours || ''} onChange={(e) => handleHoursSummaryChange('travelOvertimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.overtime)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.travelOvertimeHours) * hourlyRates.overtime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ DOUBLE TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.hoursSummary.travelDoubleTimeHours || ''} onChange={(e) => handleHoursSummaryChange('travelDoubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.doubleTime)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.hoursSummary.travelDoubleTimeHours) * hourlyRates.doubleTime)}</td>
                          </tr>
                          </>)}
                          <tr style={{...styles.tfoot}}>
                            <td colSpan={3} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatCurrency(getWorkLaborCost() + getTravelLaborCost())}
                            </td>
                          </tr>
                        </tbody>
                    </table>
                  </div>

                  {/* Saturday Labor Hours Tracking */}
                  {showSaturdayHours && (
                  <div style={{...styles.summarySection, flex: '1 1 400px', minWidth: 0, maxWidth: '700px', marginTop: '20px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: 0, color: '#f26722'}}>Labor Hours Tracking — Saturday</h3>
                      <button
                        onClick={() => {
                          setData(prev => ({
                            ...prev,
                            saturdayHoursSummary: {
                              straightTimeHours: toNum(prev.hoursSummary.straightTimeHours),
                              overtimeHours: toNum(prev.hoursSummary.overtimeHours),
                              doubleTimeHours: toNum(prev.hoursSummary.doubleTimeHours),
                              travelStraightTimeHours: toNum(prev.hoursSummary.travelStraightTimeHours),
                              travelOvertimeHours: toNum(prev.hoursSummary.travelOvertimeHours),
                              travelDoubleTimeHours: toNum(prev.hoursSummary.travelDoubleTimeHours)
                            }
                          }));
                          setIsManualSaturdayHours(true);
                          setIsDirty(true);
                        }}
                        style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Copy from M-F
                      </button>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107'}}>
                      <div style={{fontWeight: 'bold', color: '#856404'}}>
                        Work Hours Quoted: {toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours)}
                      </div>
                      <div style={{fontWeight: 'bold', color: (() => {
                        const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                        const sat = data.saturdayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
                        const actualHours = toNum(sat.straightTimeHours) + toNum(sat.overtimeHours) + toNum(sat.doubleTimeHours);
                        const diff = actualHours - quotedHours;
                        if (diff > 0) return '#dc3545';
                        if (diff < 0) return '#28a745';
                        return '#6c757d';
                      })()}}>
                        {(() => {
                          const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                          const sat = data.saturdayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
                          const actualHours = toNum(sat.straightTimeHours) + toNum(sat.overtimeHours) + toNum(sat.doubleTimeHours);
                          const diff = actualHours - quotedHours;
                          if (diff > 0) return `${diff} hours over`;
                          if (diff < 0) return `${Math.abs(diff)} hours remaining`;
                          return 'Hours exact';
                        })()}
                      </div>
                    </div>
                    <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                      <thead><tr>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}></th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>HOURS</th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>RATE</th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>AMOUNT</th>
                      </tr></thead>
                      <tbody>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ STRAIGHT TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.straightTimeHours || ''} onChange={(e) => handleSaturdayHoursChange('straightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.straightTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.straightTimeHours) * hourlyRates.straightTime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ OVERTIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.overtimeHours || ''} onChange={(e) => handleSaturdayHoursChange('overtimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.overtime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.overtimeHours) * hourlyRates.overtime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ DOUBLE TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.doubleTimeHours || ''} onChange={(e) => handleSaturdayHoursChange('doubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.doubleTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.doubleTimeHours) * hourlyRates.doubleTime)}</td>
                        </tr>
                        {showTravel && (<>
                        <tr><td colSpan={4} style={{...styles.tableCell, padding: '6px 8px', backgroundColor: 'var(--header-bg)', fontWeight: 'bold', textAlign: 'left', fontSize: '12px'}}>TRAVEL LABOR</td></tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ STRAIGHT TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.travelStraightTimeHours || ''} onChange={(e) => handleSaturdayHoursChange('travelStraightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.straightTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.travelStraightTimeHours) * hourlyRates.straightTime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ OVERTIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.travelOvertimeHours || ''} onChange={(e) => handleSaturdayHoursChange('travelOvertimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.overtime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.travelOvertimeHours) * hourlyRates.overtime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ DOUBLE TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.saturdayHoursSummary?.travelDoubleTimeHours || ''} onChange={(e) => handleSaturdayHoursChange('travelDoubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.doubleTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.saturdayHoursSummary?.travelDoubleTimeHours) * hourlyRates.doubleTime)}</td>
                        </tr>
                        </>)}
                        <tr style={{...styles.tfoot}}>
                          <td colSpan={3} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                            {formatCurrency((() => {
                              const sat = data.saturdayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0, travelStraightTimeHours: 0, travelOvertimeHours: 0, travelDoubleTimeHours: 0 };
                              return (toNum(sat.straightTimeHours) * hourlyRates.straightTime) + (toNum(sat.overtimeHours) * hourlyRates.overtime) + (toNum(sat.doubleTimeHours) * hourlyRates.doubleTime) +
                                     (toNum(sat.travelStraightTimeHours) * hourlyRates.straightTime) + (toNum(sat.travelOvertimeHours) * hourlyRates.overtime) + (toNum(sat.travelDoubleTimeHours) * hourlyRates.doubleTime);
                            })())}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  )}

                  {/* Sunday/Holiday Labor Hours Tracking */}
                  {showSundayHours && (
                  <div style={{...styles.summarySection, flex: '1 1 400px', minWidth: 0, maxWidth: '700px', marginTop: '20px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: 0, color: '#dc3545'}}>Labor Hours Tracking — Sunday / Holiday</h3>
                      <button
                        onClick={() => {
                          setData(prev => ({
                            ...prev,
                            sundayHoursSummary: {
                              straightTimeHours: toNum(prev.hoursSummary.straightTimeHours),
                              overtimeHours: toNum(prev.hoursSummary.overtimeHours),
                              doubleTimeHours: toNum(prev.hoursSummary.doubleTimeHours),
                              travelStraightTimeHours: toNum(prev.hoursSummary.travelStraightTimeHours),
                              travelOvertimeHours: toNum(prev.hoursSummary.travelOvertimeHours),
                              travelDoubleTimeHours: toNum(prev.hoursSummary.travelDoubleTimeHours)
                            }
                          }));
                          setIsManualSundayHours(true);
                          setIsDirty(true);
                        }}
                        style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Copy from M-F
                      </button>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #f5c6cb'}}>
                      <div style={{fontWeight: 'bold', color: '#721c24'}}>
                        Work Hours Quoted: {toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours)}
                      </div>
                      <div style={{fontWeight: 'bold', color: (() => {
                        const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                        const sun = data.sundayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
                        const actualHours = toNum(sun.straightTimeHours) + toNum(sun.overtimeHours) + toNum(sun.doubleTimeHours);
                        const diff = actualHours - quotedHours;
                        if (diff > 0) return '#dc3545';
                        if (diff < 0) return '#28a745';
                        return '#6c757d';
                      })()}}>
                        {(() => {
                          const quotedHours = toNum(data.hoursSummary.workHours) + toNum(data.hoursSummary.nonSovHours);
                          const sun = data.sundayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
                          const actualHours = toNum(sun.straightTimeHours) + toNum(sun.overtimeHours) + toNum(sun.doubleTimeHours);
                          const diff = actualHours - quotedHours;
                          if (diff > 0) return `${diff} hours over`;
                          if (diff < 0) return `${Math.abs(diff)} hours remaining`;
                          return 'Hours exact';
                        })()}
                      </div>
                    </div>
                    <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                      <thead><tr>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}></th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>HOURS</th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>RATE</th>
                        <th style={{...styles.tableHeader, padding: '12px 8px'}}>AMOUNT</th>
                      </tr></thead>
                      <tbody>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ STRAIGHT TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.straightTimeHours || ''} onChange={(e) => handleSundayHoursChange('straightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.straightTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.straightTimeHours) * hourlyRates.straightTime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ OVERTIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.overtimeHours || ''} onChange={(e) => handleSundayHoursChange('overtimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.overtime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.overtimeHours) * hourlyRates.overtime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ DOUBLE TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.doubleTimeHours || ''} onChange={(e) => handleSundayHoursChange('doubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.doubleTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.doubleTimeHours) * hourlyRates.doubleTime)}</td>
                        </tr>
                        {showTravel && (<>
                        <tr><td colSpan={4} style={{...styles.tableCell, padding: '6px 8px', backgroundColor: 'var(--header-bg)', fontWeight: 'bold', textAlign: 'left', fontSize: '12px'}}>TRAVEL LABOR</td></tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ STRAIGHT TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.travelStraightTimeHours || ''} onChange={(e) => handleSundayHoursChange('travelStraightTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.straightTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.travelStraightTimeHours) * hourlyRates.straightTime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ OVERTIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.travelOvertimeHours || ''} onChange={(e) => handleSundayHoursChange('travelOvertimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.overtime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.travelOvertimeHours) * hourlyRates.overtime)}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>TRAVEL @ DOUBLE TIME:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                            <input type="number" step="0.01" style={{...styles.tableInput, width: '100%'}} value={data.sundayHoursSummary?.travelDoubleTimeHours || ''} onChange={(e) => handleSundayHoursChange('travelDoubleTimeHours', e.target.value)} readOnly={isViewMode} placeholder="0" />
                          </td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(hourlyRates.doubleTime)}</td>
                          <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(toNum(data.sundayHoursSummary?.travelDoubleTimeHours) * hourlyRates.doubleTime)}</td>
                        </tr>
                        </>)}
                        <tr style={{...styles.tfoot}}>
                          <td colSpan={3} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                          <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                            {formatCurrency((() => {
                              const sun = data.sundayHoursSummary || { straightTimeHours: 0, overtimeHours: 0, doubleTimeHours: 0, travelStraightTimeHours: 0, travelOvertimeHours: 0, travelDoubleTimeHours: 0 };
                              return (toNum(sun.straightTimeHours) * hourlyRates.straightTime) + (toNum(sun.overtimeHours) * hourlyRates.overtime) + (toNum(sun.doubleTimeHours) * hourlyRates.doubleTime) +
                                     (toNum(sun.travelStraightTimeHours) * hourlyRates.straightTime) + (toNum(sun.travelOvertimeHours) * hourlyRates.overtime) + (toNum(sun.travelDoubleTimeHours) * hourlyRates.doubleTime);
                            })())}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  )}
                  
                  {/* Hours Summary Section - Right Side - fixed width so it doesn't stretch the page */}
                  <div style={{...styles.summarySection, width: '300px', maxWidth: '100%', minWidth: 0, marginLeft: 0, flex: '0 0 300px', overflow: 'hidden', boxSizing: 'border-box'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>Hours Summary</h3>
                      <table style={{...styles.table, width: '100%', minWidth: 0, fontSize: '14px', tableLayout: 'fixed'}}>
                        <tbody>
                          <tr>
                            <td style={{...styles.tableCell, width: '60%', textAlign: 'left', padding: '12px 8px'}}>Men:</td>
                            <td style={{...styles.tableCell, width: '40%', padding: '12px 8px'}}>
                              <input
                                type="number"
                                step="0.01"
                                style={{...styles.tableInput, width: '100%'}}
                                value={data.hoursSummary.men}
                                onChange={(e) => handleHoursSummaryChange('men', e.target.value)}
                              />
                            </td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, textAlign: 'left', padding: '12px 8px'}}>Hrs/Day:</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>
                              <input
                                type="number"
                                step="0.01"
                                style={{...styles.tableInput, width: '100%'}}
                                value={data.hoursSummary.hoursPerDay}
                                onChange={(e) => handleHoursSummaryChange('hoursPerDay', e.target.value)}
                              />
                            </td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, textAlign: 'left', padding: '12px 8px'}}>Days Onsite:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              {formatNumber(data.hoursSummary.daysOnsite)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, textAlign: 'left', padding: '12px 8px'}}>Work / SOV Hrs:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              {formatNumber(data.hoursSummary.workHours)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, textAlign: 'left', padding: '12px 8px'}}>Non-SOV Hrs:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              {formatNumber(data.hoursSummary.nonSovHours)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, textAlign: 'left', padding: '12px 8px'}}>Travel Hours:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              {formatNumber(data.hoursSummary.travelHours)}
                            </td>
                          </tr>
                          <tr style={{...styles.tfoot}}>
                            <td style={{...styles.tableCell, textAlign: 'left', fontWeight: 'bold', padding: '12px 8px'}}>TOTAL HOURS:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatNumber(data.hoursSummary.totalHours)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    

                  </div>
                  
                  {/* Calculation Tables and Financial Summary - Side by Side */}
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '20px', marginTop: '20px'}}>
                    {/* Left Side - Calculation Tables */}
                    <div style={{width: '50%'}}>
                      {/* Payment Term Calculations Table */}
                      <div style={{...styles.summarySection, width: '100%', marginBottom: '20px'}}>
                        <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>PAYMENT TERM CALCULATIONS</h3>
                        <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                          <thead>
                            <tr>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>PAYMENT TERMS</th>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>FACTOR</th>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>ROUNDED PRICE</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>NET 30</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={paymentTermFactors.net30}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setPaymentTermFactors(prev => ({...prev, net30: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>NET 60</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={paymentTermFactors.net60}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setPaymentTermFactors(prev => ({...prev, net60: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>NET 90</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={paymentTermFactors.net90}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setPaymentTermFactors(prev => ({...prev, net90: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Mobilization Calculations Table */}
                      <div style={{...styles.summarySection, width: '100%'}}>
                        <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>MOBILIZATION CALCULATIONS</h3>
                        <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                          <thead>
                            <tr>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>THRESHOLD COST (&gt;)</th>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>FACTOR</th>
                              <th style={{...styles.tableHeader, padding: '12px 8px'}}>ROUNDED PRICE</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$0.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={mobilizationFactors.base}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setMobilizationFactors(prev => ({...prev, base: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * mobilizationFactors.base))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$100,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={mobilizationFactors.over100k}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setMobilizationFactors(prev => ({...prev, over100k: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{(() => { const f = getFinalValue(); const factor = f > 100000 ? mobilizationFactors.over100k : mobilizationFactors.base; return formatCurrency(Math.ceil(f * factor)); })()}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$500,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={mobilizationFactors.over500k}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setMobilizationFactors(prev => ({...prev, over500k: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{(() => { const f = getFinalValue(); const factor = f > 500000 ? mobilizationFactors.over500k : (f > 100000 ? mobilizationFactors.over100k : mobilizationFactors.base); return formatCurrency(Math.ceil(f * factor)); })()}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$1,000,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                                  value={mobilizationFactors.over1m}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setMobilizationFactors(prev => ({...prev, over1m: value}));
                                    setIsDirty(true);
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{(() => { const f = getFinalValue(); const factor = f > 1000000 ? mobilizationFactors.over1m : (f > 500000 ? mobilizationFactors.over500k : (f > 100000 ? mobilizationFactors.over100k : mobilizationFactors.base)); return formatCurrency(Math.ceil(f * factor)); })()}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Right Side - Financial Summary and Quote Text */}
                    <div style={{width: '50%'}}>
                      {/* Financial Summary */}
                      <div style={{...styles.summarySection, width: '100%', marginBottom: '20px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                          {/* Left side - SUB TOTAL and FINAL */}
                          <div style={{width: '60%'}}>
                            <div style={{marginBottom: '15px'}}>
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>SUB TOTAL (M-F)</div>
                              <div style={{fontSize: '16px', fontWeight: 'bold'}}>
                                {formatCurrency(getMaterialExpenseBase() + getWorkLaborCost() + getTravelLaborCost() + getTravelNonLaborCost())}
                              </div>
                              <div style={{fontSize: '12px', color: 'var(--text-color)', opacity: 0.8}}>(before final mark-up)</div>
                            </div>
                            <div>
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>FINAL (M-F)</div>
                              <div style={{marginBottom: '5px'}}>
                                {formatCurrency(getFinalValue())}
                              </div>
                              <div style={{marginBottom: '5px'}}>
                                Mobilization: {(() => {
                                  const final = getFinalValue();
                                  const factor = getMobilizationFactor(final);
                                  return formatCurrency(Math.ceil(final * factor));
                                })()}
                              </div>
                            </div>
                          </div>
                          
                          {/* Right side - CUSTOMER TOTAL COST table (includes mobilization as last step) */}
                          <div style={{width: '40%'}}>
                            <div style={{fontWeight: 'bold', marginBottom: '10px', textAlign: 'center'}}>CUSTOMER TOTAL COST</div>
                            <table style={{...styles.table, width: '100%', fontSize: '12px'}}>
                              <thead>
                                <tr>
                                  <th style={{...styles.tableHeader, padding: '6px 8px'}}></th>
                                  <th style={{...styles.tableHeader, padding: '6px 8px'}}>M-F</th>
                                  {showSaturdayHours && <th style={{...styles.tableHeader, padding: '6px 8px', color: '#f26722'}}>SAT</th>}
                                  {showSundayHours && <th style={{...styles.tableHeader, padding: '6px 8px', color: '#dc3545'}}>SUN/HOL</th>}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'left'}}>NET 30</td>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                                  {showSaturdayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net30) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}</td>}
                                  {showSundayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net30) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}</td>}
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'left'}}>NET 60</td>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                                  {showSaturdayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net60) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}</td>}
                                  {showSundayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net60) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}</td>}
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'left'}}>NET 90</td>
                                  <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}</td>
                                  {showSaturdayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net90) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}</td>}
                                  {showSundayHours && <td style={{...styles.tableCell, padding: '6px 8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net90) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}</td>}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      
                      {/* Quantity for combined letter proposal */}
                      <div style={{...styles.summarySection, width: '100%', marginTop: '12px', marginBottom: '8px'}}>
                        <div style={{fontWeight: 'bold', marginBottom: '5px'}}>Quantity for combined letter</div>
                        <div style={{fontSize: '12px', color: 'var(--text-color)', opacity: 0.9, marginBottom: '6px'}}>
                          Used when this estimate is included in a combined letter proposal. You can still change it when generating the letter.
                        </div>
                        <input
                          type="number"
                          min={1}
                          value={combinedLetterQuantity}
                          onChange={(e) => {
                            const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                            setCombinedLetterQuantity(v);
                            setIsDirty(true);
                          }}
                          readOnly={isViewMode}
                          style={{...styles.tableInput, width: '80px', textAlign: 'center'}}
                        />
                      </div>
                      
                      {/* Quote Text and Terms */}
                      <div style={{...styles.summarySection, width: '100%'}}>
                        <div style={{fontWeight: 'bold', marginBottom: '10px'}}>(Copy paste below into quote)</div>
                        <div style={{fontSize: '14px', lineHeight: '1.5'}}>
                          <div style={{fontWeight: 'bold', marginBottom: '8px'}}>NET 30:</div>
                          <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Monday - Friday: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}
                          </div>
                          {showSaturdayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Saturday: {formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net30) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}
                          </div>}
                          {showSundayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Sunday / Holiday: {formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net30) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}
                          </div>}
                          <div style={{fontWeight: 'bold', marginBottom: '8px', marginTop: '8px'}}>NET 60:</div>
                          <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Monday - Friday: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}
                          </div>
                          {showSaturdayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Saturday: {formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net60) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}
                          </div>}
                          {showSundayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Sunday / Holiday: {formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net60) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}
                          </div>}
                          <div style={{fontWeight: 'bold', marginBottom: '8px', marginTop: '8px'}}>NET 90:</div>
                          <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Monday - Friday: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90) + Math.ceil(getFinalValue() * getMobilizationFactor(getFinalValue())))}
                          </div>
                          {showSaturdayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Saturday: {formatCurrency(Math.ceil(getSaturdayFinalValue() * paymentTermFactors.net90) + Math.ceil(getSaturdayFinalValue() * getMobilizationFactor(getSaturdayFinalValue())))}
                          </div>}
                          {showSundayHours && <div style={{marginBottom: '5px', paddingLeft: '10px'}}>
                            Sunday / Holiday: {formatCurrency(Math.ceil(getSundayFinalValue() * paymentTermFactors.net90) + Math.ceil(getSundayFinalValue() * getMobilizationFactor(getSundayFinalValue())))}
                          </div>}
                          <div style={{marginBottom: '10px', marginTop: '8px'}}>
                            Mobilization costs of <b>${(() => { const f = getFinalValue(); const factor = getMobilizationFactor(f); return formatCurrency(Math.ceil(f * factor)); })()}</b> shall be paid out of the above agreed upon price before the first day of work.
                          </div>
                          {showTravel && (
                            <div style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)'}}>
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>Total Travel Cost:</div>
                              <div style={{fontSize: '16px', fontWeight: 'bold'}}>
                                {formatCurrency(getTotalTravelCost())}
                              </div>
                              <div style={{fontSize: '11px', color: 'var(--text-color)', opacity: 0.7, marginTop: '4px'}}>
                                Travel Labor: {formatCurrency(getTravelLaborCost())} &nbsp;|&nbsp; Non-Labor: {formatCurrency(getTravelNonLaborCost())}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Quote Selection Modal */}
      {isQuoteSelectOpen && (
        <Dialog open={isQuoteSelectOpen}         onClose={() => {
          setIsQuoteSelectOpen(false);
          setSingleLetterScopeQuantity(1);
          setIncludeMobilizationWhenZero(false);
          // Reset mode to allow immediate reopening
          if (mode === 'letter') {
            // Use a timeout to reset the mode, allowing immediate reopening
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('resetEstimateMode'));
            }, 100);
          }
        }} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold mb-4">Select a Quote</h2>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm text-gray-700">Scope Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={singleLetterScopeQuantity}
                  onChange={(e) => {
                    const qty = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    setSingleLetterScopeQuantity(qty);
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <label className="flex items-center cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={includeMobilizationWhenZero}
                  onChange={(e) => setIncludeMobilizationWhenZero(e.target.checked)}
                  className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Include mobilization in letter even when $0</span>
              </label>
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Work Schedule Pricing in Letter</p>
                <div className="space-y-1.5">
                  <label className="flex items-center cursor-pointer">
                    <input type="checkbox" checked={letterIncludeMF} onChange={(e) => setLetterIncludeMF(e.target.checked)} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                    <span className="text-sm text-gray-700">Monday - Friday</span>
                  </label>
                  <label className={`flex items-center ${showSaturdayHours ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input type="checkbox" checked={letterIncludeSaturday} onChange={(e) => setLetterIncludeSaturday(e.target.checked)} disabled={!showSaturdayHours} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                    <span className="text-sm text-gray-700">Saturday{!showSaturdayHours ? ' (enable Saturday table first)' : ''}</span>
                  </label>
                  <label className={`flex items-center ${showSundayHours ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input type="checkbox" checked={letterIncludeSunday} onChange={(e) => setLetterIncludeSunday(e.target.checked)} disabled={!showSundayHours} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                    <span className="text-sm text-gray-700">Sunday / Holiday{!showSundayHours ? ' (enable Sunday table first)' : ''}</span>
                  </label>
                </div>
              </div>
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Payment Terms in Letter</p>
                <label className="flex items-center cursor-pointer mb-2">
                  <input type="checkbox" checked={letterShowAllTerms} onChange={(e) => setLetterShowAllTerms(e.target.checked)} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                  <span className="text-sm text-gray-700">Show all payment terms (NET 30, 60, 90)</span>
                </label>
                {!letterShowAllTerms && (
                  <select
                    value={letterPaymentTerm}
                    onChange={(e) => setLetterPaymentTerm(e.target.value as 'net30' | 'net60' | 'net90')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                  >
                    <option value="net30">NET 30</option>
                    <option value="net60">NET 60</option>
                    <option value="net90">NET 90</option>
                  </select>
                )}
              </div>
            </div>
            <ul>
              {quotes.map((q, idx) => (
                <li key={q.id} className="mb-2 flex items-center justify-between">
                  <span>{(function(){
                    try {
                      const parsed = typeof q.data === 'string' ? JSON.parse(q.data) : q.data || {};
                      const customTitle = parsed?.title?.trim();
                      if (customTitle) return customTitle;
                    } catch {}
                    return `Quote ${(opportunityData as any)?.quote_number || q.id?.slice(0,6) || (idx + 1)}`;
                  })()} - {q.created_at?.slice(0,10)}</span>
                  <Button onClick={() => handleSelectQuoteForLetter(idx)} className="bg-[#f26722] text-white ml-2">Select</Button>
                </li>
              ))}
            </ul>
            <Button onClick={() => {
              setIsQuoteSelectOpen(false);
              setSingleLetterScopeQuantity(1);
              setIncludeMobilizationWhenZero(false);
              // Reset mode to allow immediate reopening
              if (mode === 'letter') {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                }, 100);
              }
            }} className="mt-4">Cancel</Button>
          </div>
        </Dialog>
      )}

      {/* Combined Quote Selection Modal */}
      {isCombinedQuoteSelectOpen && (
        <Dialog open={isCombinedQuoteSelectOpen} onClose={() => {
          setIsCombinedQuoteSelectOpen(false);
          setSelectedQuotesForCombined([]);
          setScopeQuantities({});
          setShowIndividualPricing(true);
          setShowGrandTotalPricing(true);
          setIncludeMobilizationWhenZero(false);
          // Reset mode to allow immediate reopening
          if (mode === 'combined-letter') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('resetEstimateMode'));
            }, 100);
          }
        }} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full">
            <h2 className="text-lg font-bold mb-4">Select Multiple Quotes for Combined Letter</h2>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Select the quotes you want to include in the combined letter proposal:</p>
            </div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing Options:</p>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showIndividualPricing}
                    onChange={(e) => setShowIndividualPricing(e.target.checked)}
                    className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Show individual pricing for each scope</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGrandTotalPricing}
                    onChange={(e) => setShowGrandTotalPricing(e.target.checked)}
                    className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Show grand total pricing for all scope</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMobilizationWhenZero}
                    onChange={(e) => setIncludeMobilizationWhenZero(e.target.checked)}
                    className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Include mobilization in letter even when $0</span>
                </label>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Work Schedule Pricing in Letter</p>
                  <div className="space-y-1.5">
                    <label className="flex items-center cursor-pointer">
                      <input type="checkbox" checked={letterIncludeMF} onChange={(e) => setLetterIncludeMF(e.target.checked)} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Monday - Friday</span>
                    </label>
                    <label className={`flex items-center ${showSaturdayHours ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input type="checkbox" checked={letterIncludeSaturday} onChange={(e) => setLetterIncludeSaturday(e.target.checked)} disabled={!showSaturdayHours} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Saturday{!showSaturdayHours ? ' (enable table first)' : ''}</span>
                    </label>
                    <label className={`flex items-center ${showSundayHours ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input type="checkbox" checked={letterIncludeSunday} onChange={(e) => setLetterIncludeSunday(e.target.checked)} disabled={!showSundayHours} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Sunday / Holiday{!showSundayHours ? ' (enable table first)' : ''}</span>
                    </label>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payment Terms in Letter</p>
                  <label className="flex items-center cursor-pointer mb-2">
                    <input type="checkbox" checked={letterShowAllTerms} onChange={(e) => setLetterShowAllTerms(e.target.checked)} className="mr-2 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Show all payment terms (NET 30, 60, 90)</span>
                  </label>
                  {!letterShowAllTerms && (
                    <select
                      value={letterPaymentTerm}
                      onChange={(e) => setLetterPaymentTerm(e.target.value as 'net30' | 'net60' | 'net90')}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white dark:bg-dark-100 dark:text-white dark:border-gray-600"
                    >
                      <option value="net30">NET 30</option>
                      <option value="net60">NET 60</option>
                      <option value="net90">NET 90</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {quotes.map((q, idx) => (
                <div key={q.id} className="mb-3 flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center flex-1">
                    <input
                      type="checkbox"
                      id={`quote-${idx}`}
                      checked={selectedQuotesForCombined.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQuotesForCombined(prev => [...prev, idx]);
                          // Default scope quantity from estimate sheet (combinedLetterQuantity), else 1
                          let qty = 1;
                          try {
                            const parsed = typeof q.data === 'string' ? JSON.parse(q.data) : q.data || {};
                            if (parsed.combinedLetterQuantity !== undefined && parsed.combinedLetterQuantity !== null) {
                              qty = Math.max(1, Math.floor(Number(parsed.combinedLetterQuantity)) || 1);
                            }
                          } catch (_) {}
                          setScopeQuantities(prev => ({
                            ...prev,
                            [idx]: qty
                          }));
                        } else {
                          setSelectedQuotesForCombined(prev => prev.filter(i => i !== idx));
                          // Remove scope quantity when unselected
                          setScopeQuantities(prev => {
                            const updated = { ...prev };
                            delete updated[idx];
                            return updated;
                          });
                        }
                      }}
                      className="mr-3 h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                    />
                    <label htmlFor={`quote-${idx}`} className="text-sm font-medium text-gray-900 cursor-pointer">
                      {(function(){
                        try {
                          const parsed = typeof q.data === 'string' ? JSON.parse(q.data) : q.data || {};
                          const customTitle = parsed?.title?.trim();
                          if (customTitle) return customTitle;
                        } catch {}
                        return `Quote ${(opportunityData as any)?.quote_number || q.id?.slice(0,6) || (idx + 1)}`;
                      })()} - {q.created_at?.slice(0,10)}
                    </label>
                  </div>
                  {selectedQuotesForCombined.includes(idx) && (
                    <div className="flex items-center gap-2 ml-4">
                      <label className="text-sm text-gray-700">Scope Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={scopeQuantities[idx] || 1}
                        onChange={(e) => {
                          const qty = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setScopeQuantities(prev => ({
                            ...prev,
                            [idx]: qty
                          }));
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <Button onClick={() => {
                setIsCombinedQuoteSelectOpen(false);
                setSelectedQuotesForCombined([]);
                setScopeQuantities({});
                setShowIndividualPricing(true);
                setShowGrandTotalPricing(true);
                setIncludeMobilizationWhenZero(false);
                // Reset mode to allow immediate reopening
                if (mode === 'combined-letter') {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                  }, 100);
                }
              }} className="bg-gray-500 text-white">Cancel</Button>
              <Button 
                onClick={() => handleSelectQuotesForCombinedLetter()} 
                disabled={selectedQuotesForCombined.length === 0}
                className="bg-[#f26722] text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Generate Combined Letter ({selectedQuotesForCombined.length} selected)
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Saved Letters Modal */}
      {isLettersListOpen && (
        <Dialog open={isLettersListOpen} onClose={() => {
          setIsLettersListOpen(false);
          // Reset mode to allow immediate reopening
          if (mode === 'letters') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('resetEstimateMode'));
            }, 100);
          }
        }} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
            <h2 className="text-lg font-bold mb-4">Saved Letter Proposals</h2>
            {letters.length === 0 ? (
              <div className="text-sm text-gray-500">No saved letters yet.</div>
            ) : (
              <ul className="divide-y">
                {letters.map((l, idx) => (
                  <li key={l.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{(l as any).title || `Letter # ${((opportunityData as any)?.quote_number || (idx + 1))}`}</div>
                      <div className="text-xs text-gray-500">{l.created_at?.slice(0,10)}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={async () => {
                        try {
                          const baseTitle = (l as any).title || `Letter # ${((opportunityData as any)?.quote_number || (idx + 1))}`;
                          const newTitle = `${baseTitle} - Copy`;
                          const payload: any = {
                            opportunity_id: opportunityId,
                            title: newTitle,
                            html: l.html,
                            created_at: new Date().toISOString(),
                            quote_number: (opportunityData as any)?.quote_number || null,
                            neta_standard: (l as any)?.neta_standard || null,
                          };
                          const { data: inserted, error: dupErr } = await supabase
                            .schema('business')
                            .from('letter_proposals')
                            .insert(payload)
                            .select('*')
                            .single();
                          if (dupErr) throw dupErr;
                          // Prepend the new copy to the list (newest first)
                          setLetters(prev => [inserted as any, ...prev]);
                        } catch (e: any) {
                          alert('Failed to duplicate: ' + (e?.message || 'Unknown error'));
                        }
                      }} className="bg-blue-600 text-white hover:bg-blue-700">Duplicate</Button>
                      <Button onClick={() => {
                        setIsLettersListOpen(false);
                        setIsLetterProposalOpen(true);
                        const normalized = normalizePricingTermsHtml(l.html);
                        setLetterHtml(normalized);
                        savedLetterHtmlRef.current = normalized;
                        setIsLetterDirty(false);
                        setCurrentLetterId(l.id);
                        setNetaStandard(l.neta_standard || '');
                        setLetterProposalName((l as any).title || ''); // Populate the name field
                      }} className="bg-[#f26722] text-white">Open</Button>
                      <Button onClick={async () => {
                        if (!confirm('Delete this saved letter?')) return;
                        try {
                          const { error } = await supabase
                            .schema('business')
                            .from('letter_proposals')
                            .delete()
                            .eq('id', l.id);
                          if (error) throw error;
                          setLetters(prev => prev.filter(item => item.id !== l.id));
                          if (currentLetterId === l.id) {
                            setCurrentLetterId(null);
                            setIsLetterProposalOpen(false);
                            setIsLetterDirty(false);
                            savedLetterHtmlRef.current = "";
                          }
                        } catch (e: any) {
                          alert('Failed to delete: ' + (e?.message || 'Unknown error'));
                        }
                      }} className="bg-red-600 text-white">Delete</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <Button onClick={() => {
                setIsLettersListOpen(false);
                // Reset mode to allow immediate reopening
                if (mode === 'letters') {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                  }, 100);
                }
              }}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Letter Proposal Modal */}
      <Dialog open={isLetterProposalOpen} onClose={handleCloseLetterProposal} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40" onClick={handleCloseLetterProposal} />
        <div className="relative z-50 bg-white w-full h-full max-w-5xl mx-auto my-8 rounded-lg shadow-lg flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold">Letter Proposal</h2>
              <div className="flex gap-2">
              {currentLetterId ? (
                <Button onClick={async () => {
                  if (!confirm('Delete this saved letter?')) return;
                  try {
                    const { error } = await supabase
                      .schema('business')
                      .from('letter_proposals')
                      .delete()
                      .eq('id', currentLetterId);
                    if (error) throw error;
                    // Update the letters list to remove the deleted letter
                    setLetters(prev => prev.filter(item => item.id !== currentLetterId));
                    setCurrentLetterId(null);
                    setIsLetterProposalOpen(false);
                    setIsLetterDirty(false);
                    savedLetterHtmlRef.current = "";
                    setLetterProposalName(''); // Clear the letter name
                    // Clear letter proposal state when deleting
                    clearLetterProposalState();
                    // Reset mode to allow immediate reopening
                    if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                      }, 100);
                    }
                    alert('Letter deleted successfully');
                  } catch (e: any) {
                    alert('Failed to delete letter: ' + (e?.message || 'Unknown error'));
                  }
                }} className="bg-red-600 text-white hover:bg-red-700">Delete Letter</Button>
              ) : null}
              <Button onClick={async () => {
                try {
                  const sourceHtml = (letterEditorRef.current?.innerHTML || letterHtml || '').trim();
                  if (!sourceHtml) {
                    alert('Nothing to save. Please generate a letter first.');
                    return;
                  }

                  // Use the letterProposalName from the input field (optional)
                  const customName = letterProposalName.trim();

                  const container = document.createElement('div');
                  container.innerHTML = sourceHtml;
                  // Sync any input current values to their value attributes before saving HTML
                  try {
                    Array.from(container.querySelectorAll('input')).forEach((el: any) => {
                      if (el && typeof el.value === 'string') {
                        el.setAttribute('value', el.value);
                      }
                    });
                  } catch {}
                  // Ensure selected NETA standard text is reflected in the letter before saving
                  try {
                    const sel = container.querySelector('#neta-standard-select') as HTMLSelectElement | null;
                    const txt = container.querySelector('#neta-standard-text') as HTMLElement | null;
                    if (sel && txt) {
                      const selected = sel.options[sel.selectedIndex]?.text || '';
                      if (selected) txt.textContent = selected;
                    }
                  } catch {}

                  const htmlToSave = container.innerHTML;

                  const payload = {
                    opportunity_id: opportunityId,
                    title: customName.length > 0 ? customName : `Letter Proposal - ${opportunityData?.title || 'Untitled'}`,
                    html: htmlToSave,
                    created_at: new Date().toISOString(),
                    quote_number: (opportunityData as any)?.quote_number || null,
                    neta_standard: netaStandard,
                  } as any;

                  // Compute a NET 30 price for quoted_amount fallback, honoring per-scope quantities
                  let computedNet30: number = 0;
                  try {
                    // 1) Prefer combined grand total if present (already quantity-adjusted by UI)
                    const grand = container.querySelector('.grand-price[data-kind="net30"]') as HTMLElement | null;
                    const grandBaseAttr = grand?.getAttribute('data-base');
                    if (grandBaseAttr) {
                      const v = Number(grandBaseAttr.replace(/,/g, '')) || 0;
                      computedNet30 = Math.round(v * 100) / 100;
                    }
                    // If no data-base, try text content under the Grand Total Pricing block
                    if ((!computedNet30 || computedNet30 <= 0)) {
                      const grandHeader = Array.from(container.querySelectorAll('b')).find(el => (el.textContent || '').trim() === 'Grand Total Pricing');
                      if (grandHeader) {
                        const block = grandHeader.closest('.amp-scope-block') || grandHeader.parentElement?.parentElement || grandHeader.parentElement;
                        if (block) {
                          const liNet30 = Array.from(block.querySelectorAll('li')).find(li => /NET\s*30/i.test(li.textContent || '')) as HTMLElement | undefined;
                          if (liNet30) {
                            const match = (liNet30.textContent || '').match(/\$([0-9,]+\.?[0-9]*)/);
                            if (match && match[1]) {
                              const v = Number(match[1].replace(/,/g, '')) || 0;
                              computedNet30 = Math.round(v * 100) / 100;
                            }
                          }
                        }
                      }
                    }

                    // 2) If no grand total, sum per-scope base prices * nearest scope qty
                    if (!computedNet30 || computedNet30 <= 0) {
                      const scopePrices = Array.from(container.querySelectorAll('.scope-price[data-kind="net30"]')) as HTMLElement[];
                      if (scopePrices.length > 0) {
                        let sum = 0;
                        scopePrices.forEach((el) => {
                          const baseAttr = el.getAttribute('data-base') || '0';
                          const base = Number((baseAttr || '0').replace(/,/g, '')) || 0;
                          // find closest scope qty input within the same scope block
                          const block = el.closest('.amp-section')?.parentElement || el.parentElement as HTMLElement | null;
                          let qtyEl = block?.querySelector('input.scope-qty') as HTMLInputElement | null;
                          if (!qtyEl) {
                            // global fallback
                            qtyEl = container.querySelector('input.scope-qty') as HTMLInputElement | null;
                          }
                          const qtyRaw = qtyEl?.getAttribute('value') || qtyEl?.value || '1';
                          const qty = Math.max(1, parseInt(qtyRaw || '1', 10) || 1);
                          sum += base * qty;
                        });
                        computedNet30 = Math.round(sum * 100) / 100;
                      }
                    }
                    // Final fallback: scan all NET 30 amounts and take the largest (covers single/multi blocks)
                    if (!computedNet30 || computedNet30 <= 0) {
                      const net30Lis = Array.from(container.querySelectorAll('li')) as HTMLElement[];
                      let best = 0;
                      net30Lis.forEach(li => {
                        const txt = (li.textContent || '').trim();
                        if (/NET\s*30/i.test(txt)) {
                          const m = txt.match(/\$([0-9,]+\.?[0-9]*)/);
                          if (m && m[1]) {
                            const v = Number(m[1].replace(/,/g, '')) || 0;
                            if (v > best) best = v;
                          }
                        }
                      });
                      if (best > 0) computedNet30 = Math.round(best * 100) / 100;
                    }
                  } catch {}
                  
                  const extractNet30FromHtml = (html: string): number => {
                    try {
                      const doc = document.implementation.createHTMLDocument('letter-parse');
                      const tmp = doc.createElement('div');
                      tmp.innerHTML = html || '';
                      // 1) Grand total data-base
                      const grand = tmp.querySelector('.grand-price[data-kind="net30"]') as HTMLElement | null;
                      const baseAttr = grand?.getAttribute('data-base');
                      if (baseAttr) {
                        const v = Number(baseAttr.replace(/,/g, '')) || 0;
                        if (v > 0) return Math.round(v * 100) / 100;
                      }
                      // 2) Grand Total Pricing block text
                      const grandHeader = Array.from(tmp.querySelectorAll('b')).find(el => (el.textContent || '').trim() === 'Grand Total Pricing');
                      if (grandHeader) {
                        const block = (grandHeader.closest('.amp-scope-block') || grandHeader.parentElement?.parentElement || grandHeader.parentElement) as HTMLElement | null;
                        if (block) {
                          const liNet30 = Array.from(block.querySelectorAll('li')).find(li => /NET\s*30/i.test(li.textContent || '')) as HTMLElement | undefined;
                          if (liNet30) {
                            const m = (liNet30.textContent || '').match(/\$([0-9,]+\.?[0-9]*)/);
                            if (m && m[1]) {
                              const v = Number(m[1].replace(/,/g, '')) || 0;
                              if (v > 0) return Math.round(v * 100) / 100;
                            }
                          }
                        }
                      }
                      // 3) Max NET 30 across all list items
                      const net30Lis = Array.from(tmp.querySelectorAll('li')) as HTMLElement[];
                      let best = 0;
                      net30Lis.forEach(li => {
                        const txt = (li.textContent || '').trim();
                        if (/NET\s*30/i.test(txt)) {
                          const m = txt.match(/\$([0-9,]+\.?[0-9]*)/);
                          if (m && m[1]) {
                            const v = Number(m[1].replace(/,/g, '')) || 0;
                            if (v > best) best = v;
                          }
                        }
                      });
                      if (best > 0) return Math.round(best * 100) / 100;
                    } catch {}
                    return 0;
                  };

                  const updateOpportunityFromLetter = async (proposalId: string | null, net30: number) => {
                    try {
                      const payload: any = { selected_letter_proposal: proposalId };
                      // Always set quoted_amount from the most recent letter proposal when saving
                      if (net30 && net30 > 0) {
                        payload.quoted_amount = net30;
                      }
                      const { error: oppErr } = await supabase
                        .schema('business')
                        .from('opportunities')
                        .update(payload)
                        .eq('id', opportunityId);
                      if (oppErr) {
                        console.warn('Failed to sync opportunity from letter:', oppErr);
                      }
                    } catch (e) {
                      console.warn('Opportunity sync exception:', e);
                    }
                  };

                  if (currentLetterId) {
                    const { error } = await supabase
                      .schema('business')
                      .from('letter_proposals')
                      .update(payload)
                      .eq('id', currentLetterId);
                    if (error) throw error;
                    
                    // Update the letters list with the new title
                    setLetters(prev => prev.map(letter => 
                      letter.id === currentLetterId 
                        ? { ...letter, title: payload.title, html: payload.html, neta_standard: payload.neta_standard }
                        : letter
                    ));
                    
                    // Re-read saved HTML to ensure we match the persisted letter
                    let net30Saved = computedNet30;
                    try {
                      const { data: savedLetter } = await supabase
                        .schema('business')
                        .from('letter_proposals')
                        .select('html')
                        .eq('id', currentLetterId)
                        .single();
                      if (savedLetter?.html) {
                        const v = extractNet30FromHtml(String(savedLetter.html));
                        if (v && v > 0) net30Saved = v;
                      }
                    } catch {}
                    await updateOpportunityFromLetter(currentLetterId, net30Saved);
                    
                    // Update letter proposal date and notify parent when letter is saved
                    updateLetterProposalCreatedDate();
                    
                    // Reload the saved letter to ensure it's ready to print
                    try {
                      const { data: savedLetterData } = await supabase
                        .schema('business')
                        .from('letter_proposals')
                        .select('html, title, neta_standard')
                        .eq('id', currentLetterId)
                        .single();
                      
                      if (savedLetterData) {
                        const savedHtml = normalizePricingTermsHtml(savedLetterData.html || letterHtml);
                        setLetterHtml(savedHtml);
                        savedLetterHtmlRef.current = savedHtml;
                        setIsLetterDirty(false);
                        if (savedLetterData.title) {
                          setLetterProposalName(savedLetterData.title);
                        }
                        if (savedLetterData.neta_standard) {
                          setNetaStandard(savedLetterData.neta_standard);
                        }
                        // Refresh the letters list
                        const { data: updatedLetters } = await supabase
                          .schema('business')
                          .from('letter_proposals')
                          .select('id, title, html, created_at, quote_number, neta_standard')
                          .eq('opportunity_id', opportunityId)
                          .order('created_at', { ascending: false });
                        if (updatedLetters) {
                          setLetters(updatedLetters as any);
                        }
                      }
                    } catch (e) {
                      console.error('Error reloading saved letter:', e);
                    }
                    
                    // Keep the letter proposal open so user can print it
                    // No alert or prompt - just keep it open
                  } else {
                    const { data: inserted, error } = await supabase
                      .schema('business')
                      .from('letter_proposals')
                      .insert(payload)
                      .select('id')
                      .single();
                    if (error) throw error;
                    setCurrentLetterId(inserted?.id || null);
                    // Re-read saved HTML to ensure we match the persisted letter
                    let net30Saved2 = computedNet30;
                    try {
                      const { data: savedLetter2 } = await supabase
                        .schema('business')
                        .from('letter_proposals')
                        .select('html')
                        .eq('id', inserted?.id || '')
                        .single();
                      if (savedLetter2?.html) {
                        const v = extractNet30FromHtml(String(savedLetter2.html));
                        if (v && v > 0) net30Saved2 = v;
                      }
                    } catch {}
                    await updateOpportunityFromLetter(inserted?.id || null, net30Saved2);
                    
                    // Update letter proposal date and notify parent when letter is saved
                    updateLetterProposalCreatedDate();
                    
                    // Reload the saved letter to ensure it's ready to print
                    try {
                      const { data: savedLetterData } = await supabase
                        .schema('business')
                        .from('letter_proposals')
                        .select('html, title, neta_standard')
                        .eq('id', inserted?.id || '')
                        .single();
                      
                      if (savedLetterData) {
                        const savedHtml = normalizePricingTermsHtml(savedLetterData.html || letterHtml);
                        setLetterHtml(savedHtml);
                        savedLetterHtmlRef.current = savedHtml;
                        setIsLetterDirty(false);
                        if (savedLetterData.title) {
                          setLetterProposalName(savedLetterData.title);
                        }
                        if (savedLetterData.neta_standard) {
                          setNetaStandard(savedLetterData.neta_standard);
                        }
                        // Refresh the letters list to include the new letter
                        const { data: updatedLetters } = await supabase
                          .schema('business')
                          .from('letter_proposals')
                          .select('id, title, html, created_at, quote_number, neta_standard')
                          .eq('opportunity_id', opportunityId)
                          .order('created_at', { ascending: false });
                        if (updatedLetters) {
                          setLetters(updatedLetters as any);
                        }
                      }
                    } catch (e) {
                      console.error('Error reloading saved letter:', e);
                    }
                    
                    // Keep the letter proposal open so user can print it
                    // No alert or prompt - just keep it open
                  }
                } catch (e: any) {
                  console.error('Save letter failed', e);
                  alert('Failed to save letter: ' + (e?.message || 'Unknown error'));
                }
              }} className="bg-[#f26722] text-white">Save Letter</Button>
              <Button onClick={handlePrintLetter} className="bg-[#f26722] text-white">Print</Button>
              <Button onClick={handleCloseLetterProposal}>Close</Button>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2 border-t px-4">
            <label htmlFor="letter-name" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Letter Name (optional):
            </label>
            <input
              id="letter-name"
              type="text"
              value={letterProposalName}
              onChange={(e) => setLetterProposalName(e.target.value)}
              placeholder={`Letter Proposal - ${opportunityData?.title || 'Untitled'}`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] text-sm bg-white"
            />
          </div>
        </div>
          {/* Inline control bar, confined to the same width as the letter content */}
          <div className="p-3 border-b bg-gray-50">
            <div className="flex items-center gap-2" style={{ maxWidth: 900, margin: '0 auto' }}>
              <span className="text-sm font-medium">NETA Standard:</span>
              <select
                value={netaStandard}
                onChange={(e) => applyNetaTextByValue(e.target.value)}
                className="border rounded px-2 py-1 w-full"
              >
                {NETA_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.text}</option>
                ))}
              </select>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsScopeNotesModalOpen(true);
                }}
                variant="outline"
                size="sm"
                className="whitespace-nowrap border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white"
              >
                Scope Notes
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8" style={{ background: '#f9f9f9' }}>
            <div
              ref={letterEditorRef}
              contentEditable
              suppressContentEditableWarning
              style={{ minHeight: '1000px', outline: 'none', background: 'white', padding: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', maxWidth: 900, margin: '0 auto' }}
              onInput={e => {
                letterUpdateSourceRef.current = 'user';
                const newHtml = (e.target as HTMLElement).innerHTML;
                if (newHtml !== letterHtml) {
                  setLetterHtml(newHtml);
                  if (newHtml.trim() !== savedLetterHtmlRef.current.trim()) {
                    setIsLetterDirty(true);
                  }
                }
              }}
              onBlur={() => {}}
            />
          </div>

          {/* Scope Notes Modal - rendered inside Letter Proposal so opening it doesn't close the parent */}
          <ProposalScopeNotesModal
        isOpen={isScopeNotesModalOpen}
        onClose={() => setIsScopeNotesModalOpen(false)}
        onInsert={(notesHtml: string) => {
          if (!letterEditorRef.current) return;
          const editorEl = letterEditorRef.current;
          const currentHtml = editorEl.innerHTML;
          
          // Strategy: Insert scope notes after the Item & Quantity table(s)
          // Look for the last </table> before pricing, or after the scope section
          const container = document.createElement('div');
          container.innerHTML = currentHtml;
          
          // Check if scope notes section already exists - append to it
          const existingScopeNotes = container.querySelector('.scope-notes-section');
          if (existingScopeNotes) {
            // Append new notes to the existing list
            const existingUl = existingScopeNotes.querySelector('ul');
            if (existingUl) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = notesHtml;
              const newUl = tempDiv.querySelector('ul');
              if (newUl) {
                Array.from(newUl.children).forEach(li => {
                  existingUl.appendChild(li.cloneNode(true));
                });
              }
            }
          } else {
            // Find the best insertion point: after the last scope table, before pricing
            // For combined letters, look for the last .amp-scope-block
            const scopeBlocks = container.querySelectorAll('.amp-scope-block');
            const tables = container.querySelectorAll('table.amp-section');
            
            // Create the notes element
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = notesHtml;
            const notesElement = tempDiv.firstElementChild;
            
            if (notesElement) {
              if (scopeBlocks.length > 0) {
                // Combined letter: insert after the last scope block
                const lastScopeBlock = scopeBlocks[scopeBlocks.length - 1];
                lastScopeBlock.parentNode?.insertBefore(notesElement, lastScopeBlock.nextSibling);
              } else if (tables.length > 0) {
                // Single letter: insert after the last table
                const lastTable = tables[tables.length - 1];
                lastTable.parentNode?.insertBefore(notesElement, lastTable.nextSibling);
              } else {
                // Fallback: append to the letter content
                const letterDiv = container.querySelector('#letter-proposal') || container;
                // Find the Pricing & Terms section and insert before it
                const pricingHeaders = Array.from(container.querySelectorAll('b')).filter(
                  el => (el.textContent || '').trim() === 'Pricing & Terms'
                );
                if (pricingHeaders.length > 0) {
                  const pricingSection = pricingHeaders[0].closest('.amp-section') || pricingHeaders[0].parentElement;
                  if (pricingSection) {
                    pricingSection.parentNode?.insertBefore(notesElement, pricingSection);
                  } else {
                    letterDiv.appendChild(notesElement);
                  }
                } else {
                  letterDiv.appendChild(notesElement);
                }
              }
            }
          }
          
          const newHtml = container.innerHTML;
          letterUpdateSourceRef.current = 'programmatic';
          setLetterHtml(newHtml);
          editorEl.innerHTML = newHtml;
          setIsLetterDirty(true);
        }}
        userId={user?.id}
      />
        </div>
      </Dialog>
    </div>
  );
} 