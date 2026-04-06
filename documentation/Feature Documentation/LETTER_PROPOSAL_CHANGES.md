# Letter Proposal Changes

## Overview

The Letter Proposal system generates professional proposal letters from estimates/quotes. Recent enhancements include duplicate functionality, section visibility toggles, rename capabilities, and improved state management.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Recent Changes](#recent-changes)
3. [Database Schema](#database-schema)
4. [Component Structure](#component-structure)
5. [State Management](#state-management)
6. [Letter Generation](#letter-generation)
7. [Section Visibility](#section-visibility)
8. [Duplicate Functionality](#duplicate-functionality)

---

## Features

### Core Capabilities

- **Letter Generation**: Generate proposal letters from estimates/quotes
- **Quote Selection**: Select which quote(s) to include in the letter
- **Scope Quantity**: Specify quantities for combined quotes
- **NETA Standard Selection**: Choose NETA standard (ATS/MTS)
- **Section Visibility**: Toggle sections on/off
- **Duplicate Letters**: Create copies of existing letters
- **Rename Letters**: Customize letter titles
- **Auto-Save**: Automatic saving of letter drafts
- **Price Calculation**: Automatic price calculation with quantities

### Recent Enhancements

- **Duplicate Letter Proposal**: One-click duplication of letters
- **Section Visibility Toggles**: Show/hide sections in letter
- **Rename Cover Letter**: Customize letter titles
- **Improved State Management**: Better persistence and restoration
- **Combined Quote Support**: Support for multiple quotes with quantities

---

## Recent Changes

### Duplicate Letter Proposal

Users can now duplicate existing letter proposals:

1. Open letter proposal
2. Click "Duplicate" button
3. New letter is created with same content
4. Can be edited independently

### Section Visibility Toggles

Sections can be toggled on/off:

- **Header Section**: Company header and logo
- **Introduction Section**: Opening paragraph
- **Scope Section**: Work scope and SOV items
- **Pricing Section**: Pricing breakdown
- **Terms Section**: Terms and conditions
- **Signature Section**: Signature and closing

### Rename Cover Letter

Users can customize letter titles:

1. Click "Rename" button
2. Enter new title
3. Title is saved and displayed

### Improved State Management

- Letter state persists across page refreshes
- State restored when tab becomes visible
- Better handling of unsaved changes
- Improved error handling

---

## Database Schema

### Table: `business.letter_proposals`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `opportunity_id` | UUID | Reference to opportunity |
| `title` | TEXT | Letter title/name |
| `html` | TEXT | Letter HTML content |
| `net_30_price` | DECIMAL | Net 30 pricing |
| `neta_standard` | TEXT | NETA standard (ATS/MTS) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Table: `business.opportunities`

Relevant columns for letter proposals:

| Column | Type | Description |
|--------|------|-------------|
| `letter_proposal_date` | DATE | Date letter proposal was created |
| `selected_letter_proposal` | UUID | Currently selected letter proposal |
| `quoted_amount` | DECIMAL | Quoted amount (updated from letter) |

---

## Component Structure

### EstimateSheet Component

**Location**: `src/components/estimates/EstimateSheet.tsx`

Main component for letter proposal management.

**Key Functions**:
- `generateLetterProposal(index)` - Generate letter from quote
- `generateLetterContent(index)` - Generate letter HTML
- `saveLetterProposal()` - Save letter to database
- `duplicateLetterProposal()` - Duplicate existing letter
- `toggleSectionVisibility()` - Toggle section visibility

### Letter Proposal State Hook

**Location**: `src/hooks/useUserPreferences.ts`

Hook for managing letter proposal state:

```typescript
export function useLetterProposalState(opportunityId: string) {
  // State management
  const letterHtml = preferences.drafts?.[draftKey] || null;
  const isOpen = preferences.ui?.[openKey] === 'true';
  const quoteIndex = preferences.ui?.[quoteIndexKey];
  const netaStandard = preferences.ui?.[netaStandardKey];
  
  // Setters
  const setLetterHtml = useCallback(async (html: string) => {...});
  const setIsOpen = useCallback(async (open: boolean) => {...});
  const setQuoteIndex = useCallback(async (index: number | null) => {...});
  const setNetaStandard = useCallback(async (standard: string) => {...});
}
```

---

## State Management

### User Preferences Storage

Letter proposal state is stored in user preferences:

```typescript
// Draft content
drafts: {
  'letter-proposal-draft-{opportunityId}': html
}

// UI state
ui: {
  'letter-proposal-open-{opportunityId}': true/false,
  'letter-quote-index-{opportunityId}': number,
  'letter-neta-standard-{opportunityId}': 'ATS' | 'MTS'
}
```

### State Persistence

State is automatically saved:

1. **On Change**: State changes trigger saves
2. **On Visibility Change**: State restored when tab becomes visible
3. **On Page Load**: State restored from preferences
4. **Auto-Save**: Drafts auto-saved periodically

### State Restoration

When tab becomes visible:

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const savedState = getLetterProposalState();
      
      // Restore if should be open but isn't
      if (savedState.isOpen && savedState.html && !isLetterProposalOpen) {
        setIsLetterProposalOpen(true);
        setLetterHtml(savedState.html);
        if (savedState.quoteIndex !== null) {
          setSelectedLetterQuoteIndex(savedState.quoteIndex);
        }
        if (savedState.netaStandard) {
          setNetaStandard(savedState.netaStandard);
        }
      }
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

---

## Letter Generation

### Generation Process

1. **Quote Selection**: User selects quote(s) to include
2. **Scope Quantity**: User sets quantities (if combining quotes)
3. **NETA Standard**: User selects ATS or MTS
4. **Content Generation**: System generates HTML from quote data
5. **Section Assembly**: Sections assembled based on visibility settings
6. **Price Calculation**: Prices calculated with quantities
7. **Save**: Letter saved to database

### HTML Generation

```typescript
function generateLetterContent(index: number) {
  const quote = quotes[index];
  const parsedData = typeof quote.data === 'string' 
    ? JSON.parse(quote.data) 
    : quote.data;
  
  // Extract SOV items
  const sovItems = parsedData.sovItems || [];
  
  // Calculate pricing
  const baseFinalValue = calculatePrice(parsedData);
  const finalValue = baseFinalValue * (scopeQuantity || 1);
  
  // Generate HTML
  const letterHtml = `
    <div class="letter-proposal">
      ${generateHeader()}
      ${generateIntroduction()}
      ${generateScope(sovItems)}
      ${generatePricing(finalValue)}
      ${generateTerms()}
      ${generateSignature()}
    </div>
  `;
  
  setLetterHtml(letterHtml);
}
```

### Asset Preloading

Before generating letter, assets are preloaded:

```typescript
const preloadAssets = () => {
  return new Promise((resolve) => {
    const logo = new Image();
    const signature = new Image();
    
    logo.src = 'https://...AMP Logo...';
    signature.src = window.AMP_SIGNATURE_URL || '/img/brian-rodgers-signature.jpg';
    
    // Wait for both to load
    let loadedCount = 0;
    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= 2) resolve(true);
    };
    
    logo.onload = checkComplete;
    signature.onload = checkComplete;
    
    // Timeout fallback
    setTimeout(() => resolve(true), 5000);
  });
};
```

---

## Section Visibility

### Toggleable Sections

Sections can be shown/hidden:

1. **Header**: Company header and logo
2. **Introduction**: Opening paragraph
3. **Scope**: Work scope and SOV items
4. **Pricing**: Pricing breakdown
5. **Terms**: Terms and conditions
6. **Signature**: Signature and closing

### Implementation

```typescript
const [sectionVisibility, setSectionVisibility] = useState({
  header: true,
  introduction: true,
  scope: true,
  pricing: true,
  terms: true,
  signature: true
});

const toggleSection = (section: string) => {
  setSectionVisibility(prev => ({
    ...prev,
    [section]: !prev[section]
  }));
};

// In HTML generation
${sectionVisibility.header ? generateHeader() : ''}
${sectionVisibility.introduction ? generateIntroduction() : ''}
${sectionVisibility.scope ? generateScope() : ''}
```

### UI Controls

Toggle buttons in letter editor:

```typescript
<div className="section-controls">
  <button onClick={() => toggleSection('header')}>
    {sectionVisibility.header ? 'Hide' : 'Show'} Header
  </button>
  <button onClick={() => toggleSection('scope')}>
    {sectionVisibility.scope ? 'Hide' : 'Show'} Scope
  </button>
  {/* ... other sections ... */}
</div>
```

---

## Duplicate Functionality

### Duplicate Process

1. User clicks "Duplicate" button
2. System creates new letter proposal record
3. HTML content is copied
4. Title is set to "Copy of [Original Title]"
5. New letter is opened for editing

### Implementation

```typescript
const duplicateLetterProposal = async () => {
  if (!currentLetterId) return;
  
  // Fetch original letter
  const { data: original } = await supabase
    .schema('business')
    .from('letter_proposals')
    .select('*')
    .eq('id', currentLetterId)
    .single();
  
  // Create duplicate
  const { data: duplicate } = await supabase
    .schema('business')
    .from('letter_proposals')
    .insert({
      opportunity_id: original.opportunity_id,
      title: `Copy of ${original.title}`,
      html: original.html,
      net_30_price: original.net_30_price,
      neta_standard: original.neta_standard
    })
    .select()
    .single();
  
  // Open duplicate for editing
  setCurrentLetterId(duplicate.id);
  setLetterHtml(duplicate.html);
  setIsLetterProposalOpen(true);
};
```

---

## Price Calculation

### Calculation Logic

Prices are calculated from quote data:

1. **Base Calculation**: Material + Expense + Labor costs
2. **Markup Application**: Material markup applied
3. **Travel Addition**: Travel costs added
4. **Division**: Divide by 0.96 (margin)
5. **Quantity Multiplication**: Multiply by scope quantity
6. **Rounding**: Round up to nearest dollar

### Implementation

```typescript
function getFinalNumeratorWithoutTravel(parsed: any) {
  const cv = parsed.calculatedValues || {};
  const hs = parsed.hoursSummary || {};
  
  return (
    (cv.totalMaterial * 1.09 * materialMarkup) +
    (cv.totalExpense * 1.09) +
    (cv.nonSovExpense * 1.00) +
    (hs.straightTimeHours * hourlyRates.straightTime) +
    (hs.overtimeHours * hourlyRates.overtime) +
    (hs.doubleTimeHours * hourlyRates.doubleTime)
  );
}

const baseFinalValue = Math.ceil(
  (getFinalNumeratorWithoutTravel(parsedData) + getParsedTotalTravelCost()) / 0.96
);

const finalValue = baseFinalValue * (scopeQuantity || 1);
```

### Opportunity Update

When letter is saved, opportunity is updated:

```typescript
const updateOpportunityFromLetter = async (letterId: string, net30Price: number) => {
  // Update opportunity quoted_amount
  await supabase
    .schema('business')
    .from('opportunities')
    .update({ 
      quoted_amount: net30Price,
      selected_letter_proposal: letterId
    })
    .eq('id', opportunityId);
  
  // Update letter_proposal_date
  const today = new Date().toISOString().substring(0, 10);
  await supabase
    .schema('business')
    .from('opportunities')
    .update({ 
      letter_proposal_date: today + 'T12:00:00.000Z'
    })
    .eq('id', opportunityId);
};
```

---

## Related Documentation

- [Scope Quantity Changes](./SCOPE_QUANTITY_CHANGES.md) - Quantity functionality
- [Executive Summary Pages](./EXECUTIVE_SUMMARY.md) - Document generation
- Estimate Components: `src/components/estimates/EstimateSheet.tsx`
- User Preferences: `src/hooks/useUserPreferences.ts`

---

## Troubleshooting

### Letter Not Saving

1. Check database connection
2. Verify RLS policies allow insert/update
3. Review browser console for errors
4. Check user preferences storage

### State Not Persisting

1. Verify user preferences hook is working
2. Check localStorage is available
3. Review state restoration logic
4. Check for state conflicts

### Duplicate Not Working

1. Verify original letter exists
2. Check database insert permissions
3. Review duplicate creation logic
4. Check for unique constraint violations

### Sections Not Toggling

1. Verify section visibility state
2. Check HTML generation logic
3. Review CSS display rules
4. Check for JavaScript errors

---

## Future Enhancements

Potential improvements:

- Section templates
- Custom section ordering
- Section content editing
- Multiple letter templates
- Letter versioning
- Letter sharing
- PDF export
- Email integration
- Letter approval workflow
