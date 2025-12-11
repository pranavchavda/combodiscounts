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

interface BundleConfig {
  defaultBundleDiscount: number;
}

interface Configuration {
  comboRules: ComboRule[];
  excludedTags: string[];
  bundleConfig?: BundleConfig;
}

// Default configuration matching the Christmas Combos requirements
const DEFAULT_CONFIG: Configuration = {
  comboRules: [
    {
      // 15% tier - premium brands
      machineVendors: ['Bezzera', 'Sanremo', 'Rancilio', 'Quick Mill', 'Slayer'],
      grinderVendors: ['Eureka', 'Eureka Oro', 'Mahlkonig', 'Anfim', 'HeyCafe', 'Mazzer', 'ECM', 'Profitec'],
      discountPercentage: 15,
    },
    {
      // 10% tier - standard brands
      machineVendors: ['ECM', 'Profitec', 'Technivorm'],
      grinderVendors: ['Eureka', 'Eureka Oro', 'Mahlkonig', 'Anfim', 'HeyCafe', 'Mazzer', 'ECM', 'Profitec'],
      discountPercentage: 10,
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

interface CartLineWithBundle {
  id: string;
  productId: string;
  bundleProductIds: string[];
  bundleDiscount: number | null;
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
          bundleProducts?: { value: string } | null;
          bundleDiscount?: { value: string } | null;
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

  // Parse cart lines for bundle discount matching
  const cartLinesWithBundles: CartLineWithBundle[] = input.cart.lines
    .filter(line => line.merchandise.__typename === 'ProductVariant')
    .map(line => {
      const variant = line.merchandise as {
        __typename: 'ProductVariant';
        id: string;
        product: {
          id: string;
          hasAnyTag: boolean;
          bundleProducts?: { value: string } | null;
          bundleDiscount?: { value: string } | null;
        };
      };

      // Parse bundle_products metafield (list.product_reference format: ["gid://shopify/Product/123", ...])
      let bundleProductIds: string[] = [];
      if (variant.product.bundleProducts?.value) {
        try {
          bundleProductIds = JSON.parse(variant.product.bundleProducts.value);
        } catch {
          bundleProductIds = [];
        }
      }

      // Parse bundle_discount metafield (number_decimal)
      let bundleDiscount: number | null = null;
      if (variant.product.bundleDiscount?.value) {
        const parsed = parseFloat(variant.product.bundleDiscount.value);
        if (!isNaN(parsed)) {
          bundleDiscount = parsed;
        }
      }

      return {
        id: line.id,
        productId: variant.product.id,
        bundleProductIds,
        bundleDiscount,
        hasExcludedTag: variant.product.hasAnyTag,
      };
    });

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

  // Find machine lines - must be product type "Espresso Machines" AND vendor in machineVendors
  const machineLines = cartLines.filter(line => {
    if (!line.vendor) return false;
    if (line.productType?.toLowerCase() !== 'espresso machines') return false;
    return sortedRules.some(rule =>
      rule.machineVendors.some(
        mv => mv.toLowerCase() === line.vendor?.toLowerCase(),
      ),
    );
  });

  // Find grinder lines - must be product type "Grinders" AND vendor in grinderVendors
  const grinderLines = cartLines.filter(line => {
    if (!line.vendor) return false;
    if (line.productType?.toLowerCase() !== 'grinders') return false;
    return sortedRules.some(rule =>
      rule.grinderVendors.some(
        gv => gv.toLowerCase() === line.vendor?.toLowerCase(),
      ),
    );
  });

  // Match machines with grinders
  for (const machineLine of machineLines) {
    if (discountedLineIds.has(machineLine.id)) continue;

    // Find the best discount rule for this machine
    const machineRule = sortedRules.find(rule =>
      rule.machineVendors.some(
        mv => mv.toLowerCase() === machineLine.vendor?.toLowerCase(),
      ),
    );

    if (!machineRule) continue;

    // Find an eligible grinder that hasn't been discounted yet
    for (const grinderLine of grinderLines) {
      if (discountedLineIds.has(grinderLine.id)) continue;
      if (machineLine.id === grinderLine.id) continue;

      // Check if this grinder is eligible for this rule
      const isEligibleGrinder = machineRule.grinderVendors.some(
        gv => gv.toLowerCase() === grinderLine.vendor?.toLowerCase(),
      );

      if (!isEligibleGrinder) continue;

      // Found a combo! Apply discount to BOTH items
      discountedLineIds.add(machineLine.id);
      discountedLineIds.add(grinderLine.id);

      const discountMessage = `Christmas Combo: ${machineRule.discountPercentage}% off`;

      // Add discount for machine
      candidates.push({
        message: discountMessage,
        targets: [{ cartLine: { id: machineLine.id } }],
        value: { percentage: { value: machineRule.discountPercentage } },
      });

      // Add discount for grinder
      candidates.push({
        message: discountMessage,
        targets: [{ cartLine: { id: grinderLine.id } }],
        value: { percentage: { value: machineRule.discountPercentage } },
      });

      // Only one grinder per machine
      break;
    }
  }

  // ===== BUNDLE DISCOUNTS =====
  // Apply discounts to bundle products when the parent product is in cart
  // The discount percentage is read from the CHILD (bundle product) via custom.bundle_discount
  // or falls back to the global default
  const defaultBundleDiscount = config.bundleConfig?.defaultBundleDiscount ?? 0;

  // Get all product IDs in cart for quick lookup
  const cartProductIds = new Set(cartLinesWithBundles.map(l => l.productId));

  // Find "parent" products that have bundle_products metafield
  const parentProducts = cartLinesWithBundles.filter(
    l => l.bundleProductIds.length > 0 && !l.hasExcludedTag
  );

  for (const parent of parentProducts) {
    // Find bundle products that are also in the cart
    for (const bundleProductId of parent.bundleProductIds) {
      if (!cartProductIds.has(bundleProductId)) continue;

      // Find the cart line(s) for this bundle product
      const bundleLines = cartLinesWithBundles.filter(
        l => l.productId === bundleProductId && !l.hasExcludedTag && !discountedLineIds.has(l.id)
      );

      for (const bundleLine of bundleLines) {
        // Read discount from the CHILD product, fall back to default
        const discountPercent = bundleLine.bundleDiscount ?? defaultBundleDiscount;

        if (discountPercent <= 0) continue;

        discountedLineIds.add(bundleLine.id);

        candidates.push({
          message: `Bundle Discount: ${discountPercent}% off`,
          targets: [{ cartLine: { id: bundleLine.id } }],
          value: { percentage: { value: discountPercent } },
        });
      }
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
