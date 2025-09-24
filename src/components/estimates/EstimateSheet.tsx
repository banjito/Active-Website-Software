import React, { useState, useEffect, useRef } from 'react';
import { Tab, Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/AuthContext';

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
  description: string;
  quote_number?: string;
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
  numVehicles: 1,
  totalMiles: 0,
  rate: 3.00,
  vehicleTravelCost: 0
};

interface QuoteData {
  id: string;
  created_at: string;
  data: any;
  travel_data: any;
  quote_number?: string;
}

export default function EstimateSheet({ opportunityId, mode, openSignal }: EstimateSheetProps) {
  const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const [isOpen, setIsOpen] = useState(true);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [selectedQuoteIndex, setSelectedQuoteIndex] = useState<number>(-1);
  const [isNewQuote, setIsNewQuote] = useState(true);
  const [hasQuote, setHasQuote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [isGettingData, setIsGettingData] = useState(true);
  const [opportunityData, setOpportunityData] = useState<OpportunityData | null>(null);
  const [isManualLaborHours, setIsManualLaborHours] = useState(false);
  const { user } = useAuth(); // Get user at component level

  // State for the travel data object
  const [travelData, setTravelData] = useState({
    travelExpense: [{ ...EMPTY_TRAVEL_ITEM }],
    travelTime: [{
      trips: 1,
      oneWayHours: 0,
      roundTripHours: 0,
      totalTravelHours: 0,
      numMen: 2,
      grandTotalTravelHours: 0,
      rate: 240.00,
      totalTravelLabor: 0
    }],
    perDiem: [{
      numDays: 0,
      firstDayRate: 65.00,
      lastDayRate: 65.00,
      dailyRate: 65.00,
      additionalDays: -2,
      totalPerDiemPerMan: 0,
      numMen: 2,
      totalPerDiem: 0
    }],
    lodging: [{
      numNights: 0,
      numMen: 2,
      manNights: 0,
      rate: 210.00,
      totalAmount: 0
    }],
    localMiles: [{
      numDays: 0,
      numVehicles: 1,
      milesPerDay: 50,
      totalMiles: 0,
      rate: 3.00,
      totalLocalMilesCost: 0
    }],
    flights: [{
      numFlights: 0,
      numMen: 2,
      rate: 600.00,
      luggageFees: 50.00,
      totalFlightAmount: 0
    }],
    airTravelTime: [{
      trips: 0,
      oneWayHoursInAir: 0,
      roundTripTerminalTime: 0,
      totalTravelHours: 0,
      numMen: 0,
      grandTotalTravelHours: 0,
      rate: 240.00,
      totalTravelLabor: 0
    }],
    rentalCar: [{
      numCars: 0,
      rate: 750.00,
      totalAmount: 0
    }]
  });

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
        men: 2,
        hoursPerDay: 8,
        daysOnsite: 0,
        workHours: 0,
        nonSovHours: 0,
        travelHours: 0,
        totalHours: 0,
        straightTimeHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0
      }
    };
    try {
      const raw = localStorage.getItem(`estimate-draft-${opportunityId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...defaults, ...parsed } as EstimateData;
        }
      }
    } catch {}
    return defaults;
  });

  // Track fields temporarily displayed as blank (for backspace over 0)
  const [blankingKeys, setBlankingKeys] = useState<Set<string>>(new Set());
  const makeKey = (section: 'sov' | 'nonSov', index: number, field: string) => `${section}:${index}:${field}`;
  
  // Drag and drop state
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [draggedItemType, setDraggedItemType] = useState<'sov' | 'nonSov' | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
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
  const draftKey = `estimate-draft-${opportunityId}`;
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  const [itemColWidth, setItemColWidth] = useState<number>(240);
  const [nonSovItemColWidth, setNonSovItemColWidth] = useState<number>(240);
  const itemHeaderRef = useRef<HTMLTableCellElement>(null);
  const nonSovItemHeaderRef = useRef<HTMLTableCellElement>(null);
  const isResizingItemRef = useRef(false);
  const isResizingNonSovRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const startNonSovWidthRef = useRef(0);

  const onItemMouseDown = (e: React.MouseEvent) => {
    if (!itemHeaderRef.current) return;
    isResizingItemRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = itemColWidth;
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isResizingItemRef.current) {
      const delta = e.clientX - startXRef.current;
      const next = Math.max(120, Math.min(600, startWidthRef.current + delta));
      setItemColWidth(next);
    } else if (isResizingNonSovRef.current) {
      const delta = e.clientX - startXRef.current;
      const next = Math.max(120, Math.min(600, startNonSovWidthRef.current + delta));
      setNonSovItemColWidth(next);
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
  };
  
  // Fetch opportunity data
  useEffect(() => {
    async function fetchOpportunityData() {
      try {
        // 1. Fetch Opportunity from business schema
        const opportunityColumns = 'id, description, customer_id, contact_id, quote_number';
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
          description: oppData.description || '',
          quote_number: (oppData as any).quote_number || '',
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

  // Restore draft from localStorage when opening 'new' estimate for this opportunity
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            // Extract payment term factors if they exist
            const { paymentTermFactors: savedFactors, mobilizationFactors: savedMobilization, ...restData } = parsed;
            
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
            
            setDraftRestored(true);
          }
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNewQuote, opportunityId]);

  // Persist draft on changes while editing a new quote
  useEffect(() => {
    if (!opportunityId) return;
    if (isOpen && isNewQuote) {
      try {
        const draftData = {
          ...data,
          paymentTermFactors,
          mobilizationFactors
        };
        localStorage.setItem(draftKey, JSON.stringify(draftData));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, paymentTermFactors, mobilizationFactors, isOpen, isNewQuote, opportunityId]);

  async function fetchEstimateData() {
    try {
      const { data: quoteData, error } = await supabase
        .schema('business')
        .from('estimates')
        .select('id, created_at, data, travel_data')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching estimates:', error);
        return;
      }

      if (quoteData && quoteData.length > 0) {
        // Load the most recent quote
        loadQuoteData(quoteData[0]);
        setQuotes(quoteData);
        setSelectedQuoteIndex(0);
        setIsNewQuote(false);
        setHasQuote(true);
      } else {
        // No existing quotes, set up for a new one
        setHasQuote(false);
        setIsNewQuote(true);
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
        .select('id, created_at, data, travel_data')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching quotes list:', error);
        setQuotes([]);
        return;
      }
      
      setQuotes(data || []);
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
  // Function to calculate default labor hours using the formula
  const calculateDefaultLaborHours = (data: any) => {
    const men = data.hoursSummary.men || 2;
    const hoursPerDay = data.hoursSummary.hoursPerDay || 8;
    
    // Calculate total SOV labor hours from the SOV items
    let sovLaborHours = 0;
    if (data.sovItems) {
      sovLaborHours = data.sovItems.reduce((total: number, item: any) => {
        return total + (calculateLaborUnit(item.laborMen, item.laborHours) * item.quantity);
      }, 0);
    }
    
    // Calculate days onsite from SOV labor hours
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
          men: 2,
          hoursPerDay: 8,
          daysOnsite: 0,
          workHours: 0,
          nonSovHours: 0,
          travelHours: 0,
          totalHours: 0,
          straightTimeHours: 0,
          overtimeHours: 0,
          doubleTimeHours: 0,
          ...(parsedData.hoursSummary || {})
        }
        };
        
        setData(completeData);
        
        // Debug: Log what's being loaded
        console.log('Loading quote data:', {
          hoursSummary: completeData.hoursSummary,
          parsedHoursSummary: parsedData.hoursSummary
        });
        
        // Handle hourly rates
        if (parsedData.hourlyRates) {
          setHourlyRates(parsedData.hourlyRates);
        } else {
          // Set default rates if not found
          setHourlyRates({
            straightTime: 240.00,
            overtime: 360.00,
            doubleTime: 480.00
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
        
        // Set default labor hours using formula if not already set
        if (!parsedData.hoursSummary || 
            (parsedData.hoursSummary.straightTimeHours === 0 && 
             parsedData.hoursSummary.overtimeHours === 0 && 
             parsedData.hoursSummary.doubleTimeHours === 0)) {
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
        setTravelData(parsedTravelData);
        setShowTravel(true);
      } else {
        setShowTravel(false);
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
          men: 2,
          hoursPerDay: 8,
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
      setShowTravel(false);
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
     const safeTravelData = travelData ? travelData : {};
     const dataWithEmbeddedTravel = { 
       ...(data as any), 
       travel_data: safeTravelData,
       hourlyRates: hourlyRates,
       paymentTermFactors: paymentTermFactors,
       mobilizationFactors: mobilizationFactors
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
      user_id: user.id // Track who created this estimate
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
        // Preserve existing quote number when updating
        const updatePayload = { ...quoteRecord } as any;
        delete updatePayload.quote_number;
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
            // Clear any local draft after a successful save of an existing quote
            try { localStorage.removeItem(draftKey); } catch {}
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
             // Refetch to be sure state is correct
             await fetchEstimateData(); 
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
            // Clear local draft after successful creation
            try { localStorage.removeItem(draftKey); } catch {}
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
            await fetchEstimateData();
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

  // Reset data for new quote
  const handleGenerateNewQuote = () => {
    setIsNewQuote(true);
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
        men: 2,
        hoursPerDay: 8,
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
    setShowTravel(false);
    setIsOpen(true);
  };

  // Function to calculate material extension
  const calculateMaterialExtension = (quantity: number, price: number) => {
    return (quantity || 0) * (price || 0);
  };
  
  // Function to calculate expense extension
  const calculateExpenseExtension = (quantity: number, price: number) => {
    return (quantity || 0) * (price || 0);
  };
  
  // Function to calculate labor unit
  const calculateLaborUnit = (men: number, hours: number) => {
    return (men || 0) * (hours || 0);
  };
  
  // Function to calculate labor total
  const calculateLaborTotal = (quantity: number, men: number, hours: number) => {
    return (quantity || 0) * calculateLaborUnit(men, hours);
  };

  // Helper function to format numbers with commas
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Helper function to format numbers with commas (no currency symbol)
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };
  
  // Calculate total travel cost from the current travelData state
  const getTotalTravelCost = () => {
    try {
      const td: any = travelData as any;
      const sum =
        (td?.travelExpense?.[0]?.vehicleTravelCost ?? 0) +
        (td?.travelTime?.[0]?.totalTravelLabor ?? 0) +
        (td?.perDiem?.[0]?.totalPerDiem ?? 0) +
        (td?.lodging?.[0]?.totalAmount ?? 0) +
        (td?.localMiles?.[0]?.totalLocalMilesCost ?? 0) +
        (td?.flights?.[0]?.totalFlightAmount ?? 0) +
        (td?.airTravelTime?.[0]?.totalTravelLabor ?? 0) +
        (td?.rentalCar?.[0]?.totalAmount ?? 0);
      return Number.isFinite(sum) ? sum : 0;
    } catch {
      return 0;
    }
  };
  
  // Helper function to get the exact FINAL value (G54) as shown in UI
  const getFinalValue = () => {
    return Math.ceil((
      // Financial Summary Total (F46)
      (data.calculatedValues.totalMaterial * 1.09 * materialMarkup) +
      (data.calculatedValues.totalExpense * 1.09) +
      (data.calculatedValues.nonSovExpense * 1.00) +
      // Labor Calculation Total (D52) - Use editable hourly rates
      (data.hoursSummary.straightTimeHours * hourlyRates.straightTime) +
      (data.hoursSummary.overtimeHours * hourlyRates.overtime) +
      (data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime) +
      // Include total travel cost in subtotal before markup
      getTotalTravelCost()
    ) / 0.96);
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

  // Handle input changes
  const handleItemChange = (section: 'sov' | 'nonSov', index: number, field: string, value: string | number) => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    const newItems = [...data[itemsKey]];
    newItems[index] = {
      ...newItems[index],
      [field]: field === 'item' || field === 'notes' ? value : Number(value)
    };
    
    setData(prev => {
      const newData = {
        ...prev,
        [itemsKey]: newItems
      };
      
      // Apply formula automatically when SOV item labor data changes
      if (section === 'sov' && (field === 'laborMen' || field === 'laborHours' || field === 'quantity')) {
        setIsManualLaborHours(false); // Reset manual flag when SOV data changes
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



  const handleHoursSummaryChange = (field: string, value: string) => {
    console.log('handleHoursSummaryChange called:', { field, value });
    
    // Set manual flag when labor hours are edited
    if (field === 'straightTimeHours' || field === 'overtimeHours' || field === 'doubleTimeHours') {
      setIsManualLaborHours(true);
    }
    
    setData(prev => {
      const newData = {
        ...prev,
        hoursSummary: {
          ...prev.hoursSummary,
          [field]: value === '' ? 0 : Number(value) || 0
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
    const daysOnsite = data.hoursSummary.men > 0 && data.hoursSummary.hoursPerDay > 0 
      ? totalWorkHours / (data.hoursSummary.men * data.hoursSummary.hoursPerDay) 
      : 0;
    
    // Calculate labor rate breakdown based on hours per day
    // 0-8 hours per day = straight time, >8-12 = overtime, >12 = double time
    const hoursPerDay = data.hoursSummary.hoursPerDay;
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
      totalTravelHours = travelData.travelTime.reduce((sum, item) => sum + item.grandTotalTravelHours, 0) +
                        travelData.airTravelTime.reduce((sum, item) => sum + item.grandTotalTravelHours, 0);
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
        // Apply formula automatically when SOV data or hours per day changes, unless manually edited
        straightTimeHours: isManualLaborHours ? prev.hoursSummary.straightTimeHours : straightTimeHours,
        overtimeHours: isManualLaborHours ? prev.hoursSummary.overtimeHours : overtimeHours,
        doubleTimeHours: isManualLaborHours ? prev.hoursSummary.doubleTimeHours : doubleTimeHours
      }
    }));
  }, [data.sovItems, data.nonSovItems, data.hoursSummary.men, data.hoursSummary.hoursPerDay, showTravel, travelData]);

  const handleAddLine = (section: 'sov' | 'nonSov') => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    setData(prev => ({
      ...prev,
      [itemsKey]: [...prev[itemsKey], {...EMPTY_LINE_ITEM}]
    }));
  };

  const handleClearRow = (section: 'sov' | 'nonSov', index: number) => {
    const itemsKey = section === 'sov' ? 'sovItems' : 'nonSovItems';
    const newItems = [...data[itemsKey]];
    newItems[index] = {...EMPTY_LINE_ITEM};
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
          
          // Sync numMen with other travel sections (except flights and air travel)
          if (field === 'numMen') {
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
            
            // Update local miles
            if (newData.localMiles[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: item.numMen // Assuming vehicles = men for local travel
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
          
          // Sync lodging nights with per diem days
          if (field === 'numDays') {
            newData.lodging[index] = {
              ...newData.lodging[index],
              numNights: item.numDays
            };
            // Recalculate lodging totals
            const lodgingItem = newData.lodging[index];
            lodgingItem.manNights = lodgingItem.numNights * lodgingItem.numMen;
            lodgingItem.totalAmount = lodgingItem.manNights * lodgingItem.rate;
          }
          
          // Sync numMen with other travel sections (except flights and air travel)
          if (field === 'numMen') {
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
            
            // Update local miles
            if (newData.localMiles[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: item.numMen // Assuming vehicles = men for local travel
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
          
          // Sync numMen with other travel sections (except flights and air travel)
          if (field === 'numMen') {
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
            
            // Update local miles
            if (newData.localMiles[index]) {
              newData.localMiles[index] = {
                ...newData.localMiles[index],
                numVehicles: item.numMen // Assuming vehicles = men for local travel
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
          break;
          
        case 'flights':
          item.totalFlightAmount = (item.numFlights * item.numMen * item.rate) + 
            (item.numFlights * item.numMen * item.luggageFees);
          
          // Sync numMen with air travel time section
          if (field === 'numMen' && newData.airTravelTime[index]) {
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
          
          // Sync numMen with flights section
          if (field === 'numMen' && newData.flights[index]) {
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
    setIsQuoteSelectOpen(true);
  }

  function handleGenerateCombinedLetterProposal() {
    setSelectedQuotesForCombined([]);
    setIsCombinedQuoteSelectOpen(true);
  }

  const [isQuoteSelectOpen, setIsQuoteSelectOpen] = useState(false);
  const [isCombinedQuoteSelectOpen, setIsCombinedQuoteSelectOpen] = useState(false);
  const [isLetterProposalOpen, setIsLetterProposalOpen] = useState(false);
  const [isLettersListOpen, setIsLettersListOpen] = useState(false);
  const [letters, setLetters] = useState<Array<{ id: string; html: string; created_at: string; quote_number?: string; neta_standard?: string }>>([]);
  const [selectedLetterIndex, setSelectedLetterIndex] = useState<number>(-1);
  const [currentLetterId, setCurrentLetterId] = useState<string | null>(null);
  const [selectedQuotesForCombined, setSelectedQuotesForCombined] = useState<number[]>([]);
  const [hourlyRates, setHourlyRates] = useState({
    straightTime: 240.00,
    overtime: 360.00,
    doubleTime: 480.00
    });
    
  const [materialMarkup, setMaterialMarkup] = useState(1.3);
    
    // Trigger recalculation when hourly rates change
    useEffect(() => {
      // This will cause the component to re-render and recalculate getFinalValue()
      // The getFinalValue function now uses hourlyRates, so changing rates will update totals
    }, [hourlyRates]);
    
    const letterUpdateSourceRef = useRef<'user' | 'programmatic'>('programmatic');
  const letterEditorRef = useRef<HTMLDivElement | null>(null);
  const [selectedLetterQuoteIndex, setSelectedLetterQuoteIndex] = useState<number | null>(null);
  const [letterHtml, setLetterHtml] = useState<string>("");
  const [contactData, setContactData] = useState<{ first_name: string; last_name: string } | null>(null);
  const [isViewMode, setIsViewMode] = useState<boolean>(false);
  const [netaStandard, setNetaStandard] = useState<string>('');

  const NETA_OPTIONS = [
    { value: '', text: '-- Select --' },
    { value: 'mts', text: 'All tests will be performed in accordance with ANSI/NETA MTS 2023 - Standard for Maintenance Testing Specifications for Electrical power Equipment and Systems.' },
    { value: 'ats', text: 'All tests will be performed in accordance with ANSI/NETA ATS 2025 - Standard for Acceptance Testing Specifications for Electrical Power Equipment and Systems' },
    { value: 'both', text: 'All work will be performed in accordance with the applicable ANSI/NETA ATS/MTS & IEEE 81 Standards.' }
  ];

  function applyNetaTextByValue(value: string) {
    try {
      const option = NETA_OPTIONS.find(o => o.value === value);
      const container = document.createElement('div');
      container.innerHTML = letterHtml;
      const span = container.querySelector('#neta-standard-text') as HTMLElement | null;
      if (span) {
        span.textContent = option?.text || '[Select NETA Standard]';
        letterUpdateSourceRef.current = 'programmatic';
        setLetterHtml(container.innerHTML);
      }
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

  // Restore letter proposal state from localStorage if needed (but not for fresh generation)
  useEffect(() => {
    console.log('Restoration useEffect triggered:', { mode, isLetterProposalOpen, isQuoteSelectOpen });
    // Only restore if we're not in a fresh generation mode and there's persisted state
    // Allow restoration when mode is undefined (normal state) or other modes except 'letter'
    // IMPORTANT: Don't run this during active letter generation to prevent interference
    if (mode !== 'letter' && !isLetterProposalOpen && !isQuoteSelectOpen && selectedLetterQuoteIndex === null) {
      try {
        const savedOpen = localStorage.getItem(`letter-proposal-open-${opportunityId}`);
        const savedHtml = localStorage.getItem(`letter-proposal-draft-${opportunityId}`);
        const savedQuoteIndex = localStorage.getItem(`letter-quote-index-${opportunityId}`);
        
        console.log('Checking restoration conditions:', { savedOpen, hasSavedHtml: !!savedHtml });
        
        if (savedOpen === 'true' && savedHtml) {
          console.log('Restoring letter proposal from localStorage');
          const savedNetaStandard = localStorage.getItem(`letter-neta-standard-${opportunityId}`);
          setIsLetterProposalOpen(true);
          setLetterHtml(savedHtml);
          if (savedQuoteIndex) {
            setSelectedLetterQuoteIndex(parseInt(savedQuoteIndex, 10));
          }
          if (savedNetaStandard) {
            setNetaStandard(savedNetaStandard);
          }
        }
      } catch {}
    } else {
      console.log('Skipping restoration due to conditions:', { mode, isLetterProposalOpen, isQuoteSelectOpen, selectedLetterQuoteIndex });
    }
  }, [opportunityId, mode, isQuoteSelectOpen, selectedLetterQuoteIndex]);

  // When letter proposal opens and has persisted content, make sure editor is populated
  useEffect(() => {
    if (isLetterProposalOpen && letterHtml && letterEditorRef.current) {
      // Small delay to ensure editor is fully rendered
      setTimeout(() => {
        const editor = letterEditorRef.current;
        if (!editor) return;
        
        // Only populate if the editor is empty or significantly different
        if (editor.innerHTML.trim() === '' || (editor.innerHTML !== letterHtml && !editor.contains(document.activeElement))) {
          letterUpdateSourceRef.current = 'programmatic';
          editor.innerHTML = letterHtml;
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
                const prev = block.previousElementSibling as HTMLElement | null;
                if (prev && prev.classList.contains('amp-scope-block')) {
                  parent.insertBefore(block, prev);
                  try {
                    const html = editor.innerHTML;
                    setLetterHtml(html);
                    localStorage.setItem(`letter-proposal-draft-${opportunityId}`, html);
                  } catch {}
                }
              };
              const moveDown = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const parent = block.parentElement;
                if (!parent) return;
                const next = block.nextElementSibling as HTMLElement | null;
                if (next && next.classList.contains('amp-scope-block')) {
                  parent.insertBefore(next, block);
                  try {
                    const html = editor.innerHTML;
                    setLetterHtml(html);
                    localStorage.setItem(`letter-proposal-draft-${opportunityId}`, html);
                  } catch {}
                }
              };
              upBtn?.addEventListener('click', moveUp as any);
              downBtn?.addEventListener('click', moveDown as any);
              (block as any)._ampArrowsBound = true;
            });
          }
        } catch {}
      }, 100);
    }
  }, [isLetterProposalOpen, letterHtml]);

  // Function to format address for letter proposal
  function formatAddressForLetter(address: string): string {
    if (!address) return 'Address';
    
    // Remove "United States" from the address
    let formattedAddress = address.replace(/,?\s*United States\s*$/i, '');
    
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
    // --- Build the same numerator used by getFinalValue in the sheet (before /0.96 and without travel) ---
    function getFinalNumeratorWithoutTravel(parsed: any) {
      // Defensive: fallback to 0 if missing
      const cv = parsed.calculatedValues || {};
      const hs = parsed.hoursSummary || {};
      const totalMaterial = cv.totalMaterial || 0;
      const totalExpense = cv.totalExpense || 0;
      const nonSovExpense = cv.nonSovExpense || 0;
      const straightTimeHours = hs.straightTimeHours || 0;
      const overtimeHours = hs.overtimeHours || 0;
      const doubleTimeHours = hs.doubleTimeHours || 0;
      // Same as getFinalValue numerator in the sheet (no travel here)
      return (
        (totalMaterial * 1.09 * materialMarkup) +
        (totalExpense * 1.09) +
        (nonSovExpense * 1.00) +
        (straightTimeHours * hourlyRates.straightTime) +
        (overtimeHours * hourlyRates.overtime) +
        (doubleTimeHours * hourlyRates.doubleTime)
      );
    }
    function formatCurrency(amount: number) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    // Include travel cost from the most reliable source, in order of preference:
    // 1) quote.travel_data column
    // 2) embedded parsedData.travel_data
    // 3) current in-memory travelData state (unsaved)
    const parsedTravel = (() => {
      // Try quote.travel_data
      let source: any = (quote as any)?.travel_data ?? null;
      if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch { source = null; }
      }
      // Fallback to embedded travel in data blob
      if (!source && parsedData?.travel_data) {
        source = typeof parsedData.travel_data === 'string'
          ? (() => { try { return JSON.parse(parsedData.travel_data); } catch { return null; } })()
          : parsedData.travel_data;
      }
      // Fallback to current state
      if (!source && travelData) {
        source = travelData;
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
    // Match sheet logic exactly: add travel into numerator, then divide by 0.96
    const finalValue = Math.ceil((getFinalNumeratorWithoutTravel(parsedData) + getParsedTotalTravelCost()) / 0.96);
    const mobilization = (() => {
      const factor = getMobilizationFactor(finalValue);
      return formatCurrency(Math.ceil(finalValue * factor));
    })();
    const option1 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net30));
    const option2 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net60));
    const option3 = formatCurrency(Math.ceil(finalValue * paymentTermFactors.net90));
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
    setLetterHtml(`
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.2;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 6px; margin-bottom: 12px;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 36px; margin-right: 10px;" />
          <span style="font-size: 1.1em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
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
        <div class="amp-section" style="margin: 8px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at <span style='border-bottom:1px dotted #aaa;'>_______</span></div>
        <div class="amp-section" style="margin: 8px 0;">
          <span id="neta-standard-text">${NETA_OPTIONS.find(o => o.value === netaStandard)?.text || '[Select NETA Standard]'}</span>
        </div>
        <div class="amp-section amp-keep-with-next"><b>Scope</b></div>
        <table class="amp-section" style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
          <thead>
            <tr><th style='border:1px solid #ccc;padding:4px 12px;text-align:left;'>Item</th><th style='border:1px solid #ccc;padding:4px 12px;text-align:center;'>Quantity</th></tr>
          </thead>
          <tbody>
            ${sovTableRows}
          </tbody>
        </table>
        <div class="amp-section" style="margin-top: 12px;"><b>Pricing & Terms</b></div>
        <div class="amp-section">Mobilization costs of ${mobilization} shall be paid before the first day of work in addition to:</div>
        <ul class="amp-section" style="margin: 4px 0;">
          <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b>${option1}</b></li>
          <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b>${option2}</b></li>
          <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b>${option3}</b></li>
        </ul>
        <div class="amp-section">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div class="amp-section" style="margin-top: 8px;">This price is based upon the following:</div>
        <ol class="amp-section" style="margin: 4px 0 4px 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services 2025 T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>
        <div style="margin-top: 12px;"><b>Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 8px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 8px;">Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</div>
        <div style="margin-top: 8px;">Should you have any questions please contact the undersigned.</div>
        <div style="margin-top: 12px;">Sincerely,</div>
        <div style="margin: 4px 0 2px 0;">
          <img src="${signatureUrl}" alt="Signature" style="height: 40px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>Brian Rodgers</div>
        <div>Chief Executive Officer</div>
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        <div style="width:100%;font-size:0.85em;color:#555;border-top:1px solid #ccc;padding:4px 0;text-align:center;margin-top:12px;">P.O. Box 526 | Huntsville, Alabama 35804 | (256) 513-8255</div>
        <div style="margin-top: 16px;">
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
    `);
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
          (straightTimeHours * hourlyRates.straightTime) +
          (overtimeHours * hourlyRates.overtime) +
          (doubleTimeHours * hourlyRates.doubleTime)
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
      
      const finalValue = Math.ceil((getFinalNumeratorWithoutTravel(parsedData) + getParsedTotalTravelCost()) / 0.96);
      
      return {
        quote,
        parsedData,
        sovItems,
        finalValue,
        quoteNumber: (opportunityData as any)?.quote_number || quote.id?.slice(0,6) || (selectedQuotesForCombined[quoteIndex] + 1),
        displayTitle: (parsedData?.title && String(parsedData.title).trim()) ? String(parsedData.title).trim() : ''
      };
    });
    
    // Calculate combined totals
    const combinedFinalValue = processedQuotes.reduce((sum, q) => sum + q.finalValue, 0);
    const combinedMobilization = (() => {
      const factor = getMobilizationFactor(combinedFinalValue);
      return formatCurrency(Math.ceil(combinedFinalValue * factor));
    })();
    
    const combinedOption1 = formatCurrency(Math.ceil(combinedFinalValue * paymentTermFactors.net30));
    const combinedOption2 = formatCurrency(Math.ceil(combinedFinalValue * paymentTermFactors.net60));
    const combinedOption3 = formatCurrency(Math.ceil(combinedFinalValue * paymentTermFactors.net90));
    
    // Generate SOV tables for each quote with individual pricing
    const sovTablesHtml = processedQuotes.map((processedQuote, index) => {
      const scopeNumber = index + 1;
      const headingText = processedQuote.displayTitle || `Scope ${scopeNumber} - Scope of Work`;
      const sovTableRows = processedQuote.sovItems && processedQuote.sovItems.length > 0
        ? processedQuote.sovItems.map((item: any) => {
            const name = (item.item || '').toString();
            const qty = item.quantity ?? item.qty ?? 1;
            return `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>${name}</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>${qty}</td></tr>`;
          }).join('')
        : `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>24-hour Power Study</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>1</td></tr>`;
      
      // Calculate individual pricing for this scope
      const scopeMobilization = (() => {
        const factor = getMobilizationFactor(processedQuote.finalValue);
        return formatCurrency(Math.ceil(processedQuote.finalValue * factor));
      })();
      
      const scopeOption1 = formatCurrency(Math.ceil(processedQuote.finalValue * paymentTermFactors.net30));
      const scopeOption2 = formatCurrency(Math.ceil(processedQuote.finalValue * paymentTermFactors.net60));
      const scopeOption3 = formatCurrency(Math.ceil(processedQuote.finalValue * paymentTermFactors.net90));
      
      return `
        <div class="amp-scope-block" style="margin-bottom: 16px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; background-color: #fafafa;">
          <div class="amp-scope-controls print-hidden" contenteditable="false" style="display:flex;gap:6px;justify-content:flex-end;margin:-8px -8px 8px -8px;padding:6px 8px;">
            <button class="move-up" aria-label="Move scope up" title="Move up" style="border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;">▲</button>
            <button class="move-down" aria-label="Move scope down" title="Move down" style="border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;">▼</button>
          </div>
          <h3 style="font-size: 1.2em; font-weight: bold; margin-bottom: 12px; color: #333; border-bottom: 2px solid #f26722; padding-bottom: 8px;">${headingText}</h3>
          <table style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
            <thead>
              <tr><th style='border:1px solid #ccc;padding:4px 12px;text-align:left;background-color:#f5f5f5;'>Item</th><th style='border:1px solid #ccc;padding:4px 12px;text-align:center;background-color:#f5f5f5;'>Quantity</th></tr>
            </thead>
            <tbody>
              ${sovTableRows}
            </tbody>
          </table>
          <div style="margin-top: 16px; padding: 12px; background-color: #f8f9fa; border-radius: 4px;">
            <h4 style="font-size: 1em; font-weight: bold; margin-bottom: 8px; color: #333;">Scope ${scopeNumber} Pricing:</h4>
            <div style="margin-bottom: 4px;">Mobilization: <strong>${scopeMobilization}</strong></div>
            <div style="margin-bottom: 4px;">NET 30: <strong>${scopeOption1}</strong></div>
            <div style="margin-bottom: 4px;">NET 60: <strong>${scopeOption2}</strong></div>
            <div style="margin-bottom: 4px;">NET 90: <strong>${scopeOption3}</strong></div>
          </div>
        </div>
      `;
    }).join('');
    
    const contactName = contactData ? `${contactData.first_name} ${contactData.last_name}`.trim() : (customer.name || 'Contact Name');
    const signatureUrl = (window as any)?.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
    
    setLetterHtml(`
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; font-size: 11pt; line-height: 1.2;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 6px; margin-bottom: 12px;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 36px; margin-right: 10px;" />
          <span style="font-size: 1.1em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
        </div>
        <div><b>${dateStr}</b></div>
        <div style="margin-bottom: 8px;"><b>Combined Letter # ${(opportunityData as any)?.quote_number || 'Multiple'}</b></div>
        <div>
          ${contactName}<br/>
          ${customer.company_name || 'Company'}<br/>
          ${formatAddressForLetter(customer.address)}<br/>
        </div>
        <div style="margin: 8px 0;">Dear ${contactName},</div>
        <div>AMP LLC is pleased to offer the following combined proposal for your consideration, including ${processedQuotes.length} separate quotes.</div>
        <div style="margin: 8px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at <span style='border-bottom:1px dotted #aaa;'>_______</span></div>
        <div style="margin: 8px 0;">
          <span id="neta-standard-text">${NETA_OPTIONS.find(o => o.value === netaStandard)?.text || '[Select NETA Standard]'}</span>
        </div>
        <div><b>Combined Scope of Work</b></div>
        ${sovTablesHtml}
        
        <div class="amp-combined-summary" style="margin-top: 16px; border: 2px solid #f26722; border-radius: 6px; padding: 12px; background-color: #fff8f5;">
          <h3 style="font-size: 1.1em; font-weight: bold; margin-bottom: 8px; color: #f26722; text-align: center;">COMBINED PRICING SUMMARY</h3>
          
          <div style="text-align: center;">
            <h4 style="font-size: 1.2em; font-weight: bold; margin-bottom: 16px; color: #f26722;">GRAND TOTAL COMBINED PRICING:</h4>
            <div style="font-size: 1.2em; margin-bottom: 12px;">Total Mobilization: <strong style="color: #f26722;">${combinedMobilization}</strong></div>
            <div style="font-size: 1.2em; margin-bottom: 12px;">Total NET 30: <strong style="color: #f26722;">${combinedOption1}</strong></div>
            <div style="font-size: 1.2em; margin-bottom: 12px;">Total NET 60: <strong style="color: #f26722;">${combinedOption2}</strong></div>
            <div style="font-size: 1.2em; margin-bottom: 12px;">Total NET 90: <strong style="color: #f26722;">${combinedOption3}</strong></div>
          </div>
          
          <div style="margin-top: 16px; font-size: 0.95em; color: #666; text-align: center;">
            <p>Mobilization costs of ${combinedMobilization} shall be paid before the first day of work in addition to the selected payment terms above.</p>
          </div>
        </div>
        <div style="margin-top: 12px;">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div style="margin-top: 12px;">This price is based upon the following:</div>
        <ol style="margin-left: 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services 2025 T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be quoted separately.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>
        <div style="margin-top: 24px;"><b>Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 16px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 16px;">Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</div>
        <div style="margin-top: 16px;">Should you have any questions please contact the undersigned.</div>
        <div style="margin-top: 20px;">Sincerely,</div>
        <div style="margin: 4px 0 2px 0;">
          <img src="${signatureUrl}" alt="Signature" style="height: 40px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>Brian Rodgers</div>
        <div>Chief Executive Officer</div>
        <div style="text-align:center; margin-top: 8px; font-size: 0.9em; color: #444;">END OF LETTER</div>
        <div style="margin-top: 8px;">
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
    `);
    
    setIsLetterProposalOpen(true);
    // Prevent AuthContext refresh while letter proposal is open
    try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
  }

  function handlePrintLetter() {
    // Open print dialog for the letter proposal
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Letter Proposal</title><style>
        @media print {
          @page { size: A4; margin: 20mm; }
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
          /* Reasonable widows/orphans to reduce awkward splits */
          p { orphans: 2; widows: 2; }
          /* Ensure images scale properly */
          img { max-width: 100%; height: auto; }
        }
        /* Signature should render well */
        img[alt="Signature"] { max-height: 60px; }
      </style></head><body>${letterHtml}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
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
      try {
        // Clear any existing draft to ensure fresh start
        localStorage.removeItem(draftKey);
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
            men: 2,
            hoursPerDay: 8,
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
      } catch {}
    } else if (mode === 'view') {
      setIsNewQuote(false);
      setIsOpen(true);
      setIsViewMode(true);
      try { localStorage.setItem('AMP_SUSPEND_REFRESH', 'true'); } catch {}
    } else if (mode === 'letter') {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      try {
        localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
        localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
        localStorage.removeItem(`letter-quote-index-${opportunityId}`);
        localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
      } catch {}
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsQuoteSelectOpen(false);
      setLetterHtml("");
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateLetterProposal();
      }, 50);
    } else if (mode === 'combined-letter') {
      setIsOpen(false); // Ensure saved estimates modal is closed
      // Clear any existing letter proposal state to start fresh
      try {
        localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
        localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
        localStorage.removeItem(`letter-quote-index-${opportunityId}`);
        localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
      } catch {}
      // Reset letter proposal state
      setIsLetterProposalOpen(false);
      setIsCombinedQuoteSelectOpen(false);
      setSelectedQuotesForCombined([]);
      setLetterHtml("");
      setSelectedLetterQuoteIndex(null);
      setCurrentLetterId(null);
      // Small delay to ensure state is reset before opening quote selection
      setTimeout(() => {
        handleGenerateCombinedLetterProposal();
      }, 50);
    } else if (mode === 'letters') {
      setIsOpen(false);
      setIsLetterProposalOpen(false);
      (async () => {
        try {
          const { data, error } = await supabase
            .schema('business')
            .from('letter_proposals')
            .select('id, html, created_at, quote_number, neta_standard')
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
      try {
        const savedHtml = localStorage.getItem(`letter-proposal-draft-${opportunityId}`);
        const savedOpen = localStorage.getItem(`letter-proposal-open-${opportunityId}`);
        
        // Only remove suspend refresh if there's no saved content and no saved open state
        // This indicates the user deliberately closed and cleared the proposal
        if (!savedHtml && savedOpen !== 'true') {
          localStorage.removeItem('AMP_SUSPEND_REFRESH');
        }
      } catch {}
    }
  }, [isLetterProposalOpen, opportunityId]);

  // Save letter content to localStorage whenever it changes (debounced)
  useEffect(() => {
    if (!letterHtml) return;
    
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(`letter-proposal-draft-${opportunityId}`, letterHtml);
      } catch {}
    }, 500); // Debounce for 500ms to avoid saving on every keystroke
    
    return () => clearTimeout(timeoutId);
  }, [letterHtml, opportunityId]);

  // Save letter proposal open state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`letter-proposal-open-${opportunityId}`, isLetterProposalOpen.toString());
      if (isLetterProposalOpen) {
        // Set suspend refresh when opening
        localStorage.setItem('AMP_SUSPEND_REFRESH', 'true');
      }
    } catch {}
  }, [isLetterProposalOpen, opportunityId]);

  // Immediate restoration on component mount and ensure suspend refresh is set
  useEffect(() => {
    try {
      const savedHtml = localStorage.getItem(`letter-proposal-draft-${opportunityId}`);
      const savedOpen = localStorage.getItem(`letter-proposal-open-${opportunityId}`);
      const savedQuoteIndex = localStorage.getItem(`letter-quote-index-${opportunityId}`);
      
      // If there's saved letter content or the proposal was open, restore it immediately
      if (savedOpen === 'true' && savedHtml && !isLetterProposalOpen) {
        console.log('Immediate restoration on mount');
        const savedNetaStandard = localStorage.getItem(`letter-neta-standard-${opportunityId}`);
        setIsLetterProposalOpen(true);
        setLetterHtml(savedHtml);
        if (savedQuoteIndex) {
          setSelectedLetterQuoteIndex(parseInt(savedQuoteIndex, 10));
        }
        if (savedNetaStandard) {
          setNetaStandard(savedNetaStandard);
        }
        localStorage.setItem('AMP_SUSPEND_REFRESH', 'true');
      } else if (savedHtml || savedOpen === 'true' || isLetterProposalOpen) {
        // Even if not restoring, ensure suspend refresh is set
        localStorage.setItem('AMP_SUSPEND_REFRESH', 'true');
      }
    } catch {}
  }, [opportunityId]); // Run on mount and when opportunityId changes

  // Add visibility change listener to restore letter proposal and ensure suspend refresh stays set
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try {
          const savedHtml = localStorage.getItem(`letter-proposal-draft-${opportunityId}`);
          const savedOpen = localStorage.getItem(`letter-proposal-open-${opportunityId}`);
          const savedQuoteIndex = localStorage.getItem(`letter-quote-index-${opportunityId}`);
          
          // If there's saved content and the proposal should be open but isn't, restore it
          if (savedOpen === 'true' && savedHtml && !isLetterProposalOpen) {
            console.log('Restoring letter proposal on visibility change');
            const savedNetaStandard = localStorage.getItem(`letter-neta-standard-${opportunityId}`);
            setIsLetterProposalOpen(true);
            setLetterHtml(savedHtml);
            if (savedQuoteIndex) {
              setSelectedLetterQuoteIndex(parseInt(savedQuoteIndex, 10));
            }
            if (savedNetaStandard) {
              setNetaStandard(savedNetaStandard);
            }
          }
          
          // Always re-set the suspend refresh flag when tab becomes visible if there's saved content
          if (savedHtml || savedOpen === 'true' || isLetterProposalOpen) {
            localStorage.setItem('AMP_SUSPEND_REFRESH', 'true');
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [opportunityId, isLetterProposalOpen]);

  // Save selected letter quote index to localStorage
  useEffect(() => {
    try {
      if (selectedLetterQuoteIndex !== null) {
        localStorage.setItem(`letter-quote-index-${opportunityId}`, selectedLetterQuoteIndex.toString());
      }
    } catch {}
  }, [selectedLetterQuoteIndex, opportunityId]);

  // Save NETA standard to localStorage
  useEffect(() => {
    try {
      if (netaStandard) {
        localStorage.setItem(`letter-neta-standard-${opportunityId}`, netaStandard);
      }
    } catch {}
  }, [netaStandard, opportunityId]);

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
        onClose={() => {
          setIsOpen(false);
          // Reset mode to allow immediate reopening
          if (mode === 'new' || mode === 'view') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('resetEstimateMode'));
            }, 100);
          }
        }}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg w-[98%] h-[95vh] mx-auto p-6 shadow-xl my-4 estimate-form">
            <div className="absolute top-0 right-0 pt-4 pr-4 flex space-x-2">
              {isNewQuote ? (
                <Button
                  onClick={saveQuote}
                  disabled={isSaving}
                  className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Quote'}
                </Button>
              ) : (
                isViewMode ? (
                  <Button
                    onClick={() => setIsViewMode(false)}
                    className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                  >
                    Edit
                  </Button>
                ) : (
                  <Button
                    onClick={saveQuote}
                    disabled={isSaving}
                    className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                )
              )}
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-dark-400 dark:hover:text-dark-300"
                onClick={() => {
                  setIsOpen(false);
                  // Reset mode to allow immediate reopening
                  if (mode === 'new' || mode === 'view') {
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                    }, 100);
                  }
                }}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-dark-900 mb-6">
              {isNewQuote ? 'New Estimate' : 'Saved Estimates'}
            </Dialog.Title>

            <div className="h-[calc(95vh-120px)] overflow-y-auto">
              {!isNewQuote && quotes.length > 0 ? (
                <Tab.Group>
                  <Tab.List className="flex space-x-2 border-b border-gray-200 mb-4">
                    {quotes.map((quote, index) => (
                      <div key={quote.id} className="flex items-center">
                        <Tab
                          className={({ selected }) =>
                            `px-4 py-2 text-sm font-medium rounded-t-lg focus:outline-none ${
                              selected
                                ? 'bg-[#f26722] text-white'
                                : 'bg-gray-100 dark:bg-dark-150 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                            }`
                          }
                          onClick={() => {
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
                        <button
                          className="ml-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteQuoteById(quote.id);
                          }}
                          title="Delete estimate"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </Tab.List>
                </Tab.Group>
              ) : null}

              <div className="mt-4">
                <div style={styles.app}>
                  {/* Page Numbering */}
                  <div style={{
                    textAlign: 'right',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: 'var(--text-color)'
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
                  <div style={styles.sectionHeader}>SOV QUOTE ITEMS</div>
                  <div style={styles.tableContainer} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th ref={itemHeaderRef} style={{...styles.tableHeader, width: itemColWidth, position: 'relative'}}>
                            ITEM
                            <span
                              onMouseDown={onItemMouseDown}
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6, cursor: 'col-resize', userSelect: 'none' }}
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
                              <td style={{...styles.tableCell, width: itemColWidth}}>
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
                                    if (e.key === 'Backspace' && String(item.quantity) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'quantity'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'quantity', '');
                                    }
                                  }}
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
                                    if (e.key === 'Backspace' && String(item.materialPrice) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'materialPrice'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'materialPrice', '');
                                    }
                                  }}
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
                                    if (e.key === 'Backspace' && String(item.expensePrice) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'expensePrice'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'expensePrice', '');
                                    }
                                  }}
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
                                  inputMode="numeric"
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'laborMen')) ? '' : String(item.laborMen ?? '')}
                                  onChange={(e) => handleItemChange('sov', index, 'laborMen', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Backspace' && String(item.laborMen) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'laborMen'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'laborMen', '');
                                    }
                                  }}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  style={styles.tableInput}
                                  value={blankingKeys.has(makeKey('sov', index, 'laborHours')) ? '' : String(item.laborHours ?? '')}
                                  onChange={(e) => handleItemChange('sov', index, 'laborHours', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Backspace' && String(item.laborHours) === '0') {
                                      const copy = new Set(blankingKeys);
                                      copy.add(makeKey('sov', index, 'laborHours'));
                                      setBlankingKeys(copy);
                                      e.preventDefault();
                                      handleItemChange('sov', index, 'laborHours', '');
                                    }
                                  }}
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
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                {!isViewMode && (
                                  <button
                                    onClick={() => handleClearRow('sov', index)}
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
                                    title="Clear this row"
                                  >
                                    Clear
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
                          <th ref={nonSovItemHeaderRef} style={{...styles.tableHeader, width: nonSovItemColWidth, position: 'relative'}}>
                            ITEM
                            <span
                              onMouseDown={(e) => {
                                if (!nonSovItemHeaderRef.current) return;
                                isResizingNonSovRef.current = true;
                                startXRef.current = e.clientX;
                                startNonSovWidthRef.current = nonSovItemColWidth;
                                e.preventDefault();
                              }}
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6, cursor: 'col-resize', userSelect: 'none' }}
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
                              <td style={{...styles.tableCell, width: nonSovItemColWidth}}>
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
                                  style={styles.tableInput}
                                  value={item.laborMen} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'laborMen', e.target.value)}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.laborHours} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'laborHours', e.target.value)}
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
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                {!isViewMode && (
                                  <button
                                    onClick={() => handleClearRow('nonSov', index)}
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
                                    title="Clear this row"
                                  >
                                    Clear
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
                            {travelData.travelExpense.map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.trips}
                                    onChange={(e) => handleTravelChange('travelExpense', index, 'trips', e.target.value)}
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
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>TOTAL TRAVEL LABOR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {travelData.travelTime.map((item, index) => (
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
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('travelTime', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalTravelLabor.toFixed(2)}
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
                            {travelData.perDiem.map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numDays}
                                    onChange={(e) => handleTravelChange('perDiem', index, 'numDays', e.target.value)}
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
                            {travelData.lodging.map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numNights}
                                    onChange={(e) => handleTravelChange('lodging', index, 'numNights', e.target.value)}
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
                            {travelData.localMiles.map((item, index) => (
                              <tr key={index}>
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    style={styles.tableInput}
                                    value={item.numDays}
                                    onChange={(e) => handleTravelChange('localMiles', index, 'numDays', e.target.value)}
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
                            {travelData.flights.map((item, index) => (
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
                              <th style={styles.tableHeader}>RATE</th>
                              <th style={styles.tableHeader}>TOTAL TRAVEL LABOR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {travelData.airTravelTime.map((item, index) => (
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
                                <td style={styles.tableCell}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    style={styles.tableInput}
                                    value={item.rate}
                                    onChange={(e) => handleTravelChange('airTravelTime', index, 'rate', e.target.value)}
                                  />
                                </td>
                                <td style={{...styles.tableCell, ...styles.calculated}}>
                                  ${item.totalTravelLabor.toFixed(2)}
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
                            {travelData.rentalCar.map((item, index) => (
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
                                travelData.travelExpense[0].vehicleTravelCost +
                                travelData.travelTime[0].totalTravelLabor +
                                travelData.perDiem[0].totalPerDiem +
                                travelData.lodging[0].totalAmount +
                                travelData.localMiles[0].totalLocalMilesCost +
                                travelData.flights[0].totalFlightAmount +
                                travelData.airTravelTime[0].totalTravelLabor +
                                travelData.rentalCar[0].totalAmount
                              ).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Summary Sections Container - Side by Side */}
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '20px', marginTop: '20px'}}>
                    {/* Financial Summary Table - Left Side */}
                    <div style={{...styles.summarySection, width: '700px'}}>
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
                                  const markup = parseFloat(e.target.value) || 1.3;
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
                                (data.calculatedValues.nonSovExpense * 1.00) +
                                // Add labor costs using editable hourly rates
                                (data.hoursSummary.straightTimeHours * hourlyRates.straightTime) +
                                (data.hoursSummary.overtimeHours * hourlyRates.overtime) +
                                (data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime)
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                                      </div>
                  
                  {/* Labor Calculation Table - Under Financial Summary */}
                  <div style={{...styles.summarySection, width: '700px', marginTop: '20px'}}>
                    <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>Labor Hours Tracking (excludes travel hours)</h3>
                    
                    {/* Hours Counter */}
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6'}}>
                      <div style={{fontWeight: 'bold', color: '#495057'}}>
                        Hours Quoted: {data.hoursSummary.workHours}
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <div style={{fontWeight: 'bold', color: (() => {
                          const quotedHours = data.hoursSummary.workHours;
                          const actualHours = data.hoursSummary.straightTimeHours + data.hoursSummary.overtimeHours + data.hoursSummary.doubleTimeHours;
                          const difference = actualHours - quotedHours;
                          if (difference > 0) return '#dc3545'; // Red for over
                          if (difference < 0) return '#28a745'; // Green for under
                          return '#6c757d'; // Gray for exact
                        })()}}>
                          {(() => {
                            const quotedHours = data.hoursSummary.workHours;
                            const actualHours = data.hoursSummary.straightTimeHours + data.hoursSummary.overtimeHours + data.hoursSummary.doubleTimeHours;
                            const difference = actualHours - quotedHours;
                            if (difference > 0) return `${difference} hours over`;
                            if (difference < 0) return `${Math.abs(difference)} hours remaining`;
                            return 'Hours exact';
                          })()}
                        </div>
                        <button
                          onClick={() => {
                            setIsManualLaborHours(false); // Reset manual flag
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
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
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
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={data.hoursSummary.straightTimeHours || ''}
                                onChange={(e) => handleHoursSummaryChange('straightTimeHours', e.target.value)}
                                readOnly={isViewMode}
                                placeholder="0"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={hourlyRates.straightTime || ''}
                                onChange={(e) => {
                                  const straightTime = parseFloat(e.target.value) || 0;
                                  setHourlyRates(prev => ({
                                    ...prev,
                                    straightTime: straightTime
                                  }));
                                }}
                                step="0.01"
                                min="0"
                                readOnly={isViewMode}
                                placeholder="240.00"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.straightTimeHours * hourlyRates.straightTime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ OVERTIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={data.hoursSummary.overtimeHours || ''}
                                onChange={(e) => handleHoursSummaryChange('overtimeHours', e.target.value)}
                                readOnly={isViewMode}
                                placeholder="0"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={hourlyRates.overtime || ''}
                                onChange={(e) => {
                                  const overtime = parseFloat(e.target.value) || 0;
                                  setHourlyRates(prev => ({
                                    ...prev,
                                    overtime: overtime
                                  }));
                                }}
                                step="0.01"
                                min="0"
                                readOnly={isViewMode}
                                placeholder="360.00"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.overtimeHours * hourlyRates.overtime)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ DOUBLE TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={data.hoursSummary.doubleTimeHours || ''}
                                onChange={(e) => handleHoursSummaryChange('doubleTimeHours', e.target.value)}
                                readOnly={isViewMode}
                                placeholder="0"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>
                              <input
                                type="number"
                                style={{...styles.tableInput, width: '100%'}}
                                value={hourlyRates.doubleTime || ''}
                                onChange={(e) => {
                                  const doubleTime = parseFloat(e.target.value) || 0;
                                  setHourlyRates(prev => ({
                                    ...prev,
                                    doubleTime: doubleTime
                                  }));
                                }}
                                step="0.01"
                                min="0"
                                readOnly={isViewMode}
                                placeholder="480.00"
                              />
                            </td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime)}</td>
                          </tr>
                          <tr style={{...styles.tfoot}}>
                            <td colSpan={3} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatCurrency(
                                (data.hoursSummary.straightTimeHours * hourlyRates.straightTime) +
                                (data.hoursSummary.overtimeHours * hourlyRates.overtime) +
                                (data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime)
                              )}
                            </td>
                          </tr>
                        </tbody>
                    </table>
                  </div>
                  
                  {/* Hours Summary Section - Right Side */}
                  <div style={{...styles.summarySection, width: '300px'}}>
                      <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>Hours Summary</h3>
                      <table style={{...styles.table, width: '100%', fontSize: '14px'}}>
                        <tbody>
                          <tr>
                            <td style={{...styles.tableCell, width: '60%', textAlign: 'left', padding: '12px 8px'}}>Men:</td>
                            <td style={{...styles.tableCell, width: '40%', padding: '12px 8px'}}>
                              <input
                                type="number"
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
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30))}</td>
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
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60))}</td>
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
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90))}</td>
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
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>SUB TOTAL</div>
                              <div style={{fontSize: '16px', fontWeight: 'bold'}}>
                                {formatCurrency((
                                  // Financial Summary Total (F46)
                                  (data.calculatedValues.totalMaterial * 1.09 * materialMarkup) +
                                  (data.calculatedValues.totalExpense * 1.09) +
                                  (data.calculatedValues.nonSovExpense * 1.00) +
                                  // Labor Calculation Total (D52) - Use editable hourly rates
                                  (data.hoursSummary.straightTimeHours * hourlyRates.straightTime) +
                                  (data.hoursSummary.overtimeHours * hourlyRates.overtime) +
                                  (data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime) +
                                  // Travel costs included in subtotal before markup
                                  getTotalTravelCost()
                                ))}
                              </div>
                              <div style={{fontSize: '12px', color: 'var(--text-color)', opacity: 0.8}}>(before final mark-up)</div>
                            </div>
                            <div>
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>FINAL</div>
                              <div style={{marginBottom: '5px'}}>
                                {formatCurrency(Math.ceil((
                                  // Financial Summary Total (F46)
                                  (data.calculatedValues.totalMaterial * 1.09 * materialMarkup) +
                                  (data.calculatedValues.totalExpense * 1.09) +
                                  (data.calculatedValues.nonSovExpense * 1.00) +
                                  // Labor Calculation Total (D52) - Use editable hourly rates
                                  (data.hoursSummary.straightTimeHours * hourlyRates.straightTime) +
                                  (data.hoursSummary.overtimeHours * hourlyRates.overtime) +
                                  (data.hoursSummary.doubleTimeHours * hourlyRates.doubleTime) +
                                  // Travel costs included in subtotal before markup
                                  getTotalTravelCost()
                                ) / 0.96))}
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
                          
                          {/* Right side - CUSTOMER TOTAL COST table */}
                          <div style={{width: '35%'}}>
                            <div style={{fontWeight: 'bold', marginBottom: '10px', textAlign: 'center'}}>CUSTOMER TOTAL COST</div>
                            <table style={{...styles.table, width: '100%', fontSize: '12px'}}>
                              <tbody>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'left'}}>with NET 30</td>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30))}</td>
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'left'}}>with NET 60</td>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60))}</td>
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'left'}}>with NET 90</td>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90))}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      
                      {/* Quote Text and Terms */}
                      <div style={{...styles.summarySection, width: '100%'}}>
                        <div style={{fontWeight: 'bold', marginBottom: '10px'}}>(Copy paste below into quote)</div>
                        <div style={{fontSize: '14px', lineHeight: '1.5'}}>
                          <div style={{marginBottom: '10px'}}>
                            Mobilization costs of <b>${(() => { const f = getFinalValue(); const factor = getMobilizationFactor(f); return formatCurrency(Math.ceil(f * factor)); })()}</b> shall be paid before the first day of work in addition to:
                          </div>
                          <div style={{marginBottom: '5px'}}>
                            Option 1: Where NET 30 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net30))}
                          </div>
                          <div style={{marginBottom: '5px'}}>
                            Option 2: Where NET 60 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net60))}
                          </div>
                          <div style={{marginBottom: '5px'}}>
                            Option 3: Where NET 90 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * paymentTermFactors.net90))}
                          </div>
                          {showTravel && (
                            <div style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)'}}>
                              <div style={{fontWeight: 'bold', marginBottom: '5px'}}>Total Travel Cost:</div>
                              <div style={{fontSize: '16px', fontWeight: 'bold'}}>
                                {formatCurrency(
                                  travelData.travelExpense[0].vehicleTravelCost +
                                  travelData.travelTime[0].totalTravelLabor +
                                  travelData.perDiem[0].totalPerDiem +
                                  travelData.lodging[0].totalAmount +
                                  travelData.localMiles[0].totalLocalMilesCost +
                                  travelData.flights[0].totalFlightAmount +
                                  travelData.airTravelTime[0].totalTravelLabor +
                                  travelData.rentalCar[0].totalAmount
                                )}
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
          </div>
        </div>
      </Dialog>

      {/* Quote Selection Modal */}
      {isQuoteSelectOpen && (
        <Dialog open={isQuoteSelectOpen} onClose={() => {
          setIsQuoteSelectOpen(false);
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
            <div className="max-h-96 overflow-y-auto">
              {quotes.map((q, idx) => (
                <div key={q.id} className="mb-3 flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`quote-${idx}`}
                      checked={selectedQuotesForCombined.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQuotesForCombined(prev => [...prev, idx]);
                        } else {
                          setSelectedQuotesForCombined(prev => prev.filter(i => i !== idx));
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
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <Button onClick={() => {
                setIsCombinedQuoteSelectOpen(false);
                setSelectedQuotesForCombined([]);
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
                      <div className="text-sm font-medium">Letter # {(opportunityData as any)?.quote_number || (idx + 1)}</div>
                      <div className="text-xs text-gray-500">{l.created_at?.slice(0,10)}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => {
                        setIsLettersListOpen(false);
                        setIsLetterProposalOpen(true);
                        setLetterHtml(l.html);
                        setCurrentLetterId(l.id);
                        setNetaStandard(l.neta_standard || '');
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
      <Dialog open={isLetterProposalOpen} onClose={() => {
        setIsLetterProposalOpen(false);
        // Clear letter proposal localStorage when closing via overlay
        try {
          localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
          localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
          localStorage.removeItem(`letter-quote-index-${opportunityId}`);
          localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
        } catch {}
        // Reset mode to allow immediate reopening
        if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('resetEstimateMode'));
          }, 100);
        }
      }} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40" onClick={() => {
          setIsLetterProposalOpen(false);
          // Clear letter proposal localStorage when closing via overlay click
          try {
            localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
            localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
            localStorage.removeItem(`letter-quote-index-${opportunityId}`);
            localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
          } catch {}
          // Reset mode to allow immediate reopening
          if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('resetEstimateMode'));
            }, 100);
          }
        }} />
        <div className="relative z-50 bg-white w-full h-full max-w-5xl mx-auto my-8 rounded-lg shadow-lg flex flex-col">
          <div className="flex justify-between items-center p-4 border-b">
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
                    setCurrentLetterId(null);
                    setIsLetterProposalOpen(false);
                    // Clear letter proposal localStorage when deleting
                    try {
                      localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
                      localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
                      localStorage.removeItem(`letter-quote-index-${opportunityId}`);
                      localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
                    } catch {}
                    // Reset mode to allow immediate reopening
                    if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                      }, 100);
                    }
                    alert('Letter deleted');
                  } catch (e: any) {
                    alert('Failed to delete letter: ' + (e?.message || 'Unknown error'));
                  }
                }} className="bg-red-600 text-white">Delete</Button>
              ) : null}
              <Button onClick={async () => {
                try {
                  // Extract NET 30 price from the letter HTML
                  let net30Price = 0;
                  
                  // For single letter proposals, extract from the selected quote
                  if (selectedLetterQuoteIndex !== null && quotes[selectedLetterQuoteIndex]) {
                    const selectedQuote = quotes[selectedLetterQuoteIndex];
                    let parsedData = selectedQuote.data;
                    if (typeof parsedData === 'string') {
                      try {
                        parsedData = JSON.parse(parsedData);
                      } catch (e) {
                        parsedData = {};
                      }
                    }
                    
                    // Calculate NET 30 price from the selected quote
                    const finalValue = (() => {
                      const cv = parsedData.calculatedValues || {};
                      const hs = parsedData.hoursSummary || {};
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
                        (straightTimeHours * hourlyRates.straightTime) +
                        (overtimeHours * hourlyRates.overtime) +
                        (doubleTimeHours * hourlyRates.doubleTime)
                      );
                    })();
                    
                    // Add travel cost
                    const parsedTravel = (() => {
                      let source: any = (selectedQuote as any)?.travel_data ?? null;
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
                    
                    net30Price = Math.ceil((finalValue + getParsedTotalTravelCost()) / 0.96);
                  }
                  
                  // For combined letter proposals, extract from the combined total
                  if (selectedQuotesForCombined.length > 0) {
                    const selectedQuotes = selectedQuotesForCombined.map(idx => quotes[idx]);
                    const processedQuotes = selectedQuotes.map((quote) => {
                      let parsedData = quote.data;
                      if (typeof parsedData === 'string') {
                        try {
                          parsedData = JSON.parse(parsedData);
                        } catch (e) {
                          parsedData = {};
                        }
                      }
                      
                      const finalValue = (() => {
                        const cv = parsedData.calculatedValues || {};
                        const hs = parsedData.hoursSummary || {};
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
                          (straightTimeHours * hourlyRates.straightTime) +
                          (overtimeHours * hourlyRates.overtime) +
                          (doubleTimeHours * hourlyRates.doubleTime)
                        );
                      })();
                      
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
                      
                      return Math.ceil((finalValue + getParsedTotalTravelCost()) / 0.96);
                    });
                    
                    net30Price = processedQuotes.reduce((sum, price) => sum + price, 0);
                  }
                  
                  const payload: any = {
                    opportunity_id: opportunityId,
                    html: letterHtml,
                    quote_number: (opportunityData as any)?.quote_number || null,
                    neta_standard: netaStandard || null,
                    data: {
                      calculatedValues: data.calculatedValues,
                      hoursSummary: data.hoursSummary,
                    }
                  };
                  
                  if (currentLetterId) {
                    const { error } = await supabase
                      .schema('business')
                      .from('letter_proposals')
                      .update(payload)
                      .eq('id', currentLetterId);
                    if (error) throw error;
                    
                    // Update quoted_amount in opportunities table
                    if (net30Price > 0) {
                      const { error: updateError } = await supabase
                        .schema('business')
                        .from('opportunities')
                        .update({ quoted_amount: net30Price })
                        .eq('id', opportunityId);
                      if (updateError) {
                        console.warn('Failed to update quoted_amount:', updateError);
                      }
                    }
                    
                    // Update letter proposal date and notify parent when letter is saved
                    updateLetterProposalCreatedDate();
                    alert('Letter updated successfully');
                  } else {
                    const { data: inserted, error } = await supabase
                      .schema('business')
                      .from('letter_proposals')
                      .insert(payload)
                      .select('id')
                      .single();
                    if (error) throw error;
                    setCurrentLetterId(inserted?.id || null);
                    
                    // Update quoted_amount in opportunities table
                    if (net30Price > 0) {
                      const { error: updateError } = await supabase
                        .schema('business')
                        .from('opportunities')
                        .update({ quoted_amount: net30Price })
                        .eq('id', opportunityId);
                      if (updateError) {
                        console.warn('Failed to update quoted_amount:', updateError);
                      }
                    }
                    
                    // Update letter proposal date and notify parent when letter is saved
                    updateLetterProposalCreatedDate();
                    alert('Letter saved successfully');
                  }
                } catch (e: any) {
                  console.error('Save letter failed', e);
                  alert('Failed to save letter: ' + (e?.message || 'Unknown error'));
                }
              }} className="bg-[#f26722] text-white">Save Letter</Button>
              <Button onClick={handlePrintLetter} className="bg-[#f26722] text-white">Print</Button>
              <Button onClick={() => {
                setIsLetterProposalOpen(false);
                // Clear letter proposal localStorage when deliberately closing
                try {
                  localStorage.removeItem(`letter-proposal-draft-${opportunityId}`);
                  localStorage.removeItem(`letter-proposal-open-${opportunityId}`);
                  localStorage.removeItem(`letter-quote-index-${opportunityId}`);
                  localStorage.removeItem(`letter-neta-standard-${opportunityId}`);
                } catch {}
                // Reset mode to allow immediate reopening
                if (mode === 'letter' || mode === 'letters' || mode === 'combined-letter') {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('resetEstimateMode'));
                  }, 100);
                }
              }}>Close</Button>
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
                // Only update state if content actually changed
                if (newHtml !== letterHtml) {
                  setLetterHtml(newHtml);
                }
              }}
              onBlur={() => {
                try {
                  const container = document.createElement('div');
                  container.innerHTML = letterHtml;
                  const sel = container.querySelector('#neta-standard-select') as HTMLSelectElement | null;
                  const txt = container.querySelector('#neta-standard-text') as HTMLElement | null;
                  if (sel && txt) {
                    const selected = sel.options[sel.selectedIndex]?.text || '';
                    txt.textContent = selected || txt.textContent;
                  }
                  letterUpdateSourceRef.current = 'programmatic';
                  // Only update HTML if it actually changed to avoid resetting caret unnecessarily
                  if (container.innerHTML !== letterHtml) {
                    setLetterHtml(container.innerHTML);
                  }
                } catch {}
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
} 