import slugify from "slugify";
import { WoocommerceRecord, Product, ProductVariant } from "./types";

export const SLUGIFY_OPTIONS = { lower: true, strict: true };

export const mapWoocommerceRecordToProduct = (
  record: WoocommerceRecord
): Product => ({
  sku: record["Artikelnummer"],
  name: record["Name"],
  description: record["Beschreibung"]
    .replace(/<\/li>(\s)*\\n/g, "</li>")
    .replace(/\\n/g, "<br>"),
  length: parseFloat(record["Länge (mm)"]) || 0,
  width: parseFloat(record["Breite (mm)"]) || 0,
  height: parseFloat(record["Höhe (mm)"]) || 0,
  categories: record["Kategorien"]
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      const parts = s.split(">");
      return parts[parts.length - 1];
    }),
  images: record["Bilder"].split(",").map((x) => x.trim()),
  upsells: record["Zusatzverkäufe"].split(",").map((x) => x.trim()),
  crosssells: record["Cross-Sells (Querverkäufe)"]
    .split(",")
    .map((x) => x.trim()),
  order: parseInt(record["Position"].replace("'", "")),
  attributes: [],
  facets: [],
  seoTitle: record["Name"],
  seoDescription: record["Meta: description"],
  minOrderQuantity: parseInt(record["Meta: _feuerschutz_min_order_quantity"]),
  bulkDiscount:
    record["Meta: _feuerschutz_variable_bulk_discount_enabled"] === "1"
      ? true
      : false,
  children: [],
});

export const mapWoocommerceRecordToProductVariant = (
  record: WoocommerceRecord
) => {
  const variant: ProductVariant = {
    sku: record["Artikelnummer"],
    price: parseFloat(record["Regulärer Preis"]),
    images: record["Bilder"].split(",").map((x) => x.trim()),
    minimumOrderQuantity: parseInt(
      record["Meta: _feuerschutz_min_order_quantity"]
    ),
    bulkDiscount: JSON.parse(
      record["Meta: _feuerschutz_bulk_discount"] || "[]"
    ).map((discount: { qty: number; ppu: number }) => ({
      quantity: discount.qty,
      price: discount.ppu,
    })),
    attributes: [],
  };

  for (const key in record) {
    const parts = key.split(" ");
    if (parts[0] !== "Attribut") {
      continue;
    }
    const num = parseInt(parts[1]) - 1;
    const type = parts[2];

    if (!variant.attributes[num]) {
      variant.attributes[num] = { name: "", value: "" };
    }

    switch (type) {
      case "Name":
        variant.attributes[num].name = record[key];
        break;
      case "Wert(e)":
        variant.attributes[num].value = record[key];
        break;

      default:
        break;
    }
  }

  return variant;
};

export const mapWoocommerceRecordsToProducts = (
  records: WoocommerceRecord[]
) => {
  const products: { [productGroupKey: string]: Product } = {};

  for (const record of records) {
    if (record["Typ"] === "variable") {
      if (record["Übergeordnetes Produkt"].length > 0) {
        console.error(record);
        throw new Error(
          "Ein variables Produkt kann kein übergeordnetes Produkt besitzen!"
        );
      }

      products[record["Artikelnummer"]] = mapWoocommerceRecordToProduct(record);

      for (const key in record) {
        const parts = key.split(" ");

        if (parts[0] !== "Attribut") {
          continue;
        }
        const num = parseInt(parts[1]) - 1;
        const type = parts[2];

        if (!products[record["Artikelnummer"]].attributes[num]) {
          products[record["Artikelnummer"]].attributes[num] = {
            name: "",
            values: [],
          };
        }

        switch (type) {
          case "Name":
            products[record["Artikelnummer"]].attributes[num].name =
              record[key];
            break;
          case "Wert(e)":
            products[record["Artikelnummer"]].attributes[num].values = record[
              key
            ]
              .split(",")
              .map((s: string) => s.trim());
            break;

          default:
            break;
        }
      }
    } else if (record["Typ"] === "variation") {
      if (
        record["Übergeordnetes Produkt"].length === 0 ||
        !products[record["Übergeordnetes Produkt"]]
      ) {
        console.log(record);
        throw new Error(
          "Produktvarianten benötigen ein übergeordnetes Produkt!"
        );
      }

      const parent = record["Übergeordnetes Produkt"];
      products[parent].children.push(
        mapWoocommerceRecordToProductVariant(record)
      );
    }
  }

  return products;
};

export const hasAllOptionGroups = (
  variant: ProductVariant,
  variants: { sku: string; options: { code: string }[] }[]
) => {
  const v = variants.find((v) => v.sku === variant.sku);
  if (!v) {
    throw new Error(
      "variants has to be in variants for hasAllOptionGroups to be called"
    );
  }
  const missingOptions = v.options.filter(
    (o) =>
      !variant.attributes.find(
        (a) => o.code === slugify(a.value, SLUGIFY_OPTIONS)
      )
  );

  return missingOptions.length === 0;
};
