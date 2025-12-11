# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Christmas Combos is a Shopify embedded admin app that provides automatic combo discounts for espresso machine and grinder combinations. When customers add eligible products from configured vendors to their cart, both items automatically receive a discount via a Shopify Function.

**Stack:** Remix 2.16 + React 18 + Prisma + Shopify App Bridge + Polaris UI + Shopify Functions (WASM)

## Common Commands

```bash
npm run dev          # Start development server (runs shopify app dev)
npm run build        # Production build (remix vite:build)
npm run deploy       # Deploy to Shopify
npm run setup        # Generate Prisma client & run migrations
npm run lint         # ESLint with caching
npm run graphql-codegen  # Generate TypeScript types from GraphQL
```

For extensions development:
```bash
cd extensions/christmas-combos-discount
npm test             # Run extension tests with Vitest
```

## Architecture

### Route Structure (Remix flat routes)
- `app/routes/app.jsx` - Embedded app shell with NavMenu and AppProvider
- `app/routes/app.christmas-combos.jsx` - **Core feature**: combo rules configuration UI (loader fetches metafield config + discount status, actions handle create/activate/save)
- `app/routes/app.christmas-combos-help.jsx` - Help documentation
- `app/routes/auth.login/` - OAuth login flow
- `app/routes/webhooks.*.jsx` - App lifecycle webhooks

### Key Server Files
- `app/shopify.server.js` - Shopify app instance, authentication, API configuration
- `app/db.server.js` - Prisma client singleton

### Shopify Function Extension
Located at `extensions/christmas-combos-discount/`:
- `src/cart_lines_discounts_generate_run.ts` - Main discount logic that runs on cart operations
- `generated/` - Auto-generated TypeScript types from GraphQL schema
- `tests/` - Vitest unit tests

The function reads combo rules from the discount's metafield, matches products by vendor and type (Espresso Machines/Grinders), excludes items with specific tags (no-combo-discount, clearance, bundle, openbox), and applies discounts to matched pairs.

### Data Storage
- **App configuration**: Stored in `currentAppInstallation` metafield (namespace: `christmas-combos`, key: `config`)
- **Sessions**: Prisma with SQLite (development) - single Session model

### Configuration Schema
```typescript
{
  comboRules: [{
    id: string,
    discountPercentage: number,  // 0-100
    machineVendors: string[],    // Espresso machine brands
    grinderVendors: string[]     // Grinder brands
  }]
}
```

## Required Shopify Scopes

`write_products`, `write_discounts`, `read_discounts`

## Key Patterns

- All Shopify data access via GraphQL Admin API (April 2025 version)
- Remix loader/action pattern for server-side logic
- Form submissions use FormData API with useFetcher/useSubmit
- Polaris components for UI consistency with Shopify Admin
- Metafields for persistent app-specific data storage
- Actions return JSON with success/error for frontend feedback

## Environment Variables

Required: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`

## Production Deployment

**Server:** 139.177.197.236 (SSH as root)

**App Directory:** `/var/www/christmas-combos` (NOT `/root/christmas-combos`)

**Process Manager:** PM2 with process name `christmas-combos`

### Deployment Steps

```bash
# 1. Sync files to production (exclude node_modules, .git, .env, db files)
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'prisma/*.db' \
  --exclude 'prisma/*.db-journal' \
  ./ root@139.177.197.236:/var/www/christmas-combos/

# 2. SSH into server, rebuild, and restart
ssh root@139.177.197.236 "cd /var/www/christmas-combos && npm install && npm run build && pm2 restart christmas-combos"
```

### Useful PM2 Commands

```bash
pm2 list                      # Show all processes
pm2 logs christmas-combos     # View app logs
pm2 restart christmas-combos  # Restart the app
pm2 describe christmas-combos # Show process details (check exec cwd!)
```
