import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link, useActionData } from "@remix-run/react";
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
  Modal,
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get config from app installation metafield
  const configResponse = await admin.graphql(`
    query {
      currentAppInstallation {
        id
        metafield(namespace: "christmas-combos", key: "config") {
          value
        }
      }
    }
  `);

  const configData = await configResponse.json();
  const metafieldValue = configData?.data?.currentAppInstallation?.metafield?.value;
  const appInstallationId = configData?.data?.currentAppInstallation?.id;

  let config = { comboRules: [] };
  if (metafieldValue) {
    try {
      config = JSON.parse(metafieldValue);
    } catch (e) {
      console.error("Failed to parse config:", e);
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

  // Find our Christmas Combos discount
  const christmasComboDiscount = discountNodes.find(node =>
    node.discount?.title?.toLowerCase().includes("christmas combo")
  );

  return json({
    config,
    appInstallationId,
    discount: christmasComboDiscount ? {
      id: christmasComboDiscount.id,
      title: christmasComboDiscount.discount.title,
      status: christmasComboDiscount.discount.status,
      startsAt: christmasComboDiscount.discount.startsAt,
      endsAt: christmasComboDiscount.discount.endsAt,
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

      console.log("Available functions:", JSON.stringify(functions, null, 2));

      // Find our discount function - look for cart_discounts API type or by app title
      const discountFunction = functions.find(fn =>
        (fn.apiType === "cart_discounts" || fn.apiType === "discounts" || fn.apiType === "product_discounts") &&
        (fn.app?.title?.toLowerCase().includes("christmas") || fn.title?.toLowerCase().includes("christmas"))
      );

      if (!discountFunction) {
        // Try finding by just the app title as fallback
        const anyMatchingFunction = functions.find(fn =>
          fn.app?.title?.toLowerCase().includes("christmas") || fn.title?.toLowerCase().includes("christmas")
        );

        if (!anyMatchingFunction) {
          return json({
            error: `Could not find the Christmas Combos discount function. Available functions: ${functions.map(f => `${f.title} (${f.apiType})`).join(', ')}. Make sure the extension is deployed.`
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
              title: "Christmas Combo Deal",
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

        return json({ success: true, message: "Discount created successfully!" });
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
            title: "Christmas Combo Deal",
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

      return json({ success: true, message: "Discount created successfully!" });
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
    const config = JSON.parse(configString);

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
            key: "config",
            type: "json",
            value: JSON.stringify(config),
            ownerId: ownerId,
          },
        ],
      },
    });

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({ error: result.data.metafieldsSet.userErrors[0].message }, { status: 400 });
    }

    return json({ success: true, message: "Configuration saved!" });
  } catch (e) {
    console.error("Error saving config:", e);
    return json({ error: e.message }, { status: 400 });
  }
};

function VendorBadges({ vendors, tone, onRemove }) {
  if (vendors.length === 0) {
    return (
      <Text as="span" tone="subdued">
        No vendors configured
      </Text>
    );
  }

  return (
    <InlineStack gap="200" wrap>
      {vendors.map((vendor) => (
        <Badge key={vendor} tone={tone}>
          <InlineStack gap="100" blockAlign="center">
            {vendor}
            <Button
              variant="plain"
              size="micro"
              onClick={() => onRemove(vendor)}
              accessibilityLabel={`Remove ${vendor}`}
            >
              ×
            </Button>
          </InlineStack>
        </Badge>
      ))}
    </InlineStack>
  );
}

function AddVendorInput({ placeholder, onAdd }) {
  const [value, setValue] = useState("");

  const handleAdd = useCallback(() => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  }, [value, onAdd]);

  return (
    <InlineStack gap="200">
      <div style={{ flex: 1 }}>
        <TextField
          label="Add vendor"
          labelHidden
          placeholder={placeholder}
          value={value}
          onChange={setValue}
          onKeyPress={(e) => e.key === "Enter" && handleAdd()}
          autoComplete="off"
        />
      </div>
      <Button onClick={handleAdd}>Add</Button>
    </InlineStack>
  );
}

function ComboRuleCard({ rule, index, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);

  const addMachineVendor = useCallback((vendor) => {
    if (!rule.machineVendors.includes(vendor)) {
      onUpdate(index, {
        ...rule,
        machineVendors: [...rule.machineVendors, vendor],
      });
    }
  }, [rule, index, onUpdate]);

  const addGrinderVendor = useCallback((vendor) => {
    if (!rule.grinderVendors.includes(vendor)) {
      onUpdate(index, {
        ...rule,
        grinderVendors: [...rule.grinderVendors, vendor],
      });
    }
  }, [rule, index, onUpdate]);

  const removeMachineVendor = useCallback((vendor) => {
    onUpdate(index, {
      ...rule,
      machineVendors: rule.machineVendors.filter((v) => v !== vendor),
    });
  }, [rule, index, onUpdate]);

  const removeGrinderVendor = useCallback((vendor) => {
    onUpdate(index, {
      ...rule,
      grinderVendors: rule.grinderVendors.filter((v) => v !== vendor),
    });
  }, [rule, index, onUpdate]);

  const updateDiscount = useCallback((value) => {
    onUpdate(index, {
      ...rule,
      discountPercentage: parseFloat(value) || 0,
    });
  }, [rule, index, onUpdate]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Badge tone="success" size="large">
              {rule.discountPercentage}% OFF
            </Badge>
            <Text variant="headingMd" as="h3">
              {rule.machineVendors.length} machine brands + {rule.grinderVendors.length} grinder brands
            </Text>
          </InlineStack>
          <InlineStack gap="200">
            <Button
              variant={isEditing ? "primary" : "plain"}
              onClick={() => setIsEditing(!isEditing)}
              icon={EditIcon}
            >
              {isEditing ? "Done" : "Edit"}
            </Button>
            <Button
              tone="critical"
              variant="plain"
              onClick={() => onDelete(index)}
              icon={DeleteIcon}
            >
              Delete
            </Button>
          </InlineStack>
        </InlineStack>

        {isEditing ? (
          <>
            <Divider />
            <BlockStack gap="200">
              <TextField
                label="Discount Percentage"
                type="number"
                value={String(rule.discountPercentage)}
                onChange={updateDiscount}
                suffix="%"
                min={0}
                max={100}
                autoComplete="off"
              />
            </BlockStack>

            <Divider />

            <BlockStack gap="300">
              <Text variant="headingSm" as="h4">
                Espresso Machine Vendors
              </Text>
              <VendorBadges
                vendors={rule.machineVendors}
                tone="info"
                onRemove={removeMachineVendor}
              />
              <AddVendorInput
                placeholder="Add machine vendor (e.g., Bezzera)"
                onAdd={addMachineVendor}
              />
            </BlockStack>

            <Divider />

            <BlockStack gap="300">
              <Text variant="headingSm" as="h4">
                Grinder Vendors
              </Text>
              <VendorBadges
                vendors={rule.grinderVendors}
                tone="attention"
                onRemove={removeGrinderVendor}
              />
              <AddVendorInput
                placeholder="Add grinder vendor (e.g., Eureka)"
                onAdd={addGrinderVendor}
              />
            </BlockStack>
          </>
        ) : (
          <>
            <Divider />
            <BlockStack gap="200">
              <Text variant="bodySm" as="p" tone="subdued">
                Machines: {rule.machineVendors.join(", ") || "None"}
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Grinders: {rule.grinderVendors.join(", ") || "None"}
              </Text>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

function NewRuleModal({ open, onClose, onAdd }) {
  const [discountPercentage, setDiscountPercentage] = useState("10");
  const [machineVendors, setMachineVendors] = useState([]);
  const [grinderVendors, setGrinderVendors] = useState([]);

  const handleAdd = useCallback(() => {
    onAdd({
      id: `rule-${Date.now()}`,
      discountPercentage: parseFloat(discountPercentage) || 10,
      machineVendors,
      grinderVendors,
    });
    setDiscountPercentage("10");
    setMachineVendors([]);
    setGrinderVendors([]);
    onClose();
  }, [discountPercentage, machineVendors, grinderVendors, onAdd, onClose]);

  const addMachineVendor = useCallback((vendor) => {
    if (!machineVendors.includes(vendor)) {
      setMachineVendors((prev) => [...prev, vendor]);
    }
  }, [machineVendors]);

  const addGrinderVendor = useCallback((vendor) => {
    if (!grinderVendors.includes(vendor)) {
      setGrinderVendors((prev) => [...prev, vendor]);
    }
  }, [grinderVendors]);

  const removeMachineVendor = useCallback((vendor) => {
    setMachineVendors((prev) => prev.filter((v) => v !== vendor));
  }, []);

  const removeGrinderVendor = useCallback((vendor) => {
    setGrinderVendors((prev) => prev.filter((v) => v !== vendor));
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Combo Rule"
      primaryAction={{
        content: "Add Rule",
        onAction: handleAdd,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label="Discount Percentage"
            type="number"
            value={discountPercentage}
            onChange={setDiscountPercentage}
            suffix="%"
            min={0}
            max={100}
            autoComplete="off"
            helpText="The percentage discount applied to both machine and grinder"
          />

          <Divider />

          <BlockStack gap="300">
            <Text variant="headingSm" as="h4">
              Espresso Machine Vendors
            </Text>
            <Text as="p" tone="subdued">
              Add the vendor names that should qualify for this discount tier.
            </Text>
            <VendorBadges
              vendors={machineVendors}
              tone="info"
              onRemove={removeMachineVendor}
            />
            <AddVendorInput
              placeholder="Add machine vendor (e.g., Bezzera)"
              onAdd={addMachineVendor}
            />
          </BlockStack>

          <Divider />

          <BlockStack gap="300">
            <Text variant="headingSm" as="h4">
              Grinder Vendors
            </Text>
            <Text as="p" tone="subdued">
              Add the vendor names for grinders that pair with the machines above.
            </Text>
            <VendorBadges
              vendors={grinderVendors}
              tone="attention"
              onRemove={removeGrinderVendor}
            />
            <AddVendorInput
              placeholder="Add grinder vendor (e.g., Eureka)"
              onAdd={addGrinderVendor}
            />
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

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
                No discount has been created yet.
              </Text>
            </BlockStack>
            <Badge tone="warning">Not Created</Badge>
          </InlineStack>
          <Banner tone="warning">
            <Text as="p">
              You need to create a discount for the combo rules to take effect. Click the button below to create the Christmas Combo discount.
            </Text>
          </Banner>
          <Button variant="primary" onClick={onCreateDiscount} loading={isSubmitting}>
            Create Christmas Combo Discount
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
              The Christmas Combo discount is active! Customers will see discounts when they add eligible machine + grinder combos to their cart.
            </Text>
          </Banner>
        ) : (
          <Banner tone="warning">
            <Text as="p">
              The discount is currently inactive. Activate it to start applying combo discounts.
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

export default function ChristmasCombos() {
  const { config: initialConfig, discount } = useLoaderData();
  const actionData = useActionData();
  const [config, setConfig] = useState(initialConfig);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const updateRule = useCallback((index, updatedRule) => {
    setConfig((prev) => ({
      ...prev,
      comboRules: prev.comboRules.map((rule, i) =>
        i === index ? updatedRule : rule
      ),
    }));
  }, []);

  const deleteRule = useCallback((index) => {
    setConfig((prev) => ({
      ...prev,
      comboRules: prev.comboRules.filter((_, i) => i !== index),
    }));
  }, []);

  const addRule = useCallback((newRule) => {
    setConfig((prev) => ({
      ...prev,
      comboRules: [...prev.comboRules, newRule],
    }));
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("config", JSON.stringify(config));
    formData.append("actionType", "saveConfig");
    submit(formData, { method: "post" });
  }, [config, submit]);

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

  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(initialConfig);

  return (
    <Page>
      <TitleBar title="Christmas Combos">
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
            {/* Discount Status Section - Most Important */}
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
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h2">
                      Combo Discount Rules
                    </Text>
                    <Text as="p" tone="subdued">
                      Configure which machine and grinder vendor combinations qualify for discounts.
                    </Text>
                  </BlockStack>
                  <Button
                    variant="primary"
                    onClick={() => setShowNewRuleModal(true)}
                    icon={PlusIcon}
                  >
                    Add New Rule
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              {config.comboRules.length === 0 ? (
                <Card>
                  <BlockStack gap="400" inlineAlign="center">
                    <Text as="p" tone="subdued" alignment="center">
                      No combo rules configured yet. Add your first rule to get started.
                    </Text>
                    <Button
                      variant="primary"
                      onClick={() => setShowNewRuleModal(true)}
                      icon={PlusIcon}
                    >
                      Add Your First Rule
                    </Button>
                  </BlockStack>
                </Card>
              ) : (
                config.comboRules
                  .sort((a, b) => b.discountPercentage - a.discountPercentage)
                  .map((rule, index) => (
                    <ComboRuleCard
                      key={rule.id || index}
                      rule={rule}
                      index={config.comboRules.findIndex((r) => r.id === rule.id)}
                      onUpdate={updateRule}
                      onDelete={deleteRule}
                    />
                  ))
              )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  Quick Links
                </Text>
                <BlockStack gap="200">
                  <Link to="/app/christmas-combos-help">
                    <Button variant="plain" fullWidth textAlign="left">
                      View Help & Documentation
                    </Button>
                  </Link>
                </BlockStack>
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    How Discounts Apply
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      When a customer adds both an eligible espresso machine and grinder to their cart, <strong>both items</strong> receive the configured discount.
                    </Text>
                    <Text as="p" variant="bodySm">
                      Rules are processed by discount percentage (highest first). Each machine pairs with one grinder only.
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
                    Products with these tags are excluded from combo discounts:
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Badge tone="warning">no-combo-discount</Badge>
                    <Badge tone="warning">clearance</Badge>
                    <Badge tone="warning">bundle</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <NewRuleModal
        open={showNewRuleModal}
        onClose={() => setShowNewRuleModal(false)}
        onAdd={addRule}
      />
    </Page>
  );
}
