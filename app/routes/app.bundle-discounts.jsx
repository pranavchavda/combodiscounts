import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Badge,
  Box,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get bundle config from app installation metafield
  const configResponse = await admin.graphql(`
    query {
      currentAppInstallation {
        id
        metafield(namespace: "christmas-combos", key: "bundle-config") {
          value
        }
      }
    }
  `);

  const configData = await configResponse.json();
  const metafieldValue = configData?.data?.currentAppInstallation?.metafield?.value;
  const appInstallationId = configData?.data?.currentAppInstallation?.id;

  let bundleConfig = { defaultBundleDiscount: 10 };
  if (metafieldValue) {
    try {
      bundleConfig = JSON.parse(metafieldValue);
    } catch (e) {
      console.error("Failed to parse bundle config:", e);
    }
  }

  // Get existing discounts that use our function
  const discountsResponse = await admin.graphql(`
    query {
      discountNodes(first: 10, query: "type:app") {
        nodes {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
              startsAt
              endsAt
              discountClass
            }
          }
        }
      }
    }
  `);

  const discountsData = await discountsResponse.json();
  const discountNodes = discountsData?.data?.discountNodes?.nodes || [];

  // Find our Bundle discount
  const bundleDiscount = discountNodes.find(node =>
    node.discount?.title?.toLowerCase().includes("bundle")
  );

  return json({
    bundleConfig,
    appInstallationId,
    discount: bundleDiscount ? {
      id: bundleDiscount.id,
      title: bundleDiscount.discount.title,
      status: bundleDiscount.discount.status,
      startsAt: bundleDiscount.discount.startsAt,
      endsAt: bundleDiscount.discount.endsAt,
    } : null
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "createDiscount") {
    try {
      // Get the function ID
      const functionsResponse = await admin.graphql(`
        query {
          shopifyFunctions(first: 25) {
            nodes {
              id
              title
              apiType
              app {
                title
              }
            }
          }
        }
      `);

      const functionsData = await functionsResponse.json();
      const functions = functionsData?.data?.shopifyFunctions?.nodes || [];

      // Find our discount function
      const discountFunction = functions.find(fn =>
        (fn.apiType === "cart_discounts" || fn.apiType === "discounts" || fn.apiType === "product_discounts") &&
        (fn.app?.title?.toLowerCase().includes("christmas") || fn.title?.toLowerCase().includes("christmas"))
      );

      if (!discountFunction) {
        const anyMatchingFunction = functions.find(fn =>
          fn.app?.title?.toLowerCase().includes("christmas") || fn.title?.toLowerCase().includes("christmas")
        );

        if (!anyMatchingFunction) {
          return json({
            error: `Could not find the discount function. Available functions: ${functions.map(f => `${f.title} (${f.apiType})`).join(', ')}. Make sure the extension is deployed.`
          }, { status: 400 });
        }

        // Use the matching function we found
        const createResponse = await admin.graphql(`
          mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
            discountAutomaticAppCreate(automaticAppDiscount: $discount) {
              automaticAppDiscount {
                discountId
                title
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: {
            discount: {
              title: "Bundle Discount",
              functionId: anyMatchingFunction.id,
              startsAt: new Date().toISOString(),
              discountClasses: ["PRODUCT"],
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: false,
                shippingDiscounts: true,
              },
            },
          },
        });

        const createData = await createResponse.json();

        if (createData.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
          return json({
            error: createData.data.discountAutomaticAppCreate.userErrors[0].message
          }, { status: 400 });
        }

        return json({ success: true, message: "Bundle discount created successfully!" });
      }

      // Create the automatic discount
      const createResponse = await admin.graphql(`
        mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $discount) {
            automaticAppDiscount {
              discountId
              title
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          discount: {
            title: "Bundle Discount",
            functionId: discountFunction.id,
            startsAt: new Date().toISOString(),
            discountClasses: ["PRODUCT"],
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: false,
              shippingDiscounts: true,
            },
          },
        },
      });

      const createData = await createResponse.json();

      if (createData.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
        return json({
          error: createData.data.discountAutomaticAppCreate.userErrors[0].message
        }, { status: 400 });
      }

      return json({ success: true, message: "Bundle discount created successfully!" });
    } catch (e) {
      console.error("Error creating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (actionType === "activateDiscount") {
    const discountId = formData.get("discountId");
    try {
      const activateResponse = await admin.graphql(`
        mutation ActivateDiscount($id: ID!) {
          discountAutomaticActivate(id: $id) {
            automaticDiscountNode {
              automaticDiscount {
                ... on DiscountAutomaticApp {
                  status
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: discountId },
      });

      const activateData = await activateResponse.json();

      if (activateData.data?.discountAutomaticActivate?.userErrors?.length > 0) {
        return json({
          error: activateData.data.discountAutomaticActivate.userErrors[0].message
        }, { status: 400 });
      }

      return json({ success: true, message: "Discount activated!" });
    } catch (e) {
      console.error("Error activating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (actionType === "deactivateDiscount") {
    const discountId = formData.get("discountId");
    try {
      const deactivateResponse = await admin.graphql(`
        mutation DeactivateDiscount($id: ID!) {
          discountAutomaticDeactivate(id: $id) {
            automaticDiscountNode {
              automaticDiscount {
                ... on DiscountAutomaticApp {
                  status
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: discountId },
      });

      const deactivateData = await deactivateResponse.json();

      if (deactivateData.data?.discountAutomaticDeactivate?.userErrors?.length > 0) {
        return json({
          error: deactivateData.data.discountAutomaticDeactivate.userErrors[0].message
        }, { status: 400 });
      }

      return json({ success: true, message: "Discount deactivated!" });
    } catch (e) {
      console.error("Error deactivating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  // Save config action
  const configString = formData.get("config");

  try {
    const bundleConfig = JSON.parse(configString);

    // First, get the current app installation ID
    const appInstallationResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          id
        }
      }
    `);
    const appInstallationData = await appInstallationResponse.json();
    const ownerId = appInstallationData?.data?.currentAppInstallation?.id;

    if (!ownerId) {
      return json({ error: "Could not find app installation" }, { status: 400 });
    }

    const response = await admin.graphql(`
      mutation SetAppMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            namespace: "christmas-combos",
            key: "bundle-config",
            type: "json",
            value: JSON.stringify(bundleConfig),
            ownerId: ownerId,
          },
        ],
      },
    });

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({ error: result.data.metafieldsSet.userErrors[0].message }, { status: 400 });
    }

    return json({ success: true, message: "Bundle configuration saved!" });
  } catch (e) {
    console.error("Error saving config:", e);
    return json({ error: e.message }, { status: 400 });
  }
};

function DiscountStatusCard({ discount, onCreateDiscount, onActivate, onDeactivate, isSubmitting }) {
  if (!discount) {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">
                Discount Status
              </Text>
              <Text as="p" tone="subdued">
                No bundle discount has been created yet.
              </Text>
            </BlockStack>
            <Badge tone="warning">Not Created</Badge>
          </InlineStack>
          <Banner tone="warning">
            <Text as="p">
              You need to create a discount for the bundle rules to take effect. Click the button below to create the Bundle Discount.
            </Text>
          </Banner>
          <Button variant="primary" onClick={onCreateDiscount} loading={isSubmitting}>
            Create Bundle Discount
          </Button>
        </BlockStack>
      </Card>
    );
  }

  const isActive = discount.status === "ACTIVE";

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">
              Discount Status
            </Text>
            <Text as="p" tone="subdued">
              {discount.title}
            </Text>
          </BlockStack>
          <Badge tone={isActive ? "success" : "attention"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </InlineStack>

        {isActive ? (
          <Banner tone="success">
            <Text as="p">
              The Bundle Discount is active! Customers will see discounts when they add products from a bundle to their cart.
            </Text>
          </Banner>
        ) : (
          <Banner tone="warning">
            <Text as="p">
              The discount is currently inactive. Activate it to start applying bundle discounts.
            </Text>
          </Banner>
        )}

        <InlineStack gap="200">
          {isActive ? (
            <Button tone="critical" onClick={() => onDeactivate(discount.id)} loading={isSubmitting}>
              Deactivate Discount
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onActivate(discount.id)} loading={isSubmitting}>
              Activate Discount
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function BundleDiscounts() {
  const { bundleConfig: initialConfig, discount } = useLoaderData();
  const actionData = useActionData();
  const [bundleConfig, setBundleConfig] = useState(initialConfig);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const updateDefaultDiscount = useCallback((value) => {
    setBundleConfig((prev) => ({
      ...prev,
      defaultBundleDiscount: parseFloat(value) || 0,
    }));
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("config", JSON.stringify(bundleConfig));
    formData.append("actionType", "saveConfig");
    submit(formData, { method: "post" });
  }, [bundleConfig, submit]);

  const handleCreateDiscount = useCallback(() => {
    const formData = new FormData();
    formData.append("actionType", "createDiscount");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleActivateDiscount = useCallback((discountId) => {
    const formData = new FormData();
    formData.append("actionType", "activateDiscount");
    formData.append("discountId", discountId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleDeactivateDiscount = useCallback((discountId) => {
    const formData = new FormData();
    formData.append("actionType", "deactivateDiscount");
    formData.append("discountId", discountId);
    submit(formData, { method: "post" });
  }, [submit]);

  const hasUnsavedChanges = JSON.stringify(bundleConfig) !== JSON.stringify(initialConfig);

  return (
    <Page>
      <TitleBar title="Bundle Discounts">
        <button variant="primary" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Configuration"}
        </button>
      </TitleBar>

      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical" onDismiss={() => {}}>
            {actionData.error}
          </Banner>
        )}

        {actionData?.success && actionData?.message && (
          <Banner tone="success" onDismiss={() => {}}>
            {actionData.message}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <DiscountStatusCard
              discount={discount}
              onCreateDiscount={handleCreateDiscount}
              onActivate={handleActivateDiscount}
              onDeactivate={handleDeactivateDiscount}
              isSubmitting={isSubmitting}
            />
          </Layout.Section>

          <Layout.Section>
            {hasUnsavedChanges && (
              <Box paddingBlockEnd="400">
                <Banner tone="warning">
                  You have unsaved changes. Click "Save Configuration" to apply them.
                </Banner>
              </Box>
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingLg" as="h2">
                    Default Bundle Discount
                  </Text>
                  <Text as="p" tone="subdued">
                    Set the default discount percentage for bundle products. This applies to all bundles unless overridden at the product level.
                  </Text>
                </BlockStack>

                <TextField
                  label="Default Discount Percentage"
                  type="number"
                  value={String(bundleConfig.defaultBundleDiscount)}
                  onChange={updateDefaultDiscount}
                  suffix="%"
                  min={0}
                  max={100}
                  autoComplete="off"
                  helpText="This discount applies to bundle products when added to cart with the parent product"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  How Bundle Discounts Work
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    1. Set up products with a <strong>custom.bundle_products</strong> metafield containing a list of product references.
                  </Text>
                  <Text as="p" variant="bodySm">
                    2. When the "parent" product is in the cart along with any of its bundle products, those bundle products receive the discount.
                  </Text>
                  <Text as="p" variant="bodySm">
                    3. The default discount percentage can be overridden per-product using a <strong>custom.bundle_discount</strong> metafield (number).
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Product Metafields Required
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      <strong>custom.bundle_products</strong>
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Type: list.product_reference
                    </Text>
                    <Text as="p" variant="bodySm">
                      Contains references to products that should be discounted when purchased with this product.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      <strong>custom.bundle_discount</strong> (optional)
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Type: number_decimal
                    </Text>
                    <Text as="p" variant="bodySm">
                      Override the default discount for this specific bundle.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Excluded Products
                  </Text>
                  <Text as="p" variant="bodySm">
                    Products with these tags are excluded from bundle discounts:
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Badge tone="warning">no-combo-discount</Badge>
                    <Badge tone="warning">clearance</Badge>
                    <Badge tone="warning">bundle</Badge>
                    <Badge tone="warning">openbox</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
