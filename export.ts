import * as fs from "fs";
import { GraphQLClient } from "graphql-request";

import { rlPasword, rlQuestion } from "./rl-utils";

import { ProductVariant } from "schema";
import { assertAuthentication, getAllProductVariants } from "./graphql-utils";
import { parse } from "json2csv";

if (process.argv.length < 4) {
  console.error(
    'Syntax: "node export.js https://vendure-domain.tld/admin-api path/to/out.csv"'
  );
  process.exit(0);
}

const output = process.argv[3];

const toPrice = (p?: number) => {
  if (p) {
    return p / 100;
  }
  return p;
};

async function main() {
  //use language code=cn, otherwise not all translations are loaded :(
  const endpoint = `${process.argv[2]}?languageCode=de`;

  const username = await rlQuestion("Benutzername: ");
  const password = await rlPasword("Passwort: ");

  const token = await assertAuthentication(endpoint, username, password);

  console.log(`Authentifikation erfolgreich! Token: ${token}`);

  const graphQLClient = new GraphQLClient(endpoint, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const productVariants: ProductVariant[] = await getAllProductVariants(
    graphQLClient,
    50
  );

  console.log(
    `Exportiere insgesamt ${productVariants.length} Produktvarianten`
  );

  console.log("Schreibe JSON Ausgabe: " + output);
  const csv = parse(productVariants, {
    fields: [
      {
        label: "Artikel_Nummer_Produkt",
        value: (p: ProductVariant) => p.sku,
        default: undefined,
      },
      {
        label: "Artikelname_neu",
        value: (p: ProductVariant) => p.name,
        default: undefined,
      },
      {
        label: "Einzelpreis",
        value: (p: ProductVariant) => toPrice(p.priceWithTax),
        default: undefined,
      },
      {
        label: "Schilder_Rabattberechtigt",
        value: (p: ProductVariant) =>
          p.facetValues.find(
            (f) =>
              f.facet.code === "reseller-discounts" && f.name === "Schilder"
          )
            ? "Ja"
            : "Nein",
        default: undefined,
      },
      {
        label: "VP Staffel 2",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 2)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 4",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 4)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 5",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 5)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 6",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 6)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 7",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 7)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 10",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 10)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 14",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 14)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 15",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 15)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 20",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 20)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 25",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 25)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 50",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 50)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 80",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 80)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 100",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 100)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 150",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 150)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 250",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 250)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 300",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 300)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 400",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 400)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 800",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 800)?.price),
        default: "0",
      },
      {
        label: "VP Staffel 1500",
        value: (p: ProductVariant) =>
          toPrice(p.bulkDiscounts.find((b) => b.quantity === 1500)?.price),
        default: "0",
      },
      {
        label: "Thema",
        value: (p: ProductVariant) =>
          p.product.collections.length > 0 ? p.product.collections[0].name : "",
        default: undefined,
      },
      {
        label: "Produktgruppe_Shop",
        value: (p: ProductVariant) => p.product.customFields?.groupKey,
        default: undefined,
      },
      {
        label: "Ursprungsland",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Ursprungsland")?.name,
        default: undefined,
      },
      {
        label: "Eigenschaft_Druck",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Druckeigenschaft(-en)")?.name,
        default: undefined,
      },
      {
        label: "Material",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Material")?.name,
        default: undefined,
      },
      {
        label: "Ausführung",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Ausführung")?.name,
        default: undefined,
      },
      {
        label: "PSPA_Class",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "PSPA Klasse")?.name,
        default: undefined,
      },
      {
        label: "Leuchtdichte_mcd",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Leuchtdichte")?.name,
        default: undefined,
      },
      {
        label: "Farbe",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Farbe")?.name,
        default: undefined,
      },
      {
        label: "Format",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Format")?.name,
        default: undefined,
      },
      {
        label: "Grösse",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Grösse")?.name,
        default: undefined,
      },
      {
        label: "Breite",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Breite")?.name,
        default: undefined,
      },
      {
        label: "Höhe",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Höhe")?.name,
        default: undefined,
      },
      {
        label: "Durchmesser",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Durchmesser")?.name,
        default: undefined,
      },
      {
        label: "Stärke",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Stärke")?.name,
        default: undefined,
      },
      {
        label: "Norm",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Norm")?.name,
        default: undefined,
      },
      {
        label: "Pfeilrichtung",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Pfeilrichtung")?.name,
        default: undefined,
      },
      {
        label: "Variante",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Variante")?.name,
        default: undefined,
      },
      {
        label: "Jahr",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Jahr")?.name,
        default: undefined,
      },
      {
        label: "Einheit",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Einheit")?.name,
        default: undefined,
      },
      {
        label: "Stückzahl pro Einheit",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Stückzahl pro Einheit")?.name,
        default: undefined,
      },
      {
        label: "Stückzahl pro Einheit",
        value: (p: ProductVariant) =>
          p.options.find((o) => o.group.name === "Stückzahl pro Einheit")?.name,
        default: undefined,
      },
    ],
  });
  fs.writeFileSync(output, csv);

  console.log("Fertig!");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit();
});
