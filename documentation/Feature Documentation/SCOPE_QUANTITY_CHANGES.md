# Scope Quantity Changes

## Overview

The Scope Quantity feature allows users to specify quantities when combining multiple quotes into a single letter proposal. This enables accurate pricing calculations when a proposal includes multiple instances of the same scope.

**Last Updated**: January 2025

---

## Table of Contents

1. [Features](#features)
2. [Use Cases](#use-cases)
3. [Implementation](#implementation)
4. [User Interface](#user-interface)
5. [Price Calculation](#price-calculation)
6. [Data Storage](#data-storage)

---

## Features

### Core Capabilities

- **Quantity Selection**: Specify quantity for each quote when combining
- **Price Multiplication**: Automatically multiply base price by quantity
- **Combined Quote Support**: Works with combined quote functionality
- **Scope-Based Calculation**: Calculate total based on scope quantities
- **Visual Indicators**: Clear display of quantities in UI

### Key Functionality

- Users can select multiple quotes to combine
- Each selected quote can have a quantity (default: 1)
- Total price is calculated as: `base_price × quantity` for each quote
- Sum of all quote prices (with quantities) = total proposal price

---

## Use Cases

### Multiple Equipment Units

**Scenario**: Proposing for 5 identical transformers

1. Create quote for one transformer ($10,000)
2. Select quote for letter proposal
3. Set scope quantity to 5
4. System calculates: $10,000 × 5 = $50,000 total

### Mixed Quantities

**Scenario**: Proposing for multiple different items

1. Quote 1: Panelboard (quantity: 2) = $5,000 × 2 = $10,000
2. Quote 2: Circuit Breaker (quantity: 10) = $500 × 10 = $5,000
3. Quote 3: Cable (quantity: 100 ft) = $10/ft × 100 = $1,000
4. **Total**: $16,000

### Single Unit (Default)

**Scenario**: Standard single-unit proposal

1. Select quote
2. Quantity defaults to 1
3. Price = base price (no multiplication)

---

## Implementation

### Component Location

**File**: `src/components/estimates/EstimateSheet.tsx`

### State Management

```typescript
// Scope quantities state
const [scopeQuantities, setScopeQuantities] = useState<Record<number, number>>({});

// When quote is selected for combined quote
const handleSelectQuoteForCombined = (index: number) => {
  // Initialize quantity to 1 if not set
  if (!scopeQuantities[index]) {
    setScopeQuantities(prev => ({
      ...prev,
      [index]: 1
    }));
  }
  // Add to selected quotes
  setSelectedQuotesForCombined(prev => [...prev, index]);
};
```

### Quantity Input

```typescript
// Quantity input component
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
```

---

## User Interface

### Combined Quote Selection Dialog

When selecting quotes to combine:

1. **Quote List**: Display all available quotes
2. **Checkbox Selection**: Select quotes to include
3. **Quantity Input**: Appears next to selected quotes
4. **Default Quantity**: Automatically set to 1
5. **Minimum Value**: Enforced minimum of 1

### Visual Layout

```
☑ Quote 1 - $10,000 - 2024-01-15
   Scope Quantity: [1]

☑ Quote 2 - $5,000 - 2024-01-16
   Scope Quantity: [3]

☐ Quote 3 - $2,000 - 2024-01-17
```

### Quantity Input Features

- **Number Input**: Numeric input field
- **Minimum Value**: Cannot be less than 1
- **Integer Only**: Automatically floors decimal values
- **Real-time Update**: Updates immediately on change
- **Visual Feedback**: Clear indication of selected quotes with quantities

---

## Price Calculation

### Calculation Logic

**Location**: `src/components/jobs/OpportunityDetail.tsx`

```typescript
// Method 1: Use grand total if available
let price = extractedNet30 || 0;

// Method 2: Extract from HTML if grand total not found
if (!price || price <= 0) {
  const grandTotalEl = doc.querySelector('.grand-total-price');
  if (grandTotalEl) {
    const priceText = grandTotalEl.textContent || '';
    price = parsePrice(priceText);
  }
}

// Method 3: Sum individual scope prices with quantities
if (!price || price <= 0) {
  const scopePrices = Array.from(doc.querySelectorAll('.scope-price[data-kind="net30"]'));
  if (scopePrices.length > 0) {
    let sum = 0;
    scopePrices.forEach((el) => {
      const baseAttr = el.getAttribute('data-base') || '0';
      const base = Number((baseAttr || '0').replace(/,/g, '')) || 0;
      
      // Find scope quantity
      const block = el.closest('.amp-section')?.parentElement || el.parentElement;
      let qtyEl = block?.querySelector('input.scope-qty') as HTMLInputElement | null;
      if (!qtyEl) {
        qtyEl = doc.querySelector('input.scope-qty') as HTMLInputElement | null;
      }
      const qtyRaw = qtyEl?.getAttribute('value') || qtyEl?.value || '1';
      const qty = Math.max(1, parseInt(qtyRaw || '1', 10) || 1);
      
      sum += base * qty;
    });
    if (sum > 0) {
      price = Math.round(sum * 100) / 100;
    }
  }
}
```

### Calculation Steps

1. **Extract Base Price**: Get base price from quote data
2. **Get Quantity**: Read quantity from scope quantity input
3. **Calculate**: `price = base_price × quantity`
4. **Sum All**: Add all quote prices (with quantities) together
5. **Round**: Round to 2 decimal places

### Price Extraction Methods

The system tries multiple methods to extract the total price:

1. **Direct Net30 Value**: From `extractedNet30` variable
2. **Grand Total Element**: From `.grand-total-price` element in HTML
3. **Scope Price Sum**: Sum of all scope prices multiplied by quantities

---

## Data Storage

### State Storage

Quantities are stored in component state:

```typescript
// In-memory state
const [scopeQuantities, setScopeQuantities] = useState<Record<number, number>>({});
```

### HTML Storage

Quantities are embedded in the letter proposal HTML:

```html
<input 
  type="number" 
  class="scope-qty" 
  value="3" 
  data-quote-index="1"
/>
```

### Letter Proposal Storage

When letter proposal is saved:

```typescript
// Save letter proposal with quantities embedded in HTML
await supabase
  .schema('business')
  .from('letter_proposals')
  .update({
    html: letterHtml, // Contains quantity inputs
    net_30_price: calculatedTotal // Total with quantities applied
  })
  .eq('id', letterProposalId);
```

### Opportunity Update

The opportunity's `quoted_amount` is updated based on calculated total:

```typescript
// Update opportunity with calculated price
await updateOpportunityFromLetter(letterProposalId, calculatedTotal);
```

---

## Integration Points

### Estimate Sheet

**Component**: `EstimateSheet.tsx`

- Quote selection interface
- Quantity input fields
- Combined quote generation

### Opportunity Detail

**Component**: `OpportunityDetail.tsx`

- Price extraction from letter proposals
- Quantity-aware price calculation
- Opportunity amount updates

### Letter Proposal Generation

**Process**:

1. User selects quotes with quantities
2. Letter proposal HTML is generated
3. Quantities are embedded as input fields
4. Prices are calculated with quantities
5. Total is stored in `net_30_price`
6. Opportunity `quoted_amount` is updated

---

## HTML Structure

### Quantity Input in Letter

```html
<div class="amp-section">
  <div class="scope-item">
    <span class="scope-title">Transformer Installation</span>
    <span class="scope-price" data-kind="net30" data-base="10000">
      $10,000.00
    </span>
    <input 
      type="number" 
      class="scope-qty" 
      value="5" 
      min="1"
      data-quote-index="0"
    />
  </div>
</div>
```

### Price Calculation in HTML

```html
<div class="grand-total">
  <span class="grand-total-label">Total:</span>
  <span class="grand-total-price">$50,000.00</span>
</div>
```

---

## Related Documentation

- [Letter Proposal Changes](./LETTER_PROPOSAL_CHANGES.md) - Letter proposal system
- Estimate Components: `src/components/estimates/EstimateSheet.tsx`
- Opportunity Components: `src/components/jobs/OpportunityDetail.tsx`

---

## Troubleshooting

### Quantities Not Saving

1. Verify quantity input has correct `value` attribute
2. Check state updates are triggering
3. Review browser console for errors
4. Verify HTML is being generated correctly

### Prices Not Calculating Correctly

1. Check base prices are being extracted correctly
2. Verify quantities are being read from inputs
3. Review calculation logic in `OpportunityDetail.tsx`
4. Check for rounding errors

### Quantities Not Displaying

1. Verify quotes are selected for combined quote
2. Check quantity state is initialized
3. Review UI rendering logic
4. Check CSS classes are correct

---

## Future Enhancements

Potential improvements:

- Quantity validation (max values, ranges)
- Quantity presets (common quantities)
- Bulk quantity updates
- Quantity-based discounts
- Quantity history tracking
- Quantity templates
- Unit of measure support (each, ft, lbs, etc.)
