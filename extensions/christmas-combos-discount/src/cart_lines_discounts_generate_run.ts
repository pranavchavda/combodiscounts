import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

// Configuration structure stored in metafield
interface ComboRule {
  machineVendors: string[];
  grinderVendors: string[];
  discountPercentage: number;
}

interface Configuration {
  comboRules: ComboRule[];
  excludedTags: string[];
}

// Default configuration - 5% for live promo
const DEFAULT_CONFIG: Configuration = {
  comboRules: [
    {
      machineVendors: ['Magister', 'Ascaso', 'Bezzera', 'ECM', 'Flair Espresso', 'La Marzocco', 'Nuova Simonelli', 'Nurri', 'Profitec', 'Quick Mill', 'Rancilio', 'Sanremo', 'Slayer', 'Solis', 'Victoria Arduino'],
      grinderVendors: ['Mahlkonig', 'Anfim', 'Baratza', 'Breville', 'Ditting', 'ECM', 'Eureka', 'Eureka Oro', 'HeyCafe', 'La Marzocco', 'Mazzer', 'Nuova Simonelli', 'Profitec', 'Rancilio', 'Sanremo', 'Technivorm'],
      discountPercentage: 5,
    },
  ],
  excludedTags: ['no-combo-discount', 'clearance', 'bundle', 'openbox'],
};

interface CartLineWithVendor {
  id: string;
  vendor: string | null;
  productType: string | null;
  hasExcludedTag: boolean;
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  // Check if we have product discount class enabled
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Get configuration from metafield or use defaults
  const config: Configuration = input.discount.metafield?.jsonValue
    ? (input.discount.metafield.jsonValue as Configuration)
    : DEFAULT_CONFIG;

  // Parse cart lines with vendor info
  const cartLines: CartLineWithVendor[] = input.cart.lines
    .filter(line => line.merchandise.__typename === 'ProductVariant')
    .map(line => {
      const variant = line.merchandise as {
        __typename: 'ProductVariant';
        id: string;
        product: {
          id: string;
          vendor: string | null;
          productType: string | null;
          hasAnyTag: boolean;
        };
      };
      return {
        id: line.id,
        vendor: variant.product.vendor,
        productType: variant.product.productType,
        hasExcludedTag: variant.product.hasAnyTag,
      };
    })
    // Filter out items with excluded tags
    .filter(line => !line.hasExcludedTag);

  // Find combo matches and apply discounts
  const discountedLineIds = new Set<string>();
  const candidates: Array<{
    message: string;
    targets: Array<{ cartLine: { id: string } }>;
    value: { percentage: { value: number } };
  }> = [];

  // Sort rules by discount percentage (highest first) to apply best discount
  const sortedRules = [...config.comboRules].sort(
    (a, b) => b.discountPercentage - a.discountPercentage,
  );

  // Pre-compute Sets of vendors for each rule to avoid repeated .some() checks
  const ruleLookups = sortedRules.map(rule => ({
    rule,
    machineVendors: new Set(rule.machineVendors.map(v => v.toLowerCase())),
    grinderVendors: new Set(rule.grinderVendors.map(v => v.toLowerCase())),
  }));

  // Find machine lines - must be product type "Espresso Machines" AND vendor in machineVendors
  const machineLines = cartLines.filter(line => {
    if (!line.vendor) return false;
    const typeMatch = line.productType?.toLowerCase() === 'espresso machines';
    if (!typeMatch) return false;

    const vendorLower = line.vendor.toLowerCase();
    return ruleLookups.some(lookup => lookup.machineVendors.has(vendorLower));
  });

  // Find grinder lines - must be product type "Grinders" AND vendor in grinderVendors
  const grinderLines = cartLines.filter(line => {
    if (!line.vendor) return false;
    const typeMatch = line.productType?.toLowerCase() === 'grinders';
    if (!typeMatch) return false;

    const vendorLower = line.vendor.toLowerCase();
    return ruleLookups.some(lookup => lookup.grinderVendors.has(vendorLower));
  });

  // Match machines with grinders
  for (const machineLine of machineLines) {
    if (discountedLineIds.has(machineLine.id)) continue;

    // Find the best discount rule for this machine
    const machineVendorLower = machineLine.vendor?.toLowerCase();
    const machineRuleLookup = ruleLookups.find(lookup =>
      lookup.machineVendors.has(machineVendorLower),
    );

    if (!machineRuleLookup) continue;

    // Find an eligible grinder that hasn't been discounted yet
    for (const grinderLine of grinderLines) {
      if (discountedLineIds.has(grinderLine.id)) continue;
      if (machineLine.id === grinderLine.id) continue;

      // Check if this grinder is eligible for this rule
      const grinderVendorLower = grinderLine.vendor?.toLowerCase();
      if (!machineRuleLookup.grinderVendors.has(grinderVendorLower)) continue;

      // Found a combo! Apply discount to BOTH items
      discountedLineIds.add(machineLine.id);
      discountedLineIds.add(grinderLine.id);

      const discountMessage = `Combo Discount: ${machineRuleLookup.rule.discountPercentage}% off`;

      // Add discount for machine
      candidates.push({
        message: discountMessage,
        targets: [{ cartLine: { id: machineLine.id } }],
        value: { percentage: { value: machineRuleLookup.rule.discountPercentage } },
      });

      // Add discount for grinder
      candidates.push({
        message: discountMessage,
        targets: [{ cartLine: { id: grinderLine.id } }],
        value: { percentage: { value: machineRuleLookup.rule.discountPercentage } },
      });

      // Only one grinder per machine
      break;
    }
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
