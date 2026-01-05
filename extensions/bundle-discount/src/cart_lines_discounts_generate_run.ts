import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

// Configuration structure stored in metafield
interface BundleConfig {
  defaultBundleDiscount: number;
}

interface Configuration {
  bundleConfig?: BundleConfig;
}

// Default configuration
const DEFAULT_CONFIG: Configuration = {
  bundleConfig: {
    defaultBundleDiscount: 10,
  },
};

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

  // Track which lines have been discounted
  const discountedLineIds = new Set<string>();
  const candidates: Array<{
    message: string;
    targets: Array<{ cartLine: { id: string } }>;
    value: { percentage: { value: number } };
  }> = [];

  // Get default bundle discount from config
  const defaultBundleDiscount = config.bundleConfig?.defaultBundleDiscount ?? 0;

  // Build a map of product ID -> cart lines for O(1) lookup
  const productIdToLines = new Map<string, CartLineWithBundle[]>();
  for (const line of cartLinesWithBundles) {
    if (!productIdToLines.has(line.productId)) {
      productIdToLines.set(line.productId, []);
    }
    productIdToLines.get(line.productId)!.push(line);
  }

  // Find "parent" products that have bundle_products metafield
  const parentProducts = cartLinesWithBundles.filter(
    l => l.bundleProductIds.length > 0 && !l.hasExcludedTag
  );

  for (const parent of parentProducts) {
    // Find bundle products that are also in the cart
    for (const bundleProductId of parent.bundleProductIds) {
      const bundleLines = productIdToLines.get(bundleProductId);
      if (!bundleLines) continue;

      for (const bundleLine of bundleLines) {
        // Skip if already discounted or has excluded tag
        if (bundleLine.hasExcludedTag || discountedLineIds.has(bundleLine.id)) continue;

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
