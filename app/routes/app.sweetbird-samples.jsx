import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { writeFile } from "fs/promises";
import { join } from "path";
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
  Divider,
  Banner,
  Tag,
  Thumbnail,
  EmptyState,
  Select,
  Checkbox,
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "$app:sweetbird-samples";
const METAFIELD_KEY = "config";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      currentAppInstallation {
        id
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }
  `);

  const data = await response.json();
  const raw = data?.data?.currentAppInstallation?.metafield?.value;
  const appInstallationId = data?.data?.currentAppInstallation?.id;

  let config = {
    active: false,
    offerTitle: "Choose your free Sweetbird syrup sample!",
    qualifyingCollectionIds: [],
    qualifyingCollectionTitles: [],
    syrups: [],
  };

  if (raw) {
    try {
      config = { ...config, ...JSON.parse(raw) };
    } catch (e) {
      console.error("Failed to parse sweetbird config:", e);
    }
  }

  // Resolve collection titles if we have IDs stored
  let resolvedCollections = config.qualifyingCollectionIds.map((id, i) => ({
    id,
    title: config.qualifyingCollectionTitles?.[i] ?? id,
  }));

  // Check for existing Sweetbird Sample discount
  const discountsResponse = await admin.graphql(`
    query {
      discountNodes(first: 10, query: "title:Sweetbird Free Sample") {
        nodes {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
              startsAt
            }
          }
        }
      }
    }
  `);

  const discountsData = await discountsResponse.json();
  const discountNodes = discountsData?.data?.discountNodes?.nodes || [];
  const sampleDiscount = discountNodes.find(n => n.discount?.status === "ACTIVE")
    || discountNodes[discountNodes.length - 1];

  return json({
    config,
    appInstallationId,
    resolvedCollections,
    discount: sampleDiscount ? {
      id: sampleDiscount.id,
      title: sampleDiscount.discount.title,
      status: sampleDiscount.discount.status,
    } : null,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "createDiscount") {
    try {
      const functionsResponse = await admin.graphql(`
        query {
          shopifyFunctions(first: 25) {
            nodes { id title apiType app { title } }
          }
        }
      `);
      const functionsData = await functionsResponse.json();
      const functions = functionsData?.data?.shopifyFunctions?.nodes || [];

      const discountFunction = functions.find(fn =>
        fn.title?.toLowerCase().includes("sweetbird") ||
        fn.title?.toLowerCase().includes("sample")
      );

      if (!discountFunction) {
        return json({
          error: `Could not find the Sweetbird Sample Discount function. Available: ${functions.map(f => `${f.title} (${f.apiType})`).join(', ')}`
        }, { status: 400 });
      }

      const createResponse = await admin.graphql(`
        mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $discount) {
            automaticAppDiscount { discountId title status }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          discount: {
            title: "Sweetbird Free Sample",
            functionId: discountFunction.id,
            startsAt: new Date().toISOString(),
            discountClasses: ["PRODUCT"],
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: true,
            },
          },
        },
      });

      const createData = await createResponse.json();
      if (createData.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
        return json({ error: createData.data.discountAutomaticAppCreate.userErrors[0].message });
      }
      return json({ success: true, message: "Discount created!" });
    } catch (e) {
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (intent === "activateDiscount") {
    const discountId = formData.get("discountId");
    try {
      const response = await admin.graphql(`
        mutation ActivateDiscount($id: ID!) {
          discountAutomaticActivate(id: $id) {
            automaticDiscountNode { id }
            userErrors { field message }
          }
        }
      `, { variables: { id: discountId } });
      const data = await response.json();
      if (data.data?.discountAutomaticActivate?.userErrors?.length > 0) {
        return json({ error: data.data.discountAutomaticActivate.userErrors[0].message });
      }
      return json({ success: true, message: "Discount activated!" });
    } catch (e) {
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (intent === "saveConfig") {
    const configJson = formData.get("config");
    const appInstallationId = formData.get("appInstallationId");

    let config;
    try {
      config = JSON.parse(configJson);
    } catch {
      return json({ error: "Invalid config JSON" }, { status: 400 });
    }

    const response = await admin.graphql(`
      mutation SetMetafield($ownerId: ID!, $namespace: String!, $key: String!, $value: String!) {
        metafieldsSet(metafields: [{
          ownerId: $ownerId,
          namespace: $namespace,
          key: $key,
          type: "json",
          value: $value
        }]) {
          metafields {
            id
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        ownerId: appInstallationId,
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        value: JSON.stringify(config),
      },
    });

    const data = await response.json();
    const errors = data?.data?.metafieldsSet?.userErrors;

    if (errors?.length > 0) {
      return json({ error: errors.map((e) => e.message).join(", ") });
    }

    // Also save to the shop metafield so the checkout UI extension can read it
    // via useAppMetafields (which reads shop-owned app metafields)
    const shopResponse = await admin.graphql(`
      query { shop { id } }
    `);
    const shopData = await shopResponse.json();
    const shopId = shopData?.data?.shop?.id;

    if (shopId) {
      await admin.graphql(`
        mutation SetShopMetafield($ownerId: ID!, $namespace: String!, $key: String!, $value: String!) {
          metafieldsSet(metafields: [{
            ownerId: $ownerId,
            namespace: $namespace,
            key: $key,
            type: "json",
            value: $value
          }]) {
            metafields { id }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          value: JSON.stringify(config),
        },
      });
    }

    // Also write to local file for the public API endpoint
    try {
      await writeFile(
        join(process.cwd(), "sweetbird-config.json"),
        JSON.stringify(config),
        "utf-8",
      );
    } catch (e) {
      console.error("Failed to write sweetbird config file:", e);
    }

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SweetbirdSamples() {
  const { config: initialConfig, appInstallationId, resolvedCollections: initialCollections, discount } =
    useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  // Local state
  const [active, setActive] = useState(initialConfig.active ?? false);
  const [offerTitle, setOfferTitle] = useState(
    initialConfig.offerTitle ?? "Choose your free Sweetbird syrup sample!",
  );
  const [collections, setCollections] = useState(initialCollections ?? []);
  const [syrups, setSyrups] = useState(initialConfig.syrups ?? []);


  const openCollectionPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "collection",
      multiple: true,
      selectionIds: collections.map((c) => ({ id: c.id })),
    });
    if (selected) {
      setCollections(selected.map((c) => ({ id: c.id, title: c.title })));
    }
  }, [collections]);

  const openProductPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: syrups.map((s) => ({ id: s.id })),
      filter: { variants: true },
    });
    if (selected) {
      const newSyrups = [];
      for (const product of selected) {
        for (const variant of product.variants ?? []) {
          if (newSyrups.length >= 3) break;
          newSyrups.push({
            id: variant.id,
            title: `${product.title}${variant.title !== "Default Title" ? ` – ${variant.title}` : ""}`,
            imageUrl:
              variant.image?.originalSrc ??
              product.images?.[0]?.originalSrc ??
              null,
          });
        }
        if (newSyrups.length >= 3) break;
      }
      setSyrups(newSyrups);
    }
  }, [syrups]);

  const removeCollection = (id) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  const removeSyrup = (id) => {
    setSyrups((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = () => {
    const config = {
      active,
      offerTitle,
      qualifyingCollectionIds: collections.map((c) => c.id),
      qualifyingCollectionTitles: collections.map((c) => c.title),
      syrups,
    };

    const formData = new FormData();
    formData.append("intent", "saveConfig");
    formData.append("config", JSON.stringify(config));
    formData.append("appInstallationId", appInstallationId);
    submit(formData, { method: "POST" });
  };

  const isDirty =
    active !== initialConfig.active ||
    offerTitle !== initialConfig.offerTitle ||
    JSON.stringify(collections.map((c) => c.id)) !==
      JSON.stringify(initialConfig.qualifyingCollectionIds) ||
    JSON.stringify(syrups) !== JSON.stringify(initialConfig.syrups);

  return (
    <Page>
      <TitleBar title="Sweetbird Free Samples" />

      <BlockStack gap="500">
        {/* Success / Error banners */}
        {actionData?.success && (
          <Banner title="Configuration saved!" tone="success" onDismiss={() => {}} />
        )}
        {actionData?.error && (
          <Banner title={`Error: ${actionData.error}`} tone="critical" onDismiss={() => {}} />
        )}

        <Layout>
          {/* Left: main config */}
          <Layout.Section>
            <BlockStack gap="500">
              {/* Discount Status */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Discount Function
                  </Text>
                  {!discount ? (
                    <BlockStack gap="300">
                      <Banner tone="warning">
                        <Text>
                          No automatic discount found. Create one to enable the 100% discount
                          on free sample cart lines.
                        </Text>
                      </Banner>
                      <Button
                        variant="primary"
                        onClick={() => {
                          const formData = new FormData();
                          formData.append("intent", "createDiscount");
                          submit(formData, { method: "POST" });
                        }}
                        loading={saving}
                      >
                        Create Discount
                      </Button>
                    </BlockStack>
                  ) : (
                    <InlineStack gap="300" blockAlignment="center">
                      <Text>{discount.title}</Text>
                      <Badge tone={discount.status === "ACTIVE" ? "success" : "attention"}>
                        {discount.status}
                      </Badge>
                      {discount.status !== "ACTIVE" && (
                        <Button
                          size="slim"
                          onClick={() => {
                            const formData = new FormData();
                            formData.append("intent", "activateDiscount");
                            formData.append("discountId", discount.id);
                            submit(formData, { method: "POST" });
                          }}
                          loading={saving}
                        >
                          Activate
                        </Button>
                      )}
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>

              {/* Toggle */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Feature Status
                  </Text>
                  <InlineStack gap="300" blockAlignment="center">
                    <Checkbox
                      label="Enable free sample offer at checkout"
                      checked={active}
                      onChange={setActive}
                    />
                    <Badge tone={active ? "success" : "enabled"}>
                      {active ? "Active" : "Inactive"}
                    </Badge>
                  </InlineStack>
                  <Text tone="subdued">
                    When active, customers who qualify will see a syrup sample picker at
                    checkout. A companion discount function automatically zeroes out the
                    sample line's price.
                  </Text>
                </BlockStack>
              </Card>

              {/* Offer customisation */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Offer Appearance
                  </Text>
                  <TextField
                    label="Offer heading"
                    value={offerTitle}
                    onChange={setOfferTitle}
                    autoComplete="off"
                    helpText="Shown above the flavor picker in the checkout UI"
                  />
                </BlockStack>
              </Card>

              {/* Qualifying collections */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlignment="center">
                    <Text variant="headingMd" as="h2">
                      Qualifying Collections
                    </Text>
                    <Button
                      icon={PlusIcon}
                      onClick={openCollectionPicker}
                    >
                      Add Collections
                    </Button>
                  </InlineStack>

                  <Text tone="subdued">
                    Customers who have at least one product from these collections in their
                    cart will be shown the free sample picker. Leave empty to show the offer
                    to everyone.
                  </Text>

                  {collections.length === 0 ? (
                    <Box
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <Text tone="subdued" alignment="center">
                        No collections selected — offer will show for all customers
                      </Text>
                    </Box>
                  ) : (
                    <InlineStack gap="200" wrap>
                      {collections.map((c) => (
                        <Tag key={c.id} onRemove={() => removeCollection(c.id)}>
                          {c.title}
                        </Tag>
                      ))}
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>

              {/* Syrup variants */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlignment="center">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Syrup Variants (up to 3)
                      </Text>
                      <Text tone="subdued">
                        Select the 3 Sweetbird syrup product variants to offer as samples
                      </Text>
                    </BlockStack>
                    <Button
                      icon={PlusIcon}
                      onClick={openProductPicker}
                      disabled={syrups.length >= 3}
                    >
                      Select Products
                    </Button>
                  </InlineStack>

                  {syrups.length === 0 ? (
                    <EmptyState
                      heading="No syrups selected"
                      image=""
                      action={{
                        content: "Select Products",
                        onAction: () => setProductPickerOpen(true),
                      }}
                    >
                      <Text>
                        Choose up to 3 Sweetbird syrup product variants to offer as the
                        free sample choices.
                      </Text>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="300">
                      {syrups.map((syrup, i) => (
                        <Box
                          key={syrup.id}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <InlineStack gap="300" blockAlignment="center" align="space-between">
                            <InlineStack gap="300" blockAlignment="center">
                              <Badge>{i + 1}</Badge>
                              {syrup.imageUrl && (
                                <Thumbnail
                                  source={syrup.imageUrl}
                                  alt={syrup.title}
                                  size="small"
                                />
                              )}
                              <BlockStack gap="100">
                                <Text variant="bodySm" fontWeight="semibold">
                                  {syrup.title}
                                </Text>
                                <Text variant="bodySm" tone="subdued">
                                  {syrup.id}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              variant="plain"
                              onClick={() => removeSyrup(syrup.id)}
                              accessibilityLabel={`Remove ${syrup.title}`}
                            />
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right: sidebar info */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    How It Works
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">
                      1. Qualifying Check
                    </Text>
                    <Text tone="subdued">
                      When a customer reaches checkout, the UI extension checks whether
                      any cart line belongs to a qualifying collection.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">
                      2. Flavor Picker
                    </Text>
                    <Text tone="subdued">
                      Qualifying customers see a choice of the 3 syrups you configure
                      here. They pick one, and it's added to the cart at full price.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">
                      3. Auto Discount
                    </Text>
                    <Text tone="subdued">
                      The <em>Sweetbird Sample Discount</em> function detects the
                      <code>_free_sample</code> attribute and zeroes out the price
                      automatically.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Setup Checklist
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <Text>
                      ✅ Deploy the <strong>sweetbird-sample-discount</strong> function and
                      activate it as an automatic discount.
                    </Text>
                    <Text>
                      ✅ Deploy the <strong>sweetbird-sample-picker</strong> checkout UI
                      extension and add it to your checkout profile via the Shopify Admin
                      Checkout editor.
                    </Text>
                    <Text>
                      ✅ In the Checkout editor, set the <strong>App URL</strong> extension
                      setting to{" "}
                      <code>https://combos.idrinkcoffee.com</code>
                    </Text>
                    <Text>
                      ✅ Save this configuration page with your qualifying collections and
                      syrup choices.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Save bar */}
        <Box paddingBlockEnd="800">
          <InlineStack align="end" gap="300">
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!isDirty && !saving}
            >
              Save Configuration
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>

    </Page>
  );
}
