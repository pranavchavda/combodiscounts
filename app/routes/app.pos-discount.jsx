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
  Divider,
  Banner,
  Select,
  Modal,
  DataTable,
  EmptyState,
  Tag,
  Autocomplete,
  Icon,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get all collections for the picker
  const collectionsResponse = await admin.graphql(`
    query {
      collections(first: 100) {
        nodes {
          id
          title
          handle
          productsCount {
            count
          }
        }
      }
    }
  `);

  const collectionsData = await collectionsResponse.json();
  const collections = collectionsData?.data?.collections?.nodes || [];

  // Get all POS-Only discount codes created by this app
  const discountsResponse = await admin.graphql(`
    query {
      discountNodes(first: 50, query: "type:code") {
        nodes {
          id
          discount {
            ... on DiscountCodeApp {
              title
              status
              codes(first: 1) {
                nodes {
                  code
                }
              }
              discountClass
              startsAt
              endsAt
            }
          }
          metafield(namespace: "$app:christmas-combos", key: "pos-config") {
            value
          }
        }
      }
    }
  `);

  const discountsData = await discountsResponse.json();
  const allNodes = discountsData?.data?.discountNodes?.nodes || [];

  // Filter to only discounts that have our pos-config metafield (created by us)
  const posDiscounts = allNodes
    .filter(n => n.metafield?.value && n.discount?.title)
    .map(n => {
      let config = {};
      try {
        config = JSON.parse(n.metafield.value);
      } catch (e) {}

      return {
        id: n.id,
        title: n.discount.title,
        code: n.discount.codes?.nodes?.[0]?.code || "",
        status: n.discount.status,
        discountType: config.discountType || "percentage",
        value: config.value || "0",
        minQuantity: config.minQuantity || 1,
        collections: config.collections || [],
        message: config.message || "POS Discount",
      };
    });

  return json({ discounts: posDiscounts, collections });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "createDiscount") {
    const title = formData.get("title");
    const code = formData.get("code");
    const discountType = formData.get("discountType");
    const value = formData.get("value");
    const minQuantity = parseInt(formData.get("minQuantity"), 10) || 1;
    const message = formData.get("message");
    const collectionsJson = formData.get("collections") || "[]";
    let collections = [];
    try {
      collections = JSON.parse(collectionsJson);
    } catch (e) {}

    try {
      // Get the function ID for POS discount
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

      // Find our POS discount function (purchase.product-discount.run)
      const discountFunction = functions.find(fn =>
        fn.apiType === "product_discounts" &&
        (fn.title?.toLowerCase().includes("pos") || fn.app?.title?.toLowerCase().includes("christmas"))
      );

      if (!discountFunction) {
        return json({
          error: `Could not find the POS discount function. Available functions: ${functions.map(f => `${f.title} (${f.apiType})`).join(', ')}. Make sure the extension is deployed.`
        }, { status: 400 });
      }

      // Create the code discount
      const createResponse = await admin.graphql(`
        mutation CreateCodeDiscount($discount: DiscountCodeAppInput!) {
          discountCodeAppCreate(codeAppDiscount: $discount) {
            codeAppDiscount {
              discountId
              title
              status
              codes(first: 1) {
                nodes {
                  code
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
        variables: {
          discount: {
            title: title,
            functionId: discountFunction.id,
            startsAt: new Date().toISOString(),
            code: code,
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

      if (createData.data?.discountCodeAppCreate?.userErrors?.length > 0) {
        return json({
          error: createData.data.discountCodeAppCreate.userErrors[0].message
        }, { status: 400 });
      }

      const discountId = createData.data?.discountCodeAppCreate?.codeAppDiscount?.discountId;

      if (!discountId) {
        return json({ error: "Failed to create discount" }, { status: 400 });
      }

      // Save the config to the discount's metafield
      const config = {
        discountType,
        value,
        minQuantity,
        collections,
        message,
      };

      const metafieldResponse = await admin.graphql(`
        mutation SetDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
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
          metafields: [{
            namespace: "$app:christmas-combos",
            key: "pos-config",
            type: "json",
            value: JSON.stringify(config),
            ownerId: discountId,
          }],
        },
      });

      const metafieldData = await metafieldResponse.json();

      if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error("Metafield error:", metafieldData.data.metafieldsSet.userErrors);
      }

      return json({ success: true, message: `Discount code "${code}" created successfully!` });
    } catch (e) {
      console.error("Error creating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (actionType === "updateDiscount") {
    const discountId = formData.get("discountId");
    const discountType = formData.get("discountType");
    const value = formData.get("value");
    const minQuantity = parseInt(formData.get("minQuantity"), 10) || 1;
    const message = formData.get("message");
    const collectionsJson = formData.get("collections") || "[]";
    let collections = [];
    try {
      collections = JSON.parse(collectionsJson);
    } catch (e) {}

    try {
      const config = {
        discountType,
        value,
        minQuantity,
        collections,
        message,
      };

      const response = await admin.graphql(`
        mutation SetDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
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
          metafields: [{
            namespace: "$app:christmas-combos",
            key: "pos-config",
            type: "json",
            value: JSON.stringify(config),
            ownerId: discountId,
          }],
        },
      });

      const result = await response.json();

      if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        return json({ error: result.data.metafieldsSet.userErrors[0].message }, { status: 400 });
      }

      return json({ success: true, message: "Discount updated!" });
    } catch (e) {
      console.error("Error updating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (actionType === "activateDiscount") {
    const discountId = formData.get("discountId");
    try {
      const response = await admin.graphql(`
        mutation ActivateDiscount($id: ID!) {
          discountCodeActivate(id: $id) {
            codeDiscountNode {
              codeDiscount {
                ... on DiscountCodeApp {
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

      const data = await response.json();

      if (data.data?.discountCodeActivate?.userErrors?.length > 0) {
        return json({
          error: data.data.discountCodeActivate.userErrors[0].message
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
      const response = await admin.graphql(`
        mutation DeactivateDiscount($id: ID!) {
          discountCodeDeactivate(id: $id) {
            codeDiscountNode {
              codeDiscount {
                ... on DiscountCodeApp {
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

      const data = await response.json();

      if (data.data?.discountCodeDeactivate?.userErrors?.length > 0) {
        return json({
          error: data.data.discountCodeDeactivate.userErrors[0].message
        }, { status: 400 });
      }

      return json({ success: true, message: "Discount deactivated!" });
    } catch (e) {
      console.error("Error deactivating discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  if (actionType === "deleteDiscount") {
    const discountId = formData.get("discountId");
    try {
      const response = await admin.graphql(`
        mutation DeleteDiscount($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: discountId },
      });

      const data = await response.json();

      if (data.data?.discountCodeDelete?.userErrors?.length > 0) {
        return json({
          error: data.data.discountCodeDelete.userErrors[0].message
        }, { status: 400 });
      }

      return json({ success: true, message: "Discount deleted!" });
    } catch (e) {
      console.error("Error deleting discount:", e);
      return json({ error: e.message }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

function CollectionPicker({ collections, selectedCollections, onSelect, onRemove }) {
  const [inputValue, setInputValue] = useState("");

  const deselectedOptions = collections
    .filter(c => !selectedCollections.includes(c.id))
    .map(c => ({
      value: c.id,
      label: `${c.title} (${c.productsCount?.count || 0} products)`,
    }));

  const filteredOptions = inputValue
    ? deselectedOptions.filter(opt =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase())
      )
    : deselectedOptions;

  const selectedTags = selectedCollections.map(id => {
    const collection = collections.find(c => c.id === id);
    return collection ? collection.title : id;
  });

  return (
    <BlockStack gap="200">
      <Autocomplete
        options={filteredOptions}
        selected={[]}
        onSelect={(selected) => {
          if (selected.length > 0) {
            onSelect(selected[0]);
            setInputValue("");
          }
        }}
        textField={
          <Autocomplete.TextField
            onChange={setInputValue}
            label="Eligible Collections"
            value={inputValue}
            prefix={<Icon source={SearchIcon} />}
            placeholder="Search collections..."
            autoComplete="off"
            helpText="Coming soon - currently applies to all products"
          />
        }
      />
      {selectedTags.length > 0 && (
        <InlineStack gap="200" wrap>
          {selectedTags.map((title, index) => (
            <Tag key={selectedCollections[index]} onRemove={() => onRemove(selectedCollections[index])}>
              {title}
            </Tag>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

function CreateDiscountModal({ open, onClose, onSubmit, isSubmitting, collections }) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [value, setValue] = useState("10");
  const [minQuantity, setMinQuantity] = useState("1");
  const [message, setMessage] = useState("POS Discount");
  const [selectedCollections, setSelectedCollections] = useState([]);

  const handleSubmit = useCallback(() => {
    onSubmit({ title, code, discountType, value, minQuantity, message, collections: selectedCollections });
  }, [title, code, discountType, value, minQuantity, message, selectedCollections, onSubmit]);

  const generateCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'POS';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  }, []);

  const handleAddCollection = useCallback((collectionId) => {
    setSelectedCollections(prev => [...prev, collectionId]);
  }, []);

  const handleRemoveCollection = useCallback((collectionId) => {
    setSelectedCollections(prev => prev.filter(id => id !== collectionId));
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create POS-Only Discount Code"
      primaryAction={{
        content: "Create Discount",
        onAction: handleSubmit,
        loading: isSubmitting,
        disabled: !title || !code || !value,
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
            label="Discount Title"
            value={title}
            onChange={setTitle}
            autoComplete="off"
            placeholder="e.g., Staff Discount 10%"
            helpText="Internal name for this discount"
          />

          <InlineStack gap="200" blockAlign="end">
            <Box minWidth="200px">
              <TextField
                label="Discount Code"
                value={code}
                onChange={setCode}
                autoComplete="off"
                placeholder="e.g., STAFF10"
                helpText="Code customers enter at checkout"
              />
            </Box>
            <Button onClick={generateCode}>Generate</Button>
          </InlineStack>

          <Select
            label="Discount Type"
            options={[
              { label: "Percentage", value: "percentage" },
              { label: "Fixed Amount", value: "fixedAmount" },
            ]}
            value={discountType}
            onChange={setDiscountType}
          />

          <TextField
            label={discountType === "percentage" ? "Discount Percentage" : "Discount Amount"}
            type="number"
            value={value}
            onChange={setValue}
            suffix={discountType === "percentage" ? "%" : "$"}
            min={0}
            autoComplete="off"
          />

          <TextField
            label="Minimum Quantity"
            type="number"
            value={minQuantity}
            onChange={setMinQuantity}
            min={1}
            autoComplete="off"
            helpText="Minimum total quantity required in cart"
          />

          <CollectionPicker
            collections={collections}
            selectedCollections={selectedCollections}
            onSelect={handleAddCollection}
            onRemove={handleRemoveCollection}
          />

          <TextField
            label="Discount Message"
            value={message}
            onChange={setMessage}
            autoComplete="off"
            helpText="Message shown when discount is applied"
          />

          <Banner tone="info">
            <Text as="p">
              This discount code will <strong>only work at POS checkout</strong>.
              If entered during online checkout, it will not apply any discount.
            </Text>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function EditDiscountModal({ open, onClose, discount, onSubmit, isSubmitting, collections }) {
  const [discountType, setDiscountType] = useState(discount?.discountType || "percentage");
  const [value, setValue] = useState(discount?.value || "10");
  const [minQuantity, setMinQuantity] = useState(String(discount?.minQuantity || 1));
  const [message, setMessage] = useState(discount?.message || "POS Discount");
  const [selectedCollections, setSelectedCollections] = useState(discount?.collections || []);

  const handleSubmit = useCallback(() => {
    onSubmit({ discountId: discount.id, discountType, value, minQuantity, message, collections: selectedCollections });
  }, [discount, discountType, value, minQuantity, message, selectedCollections, onSubmit]);

  const handleAddCollection = useCallback((collectionId) => {
    setSelectedCollections(prev => [...prev, collectionId]);
  }, []);

  const handleRemoveCollection = useCallback((collectionId) => {
    setSelectedCollections(prev => prev.filter(id => id !== collectionId));
  }, []);

  // Reset form when discount changes
  useState(() => {
    if (discount) {
      setDiscountType(discount.discountType || "percentage");
      setValue(discount.value || "10");
      setMinQuantity(String(discount.minQuantity || 1));
      setMessage(discount.message || "POS Discount");
      setSelectedCollections(discount.collections || []);
    }
  }, [discount]);

  if (!discount) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit: ${discount.title}`}
      primaryAction={{
        content: "Save Changes",
        onAction: handleSubmit,
        loading: isSubmitting,
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
          <Banner>
            <Text as="p">
              Code: <strong>{discount.code}</strong>
            </Text>
          </Banner>

          <Select
            label="Discount Type"
            options={[
              { label: "Percentage", value: "percentage" },
              { label: "Fixed Amount", value: "fixedAmount" },
            ]}
            value={discountType}
            onChange={setDiscountType}
          />

          <TextField
            label={discountType === "percentage" ? "Discount Percentage" : "Discount Amount"}
            type="number"
            value={value}
            onChange={setValue}
            suffix={discountType === "percentage" ? "%" : "$"}
            min={0}
            autoComplete="off"
          />

          <TextField
            label="Minimum Quantity"
            type="number"
            value={minQuantity}
            onChange={setMinQuantity}
            min={1}
            autoComplete="off"
          />

          <CollectionPicker
            collections={collections}
            selectedCollections={selectedCollections}
            onSelect={handleAddCollection}
            onRemove={handleRemoveCollection}
          />

          <TextField
            label="Discount Message"
            value={message}
            onChange={setMessage}
            autoComplete="off"
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default function PosDiscount() {
  const { discounts, collections } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);

  const handleCreateDiscount = useCallback((data) => {
    const formData = new FormData();
    formData.append("actionType", "createDiscount");
    formData.append("title", data.title);
    formData.append("code", data.code);
    formData.append("discountType", data.discountType);
    formData.append("value", data.value);
    formData.append("minQuantity", data.minQuantity);
    formData.append("message", data.message);
    formData.append("collections", JSON.stringify(data.collections));
    submit(formData, { method: "post" });
    setCreateModalOpen(false);
  }, [submit]);

  const handleUpdateDiscount = useCallback((data) => {
    const formData = new FormData();
    formData.append("actionType", "updateDiscount");
    formData.append("discountId", data.discountId);
    formData.append("discountType", data.discountType);
    formData.append("value", data.value);
    formData.append("minQuantity", data.minQuantity);
    formData.append("message", data.message);
    formData.append("collections", JSON.stringify(data.collections));
    submit(formData, { method: "post" });
    setEditModalOpen(false);
    setEditingDiscount(null);
  }, [submit]);

  const handleActivate = useCallback((discountId) => {
    const formData = new FormData();
    formData.append("actionType", "activateDiscount");
    formData.append("discountId", discountId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleDeactivate = useCallback((discountId) => {
    const formData = new FormData();
    formData.append("actionType", "deactivateDiscount");
    formData.append("discountId", discountId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleDelete = useCallback((discountId) => {
    if (confirm("Are you sure you want to delete this discount?")) {
      const formData = new FormData();
      formData.append("actionType", "deleteDiscount");
      formData.append("discountId", discountId);
      submit(formData, { method: "post" });
    }
  }, [submit]);

  const handleEdit = useCallback((discount) => {
    setEditingDiscount(discount);
    setEditModalOpen(true);
  }, []);

  const getCollectionNames = (collectionIds) => {
    if (!collectionIds || collectionIds.length === 0) return "All products";
    const names = collectionIds.map(id => {
      const collection = collections.find(c => c.id === id);
      return collection ? collection.title : "Unknown";
    });
    return names.join(", ");
  };

  const rows = discounts.map((discount) => [
    <Text as="span" fontWeight="semibold">{discount.title}</Text>,
    <Badge tone="info">{discount.code}</Badge>,
    discount.discountType === "percentage" ? `${discount.value}%` : `$${discount.value}`,
    discount.minQuantity,
    <Text as="span" variant="bodySm" tone="subdued">
      {getCollectionNames(discount.collections).substring(0, 30)}
      {getCollectionNames(discount.collections).length > 30 ? "..." : ""}
    </Text>,
    <Badge tone={discount.status === "ACTIVE" ? "success" : "attention"}>
      {discount.status === "ACTIVE" ? "Active" : "Inactive"}
    </Badge>,
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleEdit(discount)}>Edit</Button>
      {discount.status === "ACTIVE" ? (
        <Button size="slim" tone="critical" onClick={() => handleDeactivate(discount.id)} loading={isSubmitting}>
          Deactivate
        </Button>
      ) : (
        <Button size="slim" variant="primary" onClick={() => handleActivate(discount.id)} loading={isSubmitting}>
          Activate
        </Button>
      )}
      <Button size="slim" tone="critical" variant="plain" onClick={() => handleDelete(discount.id)}>
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page>
      <TitleBar title="POS-Only Discount Codes">
        <button variant="primary" onClick={() => setCreateModalOpen(true)}>
          Create Discount Code
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
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h2">
                      POS-Only Discount Codes
                    </Text>
                    <Text as="p" tone="subdued">
                      These discount codes only work at Point of Sale checkout. They will not apply during online checkout.
                    </Text>
                  </BlockStack>
                  <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                    Create Discount Code
                  </Button>
                </InlineStack>

                <Divider />

                {discounts.length === 0 ? (
                  <EmptyState
                    heading="No POS-only discount codes yet"
                    action={{
                      content: "Create Discount Code",
                      onAction: () => setCreateModalOpen(true),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Create discount codes that only work at your physical POS locations.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text", "text", "text"]}
                    headings={["Title", "Code", "Discount", "Min Qty", "Collections", "Status", "Actions"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  How It Works
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    POS-only discount codes are special codes that <strong>only work at Point of Sale</strong> (in-store) checkout.
                  </Text>
                  <Text as="p" variant="bodySm">
                    If a customer tries to use these codes during online checkout, the discount will not apply.
                  </Text>
                  <Text as="p" variant="bodySm">
                    This is useful for staff discounts, in-store promotions, or special deals that should only be available in person.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Configuration Options
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      <strong>Minimum Quantity:</strong> Require a minimum number of items in cart before the discount applies.
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Collections:</strong> Limit the discount to specific collections. Leave empty to apply to all products.
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Discount Type:</strong> Choose between percentage off or fixed dollar amount.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Quick Stats
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">Total Codes:</Text>
                      <Text as="span" variant="bodySm">{discounts.length}</Text>
                    </InlineStack>
                    <InlineStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">Active:</Text>
                      <Text as="span" variant="bodySm">
                        {discounts.filter(d => d.status === "ACTIVE").length}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">Inactive:</Text>
                      <Text as="span" variant="bodySm">
                        {discounts.filter(d => d.status !== "ACTIVE").length}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <CreateDiscountModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateDiscount}
        isSubmitting={isSubmitting}
        collections={collections}
      />

      <EditDiscountModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingDiscount(null);
        }}
        discount={editingDiscount}
        onSubmit={handleUpdateDiscount}
        isSubmitting={isSubmitting}
        collections={collections}
      />
    </Page>
  );
}
