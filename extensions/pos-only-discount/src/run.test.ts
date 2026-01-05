import { describe, it, expect } from "vitest";
import { run } from "./run";
import { DiscountApplicationStrategy } from "../generated/api";

describe("POS-Only Discount", () => {
  const baseCartLine = {
    id: "gid://shopify/CartLine/1",
    quantity: 2,
    merchandise: {
      __typename: "ProductVariant" as const,
      id: "gid://shopify/ProductVariant/123",
      product: {
        id: "gid://shopify/Product/456",
      },
    },
  };

  const posLocation = {
    id: "gid://shopify/Location/123",
    handle: "main-store",
  };

  const defaultConfig = {
    discountType: "percentage",
    value: "10",
    minQuantity: 1,
    collections: [],
    message: "POS Discount: 10% off",
  };

  describe("POS Detection", () => {
    it("returns empty discounts when retailLocation is null (online checkout)", () => {
      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: null, // Online checkout
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(defaultConfig),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(0);
    });

    it("applies discount when retailLocation is populated (POS checkout)", () => {
      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation, // POS checkout
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(defaultConfig),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0].message).toBe("POS Discount: 10% off");
    });
  });

  describe("Minimum Quantity Requirement", () => {
    it("returns empty discounts when minimum quantity is not met", () => {
      const configWithHighMinQty = {
        ...defaultConfig,
        minQuantity: 10, // Cart only has 2
      };

      const input = {
        cart: {
          lines: [baseCartLine], // quantity: 2
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(configWithHighMinQty),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(0);
    });

    it("applies discount when minimum quantity is met", () => {
      const configWithLowMinQty = {
        ...defaultConfig,
        minQuantity: 2, // Cart has exactly 2
      };

      const input = {
        cart: {
          lines: [baseCartLine], // quantity: 2
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(configWithLowMinQty),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(1);
    });
  });

  describe("Discount Value Types", () => {
    it("applies percentage discount correctly", () => {
      const percentConfig = {
        discountType: "percentage",
        value: "15",
        minQuantity: 1,
        collections: [],
        message: "15% off POS",
      };

      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(percentConfig),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0].value).toEqual({ percentage: { value: 15 } });
      expect(result.discounts[0].message).toBe("15% off POS");
    });

    it("applies fixed amount discount correctly", () => {
      const fixedConfig = {
        discountType: "fixedAmount",
        value: "10.00",
        minQuantity: 1,
        collections: [],
        message: "$10 off POS",
      };

      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(fixedConfig),
          },
        },
      };

      const result = run(input as any);
      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0].value).toEqual({
        fixedAmount: { amount: "10.00" },
      });
      expect(result.discounts[0].message).toBe("$10 off POS");
    });
  });

  describe("Configuration Fallback", () => {
    it("uses default config when metafield is null", () => {
      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: null, // No config
        },
      };

      // Should still work but with 0% discount (safe default)
      const result = run(input as any);
      // Default config has value "0", so no discount should be applied
      expect(result.discounts).toHaveLength(0);
    });

    it("uses default config when metafield value is invalid JSON", () => {
      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: "invalid json {{{",
          },
        },
      };

      // Should fall back to defaults (fail safe - 0% discount)
      const result = run(input as any);
      expect(result.discounts).toHaveLength(0);
    });
  });

  describe("Selection Strategy", () => {
    it("uses First selection strategy", () => {
      const input = {
        cart: {
          lines: [baseCartLine],
          retailLocation: posLocation,
        },
        discountNode: {
          metafield: {
            value: JSON.stringify(defaultConfig),
          },
        },
      };

      const result = run(input as any);
      expect(result.discountApplicationStrategy).toBe(
        DiscountApplicationStrategy.First
      );
    });
  });
});
