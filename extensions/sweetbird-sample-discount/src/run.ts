import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

export function run(input: CartInput): CartLinesDiscountsGenerateRunResult {
  // Only apply if product discount class is enabled
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Find cart lines marked as free samples
  const freeSampleLines = input.cart.lines.filter(
    (line) => line.attribute?.value === 'true',
  );

  if (freeSampleLines.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: freeSampleLines.map((line) => ({
            message: 'Free Sweetbird Sample',
            targets: [{ cartLine: { id: line.id } }],
            value: { percentage: { value: 100 } },
          })),
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
