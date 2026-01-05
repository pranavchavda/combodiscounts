import type {
  RunInput,
  FunctionRunResult,
  ProductDiscount,
  Target,
} from "../generated/api";
import {
  DiscountApplicationStrategy,
} from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

// Configuration structure stored in the discount metafield
interface PosOnlyDiscountConfig {
  discountType: 'fixedAmount' | 'percentage';
  value: string; // "10.00" for fixed amount, "10" for percentage
  minQuantity: number;
  collections: string[]; // Reserved for future use - collection filtering not yet supported
  message: string;
}

// Default configuration (safe defaults - 0% discount)
const DEFAULT_CONFIG: PosOnlyDiscountConfig = {
  discountType: 'percentage',
  value: '0',
  minQuantity: 1,
  collections: [],
  message: 'POS Discount',
};

export function run(input: RunInput): FunctionRunResult {
  // 1. KEY CHECK: If NOT a POS transaction, return empty (no discount for online)
  const isPosTransaction = input.cart.retailLocation !== null;

  if (!isPosTransaction) {
    // Online checkout - do not apply this discount
    return EMPTY_DISCOUNT;
  }

  // 2. Parse configuration from metafield or use defaults
  let config: PosOnlyDiscountConfig = DEFAULT_CONFIG;
  if (input.discountNode?.metafield?.value) {
    try {
      config = JSON.parse(input.discountNode.metafield.value) as PosOnlyDiscountConfig;
    } catch {
      // If parsing fails, use defaults (fail safe)
      config = DEFAULT_CONFIG;
    }
  }

  // 3. Filter eligible cart lines (ProductVariant only)
  // Note: Collection filtering is reserved for future implementation
  // Shopify Functions input queries are static and can't use dynamic collection IDs
  const eligibleLines = input.cart.lines.filter(line => {
    return line.merchandise.__typename === 'ProductVariant';
  });

  // 4. Check minimum quantity requirement
  const totalQuantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);

  if (totalQuantity < config.minQuantity) {
    // Minimum quantity not met
    return EMPTY_DISCOUNT;
  }

  // 5. Build discount targets
  const targets: Target[] = eligibleLines
    .filter(line => line.merchandise.__typename === 'ProductVariant')
    .map(line => ({
      productVariant: {
        id: (line.merchandise as { __typename: 'ProductVariant'; id: string }).id,
      },
    }));

  if (targets.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // 6. Build discount value based on type
  const discountValue = parseFloat(config.value) || 0;

  if (discountValue <= 0) {
    return EMPTY_DISCOUNT;
  }

  const discount: ProductDiscount = config.discountType === 'percentage'
    ? {
        message: config.message,
        targets,
        value: {
          percentage: {
            value: discountValue,
          },
        },
      }
    : {
        message: config.message,
        targets,
        value: {
          fixedAmount: {
            amount: config.value,
          },
        },
      };

  // 7. Return the discount
  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [discount],
  };
}
