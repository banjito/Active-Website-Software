import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { SearchFilters } from '../components/search/GlobalSearchBar';
import { addToRecentSearches } from '../components/search/RecentSearches.tsx';

// Define the types for search results
export interface BaseSearchResult {
  id: string;
  type: string;
  division?: string;
}

export interface CustomerSearchResult extends BaseSearchResult {
  type: 'customer';
  name: string;
  company_name: string;
  metadata: { created_at: string };
}

export interface JobSearchResult extends BaseSearchResult {
  type: 'job';
  title: string;
  status: string;
  customer: { name: string };
  due_date: string;
}

export interface ContactSearchResult extends BaseSearchResult {
  type: 'contact';
  name: string;
  email: string;
  customer: { name: string };
}

export interface OpportunitySearchResult extends BaseSearchResult {
  type: 'opportunity';
  title: string;
  customer: { name: string };
  status: string;
}

export interface AssetSearchResult extends BaseSearchResult {
  type: 'asset';
  name: string;
  identifier: string;
  location: string;
}

export interface ReportSearchResult extends BaseSearchResult {
  type: 'report';
  title: string;
  job: { title: string };
  created_at: string;
}

// Union type for all search result types
export type SearchResult = 
  | CustomerSearchResult 
  | JobSearchResult 
  | ContactSearchResult
  | OpportunitySearchResult
  | AssetSearchResult
  | ReportSearchResult;

interface SearchContextType {
  query: string;
  filters: SearchFilters;
  searchResults: SearchResult[];
  loading: boolean;
  hasSearched: boolean;
  performSearch: (query: string, filters?: SearchFilters) => Promise<void>;
  clearSearch: () => void;
}

const defaultFilters: SearchFilters = {
  entityTypes: [],
  divisions: [],
  advancedMode: false
};

const SearchContext = createContext<SearchContextType | undefined>(undefined);

// Real customer search
const searchCustomers = async (query: string, limit = 25): Promise<CustomerSearchResult[]> => {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const { data, error } = await supabase
    .schema('common')
    .from('customers')
    .select('id, name, company_name, created_at')
    .or(`name.ilike.${like},company_name.ilike.${like}`)
    .order('name')
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    type: 'customer',
    name: row.name,
    company_name: row.company_name,
    metadata: { created_at: row.created_at }
  }));
};

interface SearchProviderProps {
  children: ReactNode;
}

export const SearchProvider = ({ children }: SearchProviderProps) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = useCallback(async (searchQuery: string, searchFilters: SearchFilters = filters) => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setQuery(searchQuery);
    setFilters(searchFilters);
    setLoading(true);
    setHasSearched(true);

    try {
      const results: SearchResult[] = [];
      const types = searchFilters.entityTypes.length > 0 
        ? searchFilters.entityTypes
        : ['customers'];

      if (types.includes('customers')) {
        const customerResults = await searchCustomers(searchQuery, 25);
        setSearchResults(customerResults);
        // We currently only wire customers; extend similarly for contacts/jobs as needed
        return;
      }
      
      // Add to recent searches
      if (searchQuery.trim()) {
        addToRecentSearches(searchQuery);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setHasSearched(false);
  }, []);

  return (
    <SearchContext.Provider
      value={{
        query,
        filters,
        searchResults,
        loading,
        hasSearched,
        performSearch,
        clearSearch
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};

export default SearchContext; 