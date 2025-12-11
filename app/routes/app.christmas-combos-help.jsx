import { Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Box,
  Divider,
  Banner,
  Badge,
  InlineStack,
  List,
  Collapsible,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

function FAQItem({ question, children }) {
  const [open, setOpen] = useState(false);

  return (
    <Box paddingBlockEnd="300">
      <Button
        variant="plain"
        onClick={() => setOpen(!open)}
        ariaExpanded={open}
        fullWidth
        textAlign="left"
      >
        <Text variant="headingSm" as="h4">
          {open ? "▼" : "▶"} {question}
        </Text>
      </Button>
      <Collapsible open={open} id={question}>
        <Box paddingBlockStart="200" paddingInlineStart="400">
          {children}
        </Box>
      </Collapsible>
    </Box>
  );
}

export default function ChristmasCombosHelp() {
  return (
    <Page
      backAction={{ content: "Configuration", url: "/app/christmas-combos" }}
      title="Help & Documentation"
    >
      <TitleBar title="Christmas Combos Help" />

      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {/* Overview Section */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Overview
                </Text>
                <Text as="p">
                  Christmas Combos is a Shopify discount function that automatically applies percentage discounts when customers purchase eligible espresso machine and grinder combinations. The discount is applied to <strong>both items</strong> in the combo, encouraging customers to buy complete coffee setups.
                </Text>
                <Banner tone="info">
                  <Text as="p">
                    This app uses Shopify Functions, which means discounts are calculated server-side and work with all sales channels including online store, POS, and draft orders.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    How It Works
                  </Text>

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      1. Vendor-Based Matching
                    </Text>
                    <Text as="p">
                      The app identifies products by their <strong>vendor name</strong> (the brand/manufacturer field in Shopify). When a customer adds products from eligible machine vendors AND grinder vendors to their cart, the combo discount is triggered.
                    </Text>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      2. Discount Rules
                    </Text>
                    <Text as="p">
                      You can create multiple discount rules with different percentage values. Each rule specifies:
                    </Text>
                    <List type="bullet">
                      <List.Item>
                        <strong>Discount percentage</strong> - The percent off applied to both items (e.g., 15%)
                      </List.Item>
                      <List.Item>
                        <strong>Machine vendors</strong> - List of espresso machine brand names
                      </List.Item>
                      <List.Item>
                        <strong>Grinder vendors</strong> - List of grinder brand names that pair with the machines
                      </List.Item>
                    </List>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      3. Rule Priority
                    </Text>
                    <Text as="p">
                      When multiple rules could apply, the app automatically selects the rule with the <strong>highest discount percentage</strong>. This ensures customers always get the best available deal.
                    </Text>
                    <Banner tone="success">
                      <Text as="p">
                        Example: If a customer adds a Bezzera machine (eligible for 15% rule) and a Eureka grinder, they'll receive 15% off both items.
                      </Text>
                    </Banner>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      4. One-to-One Pairing
                    </Text>
                    <Text as="p">
                      Each machine pairs with exactly one grinder. If a customer has multiple machines and grinders in their cart, the app pairs them optimally to maximize discounts.
                    </Text>
                    <Banner>
                      <Text as="p">
                        Example: Cart with 2 machines + 3 grinders = 2 combo discounts applied (one grinder remains full price)
                      </Text>
                    </Banner>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Setup Guide
                  </Text>

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Step 1: Create Discount Rules
                    </Text>
                    <Text as="p">
                      Go to the <Link to="/app/christmas-combos">Configuration page</Link> and click "Add New Rule". For each rule:
                    </Text>
                    <List type="number">
                      <List.Item>Set the discount percentage (e.g., 15%)</List.Item>
                      <List.Item>Add machine vendor names exactly as they appear in your Shopify products</List.Item>
                      <List.Item>Add grinder vendor names that should pair with those machines</List.Item>
                      <List.Item>Click "Add Rule" to save</List.Item>
                    </List>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Step 2: Save Your Configuration
                    </Text>
                    <Text as="p">
                      After adding or editing rules, click the "Save Configuration" button in the top right. A warning banner will appear if you have unsaved changes.
                    </Text>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Step 3: Create a Shopify Discount
                    </Text>
                    <Text as="p">
                      For the function to work, you need to create a discount in your Shopify admin:
                    </Text>
                    <List type="number">
                      <List.Item>Go to <strong>Discounts</strong> in your Shopify admin</List.Item>
                      <List.Item>Click <strong>Create discount</strong></List.Item>
                      <List.Item>Select <strong>Product discount</strong></List.Item>
                      <List.Item>Choose <strong>Christmas Combos Discount</strong> as the discount type</List.Item>
                      <List.Item>Configure the discount settings (title, active dates, etc.)</List.Item>
                      <List.Item>Save the discount</List.Item>
                    </List>
                    <Banner tone="warning">
                      <Text as="p">
                        The discount function won't apply until you create a discount in the Shopify admin that uses this function.
                      </Text>
                    </Banner>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Excluded Products
                  </Text>
                  <Text as="p">
                    Products with certain tags are automatically excluded from combo discounts, even if they match the vendor criteria. This is useful for clearance items, existing bundles, or products you don't want discounted.
                  </Text>

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Currently excluded tags:
                    </Text>
                    <InlineStack gap="200" wrap>
                      <Badge tone="warning">no-combo-discount</Badge>
                      <Badge tone="warning">clearance</Badge>
                      <Badge tone="warning">bundle</Badge>
                    </InlineStack>
                  </BlockStack>

                  <Banner>
                    <Text as="p">
                      To exclude a product from combo discounts, add one of these tags to the product in your Shopify admin.
                    </Text>
                  </Banner>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Frequently Asked Questions
                  </Text>

                  <FAQItem question="Why isn't the discount showing in the cart?">
                    <BlockStack gap="200">
                      <Text as="p">Check the following:</Text>
                      <List type="bullet">
                        <List.Item>Ensure you've created a discount in the Shopify admin using this function</List.Item>
                        <List.Item>Verify the discount is active and within its scheduled dates</List.Item>
                        <List.Item>Check that the product vendors match exactly (case-sensitive)</List.Item>
                        <List.Item>Ensure neither product has an excluded tag</List.Item>
                        <List.Item>Confirm the cart contains both a machine AND a grinder from eligible vendors</List.Item>
                      </List>
                    </BlockStack>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="How do I find a product's vendor name?">
                    <Text as="p">
                      In your Shopify admin, go to <strong>Products</strong>, click on a product, and look for the "Vendor" field in the product details. This is the exact name you should use when configuring rules.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="Can customers stack this with other discounts?">
                    <Text as="p">
                      This depends on your Shopify discount settings. When creating the discount in your Shopify admin, you can configure whether it can combine with other discounts. Shopify's discount combination settings control this behavior.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="Does this work with POS and draft orders?">
                    <Text as="p">
                      Yes! Shopify Functions work across all sales channels including online store, Shopify POS, and draft orders created in the admin.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="What happens if I have multiple machines and grinders in the cart?">
                    <Text as="p">
                      The app pairs machines and grinders one-to-one, prioritizing higher discount percentages. If you have 2 machines and 3 grinders, you'll get 2 combo discounts (on 2 machines and 2 grinders), and 1 grinder remains at full price.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="Are vendor names case-sensitive?">
                    <Text as="p">
                      No, vendor matching is case-insensitive. "Bezzera", "BEZZERA", and "bezzera" will all match the same rule.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="Can I have the same vendor in multiple rules?">
                    <Text as="p">
                      Yes, a vendor can appear in multiple rules with different discount percentages. The app will automatically apply the highest applicable discount when a combo is detected.
                    </Text>
                  </FAQItem>

                  <Divider />

                  <FAQItem question="How do I disable the discount temporarily?">
                    <Text as="p">
                      Go to <strong>Discounts</strong> in your Shopify admin, find the discount that uses Christmas Combos, and either deactivate it or adjust its active dates.
                    </Text>
                  </FAQItem>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Example Configuration
                  </Text>
                  <Text as="p">
                    Here's a typical setup for a coffee equipment retailer:
                  </Text>

                  <Card background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success" size="large">15% OFF</Badge>
                        <Text variant="headingSm" as="h4">Premium Tier</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm">
                        <strong>Machines:</strong> Bezzera, Sanremo, Rancilio, Quick Mill, Slayer
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>Grinders:</strong> Eureka, Mahlkonig, Mazzer, Anfim
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success" size="large">10% OFF</Badge>
                        <Text variant="headingSm" as="h4">Standard Tier</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm">
                        <strong>Machines:</strong> ECM, Profitec, Technivorm
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>Grinders:</strong> Eureka, Mahlkonig, Mazzer, ECM, Profitec
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Troubleshooting
                  </Text>

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Discount Not Applying
                    </Text>
                    <List type="number">
                      <List.Item>Verify a Shopify discount exists that uses this function</List.Item>
                      <List.Item>Check the discount is active (not expired or scheduled for later)</List.Item>
                      <List.Item>Confirm vendor names match exactly</List.Item>
                      <List.Item>Ensure products don't have excluded tags</List.Item>
                      <List.Item>Check that you've saved your configuration</List.Item>
                    </List>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Wrong Discount Amount
                    </Text>
                    <List type="bullet">
                      <List.Item>The app applies the highest matching discount percentage</List.Item>
                      <List.Item>Check if the vendor appears in a different rule with a higher/lower percentage</List.Item>
                      <List.Item>Remember: discount applies to BOTH items in the combo</List.Item>
                    </List>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      Configuration Not Saving
                    </Text>
                    <List type="bullet">
                      <List.Item>Ensure you click "Save Configuration" after making changes</List.Item>
                      <List.Item>Check your browser console for any errors</List.Item>
                      <List.Item>Try refreshing the page and making changes again</List.Item>
                    </List>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  Quick Navigation
                </Text>
                <BlockStack gap="200">
                  <Link to="/app/christmas-combos">
                    <Button variant="plain" fullWidth textAlign="left">
                      Back to Configuration
                    </Button>
                  </Link>
                </BlockStack>
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Key Points
                  </Text>
                  <List type="bullet">
                    <List.Item>Discounts apply to BOTH machine and grinder</List.Item>
                    <List.Item>Vendor names must match exactly</List.Item>
                    <List.Item>Higher discount rules take priority</List.Item>
                    <List.Item>One machine pairs with one grinder</List.Item>
                    <List.Item>Excluded tags prevent discounts</List.Item>
                  </List>
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Need More Help?
                  </Text>
                  <Text as="p" variant="bodySm">
                    If you're experiencing issues not covered here, check that:
                  </Text>
                  <List type="bullet">
                    <List.Item>The app is properly installed</List.Item>
                    <List.Item>A discount is created in Shopify admin</List.Item>
                    <List.Item>Your product vendors are set correctly</List.Item>
                  </List>
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
