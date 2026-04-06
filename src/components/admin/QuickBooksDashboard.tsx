import React, { useState, useEffect, useMemo } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { 
  RefreshCw, 
  DollarSign, 
  AlertCircle, 
  CheckCircle, 
  FileText, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Wallet,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Receipt,
  Clock,
  CheckCircle2,
  PiggyBank,
  ArrowRightLeft,
  Users,
  User,
  Timer,
  Briefcase,
  Building2,
  Package,
  FileSpreadsheet,
  ShoppingCart,
  Truck,
  Tag,
  Layers,
  GitBranch,
  Calculator,
  ReceiptText,
  Undo2,
  Building,
  ClipboardList,
  BadgePercent,
  CalendarDays
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { 
  getQuickBooksStatus, 
  getQuickBooksCompanyInfo,
  getQuickBooksInvoices,
  getQuickBooksProfitAndLoss,
  getQuickBooksAccounts,
  getQuickBooksPurchases,
  getQuickBooksPayments,
  getQuickBooksDeposits,
  getQuickBooksCashFlow,
  getQuickBooksEmployees,
  getQuickBooksTimeActivities,
  getQuickBooksCustomers,
  getQuickBooksVendors,
  getQuickBooksEstimates,
  getQuickBooksBills,
  getQuickBooksItems,
  getQuickBooksSalesReceipts,
  getQuickBooksCreditMemos,
  getQuickBooksRefundReceipts,
  getQuickBooksJournalEntries,
  getQuickBooksClasses,
  getQuickBooksDepartments,
  getQuickBooksBillPayments,
  getQuickBooksVendorCredits,
  getQuickBooksTransfers,
  getQuickBooksPaymentMethods,
  getQuickBooksPurchaseOrders,
  getQuickBooksTaxCodes,
  getQuickBooksTerms,
  getQuickBooksPayrollSummary,
  getQuickBooksPayrollDetails,
  getQuickBooksTimeOffBalances,
  getQuickBooksEmployeeCompensation
} from '@/services/quickbooksService';

export const QuickBooksDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [profitAndLoss, setProfitAndLoss] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeActivities, setTimeActivities] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [salesReceipts, setSalesReceipts] = useState<any[]>([]);
  const [creditMemos, setCreditMemos] = useState<any[]>([]);
  const [refundReceipts, setRefundReceipts] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [billPayments, setBillPayments] = useState<any[]>([]);
  const [vendorCredits, setVendorCredits] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<any>(null);
  const [payrollDetails, setPayrollDetails] = useState<any>(null);
  const [timeOffBalances, setTimeOffBalances] = useState<any>(null);
  const [employeeCompensation, setEmployeeCompensation] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Pagination state for each table
  const [pages, setPages] = useState<Record<string, number>>({
    customers: 1,
    bills: 1,
    salesReceipts: 1,
    creditMemos: 1,
    journalEntries: 1,
    purchaseOrders: 1,
    transfers: 1,
    employees: 1,
    timeActivities: 1,
    transactions: 1,
  });
  
  const ITEMS_PER_PAGE = 20;
  
  // Pagination helper
  const setPage = (table: string, page: number) => {
    setPages(prev => ({ ...prev, [table]: page }));
  };

  // Pagination Component
  const Pagination = ({ 
    currentPage, 
    totalItems, 
    itemsPerPage = ITEMS_PER_PAGE, 
    onPageChange,
    tableName 
  }: { 
    currentPage: number; 
    totalItems: number; 
    itemsPerPage?: number;
    onPageChange: (page: number) => void;
    tableName: string;
  }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    if (totalPages <= 1) return null;
    
    // Generate page numbers to show
    const getPageNumbers = () => {
      const pages: (number | string)[] = [];
      const showPages = 5; // Number of page buttons to show
      
      if (totalPages <= showPages + 2) {
        // Show all pages
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        // Show first, last, and pages around current
        pages.push(1);
        
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);
        
        if (currentPage <= 3) {
          end = 4;
        } else if (currentPage >= totalPages - 2) {
          start = totalPages - 3;
        }
        
        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) pages.push('...');
        
        pages.push(totalPages);
      }
      
      return pages;
    };
    
    return (
      <div className="flex items-center justify-between mt-4 pt-4 border-t">
        <span className="text-sm text-gray-500">
          Showing {startItem}-{endItem} of {totalItems}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          {getPageNumbers().map((page, idx) => (
            typeof page === 'number' ? (
              <button
                key={idx}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 text-sm rounded ${
                  currentPage === page
                    ? 'bg-[#f26722] text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={idx} className="px-2 text-gray-400">...</span>
            )
          ))}
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };
  
  // Toggle states for cash flow view
  const [showCashBalance, setShowCashBalance] = useState(true);
  const [showMoneyIn, setShowMoneyIn] = useState(true);
  const [showMoneyOut, setShowMoneyOut] = useState(true);
  // View mode: 'balance' or 'moneyInOut'
  const [cashFlowViewMode, setCashFlowViewMode] = useState<'balance' | 'moneyInOut'>('balance');
  
  // Expanded sections
  const [expandedSection, setExpandedSection] = useState<string | null>('cashFlow');
  
  // Date range state - separate for each section
  type DateRangeType = 'last30days' | 'thisMonth' | 'thisMonthToDate' | 
    'thisFiscalQuarter' | 'thisFiscalQuarterToDate' |
    'thisFiscalYear' | 'thisFiscalYearToDate' |
    'lastMonth' | 'lastFiscalQuarter' | 'lastFiscalYear';
    
  // Individual date ranges for each section
  const [profitLossDateRange, setProfitLossDateRange] = useState<DateRangeType>('last30days');
  const [expensesDateRange, setExpensesDateRange] = useState<DateRangeType>('last30days');
  const [transactionsDateRange, setTransactionsDateRange] = useState<DateRangeType>('last30days');
  
  // Cash flow separate timeline
  type CashFlowPeriod = '3months' | '6months' | '9months' | '12months';
  const [cashFlowPeriod, setCashFlowPeriod] = useState<CashFlowPeriod>('12months');

  useEffect(() => {
    loadData();
  }, []);

  // Calculate date range
  const getDateRangeFor = (range: DateRangeType) => {
    const today = new Date();
    let startDate: Date;
    let endDate = new Date(today);

    const fiscalYearStartMonth = 0;
    const currentFiscalYearStart = today.getMonth() >= fiscalYearStartMonth 
      ? new Date(today.getFullYear(), fiscalYearStartMonth, 1)
      : new Date(today.getFullYear() - 1, fiscalYearStartMonth, 1);

    const monthInFiscalYear = (today.getMonth() - fiscalYearStartMonth + 12) % 12;
    const currentQuarter = Math.floor(monthInFiscalYear / 3);
    const quarterStartMonth = (fiscalYearStartMonth + currentQuarter * 3) % 12;
    const quarterStartYear = quarterStartMonth < fiscalYearStartMonth ? today.getFullYear() : 
      (today.getMonth() >= fiscalYearStartMonth ? today.getFullYear() : today.getFullYear() - 1);

    switch (range) {
      case 'last30days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'thisMonthToDate':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'thisFiscalQuarter':
        startDate = new Date(quarterStartYear, quarterStartMonth, 1);
        endDate = new Date(quarterStartYear, quarterStartMonth + 3, 0);
        break;
      case 'thisFiscalQuarterToDate':
        startDate = new Date(quarterStartYear, quarterStartMonth, 1);
        break;
      case 'thisFiscalYear':
        startDate = currentFiscalYearStart;
        endDate = new Date(currentFiscalYearStart.getFullYear() + 1, fiscalYearStartMonth, 0);
        break;
      case 'thisFiscalYearToDate':
        startDate = currentFiscalYearStart;
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'lastFiscalQuarter':
        const lastQStartMonth = (quarterStartMonth - 3 + 12) % 12;
        const lastQStartYear = lastQStartMonth > quarterStartMonth ? quarterStartYear - 1 : quarterStartYear;
        startDate = new Date(lastQStartYear, lastQStartMonth, 1);
        endDate = new Date(lastQStartYear, lastQStartMonth + 3, 0);
        break;
      case 'lastFiscalYear':
        startDate = new Date(currentFiscalYearStart.getFullYear() - 1, fiscalYearStartMonth, 1);
        endDate = new Date(currentFiscalYearStart.getFullYear(), fiscalYearStartMonth, 0);
        break;
      default:
        startDate = currentFiscalYearStart;
        break;
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  // Get cash flow period date range
  const getCashFlowDateRange = () => {
    const today = new Date();
    const endDate = new Date(today);
    let startDate: Date;
    
    const months = {
      '3months': 3,
      '6months': 6,
      '9months': 9,
      '12months': 12
    }[cashFlowPeriod];
    
    startDate = new Date(today);
    startDate.setMonth(today.getMonth() - months);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  // Cash flow period selector
  const CashFlowPeriodSelector = () => (
    <select
      value={cashFlowPeriod}
      onChange={(e) => setCashFlowPeriod(e.target.value as CashFlowPeriod)}
      className="text-sm border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 cursor-pointer hover:border-gray-400"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="12months">12 months</option>
      <option value="9months">9 months</option>
      <option value="6months">6 months</option>
      <option value="3months">3 months</option>
    </select>
  );
  
  const DateRangeSelector = ({ 
    value, 
    onChange, 
    className = '' 
  }: { 
    value: DateRangeType; 
    onChange: (value: DateRangeType) => void; 
    className?: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DateRangeType)}
      className={`text-sm border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 cursor-pointer hover:border-gray-400 ${className}`}
    >
      <optgroup label="Current Period">
        <option value="last30days">Last 30 days</option>
        <option value="thisMonth">This month</option>
        <option value="thisMonthToDate">This month to date</option>
        <option value="thisFiscalQuarter">This fiscal quarter</option>
        <option value="thisFiscalQuarterToDate">This fiscal quarter to date</option>
        <option value="thisFiscalYear">This fiscal year</option>
        <option value="thisFiscalYearToDate">This fiscal year to date</option>
      </optgroup>
      <optgroup label="Previous Period">
        <option value="lastMonth">Last month</option>
        <option value="lastFiscalQuarter">Last fiscal quarter</option>
        <option value="lastFiscalYear">Last fiscal year</option>
      </optgroup>
    </select>
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const qbStatus = await getQuickBooksStatus();
      const isConnected = qbStatus.connected;
      setConnected(isConnected);

      if (!isConnected) {
        setError('QuickBooks is not connected. Go to Admin Dashboard → Integrations to connect.');
        setLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      // Get date ranges for each section
      const pnlDateRange = getDateRangeFor(profitLossDateRange);
      const transactionsDateRangeObj = getDateRangeFor(transactionsDateRange);

      // Batch API calls sequentially to prevent overwhelming the API
      // The rate limiter will handle spacing, but we'll process in smaller batches
      // Batch 1: Core financial data (most important, runs first)
      console.log('[QB Dashboard] Loading batch 1: Core financial data...');
      
      // Process in smaller sub-batches to reduce initial queue size
      const batch1a = await Promise.allSettled([
        getQuickBooksCompanyInfo(),
        getQuickBooksProfitAndLoss(undefined, pnlDateRange.start, pnlDateRange.end),
        getQuickBooksAccounts(),
      ]);
      
      // Small delay between sub-batches
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const batch1b = await Promise.allSettled([
        getQuickBooksInvoices(),
        getQuickBooksPayments(),
        getQuickBooksDeposits(),
      ]);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const cashFlowDateRange = getCashFlowDateRange();
      const batch1c = await Promise.allSettled([
        getQuickBooksCashFlow(cashFlowDateRange.start, cashFlowDateRange.end),
        getQuickBooksEmployees(),
      ]);
      
      // Combine results
      const batch1 = [...batch1a, ...batch1b, ...batch1c];

      // Process batch 1 results immediately - use functional updates to ensure state is set
      if (batch1[0].status === 'fulfilled') {
        setCompanyInfo(batch1[0].value || null);
      } else {
        console.warn('[QB Dashboard] CompanyInfo failed:', batch1[0].reason);
      }
      
      if (batch1[1].status === 'fulfilled') {
        const pnlData = batch1[1].value;
        console.log('[QB Dashboard] P&L Raw Data:', JSON.stringify(pnlData, null, 2));
        setProfitAndLoss(pnlData);
      } else {
        console.warn('[QB Dashboard] ProfitAndLoss failed:', batch1[1].reason);
      }
      
      if (batch1[2].status === 'fulfilled') setAccounts(batch1[2].value || []);
      if (batch1[3].status === 'fulfilled') setInvoices(batch1[3].value || []);
      if (batch1[4].status === 'fulfilled') setPayments(batch1[4].value || []);
      if (batch1[5].status === 'fulfilled') setDeposits(batch1[5].value || []);
      if (batch1[6].status === 'fulfilled') setCashFlow(batch1[6].value);
      if (batch1[7].status === 'fulfilled') setEmployees(batch1[7].value || []);

      // Log batch 1 results
      const batch1Names = ['CompanyInfo', 'ProfitAndLoss', 'Accounts', 'Invoices', 'Payments', 'Deposits', 'CashFlow', 'Employees'];
      batch1.forEach((result, index) => {
        const name = batch1Names[index];
        if (result.status === 'rejected') {
          console.error(`[QB Dashboard] Failed to load ${name}:`, result.reason);
        } else {
          console.log(`[QB Dashboard] Loaded ${name}:`, Array.isArray(result.value) ? `${result.value.length} items` : (result.value ? 'data received' : 'empty/null'));
        }
      });

      // Set loading to false after critical data is loaded so UI can render
      // Even if some API calls failed, we should still render what we have
      console.log('[QB Dashboard] Setting loading to false, connected:', isConnected);
      
      // Check what data we actually have
      const hasCompanyInfo = batch1[0].status === 'fulfilled' && batch1[0].value;
      const hasPnL = batch1[1].status === 'fulfilled' && batch1[1].value;
      const hasAccounts = batch1[2].status === 'fulfilled' && Array.isArray(batch1[2].value);
      console.log('[QB Dashboard] Data status - CompanyInfo:', hasCompanyInfo, 'P&L:', hasPnL, 'Accounts:', hasAccounts);
      
      // Force a state update to ensure React re-renders
      setLoading(false);
      setInitialLoadComplete(true);

      // Batch 2: Secondary data (customers, purchases, time activities)
      console.log('[QB Dashboard] Loading batch 2: Secondary data...');
      
      const batch2a = await Promise.allSettled([
        getQuickBooksCustomers(),
        getQuickBooksPurchases(),
        // TimeActivities - handle errors gracefully, don't block loading
        getQuickBooksTimeActivities(transactionsDateRangeObj.start, transactionsDateRangeObj.end).catch(err => {
          console.warn('[QB Dashboard] TimeActivities failed, continuing without it:', err);
          return [];
        }),
      ]);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const batch2b = await Promise.allSettled([
        getQuickBooksBills(),
        getQuickBooksVendors(),
        getQuickBooksEstimates(),
      ]);
      
      const batch2 = [...batch2a, ...batch2b];

      if (batch2[0].status === 'fulfilled') setCustomers(batch2[0].value || []);
      if (batch2[1].status === 'fulfilled') setPurchases(batch2[1].value || []);
      if (batch2[2].status === 'fulfilled') setTimeActivities(batch2[2].value || []);
      if (batch2[3].status === 'fulfilled') setBills(batch2[3].value || []);
      if (batch2[4].status === 'fulfilled') setVendors(batch2[4].value || []);
      if (batch2[5].status === 'fulfilled') setEstimates(batch2[5].value || []);

      const batch2Names = ['Customers', 'Purchases', 'TimeActivities', 'Bills', 'Vendors', 'Estimates'];
      batch2.forEach((result, index) => {
        const name = batch2Names[index];
        if (result.status === 'rejected') {
          console.error(`[QB Dashboard] Failed to load ${name}:`, result.reason);
        } else {
          console.log(`[QB Dashboard] Loaded ${name}:`, Array.isArray(result.value) ? `${result.value.length} items` : (result.value ? 'data received' : 'empty/null'));
        }
      });

      // Batch 3: Additional transaction data
      console.log('[QB Dashboard] Loading batch 3: Transaction data...');
      
      const batch3a = await Promise.allSettled([
        getQuickBooksItems(),
        getQuickBooksSalesReceipts(),
        getQuickBooksCreditMemos(),
      ]);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const batch3b = await Promise.allSettled([
        getQuickBooksRefundReceipts(),
        getQuickBooksJournalEntries(),
        getQuickBooksBillPayments(),
      ]);
      
      const batch3 = [...batch3a, ...batch3b];

      if (batch3[0].status === 'fulfilled') setItems(batch3[0].value || []);
      if (batch3[1].status === 'fulfilled') setSalesReceipts(batch3[1].value || []);
      if (batch3[2].status === 'fulfilled') setCreditMemos(batch3[2].value || []);
      if (batch3[3].status === 'fulfilled') setRefundReceipts(batch3[3].value || []);
      if (batch3[4].status === 'fulfilled') setJournalEntries(batch3[4].value || []);
      if (batch3[5].status === 'fulfilled') setBillPayments(batch3[5].value || []);

      const batch3Names = ['Items', 'SalesReceipts', 'CreditMemos', 'RefundReceipts', 'JournalEntries', 'BillPayments'];
      batch3.forEach((result, index) => {
        const name = batch3Names[index];
        if (result.status === 'rejected') {
          console.error(`[QB Dashboard] Failed to load ${name}:`, result.reason);
        } else {
          console.log(`[QB Dashboard] Loaded ${name}:`, Array.isArray(result.value) ? `${result.value.length} items` : (result.value ? 'data received' : 'empty/null'));
        }
      });

      // Batch 4: Configuration and settings data
      console.log('[QB Dashboard] Loading batch 4: Configuration data...');
      
      const batch4a = await Promise.allSettled([
        getQuickBooksClasses(),
        getQuickBooksDepartments(),
        getQuickBooksVendorCredits(),
        getQuickBooksTransfers(),
      ]);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const batch4b = await Promise.allSettled([
        getQuickBooksPaymentMethods(),
        getQuickBooksPurchaseOrders(),
        getQuickBooksTaxCodes(),
        getQuickBooksTerms(),
      ]);
      
      const batch4 = [...batch4a, ...batch4b];

      if (batch4[0].status === 'fulfilled') setClasses(batch4[0].value || []);
      if (batch4[1].status === 'fulfilled') setDepartments(batch4[1].value || []);
      if (batch4[2].status === 'fulfilled') setVendorCredits(batch4[2].value || []);
      if (batch4[3].status === 'fulfilled') setTransfers(batch4[3].value || []);
      if (batch4[4].status === 'fulfilled') setPaymentMethods(batch4[4].value || []);
      if (batch4[5].status === 'fulfilled') setPurchaseOrders(batch4[5].value || []);
      if (batch4[6].status === 'fulfilled') setTaxCodes(batch4[6].value || []);
      if (batch4[7].status === 'fulfilled') setTerms(batch4[7].value || []);

      const batch4Names = ['Classes', 'Departments', 'VendorCredits', 'Transfers', 'PaymentMethods', 'PurchaseOrders', 'TaxCodes', 'Terms'];
      batch4.forEach((result, index) => {
        const name = batch4Names[index];
        if (result.status === 'rejected') {
          console.error(`[QB Dashboard] Failed to load ${name}:`, result.reason);
        } else {
          console.log(`[QB Dashboard] Loaded ${name}:`, Array.isArray(result.value) ? `${result.value.length} items` : (result.value ? 'data received' : 'empty/null'));
        }
      });

      // Batch 5: Payroll data (may require QuickBooks Payroll subscription)
      console.log('[QB Dashboard] Loading batch 5: Payroll data...');
      const batch5 = await Promise.allSettled([
        getQuickBooksPayrollSummary(transactionsDateRangeObj.start, transactionsDateRangeObj.end),
        getQuickBooksPayrollDetails(transactionsDateRangeObj.start, transactionsDateRangeObj.end),
        getQuickBooksTimeOffBalances(),
        getQuickBooksEmployeeCompensation(),
      ]);

      if (batch5[0].status === 'fulfilled') {
        console.log('[QB Dashboard] Payroll Summary:', batch5[0].value);
        setPayrollSummary(batch5[0].value);
      }
      if (batch5[1].status === 'fulfilled') {
        console.log('[QB Dashboard] Payroll Details:', batch5[1].value);
        setPayrollDetails(batch5[1].value);
      }
      if (batch5[2].status === 'fulfilled') {
        console.log('[QB Dashboard] Time Off Balances:', batch5[2].value);
        setTimeOffBalances(batch5[2].value);
      }
      if (batch5[3].status === 'fulfilled') {
        console.log('[QB Dashboard] Employee Compensation:', batch5[3].value);
        setEmployeeCompensation(batch5[3].value || []);
      }

      const batch5Names = ['PayrollSummary', 'PayrollDetails', 'TimeOffBalances', 'EmployeeCompensation'];
      batch5.forEach((result, index) => {
        const name = batch5Names[index];
        if (result.status === 'rejected') {
          console.error(`[QB Dashboard] Failed to load ${name}:`, result.reason);
        } else {
          console.log(`[QB Dashboard] Loaded ${name}:`, Array.isArray(result.value) ? `${result.value.length} items` : (result.value ? 'data received' : 'empty/null'));
        }
      });

      console.log('[QB Dashboard] All data loading complete.');

    } catch (err: any) {
      console.error('Error loading QuickBooks data:', err);
      setError(err?.message || 'Failed to load QuickBooks data');
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Reload Profit & Loss when its date range changes (only after initial load)
  useEffect(() => {
    if (!initialLoadComplete || !connected || loading) return;
    
    const reloadPnl = async () => {
      try {
        console.log('[QB Dashboard] Reloading P&L for date range:', profitLossDateRange);
        const { start, end } = getDateRangeFor(profitLossDateRange);
        const pnl = await getQuickBooksProfitAndLoss(undefined, start, end);
        console.log('[QB Dashboard] P&L reloaded with date range:', start, 'to', end);
        setProfitAndLoss(pnl);
      } catch (err) {
        console.error('Error reloading P&L:', err);
      }
    };
    
    reloadPnl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitLossDateRange]);

  // Reload Profit & Loss when expenses date range changes (expenses come from P&L report)
  // When expenses date range changes, sync P&L date range to match and reload
  useEffect(() => {
    if (!initialLoadComplete || !connected || loading) return;
    if (expensesDateRange === profitLossDateRange) {
      // Already in sync, but make sure we have the data
      return;
    }
    
    const reloadPnlForExpenses = async () => {
      try {
        console.log('[QB Dashboard] Reloading P&L for expenses date range:', expensesDateRange);
        const { start, end } = getDateRangeFor(expensesDateRange);
        const pnl = await getQuickBooksProfitAndLoss(undefined, start, end);
        console.log('[QB Dashboard] P&L reloaded for expenses with date range:', start, 'to', end);
        setProfitAndLoss(pnl);
        // Sync P&L date range to match expenses
        setProfitLossDateRange(expensesDateRange);
      } catch (err) {
        console.error('Error reloading P&L for expenses:', err);
      }
    };
    
    reloadPnlForExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expensesDateRange]);

  // Reload transactions when their date range changes (only after initial load)
  // This reloads invoices, payments, deposits which affect Not Paid/Paid/Deposited stats
  // Note: We store ALL data in state, and useMemo filters it by date range
  useEffect(() => {
    if (!initialLoadComplete || !connected || loading) return;
    
    const reloadTransactions = async () => {
      try {
        console.log('[QB Dashboard] Reloading transactions for date range:', transactionsDateRange);
        const { start, end } = getDateRangeFor(transactionsDateRange);
        
        // Fetch fresh data from QuickBooks API
        // We store ALL data, and the useMemo hooks will filter by date range
        const [invoices, payments, deposits, ta] = await Promise.allSettled([
          getQuickBooksInvoices(),
          getQuickBooksPayments(),
          getQuickBooksDeposits(),
          getQuickBooksTimeActivities(start, end).catch(err => {
            console.warn('[QB Dashboard] TimeActivities failed during reload:', err);
            return [];
          })
        ]);
        
        // Extract values from Promise.allSettled results
        const invoicesResult = invoices.status === 'fulfilled' ? invoices.value : [];
        const paymentsResult = payments.status === 'fulfilled' ? payments.value : [];
        const depositsResult = deposits.status === 'fulfilled' ? deposits.value : [];
        const taResult = ta.status === 'fulfilled' ? ta.value : [];
        
        // Store all data - filtering happens in useMemo based on transactionsDateRange
        setInvoices(invoicesResult || []);
        setPayments(paymentsResult || []);
        setDeposits(depositsResult || []);
        setTimeActivities(taResult || []);
        
        console.log('[QB Dashboard] Reloaded transactions - Invoices:', (invoicesResult || []).length, 'Payments:', (paymentsResult || []).length, 'Deposits:', (depositsResult || []).length);
      } catch (err) {
        console.error('Error reloading transactions:', err);
      }
    };
    
    reloadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionsDateRange]);

  // Reload Cash Flow when its period changes (only after initial load)
  useEffect(() => {
    if (!initialLoadComplete || !connected || loading) return;
    
    const reloadCashFlow = async () => {
      try {
        console.log('[QB Dashboard] Reloading Cash Flow for period:', cashFlowPeriod);
        const { start, end } = getCashFlowDateRange();
        console.log('[QB Dashboard] Cash Flow date range:', start, 'to', end);
        const cf = await getQuickBooksCashFlow(start, end);
        console.log('[QB Dashboard] Cash Flow report received:', cf);
        setCashFlow(cf);
      } catch (err) {
        console.error('Error reloading Cash Flow:', err);
      }
    };
    
    reloadCashFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashFlowPeriod]);

  const formatCurrency = (amount: number | string | undefined) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(num));
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Filter items by date range
  const filterByDateRange = <T extends { TxnDate?: string; MetaData?: { CreateTime?: string } }>(
    items: T[], 
    dateRangeToUse: DateRangeType = transactionsDateRange
  ): T[] => {
    const { start, end } = getDateRangeFor(dateRangeToUse);
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    
    return items.filter(item => {
      const dateStr = item.TxnDate || item.MetaData?.CreateTime;
      if (!dateStr) return false;
      const itemDate = new Date(dateStr);
      return itemDate >= startDate && itemDate <= endDate;
    });
  };

  // Create filtered versions of transaction data based on transactionsDateRange
  // These will automatically update when transactionsDateRange or data changes
  const filteredInvoices = useMemo(() => 
    filterByDateRange(invoices, transactionsDateRange), 
    [invoices, transactionsDateRange]
  );
  const filteredPayments = useMemo(() => 
    filterByDateRange(payments, transactionsDateRange), 
    [payments, transactionsDateRange]
  );
  const filteredDeposits = useMemo(() => 
    filterByDateRange(deposits, transactionsDateRange), 
    [deposits, transactionsDateRange]
  );
  const filteredPurchases = useMemo(() => 
    filterByDateRange(purchases, transactionsDateRange), 
    [purchases, transactionsDateRange]
  );
  const filteredBills = useMemo(() => 
    filterByDateRange(bills, transactionsDateRange), 
    [bills, transactionsDateRange]
  );
  const filteredSalesReceipts = useMemo(() => 
    filterByDateRange(salesReceipts, transactionsDateRange), 
    [salesReceipts, transactionsDateRange]
  );
  const filteredCreditMemos = useMemo(() => 
    filterByDateRange(creditMemos, transactionsDateRange), 
    [creditMemos, transactionsDateRange]
  );
  const filteredJournalEntries = useMemo(() => 
    filterByDateRange(journalEntries, transactionsDateRange), 
    [journalEntries, transactionsDateRange]
  );

  // Calculate invoice statuses (filtered by date range)
  const getInvoiceStats = () => {
    // Use the pre-filtered arrays (they're already filtered by transactionsDateRange)
    
    // Not Paid: invoices in period with balance > 0
    const notPaid = filteredInvoices.filter(i => i.Balance > 0);
    const notPaidTotal = notPaid.reduce((sum, i) => sum + (i.Balance || 0), 0);
    
    // Paid: Use payments received in this period (more accurate than invoice balance=0)
    const paidTotal = filteredPayments.reduce((sum, p) => sum + (p.TotalAmt || 0), 0);
    
    // Deposited: deposits in this period
    const depositedTotal = filteredDeposits.reduce((sum, d) => sum + (d.TotalAmt || 0), 0);
    
    return {
      notPaid: { count: notPaid.length, total: notPaidTotal, items: notPaid },
      paid: { count: filteredPayments.length, total: paidTotal, items: filteredPayments },
      deposited: { count: filteredDeposits.length, total: depositedTotal, items: filteredDeposits }
    };
  };

  // Extract P&L data - handles various QuickBooks report formats
  const getPnLSummary = () => {
    if (!profitAndLoss?.Rows?.Row) {
      console.log('[QB P&L] No rows found in profitAndLoss:', profitAndLoss);
      return { income: 0, expenses: 0, netIncome: 0, cogs: 0, grossProfit: 0 };
    }
    
    let income = 0;
    let expenses = 0;
    let cogs = 0;
    let grossProfit = 0;
    let netIncome = 0;

    // Helper to extract value from ColData array
    const extractValue = (colData: any[]) => {
      if (!colData) return 0;
      // Try to get the numeric value - usually in position 1, but could be elsewhere
      for (let i = colData.length - 1; i >= 0; i--) {
        const val = colData[i]?.value;
        if (val && !isNaN(parseFloat(String(val).replace(/,/g, '')))) {
          return parseFloat(String(val).replace(/,/g, '')) || 0;
        }
      }
      return 0;
    };

    // Process each row - check both group and type properties
    profitAndLoss.Rows.Row.forEach((row: any) => {
      const group = row.group || row.type || '';
      const header = row.Header?.ColData?.[0]?.value?.toLowerCase() || '';
      
      // Check Summary data first
      if (row.Summary?.ColData) {
        const value = extractValue(row.Summary.ColData);
        
        // Match various income patterns
        if (group === 'Income' || group === 'TotalIncome' || header.includes('total income')) {
          income = value;
        }
        // Match COGS patterns
        if (group === 'COGS' || group === 'CostOfGoodsSold' || group === 'CostOfSales' || 
            header.includes('cost of goods sold') || header.includes('cost of sales')) {
          cogs = Math.abs(value);
        }
        // Match Gross Profit
        if (group === 'GrossProfit' || header.includes('gross profit')) {
          grossProfit = value;
        }
        // Match Expenses patterns
        if (group === 'Expenses' || group === 'TotalExpenses' || group === 'Expense' ||
            header.includes('total expenses') || header.includes('total expense')) {
          expenses = Math.abs(value);
        }
        // Match Net Income patterns
        if (group === 'NetIncome' || group === 'NetOperatingIncome' || group === 'NetOrdinaryIncome' ||
            header.includes('net income') || header.includes('net operating income')) {
          netIncome = value;
        }
      }
      
      // Also check for rows that might have the value directly in ColData
      if (row.ColData && row.type === 'Data') {
        // This handles line items - we'll aggregate these in expense breakdown
      }
    });

    // Calculate totals if not found
    const totalSpending = cogs + expenses;
    if (netIncome === 0 && (income > 0 || totalSpending > 0)) {
      netIncome = income - totalSpending;
    }
    
    // If no gross profit, calculate it
    if (grossProfit === 0 && income > 0) {
      grossProfit = income - cogs;
    }

    console.log('[QB P&L] Summary:', { income, expenses, cogs, grossProfit, netIncome, totalSpending });

    return { income, expenses: totalSpending, netIncome, cogs, grossProfit, operatingExpenses: expenses };
  };

  // Get expense breakdown - handles various QuickBooks report formats
  const getExpenseBreakdown = () => {
    if (!profitAndLoss?.Rows?.Row) return [];
    
    const expenseCategories: { name: string; amount: number }[] = [];
    
    // Find expense section - try multiple patterns
    const expenseRow = profitAndLoss.Rows.Row.find((r: any) => {
      const group = r.group || r.type || '';
      const header = r.Header?.ColData?.[0]?.value?.toLowerCase() || '';
      return group === 'Expenses' || group === 'Expense' || 
             header.includes('expenses') || header === 'expense';
    });
    
    // Helper to extract expense items from a section
    const extractExpenseItems = (section: any) => {
      if (!section?.Rows?.Row) return;
      
      section.Rows.Row.forEach((row: any) => {
        // Handle nested sections (sub-categories)
        if (row.Rows?.Row) {
          extractExpenseItems(row);
        }
        
        // Handle direct data rows
        if (row.ColData && row.type === 'Data') {
          const name = row.ColData[0]?.value;
          const valueStr = row.ColData[1]?.value || row.ColData[row.ColData.length - 1]?.value;
          if (name && valueStr) {
            const amount = Math.abs(parseFloat(String(valueStr).replace(/,/g, '')) || 0);
            if (amount > 0) {
              expenseCategories.push({ name, amount });
            }
          }
        }
        
        // Handle Summary rows for sub-sections
        if (row.Summary?.ColData && row.Header?.ColData?.[0]?.value) {
          const name = row.Header.ColData[0].value;
          const valueStr = row.Summary.ColData[1]?.value || row.Summary.ColData[row.Summary.ColData.length - 1]?.value;
          if (name && valueStr && !name.toLowerCase().includes('total')) {
            const amount = Math.abs(parseFloat(String(valueStr).replace(/,/g, '')) || 0);
            if (amount > 0) {
              // Check if we already have individual items from this category
              const hasSubItems = expenseCategories.some(e => e.name !== name);
              if (!hasSubItems || row.Rows?.Row?.length === 0) {
                expenseCategories.push({ name, amount });
              }
            }
          }
        }
      });
    };
    
    if (expenseRow) {
      extractExpenseItems(expenseRow);
    } else {
      // If no dedicated expense section, try to find expense items in the root
      console.log('[QB P&L] No expense section found, searching root rows');
      profitAndLoss.Rows.Row.forEach((row: any) => {
        if (row.Rows?.Row) {
          const header = row.Header?.ColData?.[0]?.value?.toLowerCase() || '';
          if (header.includes('expense') || header.includes('operating')) {
            extractExpenseItems(row);
          }
        }
      });
    }
    
    // Remove duplicates and sort
    const uniqueExpenses = expenseCategories.reduce((acc: { name: string; amount: number }[], curr) => {
      const existing = acc.find(e => e.name === curr.name);
      if (!existing) {
        acc.push(curr);
      }
      return acc;
    }, []);
    
    console.log('[QB P&L] Expense breakdown:', uniqueExpenses);
    
    return uniqueExpenses
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15); // Show top 15 instead of 10
  };

  // Get bank accounts
  const bankAccounts = accounts.filter(a => a.AccountType === 'Bank');
  const totalCashBalance = bankAccounts.reduce((sum, a) => sum + (a.CurrentBalance || 0), 0);

  // Parse QuickBooks Cash Flow report to get Money In/Out
  // QuickBooks Cash Flow report has: Operating Activities, Investing Activities, Financing Activities
  const parseCashFlowReport = () => {
    if (!cashFlow?.Rows?.Row) {
      console.log('[QB Cash Flow] No cash flow report data available');
      return { moneyIn: 0, moneyOut: 0, netCashFlow: 0 };
    }

    console.log('[QB Cash Flow] Full report structure:', JSON.stringify(cashFlow, null, 2));
    
    let operatingActivities = 0;
    let investingActivities = 0;
    let financingActivities = 0;
    let netCashFlow = 0;

    // Helper to extract value from ColData array (usually the last column has the amount)
    const extractValue = (colData: any[]) => {
      if (!colData || colData.length === 0) return 0;
      // Try to find the numeric value - usually in the last column
      for (let i = colData.length - 1; i >= 0; i--) {
        const val = colData[i]?.value;
        if (val !== undefined && val !== null && val !== '') {
          const numVal = parseFloat(String(val).replace(/,/g, '').replace(/[()]/g, ''));
          if (!isNaN(numVal)) {
            return numVal;
          }
        }
      }
      return 0;
    };

    // Process each row in the Cash Flow report
    const processRow = (row: any, depth = 0) => {
      const header = row.Header?.ColData?.[0]?.value || '';
      const headerLower = header.toLowerCase();
      const group = row.group || row.type || '';
      
      // Check Summary data for section totals
      if (row.Summary?.ColData) {
        const value = extractValue(row.Summary.ColData);
        
        // Operating Activities
        if (group === 'OperatingActivities' || headerLower.includes('operating activities') || 
            headerLower.includes('operating')) {
          operatingActivities = value;
        }
        // Investing Activities
        else if (group === 'InvestingActivities' || headerLower.includes('investing activities') ||
                 headerLower.includes('investing')) {
          investingActivities = value;
        }
        // Financing Activities
        else if (group === 'FinancingActivities' || headerLower.includes('financing activities') ||
                 headerLower.includes('financing')) {
          financingActivities = value;
        }
        // Net Increase/Decrease in Cash
        else if (group === 'NetCashFlow' || headerLower.includes('net increase') || 
                 headerLower.includes('net decrease') || headerLower.includes('net cash') ||
                 headerLower.includes('net change')) {
          netCashFlow = value;
        }
      }
      
      // Process nested rows
      if (row.Rows?.Row) {
        row.Rows.Row.forEach((subRow: any) => processRow(subRow, depth + 1));
      }
    };

    // Process all rows
    cashFlow.Rows.Row.forEach((row: any) => processRow(row));

    // Calculate Money In and Money Out from activities
    // Operating Activities: positive = money in, negative = money out
    // But we need to look at individual line items to separate them properly
    let moneyIn = 0;
    let moneyOut = 0;

    // Re-process to get individual line items for better accuracy
    const processLineItems = (row: any, section: string) => {
      if (row.Rows?.Row) {
        row.Rows.Row.forEach((subRow: any) => {
          if (subRow.ColData && subRow.type === 'Data') {
            const value = extractValue(subRow.ColData);
            const label = subRow.ColData?.[0]?.value?.toLowerCase() || '';
            
            // Positive values in cash flow typically mean money in (increases cash)
            // Negative values mean money out (decreases cash)
            if (value > 0) {
              moneyIn += value;
            } else if (value < 0) {
              moneyOut += Math.abs(value);
            }
          }
          
          // Recursively process nested rows
          if (subRow.Rows?.Row) {
            processLineItems(subRow, section);
          }
        });
      }
    };

    // Process each section
    cashFlow.Rows.Row.forEach((row: any) => {
      const header = row.Header?.ColData?.[0]?.value?.toLowerCase() || '';
      if (header.includes('operating') || header.includes('investing') || header.includes('financing')) {
        processLineItems(row, header);
      }
    });

    // If we didn't get line items, use section totals
    if (moneyIn === 0 && moneyOut === 0) {
      // Operating activities: positive = net money in, negative = net money out
      if (operatingActivities > 0) {
        moneyIn = operatingActivities;
      } else if (operatingActivities < 0) {
        moneyOut = Math.abs(operatingActivities);
      }
      
      // Add investing and financing activities
      if (investingActivities > 0) moneyIn += investingActivities;
      else if (investingActivities < 0) moneyOut += Math.abs(investingActivities);
      
      if (financingActivities > 0) moneyIn += financingActivities;
      else if (financingActivities < 0) moneyOut += Math.abs(financingActivities);
    }

    console.log('[QB Cash Flow] Parsed - Operating:', operatingActivities, 'Investing:', investingActivities, 
                'Financing:', financingActivities, 'Net:', netCashFlow);
    console.log('[QB Cash Flow] Calculated - Money In:', moneyIn, 'Money Out:', moneyOut);
    
    return { moneyIn, moneyOut, netCashFlow };
  };

  // Calculate money in/out from transactions filtered by cash flow period
  // Use actual transaction data for accuracy - Cash Flow report is for net change, not individual in/out
  const getMoneyFlow = () => {
    const { start, end } = getCashFlowDateRange();
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    // Filter transactions by cash flow date range (not transactionsDateRange)
    const paymentsInRange = (payments || []).filter(p => {
      const txnDate = new Date(p.TxnDate || p.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    const depositsInRange = (deposits || []).filter(d => {
      const txnDate = new Date(d.TxnDate || d.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    const purchasesInRange = (purchases || []).filter(p => {
      const txnDate = new Date(p.TxnDate || p.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    // Also include bills and bill payments in this period
    const billsInRange = (bills || []).filter(b => {
      const txnDate = new Date(b.TxnDate || b.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    const billPaymentsInRange = (billPayments || []).filter(bp => {
      const txnDate = new Date(bp.TxnDate || bp.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });

    // Money In: Payments received + Deposits + Sales Receipts
    const salesReceiptsInRange = (salesReceipts || []).filter(sr => {
      const txnDate = new Date(sr.TxnDate || sr.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    const moneyIn = paymentsInRange.reduce((sum, p) => sum + (p.TotalAmt || 0), 0) +
                    depositsInRange.reduce((sum, d) => sum + (d.TotalAmt || 0), 0) +
                    salesReceiptsInRange.reduce((sum, sr) => sum + (sr.TotalAmt || 0), 0);

    // Money Out: Purchases + Bills + Bill Payments + Vendor Credits (negative)
    const vendorCreditsInRange = (vendorCredits || []).filter(vc => {
      const txnDate = new Date(vc.TxnDate || vc.MetaData?.CreateTime);
      return txnDate >= startDate && txnDate <= endDate;
    });
    
    const moneyOut = purchasesInRange.reduce((sum, p) => sum + (p.TotalAmt || 0), 0) +
                     billsInRange.reduce((sum, b) => sum + (b.TotalAmt || 0), 0) +
                     billPaymentsInRange.reduce((sum, bp) => sum + (bp.TotalAmt || 0), 0) -
                     vendorCreditsInRange.reduce((sum, vc) => sum + (vc.TotalAmt || 0), 0); // Vendor credits reduce money out
    
    console.log('[QB Cash Flow] Calculated from transactions - Money In:', moneyIn, 'Money Out:', moneyOut, 
                'Period:', start, 'to', end);
    console.log('[QB Cash Flow] Transaction counts - Payments:', paymentsInRange.length, 'Deposits:', depositsInRange.length,
                'Sales Receipts:', salesReceiptsInRange.length, 'Purchases:', purchasesInRange.length, 
                'Bills:', billsInRange.length, 'Bill Payments:', billPaymentsInRange.length, 'Vendor Credits:', vendorCreditsInRange.length);
    
    // Get bank transactions (combine all for display)
    const bankTransactions = [
      ...paymentsInRange.map(p => ({
        id: p.Id,
        date: p.TxnDate || p.MetaData?.CreateTime,
        type: 'Payment Received',
        description: p.CustomerRef?.name || 'Customer Payment',
        amount: p.TotalAmt || 0,
        direction: 'in' as const
      })),
      ...depositsInRange.map(d => ({
        id: d.Id,
        date: d.TxnDate || d.MetaData?.CreateTime,
        type: 'Deposit',
        description: d.PrivateNote || 'Bank Deposit',
        amount: d.TotalAmt || 0,
        direction: 'in' as const
      })),
      ...purchasesInRange.map(p => ({
        id: p.Id,
        date: p.TxnDate || p.MetaData?.CreateTime,
        type: p.PaymentType || 'Purchase',
        description: p.EntityRef?.name || 'Expense',
        amount: p.TotalAmt || 0,
        direction: 'out' as const
      })),
      ...billsInRange.map(b => ({
        id: b.Id,
        date: b.TxnDate || b.MetaData?.CreateTime,
        type: 'Bill',
        description: b.VendorRef?.name || 'Vendor Bill',
        amount: b.TotalAmt || 0,
        direction: 'out' as const
      })),
      ...billPaymentsInRange.map(bp => ({
        id: bp.Id,
        date: bp.TxnDate || bp.MetaData?.CreateTime,
        type: 'Bill Payment',
        description: bp.VendorRef?.name || 'Bill Payment',
        amount: bp.TotalAmt || 0,
        direction: 'out' as const
      })),
      ...salesReceiptsInRange.map(sr => ({
        id: sr.Id,
        date: sr.TxnDate || sr.MetaData?.CreateTime,
        type: 'Sales Receipt',
        description: sr.CustomerRef?.name || 'Sales Receipt',
        amount: sr.TotalAmt || 0,
        direction: 'in' as const
      })),
      ...vendorCreditsInRange.map(vc => ({
        id: vc.Id,
        date: vc.TxnDate || vc.MetaData?.CreateTime,
        type: 'Vendor Credit',
        description: vc.VendorRef?.name || 'Vendor Credit',
        amount: vc.TotalAmt || 0,
        direction: 'out' as const // Shows as negative/credit
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { moneyIn, moneyOut, transactions: bankTransactions };
  };

  // These calculations depend on filtered data and date ranges, so they need to be memoized
  const invoiceStats = useMemo(() => getInvoiceStats(), [filteredInvoices, filteredPayments, filteredDeposits]);
  // P&L and Expenses come from API data that's already filtered by date range, so they only depend on the data
  const pnlSummary = useMemo(() => getPnLSummary(), [profitAndLoss]);
  const expenseBreakdown = useMemo(() => getExpenseBreakdown(), [profitAndLoss]);
  // Money flow depends on all payments, deposits, purchases, bills, billPayments, salesReceipts, vendorCredits
  // and the cash flow period for date filtering
  const moneyFlow = useMemo(() => getMoneyFlow(), [payments, deposits, purchases, bills, billPayments, salesReceipts, vendorCredits, cashFlowPeriod]);

  // Calculate cash balance over time for chart
  const cashBalanceHistory = useMemo(() => {
    const { start, end } = getCashFlowDateRange();
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    // Get all transactions sorted by date
    const allTransactions = [
      ...(payments || []).map(p => ({ ...p, amount: p.TotalAmt || 0, type: 'payment', direction: 'in' })),
      ...(deposits || []).map(d => ({ ...d, amount: d.TotalAmt || 0, type: 'deposit', direction: 'in' })),
      ...(salesReceipts || []).map(sr => ({ ...sr, amount: sr.TotalAmt || 0, type: 'salesReceipt', direction: 'in' })),
      ...(purchases || []).map(p => ({ ...p, amount: p.TotalAmt || 0, type: 'purchase', direction: 'out' })),
      ...(bills || []).map(b => ({ ...b, amount: b.TotalAmt || 0, type: 'bill', direction: 'out' })),
      ...(billPayments || []).map(bp => ({ ...bp, amount: bp.TotalAmt || 0, type: 'billPayment', direction: 'out' })),
      ...(vendorCredits || []).map(vc => ({ ...vc, amount: -(vc.TotalAmt || 0), type: 'vendorCredit', direction: 'in' }))
    ]
      .map(t => ({
        ...t,
        date: new Date(t.TxnDate || t.MetaData?.CreateTime || startDate)
      }))
      .filter(t => t.date >= startDate && t.date <= endDate)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Generate all months in range
    const months: string[] = [];
    const currentMonth = new Date(startDate);
    currentMonth.setDate(1); // Start of month
    while (currentMonth <= endDate) {
      const monthKey = currentMonth.toISOString().slice(0, 7); // YYYY-MM
      months.push(monthKey);
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // Group transactions by month
    const transactionsByMonth: Record<string, typeof allTransactions> = {};
    allTransactions.forEach(txn => {
      const monthKey = txn.date.toISOString().slice(0, 7);
      if (!transactionsByMonth[monthKey]) {
        transactionsByMonth[monthKey] = [];
      }
      transactionsByMonth[monthKey].push(txn);
    });

    // Calculate monthly totals
    const monthlyData: Record<string, { in: number; out: number; net: number }> = {};
    months.forEach(monthKey => {
      const monthTxns = transactionsByMonth[monthKey] || [];
      const monthIn = monthTxns.filter(t => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0);
      const monthOut = monthTxns.filter(t => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0);
      monthlyData[monthKey] = {
        in: monthIn,
        out: monthOut,
        net: monthIn - monthOut
      };
    });

    // Calculate running balance backwards from current balance
    // Start with current balance and subtract future net cash flows
    let runningBalance = totalCashBalance;
    const balances: number[] = [];
    
    // Work backwards from the last month
    for (let i = months.length - 1; i >= 0; i--) {
      const monthKey = months[i];
      const monthData = monthlyData[monthKey];
      
      // For the last month, use current balance
      if (i === months.length - 1) {
        balances.unshift(runningBalance);
      } else {
        // Subtract this month's net cash flow to get the balance at the start of this month
        runningBalance -= monthData.net;
        balances.unshift(runningBalance);
      }
    }

    // Format for chart
    return months.map((monthKey, index) => {
      const date = new Date(monthKey + '-01');
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      return {
        month: monthLabel,
        date: monthKey,
        'Cash balance': balances[index] || 0,
        'Money in': monthlyData[monthKey].in,
        'Money out': monthlyData[monthKey].out,
        'Net cash flow': monthlyData[monthKey].net
      };
    });
  }, [payments, deposits, purchases, bills, billPayments, salesReceipts, vendorCredits, cashFlowPeriod, totalCashBalance]);

  // Parse payroll summary report to get actual pay data per employee
  const parsePayrollData = () => {
    const employeePayData: Record<string, { grossPay: number; netPay: number; taxes: number; deductions: number }> = {};
    let totalGrossPay = 0;
    let totalNetPay = 0;
    let totalTaxes = 0;
    
    if (payrollSummary?.Rows?.Row) {
      payrollSummary.Rows.Row.forEach((row: any) => {
        // Look for employee rows with pay data
        if (row.ColData) {
          const employeeName = row.ColData[0]?.value;
          const amount = parseFloat(row.ColData[1]?.value?.replace(/,/g, '') || '0');
          if (employeeName && amount) {
            if (!employeePayData[employeeName]) {
              employeePayData[employeeName] = { grossPay: 0, netPay: 0, taxes: 0, deductions: 0 };
            }
            employeePayData[employeeName].grossPay += amount;
            totalGrossPay += amount;
          }
        }
        // Handle nested rows
        if (row.Rows?.Row) {
          row.Rows.Row.forEach((subRow: any) => {
            if (subRow.ColData) {
              const employeeName = subRow.ColData[0]?.value;
              const amount = parseFloat(subRow.ColData[1]?.value?.replace(/,/g, '') || '0');
              if (employeeName && amount) {
                if (!employeePayData[employeeName]) {
                  employeePayData[employeeName] = { grossPay: 0, netPay: 0, taxes: 0, deductions: 0 };
                }
                employeePayData[employeeName].grossPay += amount;
                totalGrossPay += amount;
              }
            }
          });
        }
      });
    }
    
    return { employeePayData, totals: { totalGrossPay, totalNetPay, totalTaxes } };
  };
  
  // Parse time off balances
  const parseTimeOffBalances = () => {
    const balances: Record<string, { vacation: number; sick: number; pto: number }> = {};
    
    if (timeOffBalances?.Rows?.Row) {
      timeOffBalances.Rows.Row.forEach((row: any) => {
        if (row.ColData) {
          const employeeName = row.ColData[0]?.value;
          // Try to parse different time off types from columns
          if (employeeName) {
            balances[employeeName] = {
              vacation: parseFloat(row.ColData[1]?.value || '0'),
              sick: parseFloat(row.ColData[2]?.value || '0'),
              pto: parseFloat(row.ColData[3]?.value || '0'),
            };
          }
        }
      });
    }
    
    return balances;
  };

  // Calculate employee time tracking stats including PTO, sick time, etc.
  const getEmployeeStats = () => {
    // Filter active employees
    const activeEmployees = employees.filter(e => e.Active !== false);
    
    // Get parsed payroll and time off data
    const { employeePayData, totals: payrollTotals } = parsePayrollData();
    const timeOffBalanceData = parseTimeOffBalances();
    
    // Helper to categorize time activity type
    const categorizeTimeActivity = (ta: any) => {
      const name = (ta.NameOf || ta.Description || '').toLowerCase();
      const itemName = (ta.ItemRef?.name || '').toLowerCase();
      
      // Check for PTO/Vacation/Sick patterns
      if (name.includes('pto') || name.includes('paid time off') || itemName.includes('pto')) {
        return 'pto';
      }
      if (name.includes('vacation') || itemName.includes('vacation')) {
        return 'vacation';
      }
      if (name.includes('sick') || itemName.includes('sick')) {
        return 'sick';
      }
      if (name.includes('holiday') || itemName.includes('holiday')) {
        return 'holiday';
      }
      if (name.includes('unpaid') || name.includes('leave without pay') || itemName.includes('unpaid')) {
        return 'unpaid';
      }
      if (name.includes('personal') || itemName.includes('personal')) {
        return 'personal';
      }
      if (name.includes('overtime') || name.includes('ot') || itemName.includes('overtime')) {
        return 'overtime';
      }
      return 'regular';
    };
    
    // Map employees with their time activities and payroll data
    const employeeTimeData = activeEmployees.map(employee => {
      // Get time activities for this employee
      const employeeTimeActivities = timeActivities.filter(
        ta => ta.EmployeeRef?.value === employee.Id
      );
      
      // Try to find compensation data from enhanced API
      const compensation = employeeCompensation.find(
        ec => ec.id === employee.Id || ec.displayName === employee.DisplayName
      );
      
      // Initialize time tracking by category
      let totalHours = 0;
      let billableHours = 0;
      let totalAmount = 0;
      let ptoHours = 0;
      let vacationHours = 0;
      let sickHours = 0;
      let holidayHours = 0;
      let unpaidHours = 0;
      let personalHours = 0;
      let overtimeHours = 0;
      let regularHours = 0;
      
      employeeTimeActivities.forEach(ta => {
        const hours = ta.Hours || 0;
        const minutes = ta.Minutes || 0;
        const activityHours = hours + (minutes / 60);
        
        totalHours += activityHours;
        
        // Categorize by type
        const category = categorizeTimeActivity(ta);
        switch (category) {
          case 'pto': ptoHours += activityHours; break;
          case 'vacation': vacationHours += activityHours; break;
          case 'sick': sickHours += activityHours; break;
          case 'holiday': holidayHours += activityHours; break;
          case 'unpaid': unpaidHours += activityHours; break;
          case 'personal': personalHours += activityHours; break;
          case 'overtime': overtimeHours += activityHours; break;
          default: regularHours += activityHours; break;
        }
        
        if (ta.BillableStatus === 'Billable') {
          billableHours += activityHours;
        }
        
        // Calculate cost/revenue
        if (ta.HourlyRate) {
          totalAmount += activityHours * ta.HourlyRate;
        }
      });
      
      // Get pay rate - prioritize compensation data, then employee record
      const hourlyRate = compensation?.hourlyRate || employee.BillRate || employee.CostRate || 0;
      const costRate = compensation?.costRate || employee.CostRate || 0;
      const billRate = compensation?.billRate || employee.BillRate || 0;
      
      // Get actual pay from payroll data
      const empName = `${employee.GivenName || ''} ${employee.FamilyName || ''}`.trim() || employee.DisplayName || '';
      const payData = employeePayData[empName] || employeePayData[employee.DisplayName] || { grossPay: 0, netPay: 0, taxes: 0, deductions: 0 };
      
      // Get time off balance
      const timeOffBalance = timeOffBalanceData[empName] || timeOffBalanceData[employee.DisplayName] || { vacation: 0, sick: 0, pto: 0 };
      
      // Calculate total paid time off (PTO + vacation + sick + holiday + personal)
      const totalPaidTimeOff = ptoHours + vacationHours + sickHours + holidayHours + personalHours;
      
      // Determine if employee is salaried based on available data
      // If no hourly rates are set, assume salaried
      const isSalaried = (hourlyRate === 0 && costRate === 0 && billRate === 0) || 
                         employee.EmployeeType === 'Salaried' ||
                         employee.EmployeeType === 'Exempt' ||
                         (compensation?.employeeType === 'Salaried') ||
                         (compensation?.employeeType === 'Exempt');
      
      return {
        id: employee.Id,
        name: empName || 'Unknown',
        displayName: employee.DisplayName,
        email: employee.PrimaryEmailAddr?.Address || compensation?.email,
        phone: employee.PrimaryPhone?.FreeFormNumber || employee.Mobile?.FreeFormNumber || compensation?.phone,
        active: employee.Active !== false,
        hiredDate: employee.HiredDate || compensation?.hiredDate,
        hourlyRate,
        costRate,
        billRate,
        // Pay type indicator
        isSalaried,
        payType: isSalaried ? 'Salary' : 'Hourly',
        totalHours: Math.round(totalHours * 100) / 100,
        billableHours: Math.round(billableHours * 100) / 100,
        nonBillableHours: Math.round((totalHours - billableHours) * 100) / 100,
        // Time off tracking (used)
        regularHours: Math.round(regularHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        ptoHours: Math.round(ptoHours * 100) / 100,
        vacationHours: Math.round(vacationHours * 100) / 100,
        sickHours: Math.round(sickHours * 100) / 100,
        holidayHours: Math.round(holidayHours * 100) / 100,
        personalHours: Math.round(personalHours * 100) / 100,
        unpaidHours: Math.round(unpaidHours * 100) / 100,
        totalPaidTimeOff: Math.round(totalPaidTimeOff * 100) / 100,
        // Time off balance (remaining)
        ptoBalance: timeOffBalance.pto,
        vacationBalance: timeOffBalance.vacation,
        sickBalance: timeOffBalance.sick,
        // Actual pay data
        grossPay: payData.grossPay,
        netPay: payData.netPay,
        taxes: payData.taxes,
        deductions: payData.deductions,
        timeEntries: employeeTimeActivities.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        ssn: employee.SSN ? `***-**-${employee.SSN.slice(-4)}` : (compensation?.ssn || null),
        employeeType: employee.EmployeeType || compensation?.employeeType,
        employeeNumber: compensation?.employeeNumber,
      };
    });
    
    // Calculate totals
    const totalEmployees = activeEmployees.length;
    const totalTrackedHours = employeeTimeData.reduce((sum, e) => sum + e.totalHours, 0);
    const totalBillableHours = employeeTimeData.reduce((sum, e) => sum + e.billableHours, 0);
    const totalLabourCost = employeeTimeData.reduce((sum, e) => sum + (e.totalHours * e.costRate), 0);
    const totalPTO = employeeTimeData.reduce((sum, e) => sum + e.ptoHours, 0);
    const totalVacation = employeeTimeData.reduce((sum, e) => sum + e.vacationHours, 0);
    const totalSick = employeeTimeData.reduce((sum, e) => sum + e.sickHours, 0);
    const totalHoliday = employeeTimeData.reduce((sum, e) => sum + e.holidayHours, 0);
    const totalUnpaid = employeeTimeData.reduce((sum, e) => sum + e.unpaidHours, 0);
    const totalOvertime = employeeTimeData.reduce((sum, e) => sum + e.overtimeHours, 0);
    const totalPaidTimeOff = employeeTimeData.reduce((sum, e) => sum + e.totalPaidTimeOff, 0);
    const totalGrossPay = employeeTimeData.reduce((sum, e) => sum + e.grossPay, 0);
    
    return {
      employees: employeeTimeData,
      totals: {
        totalEmployees,
        totalTrackedHours: Math.round(totalTrackedHours * 100) / 100,
        totalBillableHours: Math.round(totalBillableHours * 100) / 100,
        totalLabourCost: Math.round(totalLabourCost * 100) / 100,
        billablePercentage: totalTrackedHours > 0 
          ? Math.round((totalBillableHours / totalTrackedHours) * 100) 
          : 0,
        // Time off totals (used)
        totalPTO: Math.round(totalPTO * 100) / 100,
        totalVacation: Math.round(totalVacation * 100) / 100,
        totalSick: Math.round(totalSick * 100) / 100,
        totalHoliday: Math.round(totalHoliday * 100) / 100,
        totalUnpaid: Math.round(totalUnpaid * 100) / 100,
        totalOvertime: Math.round(totalOvertime * 100) / 100,
        totalPaidTimeOff: Math.round(totalPaidTimeOff * 100) / 100,
        // Actual pay totals
        totalGrossPay: Math.round(totalGrossPay * 100) / 100,
        payrollTotalGross: payrollTotals.totalGrossPay,
      }
    };
  };

  const employeeStats = getEmployeeStats();

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Debug logging
  console.log('[QB Dashboard] Render check - loading:', loading, 'connected:', connected, 'initialLoadComplete:', initialLoadComplete);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">QuickBooks Dashboard</h2>
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-12 w-12 text-yellow-600" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                  QuickBooks Not Connected
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Connect your QuickBooks account to view your accounting data.
                </p>
                <Button 
                  className="mt-4"
                  onClick={() => window.location.href = '/admin-dashboard'}
                >
                  Go to Integrations
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">QuickBooks Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            {companyInfo?.CompanyName || 'Connected to QuickBooks'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://quickbooks.intuit.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 px-3 py-2"
          >
            Open QuickBooks
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Status Cards - Not Paid, Paid, Deposited */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Invoice Status</h3>
          <DateRangeSelector 
            value={transactionsDateRange} 
            onChange={setTransactionsDateRange}
            className="text-sm"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Not Paid */}
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium opacity-90">NOT PAID</span>
                <Clock className="h-5 w-5 opacity-75" />
              </div>
              <p className="text-3xl font-bold">{formatCurrency(invoiceStats.notPaid.total)}</p>
              <p className="text-sm opacity-75 mt-1">{invoiceStats.notPaid.count} invoices outstanding</p>
            </CardContent>
          </Card>

          {/* Paid */}
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium opacity-90">PAID</span>
                <CheckCircle2 className="h-5 w-5 opacity-75" />
              </div>
              <p className="text-3xl font-bold">{formatCurrency(invoiceStats.paid.total)}</p>
              <p className="text-sm opacity-75 mt-1">{invoiceStats.paid.count} invoices paid</p>
            </CardContent>
          </Card>

          {/* Deposited */}
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium opacity-90">DEPOSITED</span>
                <PiggyBank className="h-5 w-5 opacity-75" />
              </div>
              <p className="text-3xl font-bold">{formatCurrency(invoiceStats.deposited.total)}</p>
              <p className="text-sm opacity-75 mt-1">{invoiceStats.deposited.count} deposits</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Profit & Loss and Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profit & Loss */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                PROFIT & LOSS
              </CardTitle>
              <DateRangeSelector 
                value={profitLossDateRange} 
                onChange={setProfitLossDateRange}
                className="text-xs"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-gray-500">Net profit</p>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${pnlSummary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnlSummary.netIncome)}
                </span>
                {pnlSummary.income > 0 && (
                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                    pnlSummary.netIncome >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {Math.round((pnlSummary.netIncome / pnlSummary.income) * 100)}% margin
                  </span>
                )}
              </div>
            </div>
            
            {/* Income Bar */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600">Income</span>
                <span className="text-lg font-semibold text-green-600">{formatCurrency(pnlSummary.income)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded h-4">
                <div 
                  className="bg-green-500 h-full rounded"
                  style={{ width: `${pnlSummary.income > 0 && pnlSummary.expenses > 0 ? Math.min((pnlSummary.income / Math.max(pnlSummary.income, pnlSummary.expenses)) * 100, 100) : 50}%` }}
                />
              </div>
            </div>
            
            {/* Expenses Bar */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600">Expenses</span>
                <span className="text-lg font-semibold text-red-600">{formatCurrency(pnlSummary.expenses)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded h-4">
                <div 
                  className="bg-red-400 h-full rounded"
                  style={{ width: `${pnlSummary.expenses > 0 && pnlSummary.income > 0 ? Math.min((pnlSummary.expenses / Math.max(pnlSummary.income, pnlSummary.expenses)) * 100, 100) : 50}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                EXPENSES
              </CardTitle>
              <DateRangeSelector 
                value={expensesDateRange} 
                onChange={setExpensesDateRange}
                className="text-xs"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-gray-500">Total spending</p>
              <span className="text-3xl font-bold">{formatCurrency(pnlSummary.expenses)}</span>
              <span className="text-sm text-gray-500 ml-2">{expenseBreakdown.length} categories</span>
              {pnlSummary.cogs > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  (COGS: {formatCurrency(pnlSummary.cogs)} + Operating: {formatCurrency(pnlSummary.operatingExpenses)})
                </div>
              )}
            </div>
            
            {/* Expense Categories */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {expenseBreakdown.length === 0 ? (
                <div className="text-gray-500 text-sm">
                  <p>No expense categories found</p>
                  {pnlSummary.expenses > 0 && (
                    <p className="text-xs mt-1">Total expenses: {formatCurrency(pnlSummary.expenses)} (category breakdown unavailable)</p>
                  )}
                </div>
              ) : (
                expenseBreakdown.map((item, index) => {
                  const percentage = pnlSummary.expenses > 0 ? Math.round((item.amount / pnlSummary.expenses) * 100) : 0;
                  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-400', 'bg-indigo-500', 'bg-teal-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-lime-500'];
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors[index % colors.length]}`} />
                        <span className="text-sm truncate">{item.name}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                        <span className="text-xs text-gray-500 ml-2">{percentage}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow / Bank Transactions */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('cashFlow')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-500" />
              Cash Flow (Linked Bank Transactions)
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* Period Selector */}
              <CashFlowPeriodSelector />
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setCashFlowViewMode('balance')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    cashFlowViewMode === 'balance'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Cash balance
                </button>
                <button
                  onClick={() => setCashFlowViewMode('moneyInOut')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    cashFlowViewMode === 'moneyInOut'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Money in/out
                </button>
              </div>
              {expandedSection === 'cashFlow' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        {/* Summary Stats and Chart (always visible) */}
        <CardContent className="pt-0 pb-4">
          {/* Today's Cash Balance - Prominent Display */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Today's cash balance</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalCashBalance)}</p>
          </div>

          {/* Chart */}
          {cashBalanceHistory.length > 0 && (
            <div className="mb-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                {cashFlowViewMode === 'balance' ? (
                  <AreaChart data={cashBalanceHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="month" 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                        if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                        return `$${value}`;
                      }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '0.5rem'
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `Month: ${label}`}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="Cash balance" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorBalance)"
                      name="Cash balance"
                    />
                  </AreaChart>
                ) : (
                  <LineChart data={cashBalanceHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="month" 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                        if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                        return `$${value}`;
                      }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '0.5rem'
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `Month: ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="Money in" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Money in"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Money out" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Money out"
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Money In</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(moneyFlow.moneyIn)}</p>
              <p className="text-xs text-gray-500">Payments & deposits</p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Money Out</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(moneyFlow.moneyOut)}</p>
              <p className="text-xs text-gray-500">Purchases & expenses</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Net Cash Flow</span>
              </div>
              <p className={`text-2xl font-bold ${(moneyFlow.moneyIn - moneyFlow.moneyOut) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(moneyFlow.moneyIn - moneyFlow.moneyOut)}
              </p>
              <p className="text-xs text-gray-500">In selected period</p>
            </div>
          </div>
        </CardContent>

        {/* Bank Transactions List (expandable) */}
        {expandedSection === 'cashFlow' && (
          <CardContent className="pt-0 border-t">
            <h4 className="font-medium text-gray-700 mt-4 mb-3">Recent Bank Transactions</h4>
            {moneyFlow.transactions.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No transactions in selected period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-semibold">Date</th>
                      <th className="p-2 text-sm font-semibold">Type</th>
                      <th className="p-2 text-sm font-semibold">Description</th>
                      <th className="p-2 text-sm font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = moneyFlow.transactions.filter(t => {
                        if (!showMoneyIn && t.direction === 'in') return false;
                        if (!showMoneyOut && t.direction === 'out') return false;
                        return true;
                      });
                      return filtered
                        .slice((pages.transactions - 1) * ITEMS_PER_PAGE, pages.transactions * ITEMS_PER_PAGE)
                        .map((txn) => (
                          <tr key={`${txn.type}-${txn.id}`} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="p-2 text-sm">{formatDate(txn.date)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                txn.direction === 'in' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {txn.type}
                              </span>
                            </td>
                            <td className="p-2 text-sm truncate max-w-xs">{txn.description}</td>
                            <td className={`p-2 text-sm text-right font-mono ${
                              txn.direction === 'in' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {txn.direction === 'in' ? '+' : '-'}{formatCurrency(txn.amount)}
                            </td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
                <Pagination 
                  currentPage={pages.transactions} 
                  totalItems={moneyFlow.transactions.filter(t => {
                    if (!showMoneyIn && t.direction === 'in') return false;
                    if (!showMoneyOut && t.direction === 'out') return false;
                    return true;
                  }).length} 
                  onPageChange={(page) => setPage('transactions', page)}
                  tableName="transactions"
                />
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bank Accounts Detail */}
      {bankAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Bank Accounts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {bankAccounts.map(account => (
              <Card key={account.Id} className="bg-gradient-to-br from-slate-600 to-slate-700 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium opacity-90 truncate">{account.Name}</span>
                    <Wallet className="h-5 w-5 opacity-75 flex-shrink-0" />
                  </div>
                  <p className={`text-2xl font-bold ${account.CurrentBalance < 0 ? 'text-red-300' : ''}`}>
                    {formatCurrency(account.CurrentBalance)}
                  </p>
                  <p className="text-xs opacity-75 mt-1">Current balance</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Employees & Time Tracking Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('employees')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              Employees & Time Tracking
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {employeeStats.totals.totalEmployees} employee{employeeStats.totals.totalEmployees !== 1 ? 's' : ''}
              </span>
              {expandedSection === 'employees' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        {/* Summary Stats (always visible) */}
        <CardContent className="pt-0 pb-4">
          {/* Main Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-indigo-500" />
                <span className="text-sm text-gray-600">Total Employees</span>
              </div>
              <p className="text-2xl font-bold text-indigo-600">{employeeStats.totals.totalEmployees}</p>
              <p className="text-xs text-gray-500">Active employees</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600">Hours Tracked</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{employeeStats.totals.totalTrackedHours.toFixed(1)}</p>
              <p className="text-xs text-gray-500">In selected period</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">Billable Hours</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{employeeStats.totals.totalBillableHours.toFixed(1)}</p>
              <p className="text-xs text-gray-500">{employeeStats.totals.billablePercentage}% billable rate</p>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-gray-600">Gross Pay</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(employeeStats.totals.totalGrossPay || employeeStats.totals.payrollTotalGross || 0)}
              </p>
              <p className="text-xs text-gray-500">Total payroll (period)</p>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-gray-600">Labour Cost</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(employeeStats.totals.totalLabourCost)}</p>
              <p className="text-xs text-gray-500">Based on cost rates</p>
            </div>
          </div>
          
          {/* Time Off Stats Row */}
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
            <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-cyan-600">{employeeStats.totals.totalPaidTimeOff.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Paid Time Off</p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-purple-600">{employeeStats.totals.totalVacation.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Vacation</p>
            </div>
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-rose-600">{employeeStats.totals.totalSick.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Sick Time</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-amber-600">{employeeStats.totals.totalHoliday.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Holiday</p>
            </div>
            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-teal-600">{employeeStats.totals.totalPTO.toFixed(1)}</p>
              <p className="text-xs text-gray-500">PTO Used</p>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-red-600">{employeeStats.totals.totalUnpaid.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Unpaid Leave</p>
            </div>
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
              <p className="text-lg font-bold text-yellow-600">{employeeStats.totals.totalOvertime.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Overtime</p>
            </div>
          </div>
        </CardContent>

        {/* Employee Details List (expandable) */}
        {expandedSection === 'employees' && (
          <CardContent className="pt-0 border-t">
            <h4 className="font-medium text-gray-700 mt-4 mb-3">Employee Details</h4>
            {employeeStats.employees.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No employees found in QuickBooks</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-gray-50 dark:bg-gray-800/50">
                      <th className="p-2 font-semibold">Employee</th>
                      <th className="p-2 font-semibold">Status</th>
                      <th className="p-2 font-semibold text-right">Pay Type</th>
                      <th className="p-2 font-semibold text-right">Regular</th>
                      <th className="p-2 font-semibold text-right">OT</th>
                      <th className="p-2 font-semibold text-right text-cyan-600">PTO</th>
                      <th className="p-2 font-semibold text-right text-purple-600">Vacation</th>
                      <th className="p-2 font-semibold text-right text-rose-600">Sick</th>
                      <th className="p-2 font-semibold text-right text-red-600">Unpaid</th>
                      <th className="p-2 font-semibold text-right">Total Hrs</th>
                      <th className="p-2 font-semibold text-right">Billable</th>
                      <th className="p-2 font-semibold text-right">Cost</th>
                      <th className="p-2 font-semibold text-right text-emerald-600">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeStats.employees.map((emp) => (
                      <tr key={emp.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{emp.name}</p>
                              {emp.email && <p className="text-xs text-gray-500 truncate">{emp.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            emp.active 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' 
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                          }`}>
                            {emp.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono text-xs">
                          {emp.isSalaried ? (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Salary</span>
                          ) : emp.billRate > 0 ? (
                            <span className="text-green-600">${emp.billRate}/hr</span>
                          ) : emp.costRate > 0 ? (
                            <span className="text-green-600">${emp.costRate}/hr</span>
                          ) : emp.hourlyRate > 0 ? (
                            <span className="text-green-600">${emp.hourlyRate}/hr</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {emp.regularHours > 0 ? emp.regularHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-yellow-600">
                          {emp.overtimeHours > 0 ? emp.overtimeHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-cyan-600">
                          {emp.ptoHours > 0 ? emp.ptoHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-purple-600">
                          {emp.vacationHours > 0 ? emp.vacationHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-rose-600">
                          {emp.sickHours > 0 ? emp.sickHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-red-600">
                          {emp.unpaidHours > 0 ? emp.unpaidHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono font-medium">
                          {emp.totalHours > 0 ? emp.totalHours.toFixed(1) : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {emp.totalHours > 0 ? (
                            <div>
                              <span className="font-mono text-green-600">{emp.billableHours.toFixed(1)}</span>
                              <span className="text-xs text-gray-500 ml-1">
                                ({Math.round((emp.billableHours / emp.totalHours) * 100)}%)
                              </span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-orange-600">
                          {emp.costRate > 0 && emp.totalHours > 0 
                            ? formatCurrency(emp.totalHours * emp.costRate) 
                            : '—'}
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-600 font-medium">
                          {emp.grossPay > 0 ? formatCurrency(emp.grossPay) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-800 font-medium">
                    <tr>
                      <td colSpan={3} className="p-2 text-right">Totals:</td>
                      <td className="p-2 text-right font-mono">
                        {(employeeStats.totals.totalTrackedHours - employeeStats.totals.totalOvertime - employeeStats.totals.totalPaidTimeOff - employeeStats.totals.totalUnpaid).toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-yellow-600">
                        {employeeStats.totals.totalOvertime.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-cyan-600">
                        {employeeStats.totals.totalPTO.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-purple-600">
                        {employeeStats.totals.totalVacation.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-rose-600">
                        {employeeStats.totals.totalSick.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-red-600">
                        {employeeStats.totals.totalUnpaid.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold">
                        {employeeStats.totals.totalTrackedHours.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-green-600">
                        {employeeStats.totals.totalBillableHours.toFixed(1)}
                      </td>
                      <td className="p-2 text-right font-mono text-orange-600 font-bold">
                        {formatCurrency(employeeStats.totals.totalLabourCost)}
                      </td>
                      <td className="p-2 text-right font-mono text-emerald-600 font-bold">
                        {formatCurrency(employeeStats.totals.totalGrossPay || employeeStats.totals.payrollTotalGross || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Recent Time Activities */}
            {timeActivities.length > 0 && (
              <>
                <h4 className="font-medium text-gray-700 mt-6 mb-3">Recent Time Entries</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2 text-sm font-semibold">Date</th>
                        <th className="p-2 text-sm font-semibold">Employee</th>
                        <th className="p-2 text-sm font-semibold">Customer/Project</th>
                        <th className="p-2 text-sm font-semibold">Description</th>
                        <th className="p-2 text-sm font-semibold text-center">Billable</th>
                        <th className="p-2 text-sm font-semibold text-right">Hours</th>
                        <th className="p-2 text-sm font-semibold text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeActivities
                        .sort((a, b) => new Date(b.TxnDate).getTime() - new Date(a.TxnDate).getTime())
                        .slice((pages.timeActivities - 1) * ITEMS_PER_PAGE, pages.timeActivities * ITEMS_PER_PAGE)
                        .map((activity) => {
                          const hours = (activity.Hours || 0) + ((activity.Minutes || 0) / 60);
                          return (
                            <tr key={activity.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="p-2 text-sm">{formatDate(activity.TxnDate)}</td>
                              <td className="p-2 text-sm">{activity.EmployeeRef?.name || '—'}</td>
                              <td className="p-2 text-sm truncate max-w-xs">
                                {activity.CustomerRef?.name || activity.ItemRef?.name || '—'}
                              </td>
                              <td className="p-2 text-sm truncate max-w-xs">
                                {activity.Description || '—'}
                              </td>
                              <td className="p-2 text-center">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  activity.BillableStatus === 'Billable'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                }`}>
                                  {activity.BillableStatus === 'Billable' ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="p-2 text-sm text-right font-mono">{hours.toFixed(2)}</td>
                              <td className="p-2 text-sm text-right font-mono">
                                {activity.HourlyRate ? `${formatCurrency(activity.HourlyRate)}/hr` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  <Pagination 
                    currentPage={pages.timeActivities} 
                    totalItems={timeActivities.length} 
                    onPageChange={(page) => setPage('timeActivities', page)}
                    tableName="timeActivities"
                  />
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Customers Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('customers')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              Customers
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {customers.filter(c => c.Active !== false).length} active / {customers.length} total
              </span>
              {expandedSection === 'customers' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{customers.filter(c => c.Active !== false).length}</p>
              <p className="text-xs text-gray-500">Active Customers</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(customers.reduce((sum, c) => sum + (c.Balance || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Total Outstanding</p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {customers.filter(c => c.Balance > 0).length}
              </p>
              <p className="text-xs text-gray-500">With Balance Due</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{customers.filter(c => c.Active === false).length}</p>
              <p className="text-xs text-gray-500">Inactive</p>
            </div>
          </div>
        </CardContent>

        {expandedSection === 'customers' && customers.length > 0 && (
          <CardContent className="pt-0 border-t">
            <div className="overflow-x-auto mt-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 text-sm font-semibold">Customer</th>
                    <th className="p-2 text-sm font-semibold">Company</th>
                    <th className="p-2 text-sm font-semibold">Email</th>
                    <th className="p-2 text-sm font-semibold">Phone</th>
                    <th className="p-2 text-sm font-semibold text-right">Balance</th>
                    <th className="p-2 text-sm font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .slice((pages.customers - 1) * ITEMS_PER_PAGE, pages.customers * ITEMS_PER_PAGE)
                    .map((customer) => (
                    <tr key={customer.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 text-sm font-medium">{customer.DisplayName || customer.FullyQualifiedName}</td>
                      <td className="p-2 text-sm">{customer.CompanyName || '—'}</td>
                      <td className="p-2 text-sm">{customer.PrimaryEmailAddr?.Address || '—'}</td>
                      <td className="p-2 text-sm">{customer.PrimaryPhone?.FreeFormNumber || '—'}</td>
                      <td className="p-2 text-sm text-right font-mono">{formatCurrency(customer.Balance || 0)}</td>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${customer.Active !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {customer.Active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination 
                currentPage={pages.customers} 
                totalItems={customers.length} 
                onPageChange={(page) => setPage('customers', page)}
                tableName="customers"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bills Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('bills')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-red-500" />
              Bills & Payables
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{filteredBills.length} bills / {billPayments.length} payments</span>
              {expandedSection === 'bills' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(bills.reduce((sum, b) => sum + (b.Balance || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Outstanding Bills</p>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{bills.filter(b => b.Balance > 0).length}</p>
              <p className="text-xs text-gray-500">Unpaid Bills</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(billPayments.reduce((sum, p) => sum + (p.TotalAmt || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Total Paid</p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(vendorCredits.reduce((sum, c) => sum + (c.TotalAmt || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Vendor Credits</p>
            </div>
          </div>
        </CardContent>

        {expandedSection === 'bills' && (
          <CardContent className="pt-0 border-t">
            {filteredBills.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ReceiptText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No bills found in QuickBooks</p>
                <p className="text-xs mt-1">Bills data may not be available for this account</p>
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-semibold">Bill #</th>
                      <th className="p-2 text-sm font-semibold">Date</th>
                      <th className="p-2 text-sm font-semibold">Vendor</th>
                      <th className="p-2 text-sm font-semibold">Due Date</th>
                      <th className="p-2 text-sm font-semibold text-right">Total</th>
                      <th className="p-2 text-sm font-semibold text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills
                      .slice((pages.bills - 1) * ITEMS_PER_PAGE, pages.bills * ITEMS_PER_PAGE)
                      .map((bill) => (
                      <tr key={bill.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-2 text-sm font-medium">{bill.DocNumber || bill.Id}</td>
                        <td className="p-2 text-sm">{formatDate(bill.TxnDate)}</td>
                        <td className="p-2 text-sm">{bill.VendorRef?.name || '—'}</td>
                        <td className="p-2 text-sm">{bill.DueDate ? formatDate(bill.DueDate) : '—'}</td>
                        <td className="p-2 text-sm text-right font-mono">{formatCurrency(bill.TotalAmt)}</td>
                        <td className={`p-2 text-sm text-right font-mono ${bill.Balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(bill.Balance || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination 
                  currentPage={pages.bills} 
                  totalItems={filteredBills.length} 
                  onPageChange={(page) => setPage('bills', page)}
                  tableName="bills"
                />
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Sales Receipts & Credit Memos Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('salesReceipts')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-500" />
              Sales Receipts & Credits
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {salesReceipts.length} receipts / {creditMemos.length} credits / {refundReceipts.length} refunds
              </span>
              {expandedSection === 'salesReceipts' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(salesReceipts.reduce((sum, r) => sum + (r.TotalAmt || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Sales Receipts Total</p>
            </div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(creditMemos.reduce((sum, c) => sum + (c.TotalAmt || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Credit Memos</p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(refundReceipts.reduce((sum, r) => sum + (r.TotalAmt || 0), 0))}
              </p>
              <p className="text-xs text-gray-500">Refunds Issued</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{salesReceipts.length}</p>
              <p className="text-xs text-gray-500">Receipt Count</p>
            </div>
          </div>
        </CardContent>

        {expandedSection === 'salesReceipts' && (
          <CardContent className="pt-0 border-t">
            {filteredSalesReceipts.length > 0 && (
              <>
                <h4 className="font-medium text-gray-700 mt-4 mb-3">Sales Receipts</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2 text-sm font-semibold">Receipt #</th>
                        <th className="p-2 text-sm font-semibold">Date</th>
                        <th className="p-2 text-sm font-semibold">Customer</th>
                        <th className="p-2 text-sm font-semibold">Payment Method</th>
                        <th className="p-2 text-sm font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReceipts
                        .slice((pages.salesReceipts - 1) * ITEMS_PER_PAGE, pages.salesReceipts * ITEMS_PER_PAGE)
                        .map((receipt) => (
                        <tr key={receipt.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="p-2 text-sm font-medium">{receipt.DocNumber || receipt.Id}</td>
                          <td className="p-2 text-sm">{formatDate(receipt.TxnDate)}</td>
                          <td className="p-2 text-sm">{receipt.CustomerRef?.name || '—'}</td>
                          <td className="p-2 text-sm">{receipt.PaymentMethodRef?.name || '—'}</td>
                          <td className="p-2 text-sm text-right font-mono text-green-600">{formatCurrency(receipt.TotalAmt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination 
                    currentPage={pages.salesReceipts} 
                    totalItems={salesReceipts.length} 
                    onPageChange={(page) => setPage('salesReceipts', page)}
                    tableName="salesReceipts"
                  />
                </div>
              </>
            )}

            {creditMemos.length > 0 && (
              <>
                <h4 className="font-medium text-gray-700 mt-6 mb-3">Credit Memos</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2 text-sm font-semibold">Credit #</th>
                        <th className="p-2 text-sm font-semibold">Date</th>
                        <th className="p-2 text-sm font-semibold">Customer</th>
                        <th className="p-2 text-sm font-semibold text-right">Amount</th>
                        <th className="p-2 text-sm font-semibold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditMemos
                        .slice((pages.creditMemos - 1) * ITEMS_PER_PAGE, pages.creditMemos * ITEMS_PER_PAGE)
                        .map((credit) => (
                        <tr key={credit.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="p-2 text-sm font-medium">{credit.DocNumber || credit.Id}</td>
                          <td className="p-2 text-sm">{formatDate(credit.TxnDate)}</td>
                          <td className="p-2 text-sm">{credit.CustomerRef?.name || '—'}</td>
                          <td className="p-2 text-sm text-right font-mono">{formatCurrency(credit.TotalAmt)}</td>
                          <td className="p-2 text-sm text-right font-mono text-yellow-600">{formatCurrency(credit.RemainingCredit || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination 
                    currentPage={pages.creditMemos} 
                    totalItems={creditMemos.length} 
                    onPageChange={(page) => setPage('creditMemos', page)}
                    tableName="creditMemos"
                  />
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Journal Entries Section */}
      {journalEntries.length > 0 && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => toggleSection('journalEntries')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-slate-500" />
                Journal Entries
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{journalEntries.length} entries</span>
                {expandedSection === 'journalEntries' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>

          {expandedSection === 'journalEntries' && (
            <CardContent className="pt-0 border-t">
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-semibold">Entry #</th>
                      <th className="p-2 text-sm font-semibold">Date</th>
                      <th className="p-2 text-sm font-semibold">Memo</th>
                      <th className="p-2 text-sm font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries
                      .slice((pages.journalEntries - 1) * ITEMS_PER_PAGE, pages.journalEntries * ITEMS_PER_PAGE)
                      .map((entry) => (
                      <tr key={entry.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-2 text-sm font-medium">{entry.DocNumber || entry.Id}</td>
                        <td className="p-2 text-sm">{formatDate(entry.TxnDate)}</td>
                        <td className="p-2 text-sm truncate max-w-xs">{entry.PrivateNote || '—'}</td>
                        <td className="p-2 text-sm text-right font-mono">{formatCurrency(entry.TotalAmt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination 
                  currentPage={pages.journalEntries} 
                  totalItems={journalEntries.length} 
                  onPageChange={(page) => setPage('journalEntries', page)}
                  tableName="journalEntries"
                />
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Purchase Orders Section */}
      {purchaseOrders.length > 0 && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => toggleSection('purchaseOrders')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-teal-500" />
                Purchase Orders
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{purchaseOrders.length} orders</span>
                {expandedSection === 'purchaseOrders' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                <p className="text-2xl font-bold text-teal-600">{purchaseOrders.filter(p => p.POStatus === 'Open').length}</p>
                <p className="text-xs text-gray-500">Open Orders</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{purchaseOrders.filter(p => p.POStatus === 'Closed').length}</p>
                <p className="text-xs text-gray-500">Closed Orders</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(purchaseOrders.reduce((sum, p) => sum + (p.TotalAmt || 0), 0))}
                </p>
                <p className="text-xs text-gray-500">Total Value</p>
              </div>
            </div>
          </CardContent>

          {expandedSection === 'purchaseOrders' && (
            <CardContent className="pt-0 border-t">
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-semibold">PO #</th>
                      <th className="p-2 text-sm font-semibold">Date</th>
                      <th className="p-2 text-sm font-semibold">Vendor</th>
                      <th className="p-2 text-sm font-semibold text-center">Status</th>
                      <th className="p-2 text-sm font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders
                      .slice((pages.purchaseOrders - 1) * ITEMS_PER_PAGE, pages.purchaseOrders * ITEMS_PER_PAGE)
                      .map((po) => (
                      <tr key={po.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-2 text-sm font-medium">{po.DocNumber || po.Id}</td>
                        <td className="p-2 text-sm">{formatDate(po.TxnDate)}</td>
                        <td className="p-2 text-sm">{po.VendorRef?.name || '—'}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            po.POStatus === 'Open' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {po.POStatus || 'Open'}
                          </span>
                        </td>
                        <td className="p-2 text-sm text-right font-mono">{formatCurrency(po.TotalAmt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination 
                  currentPage={pages.purchaseOrders} 
                  totalItems={purchaseOrders.length} 
                  onPageChange={(page) => setPage('purchaseOrders', page)}
                  tableName="purchaseOrders"
                />
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Transfers Section */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => toggleSection('transfers')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-violet-500" />
                Account Transfers
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{transfers.length} transfers</span>
                {expandedSection === 'transfers' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>

          {expandedSection === 'transfers' && (
            <CardContent className="pt-0 border-t">
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 text-sm font-semibold">Date</th>
                      <th className="p-2 text-sm font-semibold">From Account</th>
                      <th className="p-2 text-sm font-semibold">To Account</th>
                      <th className="p-2 text-sm font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers
                      .slice((pages.transfers - 1) * ITEMS_PER_PAGE, pages.transfers * ITEMS_PER_PAGE)
                      .map((transfer) => (
                      <tr key={transfer.Id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-2 text-sm">{formatDate(transfer.TxnDate)}</td>
                        <td className="p-2 text-sm">{transfer.FromAccountRef?.name || '—'}</td>
                        <td className="p-2 text-sm">{transfer.ToAccountRef?.name || '—'}</td>
                        <td className="p-2 text-sm text-right font-mono">{formatCurrency(transfer.Amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination 
                  currentPage={pages.transfers} 
                  totalItems={transfers.length} 
                  onPageChange={(page) => setPage('transfers', page)}
                  tableName="transfers"
                />
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Settings & Configuration Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onClick={() => toggleSection('settings')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-gray-500" />
              Settings & Configuration
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {classes.length} classes, {departments.length} depts, {taxCodes.length} tax codes
              </span>
              {expandedSection === 'settings' ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              <GitBranch className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-xl font-bold">{classes.length}</p>
              <p className="text-xs text-gray-500">Classes</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              <Building className="h-5 w-5 mx-auto mb-1 text-purple-500" />
              <p className="text-xl font-bold">{departments.length}</p>
              <p className="text-xs text-gray-500">Departments</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              <BadgePercent className="h-5 w-5 mx-auto mb-1 text-green-500" />
              <p className="text-xl font-bold">{taxCodes.length}</p>
              <p className="text-xs text-gray-500">Tax Codes</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              <CreditCard className="h-5 w-5 mx-auto mb-1 text-orange-500" />
              <p className="text-xl font-bold">{paymentMethods.length}</p>
              <p className="text-xs text-gray-500">Payment Methods</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              <CalendarDays className="h-5 w-5 mx-auto mb-1 text-cyan-500" />
              <p className="text-xl font-bold">{terms.length}</p>
              <p className="text-xs text-gray-500">Payment Terms</p>
            </div>
          </div>
        </CardContent>

        {expandedSection === 'settings' && (
          <CardContent className="pt-0 border-t">
            {classes.length === 0 && departments.length === 0 && taxCodes.length === 0 && paymentMethods.length === 0 && terms.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Layers className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No configuration data found in QuickBooks</p>
                <p className="text-xs mt-1">Classes, departments, and tax codes may not be configured for this account</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {/* Classes */}
              {classes.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <GitBranch className="h-4 w-4" /> Classes
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {classes.map((cls) => (
                      <div key={cls.Id} className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                        <span>{cls.FullyQualifiedName || cls.Name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${cls.Active !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {cls.Active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Departments */}
              {departments.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Building className="h-4 w-4" /> Departments
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {departments.map((dept) => (
                      <div key={dept.Id} className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                        <span>{dept.FullyQualifiedName || dept.Name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${dept.Active !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {dept.Active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tax Codes */}
              {taxCodes.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <BadgePercent className="h-4 w-4" /> Tax Codes
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {taxCodes.map((tax) => (
                      <div key={tax.Id} className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                        <span>{tax.Name}</span>
                        <span className="text-xs text-gray-500">{tax.Description || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Methods */}
              {paymentMethods.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Payment Methods
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {paymentMethods.map((method) => (
                      <div key={method.Id} className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                        <span>{method.Name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${method.Active !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {method.Active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Terms */}
              {terms.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Payment Terms
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {terms.map((term) => (
                      <div key={term.Id} className="flex items-center justify-between text-sm p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                        <span>{term.Name}</span>
                        <span className="text-xs text-gray-500">
                          {term.DueDays ? `Due in ${term.DueDays} days` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chart of Accounts Summary */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Chart of Accounts
                </h4>
                <div className="space-y-1">
                  {['Bank', 'Accounts Receivable', 'Accounts Payable', 'Income', 'Expense', 'Other Current Asset', 'Fixed Asset', 'Other Current Liability', 'Equity'].map((type) => {
                    const count = accounts.filter(a => a.AccountType === type).length;
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-center justify-between text-sm p-1">
                        <span className="text-gray-600">{type}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default QuickBooksDashboard;
