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
import { DiscountIcon, ProductIcon, LocationIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Query all discounts directly by title (parallel requests)
  const [comboResponse, bundleResponse, posResponse] = await Promise.all([
    admin.graphql(`
      query {
        discountNodes(first: 5, query: "title:Christmas Combo Deal") {
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
    `),
    admin.graphql(`
      query {
        discountNodes(first: 5, query: "title:Bundle Discount") {
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
    `),
    admin.graphql(`
      query {
        discountNodes(first: 5, query: "title:POS-Only Discount") {
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
    `)
  ]);

  const [comboData, bundleData, posData] = await Promise.all([
    comboResponse.json(),
    bundleResponse.json(),
    posResponse.json()
  ]);

  const comboNodes = comboData?.data?.discountNodes?.nodes || [];
  const bundleNodes = bundleData?.data?.discountNodes?.nodes || [];
  const posNodes = posData?.data?.discountNodes?.nodes || [];

  // Prioritize ACTIVE discount if multiple exist
  const comboDiscount = comboNodes.find(n => n.discount?.status === "ACTIVE")
    || comboNodes[comboNodes.length - 1];
  const bundleDiscount = bundleNodes.find(n => n.discount?.status === "ACTIVE")
    || bundleNodes[bundleNodes.length - 1];
  const posDiscount = posNodes.find(n => n.discount?.status === "ACTIVE")
    || posNodes[posNodes.length - 1];

  return json({
    comboDiscount: comboDiscount ? {
      status: comboDiscount.discount.status,
      title: comboDiscount.discount.title,
    } : null,
    bundleDiscount: bundleDiscount ? {
      status: bundleDiscount.discount.status,
      title: bundleDiscount.discount.title,
    } : null,
    posDiscount: posDiscount ? {
      status: posDiscount.discount.status,
      title: posDiscount.discount.title,
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
  const { comboDiscount, bundleDiscount, posDiscount } = useLoaderData();

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
                  Configure combo rules for espresso machines + grinders, set up dynamic
                  bundle discounts based on product metafields, or create POS-only discounts.
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

              <DiscountCard
                title="POS-Only Discount"
                description="Discounts that only apply to Point of Sale transactions"
                status={posDiscount?.status}
                linkTo="/app/pos-discount"
                icon={LocationIcon}
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
