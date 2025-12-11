# Christmas Combos & Bundle Discounts

A Shopify embedded admin app that provides automatic combo and bundle discounts for your store.

## Features

### Christmas Combo Discounts
Automatic discounts when customers add eligible espresso machine + grinder combinations to their cart:
- Configure vendor-based matching rules (e.g., Bezzera machines + Eureka grinders)
- Set different discount tiers for different vendor combinations
- Both the machine and grinder receive the configured discount percentage

### Dynamic Bundle Discounts
Automatic discounts for products defined in a product's `custom.bundle_products` metafield:
- Set a global default bundle discount percentage in the app
- Override per-product using `custom.bundle_discount` metafield
- When a "parent" product is in the cart alongside any of its bundle products, those bundle products receive the discount

## Tech Stack

- **Framework:** Remix 2.16 + React 18
- **Database:** Prisma with SQLite
- **UI:** Shopify Polaris + App Bridge
- **Discounts:** Shopify Functions (WASM)
- **API:** Shopify GraphQL Admin API (April 2025)

## Setup

### Prerequisites

1. [Node.js](https://nodejs.org/) (v18.20+)
2. [Shopify Partner Account](https://partners.shopify.com/signup)
3. [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)

### Installation

```bash
npm install
npm run setup    # Generate Prisma client & run migrations
```

### Development

```bash
npm run dev      # Start development server
```

### Deployment

```bash
npm run deploy   # Deploy to Shopify
npm run build    # Production build
```

## Configuration

### Christmas Combos
1. Navigate to **Christmas Combos** in the app
2. Add combo rules with machine vendors, grinder vendors, and discount percentage
3. Create and activate the discount

### Bundle Discounts
1. Navigate to **Bundle Discounts** in the app
2. Set the default bundle discount percentage
3. Create and activate the discount
4. Set up products with required metafields (see below)

### Required Product Metafields for Bundles

| Metafield | Namespace | Key | Type | Description |
|-----------|-----------|-----|------|-------------|
| Bundle Products | `custom` | `bundle_products` | `list.product_reference` | List of product GIDs that should be discounted when purchased with this product |
| Bundle Discount | `custom` | `bundle_discount` | `number_decimal` | (Optional) Override the default discount percentage for this bundle |

### Excluded Products

Products with these tags are excluded from all discounts:
- `no-combo-discount`
- `clearance`
- `bundle`
- `openbox`

## Project Structure

```
├── app/
│   ├── routes/
│   │   ├── app.jsx                    # App shell with navigation
│   │   ├── app.christmas-combos.jsx   # Combo rules configuration
│   │   ├── app.bundle-discounts.jsx   # Bundle discount configuration
│   │   └── ...
│   ├── shopify.server.js              # Shopify app configuration
│   └── db.server.js                   # Prisma client
├── extensions/
│   └── christmas-combos-discount/
│       ├── src/
│       │   ├── cart_lines_discounts_generate_run.ts      # Discount logic
│       │   └── cart_lines_discounts_generate_run.graphql # Cart input query
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma                  # Database schema
└── package.json
```

## Required Shopify Scopes

- `write_products`
- `write_discounts`
- `read_discounts`

## License

Private - All rights reserved
