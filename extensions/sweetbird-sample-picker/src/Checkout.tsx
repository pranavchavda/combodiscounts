import { useEffect, useState } from "react";
import {
  reactExtension,
  useCartLines,
  useApplyCartLinesChange,
  useSettings,
  BlockStack,
  Text,
  ChoiceList,
  Choice,
  InlineLayout,
  Image,
  Banner,
  Button,
  Divider,
  Heading,
} from "@shopify/ui-extensions-react/checkout";

interface SyrupVariant {
  id: string;
  title: string;
  imageUrl?: string;
}

interface SweetbirdConfig {
  active: boolean;
  offerTitle: string;
  qualifyingCollectionIds: string[];
  syrups: SyrupVariant[];
  minCartValue?: number;
}

export default reactExtension(
  "purchase.checkout.block.render",
  () => <SweetbirdSamplePicker />,
);

function SweetbirdSamplePicker() {
  const settings = useSettings<{ app_url?: string; offer_title?: string }>();
  const cartLines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();

  const [config, setConfig] = useState<SweetbirdConfig | null>(null);
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const appUrl = settings.app_url || "https://combos.idrinkcoffee.com";

  useEffect(() => {
    fetch(`${appUrl}/api/sweetbird/config`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((data: SweetbirdConfig) => {
        setConfig(data);
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
      });
  }, [appUrl]);

  if (!configLoaded || !config || !config.active || !config.syrups || config.syrups.length === 0) {
    return null;
  }

  // Check minimum cart value (exclude free sample lines from the total)
  const minCartValue = config.minCartValue ?? 0;
  if (minCartValue > 0) {
    const cartTotal = cartLines.reduce((sum, line) => {
      const isSample = line.attributes?.some(
        (a) => a.key === "_free_sample" && a.value === "true",
      );
      if (isSample) return sum;
      return sum + Number(line.cost.totalAmount.amount);
    }, 0);
    if (cartTotal < minCartValue) {
      return null;
    }
  }

  const sampleLine = cartLines.find((line) =>
    line.attributes?.some(
      (a) => a.key === "_free_sample" && a.value === "true",
    ),
  );

  if (sampleLine) {
    const syrupName =
      config.syrups.find((s) => s.id === sampleLine.merchandise.id)?.title ??
      "sample";
    return (
      <Banner status="success">
        <Text>Free Sweetbird sample added: {syrupName}</Text>
      </Banner>
    );
  }

  const offerTitle =
    settings.offer_title ||
    config.offerTitle ||
    "Choose your free Sweetbird syrup sample!";

  const handleAddSample = async () => {
    if (!selected) return;
    setAdding(true);
    setAddError(null);

    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: selected,
      quantity: 1,
      attributes: [{ key: "_free_sample", value: "true" }],
    });

    if (result.type === "error") {
      setAddError(result.message);
    }

    setAdding(false);
  };

  return (
    <BlockStack spacing="base">
      <Divider />
      <Heading level={3}>{offerTitle}</Heading>
      <ChoiceList
        name="sweetbird-syrup"
        value={selected}
        onChange={setSelected}
      >
        <BlockStack spacing="tight">
          {config.syrups.map((syrup) => (
            <Choice id={syrup.id} key={syrup.id}>
              <InlineLayout columns={[50, "fill"]} spacing="base" blockAlignment="center">
                <Image
                  source={syrup.imageUrl || ""}
                  alt={syrup.title}
                  aspectRatio={1}
                  fit="cover"
                />
                <Text>{syrup.title}</Text>
              </InlineLayout>
            </Choice>
          ))}
        </BlockStack>
      </ChoiceList>
      {addError && (
        <Banner status="critical">
          <Text>{addError}</Text>
        </Banner>
      )}
      <Button
        onPress={handleAddSample}
        loading={adding}
        disabled={!selected || adding}
        accessibilityLabel="Add free Sweetbird sample to cart"
      >
        Add Free Sample
      </Button>
    </BlockStack>
  );
}
