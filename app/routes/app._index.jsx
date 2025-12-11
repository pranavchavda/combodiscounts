import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Box,
  Icon,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { DiscountIcon, ProductIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get discount status
  const discountsResponse = await admin.graphql(`
    query {
      discountNodes(first: 50, query: "type:app") {
        nodes {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
            }
          }
        }
      }
    }
  `);

  const discountsData = await discountsResponse.json();
  const discountNodes = discountsData?.data?.discountNodes?.nodes || [];

  // Find combo discount by title - "Christmas Combo Deal" or similar
  // Prioritize ACTIVE discounts over expired/inactive ones
  const comboMatchingDiscounts = discountNodes.filter(node => {
    const title = node.discount?.title?.toLowerCase() || "";
    return (title.includes("christmas") || title.includes("combo")) && !title.includes("bundle");
  });
  const comboDiscount = comboMatchingDiscounts.find(n => n.discount?.status === "ACTIVE")
    || comboMatchingDiscounts[comboMatchingDiscounts.length - 1];

  // Find bundle discount - prioritize ACTIVE ones
  const bundleMatchingDiscounts = discountNodes.filter(node =>
    node.discount?.title?.toLowerCase().includes("bundle")
  );
  const bundleDiscount = bundleMatchingDiscounts.find(n => n.discount?.status === "ACTIVE")
    || bundleMatchingDiscounts[bundleMatchingDiscounts.length - 1];

  return json({
    comboDiscount: comboDiscount ? {
      status: comboDiscount.discount.status,
      title: comboDiscount.discount.title,
    } : null,
    bundleDiscount: bundleDiscount ? {
      status: bundleDiscount.discount.status,
      title: bundleDiscount.discount.title,
    } : null,
  });
};

function DiscountCard({ title, description, status, linkTo, icon }) {
  const isActive = status === "ACTIVE";
  const statusBadge = status ? (
    <Badge tone={isActive ? "success" : "attention"}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  ) : (
    <Badge tone="warning">Not Created</Badge>
  );

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Box
              background="bg-surface-secondary"
              padding="300"
              borderRadius="200"
            >
              <Icon source={icon} tone="base" />
            </Box>
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">
                {title}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {description}
              </Text>
            </BlockStack>
          </InlineStack>
          {statusBadge}
        </InlineStack>
        <Link to={linkTo}>
          <Box paddingBlockStart="200">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              Configure →
            </Text>
          </Box>
        </Link>
      </BlockStack>
    </Card>
  );
}

export default function Index() {
  const { comboDiscount, bundleDiscount } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Combo & Bundle Discounts" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingLg" as="h1">
                  Welcome to Combo & Bundle Discounts
                </Text>
                <Text as="p" tone="subdued">
                  Automatically apply discounts when customers purchase product combinations.
                  Configure combo rules for espresso machines + grinders, or set up dynamic
                  bundle discounts based on product metafields.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Discount Features
              </Text>

              <DiscountCard
                title="Christmas Combos"
                description="Discounts for espresso machine + grinder vendor combinations"
                status={comboDiscount?.status}
                linkTo="/app/christmas-combos"
                icon={DiscountIcon}
              />

              <DiscountCard
                title="Bundle Discounts"
                description="Discounts for products in custom.bundle_products metafield"
                status={bundleDiscount?.status}
                linkTo="/app/bundle-discounts"
                icon={ProductIcon}
              />
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Quick Start
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      1. Configure your discount rules
                    </Text>
                    <Text as="p" variant="bodySm">
                      2. Create the discount in Shopify
                    </Text>
                    <Text as="p" variant="bodySm">
                      3. Activate the discount
                    </Text>
                    <Text as="p" variant="bodySm">
                      4. Customers automatically see discounts at checkout
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Excluded Products
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Products with these tags won't receive discounts:
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Badge tone="warning">no-combo-discount</Badge>
                    <Badge tone="warning">clearance</Badge>
                    <Badge tone="warning">bundle</Badge>
                    <Badge tone="warning">openbox</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Need Help?
                  </Text>
                  <Link to="/app/christmas-combos-help">
                    <Text as="span" variant="bodySm">
                      View documentation →
                    </Text>
                  </Link>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
