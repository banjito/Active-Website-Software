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
  mode?: 'new' | 'view' | 'letter' | 'letters';
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
}

export default function EstimateSheet({ opportunityId, mode }: EstimateSheetProps) {
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
  const [data, setData] = useState<EstimateData>({
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
  });
  const [itemColWidth, setItemColWidth] = useState<number>(240);
  const itemHeaderRef = useRef<HTMLTableCellElement>(null);
  const isResizingItemRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onItemMouseDown = (e: React.MouseEvent) => {
    if (!itemHeaderRef.current) return;
    isResizingItemRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = itemColWidth;
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isResizingItemRef.current) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.max(120, Math.min(600, startWidthRef.current + delta));
    setItemColWidth(next);
    e.preventDefault();
  };

  const onMouseUp = () => {
    if (isResizingItemRef.current) {
      isResizingItemRef.current = false;
    }
  };
  
  // Fetch opportunity data
  useEffect(() => {
    async function fetchOpportunityData() {
      try {
        // 1. Fetch Opportunity from business schema
        const opportunityColumns = 'id, description, customer_id, quote_number';
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
          // Fetch primary contact for this customer
          const { data: contactList, error: contactError } = await supabase
            .schema('common')
            .from('contacts')
            .select('first_name, last_name, is_primary')
            .eq('customer_id', oppData.customer_id)
            .order('is_primary', { ascending: false });
          if (!contactError && contactList && contactList.length > 0) {
            // Use primary if available, else first
            const primary = contactList.find((c: any) => c.is_primary);
            setContactData(primary || contactList[0]);
          } else {
            setContactData(null);
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

  useEffect(() => {
    fetchEstimateData();
  }, [opportunityId]);

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
    
    const randomQuoteNumber = () => Math.floor(100000 + Math.random() * 900000).toString();

    const quoteRecord = {
      opportunity_id: opportunityId,
      // Use current state data and travelData for saving
      data: JSON.stringify(data), 
      travel_data: showTravel ? JSON.stringify(travelData) : null,
      quote_number: randomQuoteNumber()
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
      (data.calculatedValues.totalMaterial * 1.09 * 1.3) +
      (data.calculatedValues.totalExpense * 1.09) +
      (data.calculatedValues.nonSovExpense * 1.00) +
      // Labor Calculation Total (D52)
      (data.hoursSummary.straightTimeHours * 240) +
      (data.hoursSummary.overtimeHours * 360) +
      (data.hoursSummary.doubleTimeHours * 480) +
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
    
    setData(prev => ({
      ...prev,
      [itemsKey]: newItems
    }));
  };

  const handleGeneralChange = (field: string, value: string) => {
    setData(prev => ({
      ...prev,
      [field]: value
    }));
  };



  const handleHoursSummaryChange = (field: string, value: string) => {
    setData(prev => ({
      ...prev,
      hoursSummary: {
        ...prev.hoursSummary,
        [field]: Number(value)
      }
    }));
  };

  // Recalculate all values when data changes
  useEffect(() => {
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
        straightTimeHours: straightTimeHours,
        overtimeHours: overtimeHours,
        doubleTimeHours: doubleTimeHours
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

  const [isQuoteSelectOpen, setIsQuoteSelectOpen] = useState(false);
  const [isLetterProposalOpen, setIsLetterProposalOpen] = useState(false);
  const [isLettersListOpen, setIsLettersListOpen] = useState(false);
  const [letters, setLetters] = useState<Array<{ id: string; html: string; created_at: string; quote_number?: string; neta_standard?: string }>>([]);
  const [selectedLetterIndex, setSelectedLetterIndex] = useState<number>(-1);
  const [currentLetterId, setCurrentLetterId] = useState<string | null>(null);
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
    { value: 'both', text: 'All work will be performmed in accordance with the applicable ANSI/NETA ATS/MTS & IEEE 81 Standards.' }
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
    try {
      // Write HTML without triggering React re-render of contentEditable
      if (editor.innerHTML !== letterHtml) {
        editor.innerHTML = letterHtml;
      }
      // Restore caret at end to avoid jump-to-top-left
      editor.focus();
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    } catch {}
  }, [letterHtml]);

  function handleSelectQuoteForLetter(index: number) {
    setSelectedLetterQuoteIndex(index);
    setIsQuoteSelectOpen(false);
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
      sovItems = parsedData.sovItems;
    }
    // --- Get customer total cost for options ---
    function getFinalValueFromParsed(parsed: any) {
      // Defensive: fallback to 0 if missing
      const cv = parsed.calculatedValues || {};
      const hs = parsed.hoursSummary || {};
      const totalMaterial = cv.totalMaterial || 0;
      const totalExpense = cv.totalExpense || 0;
      const nonSovExpense = cv.nonSovExpense || 0;
      const straightTimeHours = hs.straightTimeHours || 0;
      const overtimeHours = hs.overtimeHours || 0;
      const doubleTimeHours = hs.doubleTimeHours || 0;
      // Same as getFinalValue in sheet
      return Math.ceil(((totalMaterial * 1.09 * 1.3) + (totalExpense * 1.09) + (nonSovExpense * 1.00) + (straightTimeHours * 240) + (overtimeHours * 360) + (doubleTimeHours * 480)) / 0.96);
    }
    function formatCurrency(amount: number) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    // Include travel cost from parsed travel_data when computing final for letter
    const parsedTravel = (() => {
      const t = parsedData?.travel_data ? (typeof parsedData.travel_data === 'string' ? (() => { try { return JSON.parse(parsedData.travel_data); } catch { return null; } })() : parsedData.travel_data) : null;
      return t || {};
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
    const finalValue = Math.ceil((getFinalValueFromParsed(parsedData) + getParsedTotalTravelCost()) );
    const mobilization = (() => {
      const factor = getMobilizationFactor(finalValue);
      return formatCurrency(Math.ceil(finalValue * factor));
    })();
    const option1 = formatCurrency(finalValue * 1);
    const option2 = formatCurrency(Math.ceil(finalValue * 1.06));
    const option3 = formatCurrency(Math.ceil(finalValue * 1.09));
    const sovTableRows = sovItems && sovItems.length > 0
      ? sovItems.map((item: any) => {
          const name = item.item || '';
          const qty = item.quantity ?? item.qty ?? '';
          return `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>${name}</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>${qty}</td></tr>`;
        }).join('')
      : `<tr><td style='padding:4px 12px;border:1px solid #ccc;'>24-hour Power Study</td><td style='padding:4px 12px;border:1px solid #ccc;text-align:center;'>1</td></tr>`;

    const contactName = contactData ? `${contactData.first_name} ${contactData.last_name}`.trim() : (customer.name || 'Contact Name');
    // Prefer opportunity's quote_number for the letter number
    const letterQuoteNumber = (opportunityData as any)?.quote_number || quote.id?.slice(0,6) || (index + 1);

    const signatureUrl = (window as any)?.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
    setLetterHtml(`
      <div id="letter-proposal" class="print-content" style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; position:relative; min-height: 1100px;">
        <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 8px; margin-bottom: 24px;">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 40px; margin-right: 12px;" />
          <span style="font-size: 1.2em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
        </div>
        <div>Date: ${dateStr}</div>
        <div style="margin-bottom: 12px;"><b>Letter # ${letterQuoteNumber}</b></div>
        <div>
          ${contactName}<br/>
          ${customer.company_name || 'Company'}<br/>
          ${customer.address || 'Address'}<br/>
        </div>
        <div style="margin: 16px 0;">Dear Mr./Ms. ${contactName},</div>
        <div>AMP LLC is pleased to offer the following proposal for your consideration.</div>
        <div style="margin: 16px 0;">AMP LLC will furnish field technical services, tooling, instrumentation, and equipment to perform the listed scope at <span style='border-bottom:1px dotted #aaa;'>_______</span></div>
        <div style="margin: 16px 0;"><b>NETA Standard:</b>
          <span id="neta-standard-text" style="margin-left:6px;">${NETA_OPTIONS.find(o => o.value === netaStandard)?.text || '[Select NETA Standard]'}</span>
        </div>
        <div><b>Scope</b></div>
        <table style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
          <thead>
            <tr><th style='border:1px solid #ccc;padding:4px 12px;text-align:left;'>Name</th><th style='border:1px solid #ccc;padding:4px 12px;text-align:center;'>Quantity</th></tr>
          </thead>
          <tbody>
            ${sovTableRows}
          </tbody>
        </table>
        <div style="margin-top: 24px;"><b>Pricing & Terms</b></div>
        <div>Mobilization costs of ${mobilization} shall be paid before the first day of work in addition to:</div>
        <ul style="margin-top: 8px;">
          <li>Option 1: Where NET 30 Terms are applicable and agreed upon: <b>${option1}</b></li>
          <li>Option 2: Where NET 60 Terms are applicable and agreed upon: <b>${option2}</b></li>
          <li>Option 3: Where NET 90 Terms are applicable and agreed upon: <b>${option3}</b></li>
        </ul>
        <div style="margin-top: 12px;">AMP LLC does not offer or accept terms greater than 90 days. No retainage is allowed. This work is subject to progress billing where applicable.</div>
        <div style="margin-top: 12px;">This price is based upon the following:</div>
        <ol style="margin-left: 20px;">
          <li>The schedule for this work will be mutually determined.</li>
          <li>Work to be performed during normal working hours, Monday through Friday.</li>
          <li>Repairs and/or retests, if required, will be separately quoted.</li>
          <li>All site work delays beyond AMP Quality Energy Services control will be billed in accordance with AMP Quality Energy Services 2025 T&M Rate Sheet.</li>
          <li>Aerial lift for overhead work to be provided by others.</li>
          <li>Arc flash analysis, short circuit, and coordination study to be provided by others.</li>
          <li>All work performed by AMP will be in accordance with the safety policy attached</li>
        </ol>
        <div style="margin-top: 24px;"><b>Conclusion</b></div>
        <div>This proposal is valid for 120 days.</div>
        <div style="margin-top: 16px;">We appreciate the opportunity to provide a proposal for this scope of work. AMP Quality Energy Services enjoys the opportunity to display our core principles daily: Attentiveness, Commitment, Creativity, Dependability, Diligence, Integrity, and Poise. If we ever fall short of these values, we ask that you inform us, so we may do whatever it takes to elicit forgiveness.</div>
        <div style="margin-top: 16px;">Please send purchase orders to <a href="mailto:purchaseorders@ampqes.com">purchaseorders@ampqes.com</a>.</div>
        <div>Should you have any questions please contact the undersigned.</div>
        <div style="margin-top: 20px;">Sincerely,</div>
        <div style="margin: 10px 0 6px 0; min-height: 60px;">
          <img src="${signatureUrl}" alt="Signature" style="height: 60px; max-width: 280px; object-fit: contain;" onerror="this.style.display='none'"/>
        </div>
        <div>Brian Rodgers</div>
        <div>Chief Executive Officer</div>
        <div style="text-align:center; margin-top: 16px; font-size: 0.95em; color: #444;">END OF LETTER</div>
        <div class="amp-footer" style="position:absolute;left:0;right:0;bottom:0;width:100%;font-size:0.9em;color:#555;border-top:1px solid #ccc;padding:8px 0;text-align:center;background:white;">P.O. Box 526 | Huntsville, Alabama 35804 | (256) 513-8255</div>
        <div style="page-break-after: always; margin-top: 40px;"></div>
        <div style="margin-top: 32px;">
          <div style="display: flex; align-items: center; border-bottom: 2px solid #f26722; padding-bottom: 8px; margin-bottom: 24px;">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" style="height: 40px; margin-right: 12px;" />
            <span style="font-size: 1.2em; font-weight: bold; color: #333;">| <i>Quality Energy Services</i></span>
          </div>
          <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 16px;">Safety Policy on Jobsites</div>
          <div style="font-weight: bold; margin-bottom: 8px;">LOCKOUT / TAGOUT</div>
          <div>On a jobsite where the customer has an established Lockout program or there is a lockout procedure already established, AMP employees will follow local Lockout program provided that it does not expose the employee to greater risk than the AMP procedure below.</div>
          <div style="margin-top: 12px;">In the absence of a local lockout procedure, AMP employees will follow the following procedure.</div>
          <ul style="margin-left: 20px;">
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
          <div class="print-page-break"></div>
          <div style="margin-top: 12px; font-weight: bold;">Procedure Involving More Than One Person.</div>
          <div class="procedure-section">For a simple lockout/tagout and where more than one person is involved in the job or task, each person shall install his or her own personal lockout (tagout) device.</div>
          <div style="margin-top: 16px;" class="procedure-section">Safety is the utmost priority at AMP Quality Energy Services and we reserve the right to stop work on any project that our technicians deem as unsafe. AMP Quality Energy Services technicians follow NFPA 70E, ANSI, NETA, and OSHA safety guidelines. Lock out/Tag out of all energy sources is required prior to working on an electrical system. Any exceptions to the above-mentioned specifications will need to be made in writing prior to shut-down for our safety officer's evaluation. Drop hazard mitigation shall be implemented while working at heights.</div>
          <div style="margin-top: 32px; font-size: 1.1em; font-weight: bold; text-align: center;">END OF SAFETY POLICY</div>
        </div>
      </div>
    `);
    setIsLetterProposalOpen(true);
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
          ul, ol, li, p, div { break-inside: avoid; }
          .procedure-section { break-inside: avoid; }
          .print-page-break { page-break-before: always; break-before: page; }
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
      // Use whatever opportunityData is available now
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
    } else if (mode === 'view') {
      setIsNewQuote(false);
      setIsOpen(true);
      setIsViewMode(true);
    } else if (mode === 'letter') {
      setIsOpen(false); // Ensure saved estimates modal is closed
      handleGenerateLetterProposal();
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

  // Mobilization factor based on threshold cost
  function getMobilizationFactor(finalValue: number) {
    if (finalValue > 1000000) return 0.05;
    if (finalValue > 500000) return 0.05;
    if (finalValue > 100000) return 0.10;
    return 0.00;
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
        </>
      )}

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
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
                onClick={() => setIsOpen(false)}
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
                      <Tab
                        key={quote.id}
                        className={({ selected }) =>
                          `px-4 py-2 text-sm font-medium rounded-t-lg focus:outline-none ${
                            selected
                              ? 'bg-[#f26722] text-white'
                              : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                          }`
                        }
                        onClick={() => {
                          setSelectedQuoteIndex(index);
                          loadQuoteData(quote);
                        }}
                      >
                        Quote {(opportunityData as any)?.quote_number || quote.id?.slice(0,6) || index + 1}
                      </Tab>
                    ))}
                  </Tab.List>
                </Tab.Group>
              ) : null}

              <div className="mt-4">
                <div style={styles.app}>
                  {/* New Header Layout - Project Info on Left, Page Numbering and Notes on Right */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '30px',
                    marginBottom: '20px',
                    alignItems: 'start'
                  }}>
                    {/* Left Side - Project Information */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '15px'
                    }}>
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
                        <label style={styles.formLabel}>Job Description:</label>
                        <input 
                          type="text" 
                          style={styles.formInput}
                          value={data.jobDescription} 
                          onChange={(e) => handleGeneralChange('jobDescription', e.target.value)}
                          readOnly={isViewMode}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Date Due:</label>
                        <input 
                          type="date" 
                          style={styles.formInput}
                          value={data.dateDue} 
                          onChange={(e) => handleGeneralChange('dateDue', e.target.value)}
                          readOnly={isViewMode}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Location / Address:</label>
                        <input 
                          type="text" 
                          style={styles.formInput}
                          value={data.location} 
                          onChange={(e) => handleGeneralChange('location', e.target.value)}
                          readOnly={isViewMode}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Period of Performance:</label>
                        <input 
                          type="text" 
                          style={styles.formInput}
                          value={data.periodOfPerformance} 
                          onChange={(e) => handleGeneralChange('periodOfPerformance', e.target.value)}
                          readOnly={isViewMode}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Estimated Start Date:</label>
                        <input 
                          type="date" 
                          style={styles.formInput}
                          value={data.estimatedStartDate} 
                          onChange={(e) => handleGeneralChange('estimatedStartDate', e.target.value)}
                          readOnly={isViewMode}
                        />
                      </div>
                    </div>
                    
                    {/* Right Side - Page Numbering and Notes */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px'
                    }}>
                      {/* Page Numbering */}
                      <div style={{
                        textAlign: 'right',
                        marginBottom: '10px'
                      }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: 'var(--text-color)',
                          marginBottom: '5px'
                        }}>
                          SHEET {isNewQuote ? '1' : (selectedQuoteIndex + 1)} OF {isNewQuote ? '1' : Math.max(quotes.length, 1)}
                        </div>
                      </div>
                      
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
                      
                      {/* PO Number */}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>PO Number:</label>
                        <input 
                          type="text" 
                          style={styles.formInput}
                          value={data.poNumber} 
                          onChange={(e) => handleGeneralChange('poNumber', e.target.value)}
                        />
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
                            <tr key={index}>
                              <td style={{...styles.tableCell, width: itemColWidth}}>
                                <input 
                                  type="text" 
                                  style={styles.tableInput}
                                  value={item.item} 
                                  onChange={(e) => handleItemChange('sov', index, 'item', e.target.value)}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  style={styles.tableInput}
                                  value={item.quantity} 
                                  onChange={(e) => handleItemChange('sov', index, 'quantity', e.target.value)}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.materialPrice} 
                                  onChange={(e) => handleItemChange('sov', index, 'materialPrice', e.target.value)}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.expensePrice} 
                                  onChange={(e) => handleItemChange('sov', index, 'expensePrice', e.target.value)}
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
                                  onChange={(e) => handleItemChange('sov', index, 'laborMen', e.target.value)}
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td style={styles.tableCell}>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  style={styles.tableInput}
                                  value={item.laborHours} 
                                  onChange={(e) => handleItemChange('sov', index, 'laborHours', e.target.value)}
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    <div className="mt-4 flex justify-end space-x-4">
                      <Button
                        onClick={() => handleAddLine('sov')}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        Add SOV Line
                      </Button>
                      <Button
                        onClick={toggleTravel}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        {showTravel ? 'Hide Travel' : 'Add Travel'}
                      </Button>
                    </div>
                  </div>

                  {/* Non-SOV Quote Items */}
                  <div style={styles.sectionHeader}>NON-SOV QUOTE ITEMS</div>
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.tableHeader}>ITEM</th>
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
                        </tr>
                      </thead>
                      <tbody>
                        {data.nonSovItems.map((item, index) => {
                          const materialExtension = calculateMaterialExtension(item.quantity, item.materialPrice);
                          const expenseExtension = calculateExpenseExtension(item.quantity, item.expensePrice);
                          const laborUnit = calculateLaborUnit(item.laborMen, item.laborHours);
                          const laborTotal = calculateLaborTotal(item.quantity, item.laborMen, item.laborHours);
                          
                          return (
                            <tr key={index}>
                              <td style={styles.tableCell}>
                                <input 
                                  type="text" 
                                  style={styles.tableInput}
                                  value={item.item} 
                                  onChange={(e) => handleItemChange('nonSov', index, 'item', e.target.value)}
                                  readOnly={isViewMode}
                                />
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={() => handleAddLine('nonSov')}
                        className="bg-[#f26722] text-white hover:bg-[#f26722]/90 transition-colors"
                      >
                        Add Non-SOV Line
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
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1.3</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalMaterial * 1.09 * 1.3)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>EXPENSE TOTAL (From Sheet 1):</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1.09</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense * 1.09)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.totalExpense * 1.09)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>EXPENSE TOTAL (From Sheet 2):</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.nonSovExpense)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1.00</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.nonSovExpense * 1.00)}</td>
                            <td style={{...styles.tableCell, padding: '12px 8px'}}>1</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.calculatedValues.nonSovExpense * 1.00)}</td>
                          </tr>
                          <tr style={{...styles.tfoot}}>
                            <td colSpan={5} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatCurrency(
                                (data.calculatedValues.totalMaterial * 1.09 * 1.3) +
                                (data.calculatedValues.totalExpense * 1.09) +
                                (data.calculatedValues.nonSovExpense * 1.00)
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                                      </div>
                  
                  {/* Labor Calculation Table - Under Financial Summary */}
                  <div style={{...styles.summarySection, width: '700px', marginTop: '20px'}}>
                    <h3 style={{...styles.sectionHeader, marginBottom: '15px'}}>(excludes travel hours)</h3>
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
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatNumber(data.hoursSummary.straightTimeHours)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>$240.00</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.straightTimeHours * 240)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ OVERTIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatNumber(data.hoursSummary.overtimeHours)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>$360.00</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.overtimeHours * 360)}</td>
                          </tr>
                          <tr>
                            <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>LABOR @ DOUBLE TIME:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatNumber(data.hoursSummary.doubleTimeHours)}</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>$480.00</td>
                            <td style={{...styles.tableCell, ...styles.calculated, padding: '12px 8px'}}>{formatCurrency(data.hoursSummary.doubleTimeHours * 480)}</td>
                          </tr>
                          <tr style={{...styles.tfoot}}>
                            <td colSpan={3} style={{...styles.tableCell, textAlign: 'right', fontWeight: 'bold', padding: '12px 8px'}}>Total:</td>
                            <td style={{...styles.tableCell, ...styles.calculated, fontWeight: 'bold', padding: '12px 8px'}}>
                              {formatCurrency(
                                (data.hoursSummary.straightTimeHours * 240) +
                                (data.hoursSummary.overtimeHours * 360) +
                                (data.hoursSummary.doubleTimeHours * 480)
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
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>1</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 1))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>NET 60</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>1.06</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 1.06))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>NET 90</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>1.09</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 1.09))}</td>
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
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>0.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 0.00))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$100,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>0.10</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{(() => { const f = getFinalValue(); const factor = getMobilizationFactor(f); return formatCurrency(Math.ceil(f * factor)); })()}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$500,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>0.05</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 0.05))}</td>
                            </tr>
                            <tr>
                              <td style={{...styles.tableCell, fontWeight: 'bold', padding: '12px 8px', textAlign: 'left'}}>$1,000,000.00</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>0.05</td>
                              <td style={{...styles.tableCell, padding: '12px 8px'}}>{formatCurrency(Math.ceil(getFinalValue() * 0.05))}</td>
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
                                  (data.calculatedValues.totalMaterial * 1.09 * 1.3) +
                                  (data.calculatedValues.totalExpense * 1.09) +
                                  (data.calculatedValues.nonSovExpense * 1.00) +
                                  // Labor Calculation Total (D52)
                                  (data.hoursSummary.straightTimeHours * 240) +
                                  (data.hoursSummary.overtimeHours * 360) +
                                  (data.hoursSummary.doubleTimeHours * 480) +
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
                                  (data.calculatedValues.totalMaterial * 1.09 * 1.3) +
                                  (data.calculatedValues.totalExpense * 1.09) +
                                  (data.calculatedValues.nonSovExpense * 1.00) +
                                  // Labor Calculation Total (D52)
                                  (data.hoursSummary.straightTimeHours * 240) +
                                  (data.hoursSummary.overtimeHours * 360) +
                                  (data.hoursSummary.doubleTimeHours * 480) +
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
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * 1))}</td>
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'left'}}>with NET 60</td>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * 1.06))}</td>
                                </tr>
                                <tr>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'left'}}>with NET 90</td>
                                  <td style={{...styles.tableCell, padding: '8px', textAlign: 'right'}}>{formatCurrency(Math.ceil(getFinalValue() * 1.09))}</td>
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
                            Option 1: Where NET 30 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * 1))}
                          </div>
                          <div style={{marginBottom: '5px'}}>
                            Option 2: Where NET 60 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * 1.06))}
                          </div>
                          <div style={{marginBottom: '5px'}}>
                            Option 3: Where NET 90 Terms are applicable and agreed upon: {formatCurrency(Math.ceil(getFinalValue() * 1.09))}
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
      {isQuoteSelectOpen && !isLetterProposalOpen && (
        <Dialog open={isQuoteSelectOpen} onClose={() => setIsQuoteSelectOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold mb-4">Select a Quote</h2>
            <ul>
              {quotes.map((q, idx) => (
                <li key={q.id} className="mb-2 flex items-center justify-between">
                  <span>Quote {(opportunityData as any)?.quote_number || q.id?.slice(0,6) || (idx + 1)} - {q.created_at?.slice(0,10)}</span>
                  <Button onClick={() => handleSelectQuoteForLetter(idx)} className="bg-[#f26722] text-white ml-2">Select</Button>
                </li>
              ))}
            </ul>
            <Button onClick={() => setIsQuoteSelectOpen(false)} className="mt-4">Cancel</Button>
          </div>
        </Dialog>
      )}

      {/* Saved Letters Modal */}
      {isLettersListOpen && (
        <Dialog open={isLettersListOpen} onClose={() => setIsLettersListOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
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
              <Button onClick={() => setIsLettersListOpen(false)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Letter Proposal Modal */}
      <Dialog open={isLetterProposalOpen} onClose={() => setIsLetterProposalOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40" onClick={() => setIsLetterProposalOpen(false)} />
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
                    alert('Letter deleted');
                  } catch (e: any) {
                    alert('Failed to delete letter: ' + (e?.message || 'Unknown error'));
                  }
                }} className="bg-red-600 text-white">Delete</Button>
              ) : null}
              <Button onClick={async () => {
                try {
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
                    alert('Letter saved successfully');
                  }
                } catch (e: any) {
                  console.error('Save letter failed', e);
                  alert('Failed to save letter: ' + (e?.message || 'Unknown error'));
                }
              }} className="bg-[#f26722] text-white">Save Letter</Button>
              <Button onClick={handlePrintLetter} className="bg-[#f26722] text-white">Print</Button>
              <Button onClick={() => setIsLetterProposalOpen(false)}>Close</Button>
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
                setLetterHtml((e.target as HTMLElement).innerHTML);
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