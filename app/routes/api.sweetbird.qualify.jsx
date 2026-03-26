/**
 * Public endpoint — no auth required.
 * Checks whether any of the given variant IDs belong to the qualifying
 * collections configured in the Sweetbird samples metafield.
 *
 * GET /api/sweetbird/qualify?variantIds=gid://shopify/ProductVariant/123,gid://...
 *
 * Response: { qualifies: boolean }
 */

import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const variantIdsParam = url.searchParams.get("variantIds");

  if (!variantIdsParam) {
    return json({ qualifies: false }, { headers: CORS_HEADERS });
  }

  const variantIds = variantIdsParam
    .split(",")
    .map((id) => decodeURIComponent(id.trim()))
    .filter(Boolean)
    .slice(0, 50); // Safety cap

  if (variantIds.length === 0) {
    return json({ qualifies: false }, { headers: CORS_HEADERS });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request).catch(
      () => authenticate.admin(request),
    );

    // 1. Get qualifying collection IDs from config
    const configResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          metafield(namespace: "$app:sweetbird-samples", key: "config") {
            value
          }
        }
      }
    `);

    const configData = await configResponse.json();
    const raw = configData?.data?.currentAppInstallation?.metafield?.value;

    let qualifyingCollectionIds = [];
    if (raw) {
      try {
        const config = JSON.parse(raw);
        qualifyingCollectionIds = config.qualifyingCollectionIds ?? [];
      } catch {
        // ignore
      }
    }

    // No restrictions configured — everyone qualifies
    if (qualifyingCollectionIds.length === 0) {
      return json({ qualifies: true }, { headers: CORS_HEADERS });
    }

    // 2. Look up the product IDs for the given variants
    const variantQuery = variantIds
      .map((id, i) => `v${i}: productVariant(id: "${id}") { product { id } }`)
      .join("\n");

    const variantsResponse = await admin.graphql(`query { ${variantQuery} }`);
    const variantsData = await variantsResponse.json();

    const productIds = Object.values(variantsData?.data ?? {})
      .filter(Boolean)
      .map((v) => v.product?.id)
      .filter(Boolean);

    if (productIds.length === 0) {
      return json({ qualifies: false }, { headers: CORS_HEADERS });
    }

    // 3. Check if any product is in a qualifying collection
    for (const collectionId of qualifyingCollectionIds) {
      const memberQuery = productIds
        .map(
          (pid, i) =>
            `p${i}: collectionContainsProduct(id: "${collectionId}", productId: "${pid}")`,
        )
        .join("\n");

      const memberResponse = await admin.graphql(`query { ${memberQuery} }`);
      const memberData = await memberResponse.json();

      const anyMatch = Object.values(memberData?.data ?? {}).some(Boolean);
      if (anyMatch) {
        return json({ qualifies: true }, { headers: CORS_HEADERS });
      }
    }

    return json({ qualifies: false }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("sweetbird qualify error:", err);
    // Fail open — let the sample picker show rather than silently break
    return json({ qualifies: true }, { headers: CORS_HEADERS });
  }
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
};
