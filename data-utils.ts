import slugify from "slugify";
import XLSX from "xlsx";
import {
  WoocommerceRecord,
  Product,
  ProductVariant,
  AttributeFacet,
  Facet,
} from "./types";

export const SLUGIFY_OPTIONS = { lower: true, strict: true };

export const RESELLER_DISCOUNT_FACET_CODE = "reseller-discount";

interface AttributeMeta {
  name: string;
  columnKey: string;
  slug: string;
  position: number;
  visibility: boolean;
  variation: boolean;
  isTaxonomy: boolean;
}

const EXCEL_ATTRIBUTES: AttributeMeta[] = [
  {
    name: "Ausführung",
    columnKey: "Ausführung",
    slug: "model",
    position: 50,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Pfeilrichtung",
    columnKey: "Pfeilrichtung",
    slug: "arrow-dir",
    position: 0,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Grösse",
    columnKey: "Grösse",
    slug: "size",
    position: 1,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Jahr",
    columnKey: "Jahr",
    slug: "year",
    position: 60,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Farbe",
    columnKey: "Farbe",
    slug: "color",
    position: 70,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Format",
    columnKey: "Format",
    slug: "format",
    position: 80,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Leuchtdichte",
    columnKey: "Leuchtdichte_mcd",
    slug: "luminance",
    position: 40,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Material",
    columnKey: "Material",
    slug: "material",
    position: 10,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Norm",
    columnKey: "Norm",
    slug: "norm",
    position: 90,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "PSPA Klasse",
    columnKey: "PSPA_Class",
    slug: "pspa-class",
    position: 100,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Ursprungsland",
    columnKey: "Ursprungsland",
    slug: "country",
    position: 120,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Druckeigenschaft(-en)",
    columnKey: "Eigenschaft_Druck",
    slug: "print-property",
    position: 110,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Einheit",
    columnKey: "Einheit",
    slug: "unit",
    position: 1000,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Symbolnummer",
    columnKey: "Symbolnummer",
    slug: "symbol-number",
    position: 990,
    visibility: true,
    variation: true,
    isTaxonomy: true,
  },
  {
    name: "Inhalt",
    columnKey: "Inhalt",
    slug: "content",
    position: 1,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
  {
    name: "Variante",
    columnKey: "Variante",
    slug: "product_variation",
    position: 0,
    visibility: true,
    variation: true,
    isTaxonomy: false,
  },
].sort((a, b) => a.position - b.position);

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

export const excelToProducts = (workbook: XLSX.WorkBook) => {
  const sheetNameList = workbook.SheetNames;

  const products: { [productGroupKey: string]: Product } = {};

  sheetNameList.forEach((sheetName) => {
    /* iterate through sheets */
    const excelProducts: { [key: string]: any }[] = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName]
    );

    excelProducts
      .filter((productData) => productData["Shop_Produkt_Ja_Nein"] === 1)
      .forEach((productData: { [key: string]: any }, index: number) => {
        //Merging variants with each other based on variation code
        try {
          let price = 0;

          if ("Einzelpreis" in productData) {
            if (
              typeof productData["Einzelpreis"] === "string" &&
              productData["Einzelpreis"].includes("CHF")
            ) {
              price = parseFloat(
                productData["Einzelpreis"].trim().split(" ")[1]
              );
            } else if (typeof productData["Einzelpreis"] === "number") {
              price = productData["Einzelpreis"];
            } else {
              throw new Error(
                `Ignoriere das Produkt auf Zeile ${index}, productData["Einzelpreis"]: "${productData["Einzelpreis"]}" ist ungültig`
              );
            }

            if (price <= 0) {
              throw new Error(
                `Das Produkt auf Zeile ${index} wird ignoriert, da der Preis negativ ist`
              );
            }
          } else {
            throw new Error(
              `Das Produkt auf Zeile ${index} wird ignoriert, da es keinen "Einzelpreis" besitzt`
            );
          }

          const variant: ProductVariant = {
            sku: productData["Artikel_Nummer_Produkt"] || "",
            price,
            images: [],
            minimumOrderQuantity:
              parseInt(productData["Mindestbestellmenge"]) || 0,
            bulkDiscount: [], //filled below
            attributes: [], //filled below
          };

          //modify attribute columns

          //Merge BOGEN + Stückzahl pro Einheit
          if (
            "Stückzahl pro Einheit" in productData &&
            productData["Stückzahl pro Einheit"] &&
            "Einheit" in productData
          ) {
            productData[
              "Einheit"
            ] = `${productData["Einheit"]} (${productData["Stückzahl pro Einheit"]} STK)`;
          }

          //Bulk discount

          for (let column in productData) {
            if (column.indexOf("VP Staffel ") !== -1) {
              const pricePerUnit = parseFloat(
                productData[column].toString().replace("CHF", "").trim()
              );
              const quantity = parseInt(
                column.replace("VP Staffel ", "").trim(),
                10
              );

              if (pricePerUnit > 0 && quantity > 0) {
                variant.bulkDiscount.push({
                  price: pricePerUnit,
                  quantity: quantity,
                });
              }
            }
          }

          EXCEL_ATTRIBUTES.filter(
            ({ columnKey }) => columnKey in productData
          ).forEach((attribute) => {
            variant.attributes.push({
              name: attribute.name,
              value: productData[attribute.columnKey],
            });
          });

          if ("Produktgruppe_Shop" in productData) {
            const groupName: string = productData["Produktgruppe_Shop"].trim();

            if (!(groupName in products)) {
              const attributes: AttributeFacet[] = EXCEL_ATTRIBUTES.filter(
                ({ columnKey }) => columnKey in productData
              ).map((attribute) => ({
                name: attribute.name,
                values: [productData[attribute.columnKey]],
              }));

              const facets: Facet[] = [];

              //Check for discount keys
              for (let column in productData) {
                if (column.indexOf("_Rabattberechtigt") !== -1) {
                  const f = facets.find(
                    (f) => f.code === RESELLER_DISCOUNT_FACET_CODE
                  );
                  if (f) {
                    f.values.push(column.replace("_Rabattberechtigt", ""));
                  } else {
                    facets.push({
                      code: RESELLER_DISCOUNT_FACET_CODE,
                      values: [column.replace("_Rabattberechtigt", "")],
                    });
                  }
                }
              }

              //create parent product of type variable
              products[groupName] = {
                sku: groupName,
                name: productData["Artikelname_neu"].trim() || "",
                description: "",
                width: parseFloat(productData["Breite"]) || 0,
                height: parseFloat(productData["Höhe"]) || 0,
                length: 0,
                images: [],
                upsells: [],
                crosssells: [],
                order: 0,
                categories: productData["Thema"] ? [productData["Thema"]] : [],
                facets,
                attributes,
                bulkDiscount: false,
                minOrderQuantity:
                  parseInt(productData["Mindestbestellmenge"]) || 0,
                children: [],
              };
            } else {
              //verify

              let p: string[] = products[groupName].attributes
                .map((a) => a.name.toLocaleLowerCase())
                .sort();
              let v: string[] = variant.attributes
                .map((a) => a.name.toLocaleLowerCase())
                .sort();

              if (
                p.length !== v.length ||
                !(p
                  .map((name, index) => name === v[index].toLocaleLowerCase())
                  .reduce((a, b) => a && b),
                true)
              ) {
                throw new Error(
                  `Das Produkt auf Zeile ${index} wird ignoriert, da die Attribute [${v.join(
                    ","
                  )}]{${v.length}} (Variante) und [${p.join(",")}]{${
                    p.length
                  }} nicht gleich sind."`
                );
              }

              //add different variants to the parent
              variant.attributes.forEach((attribute) => {
                const a = products[groupName].attributes.find(
                  (a) => a.name === attribute.name
                );
                if (a && !a.values.includes(attribute.value)) {
                  a.values.push(attribute.value);
                }
              });
              products[groupName].children.push(variant);
            }
          } else {
            throw new Error(
              "Produkte ohne Produktgruppen werden momentan nicht unterstützt."
            );
          }

          /*if ("Artikel_Bilder_Code" in productData) {
            product.imageCode = productData["Artikel_Bilder_Code"];
          } else {
            throw new Error(
              `Das Produkt auf Zeile ${index} wird ignoriert, da es kein Bild besitzt!`
            );
          }*/
        } catch (e) {
          console.log("Error", e.message);
        }
      });
  });

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
