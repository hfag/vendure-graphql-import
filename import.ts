import * as fs from "fs";
import parse from "csv-parse/lib/sync";
import XLSX from "xlsx";
import { GraphQLClient } from "graphql-request";

import {
  rlQuestion,
  rlPasword,
  rlConfirm,
  assertConfirm,
  selection,
} from "./rl-utils";

import {
  getExistingProducts,
  assertAuthentication,
  getOptionGroups,
  createProduct,
  assignOptionGroupToProduct,
  getExistingProductVariants,
  deleteProductVariants,
  createProductVariants,
  updateProductVariants,
  updateProductVariantBulkDiscounts,
  getCollections,
  updateProduct,
  createCategoryCollection,
  updateProductCrosssells,
  updateProductUpsells,
  findOrCreateAssets,
  getFacets,
  createOrUpdateOptionGroups,
  createOrUpdateFacets,
  createOptionGroup,
  createProductOptions,
  getOptionGroup,
} from "./graphql-utils";
import {
  SLUGIFY_OPTIONS,
  hasAllOptionGroups,
  tableToProducts,
} from "./data-utils";
import {
  OptionGroup,
  ProductVariantCreation,
  ProductVariantUpdate,
  ProductPrototype,
  Facet,
  ID,
  Record,
} from "./types";
import { DeepRequired } from "ts-essentials";
import { CATEGORY_FACET_CODE } from "./data-utils/facets";
import slugify from "slugify";
import cliProgress from "cli-progress";
import util from "util";
import { notEmpty } from "./utils";

if (process.argv.length < 4) {
  console.error(
    'Syntax: "node import.js path/to/file.ext https://vendure-domain.tld/admin-api" oder "node import.js path/to/file.ext path/to/out.json"'
  );
  process.exit(0);
}

let records: Record[];
let json: any = null;

if (process.argv[2].endsWith(".csv")) {
  console.log("Importiere aus CSV");
  records = parse(fs.readFileSync(process.argv[2], { encoding: "utf-8" }), {
    columns: true,
    skip_empty_lines: true,
  });
} else if (process.argv[2].endsWith(".xlsx")) {
  console.log("Importiere aus Excel-Datei");
  const workbook = XLSX.readFile(process.argv[2]);
  const sheetNameList = workbook.SheetNames;
  records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetNameList[0]]);
} else if (process.argv[2].endsWith(".json")) {
  console.log("Importiere aus JSON-Datei");
  json = JSON.parse(fs.readFileSync(process.argv[2], { encoding: "utf-8" }));
} else {
  throw new Error("Entweder .csv, .json .xlsx Dateien!");
}

async function main() {
  const endpoint = process.argv[3];

  const username = await rlQuestion("Benutzername: ");
  const password = await rlPasword("Passwort: ");

  const token = await assertAuthentication(endpoint, username, password);

  console.log(`Authentifikation erfolgreich! Token: ${token}`);

  const graphQLClient = new GraphQLClient(endpoint, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  let f: Facet[] = await getFacets(graphQLClient);

  let products: ProductPrototype[] = [];

  const r: {
    products: (ProductPrototype & {
      translationId?: string | number | undefined;
    })[];
    facets: Facet[];
  } = json ? json : await tableToProducts(records, f);
  products = r.products;
  f = r.facets;

  if (process.argv[4] && process.argv[4].endsWith(".json")) {
    console.log("Schreibe JSON Ausgabe: " + process.argv[4]);
    fs.writeFileSync(process.argv[4], JSON.stringify(r));
    process.exit(0);
  }

  console.log("Validiere Produkte...");
  products.forEach((p) => {
    if (!p.translations.find((t) => t.languageCode === "de")) {
      console.log(util.inspect(p, { showHidden: false, depth: null }));
      console.error(`Produkt ist nicht auf Deutsch übersetzt.`);
      process.exit(-1);
    }

    p.optionGroups.forEach((group) => {
      if (
        !["de", "fr"].every((lang) =>
          group.translations.find((t) => t.languageCode === lang)
        )
      ) {
        console.log(p.sku);
        console.log(util.inspect(group, { showHidden: false, depth: null }));
        console.error(`Optionsgruppe ist nicht übersetzt.`);
        process.exit(-1);
      }

      group.options.forEach((o) => {
        if (
          !["de"].every((lang) =>
            o.translations.find((t) => t.languageCode === lang)
          )
        ) {
          console.log(p.sku);
          console.log(util.inspect(o, { showHidden: false, depth: null }));
          console.error(`Option ist nicht übersetzt.`);
          process.exit(-1);
        }
      });
    });
  });

  console.log("Validiere Facetten...");
  const untranslatedFacets = f.filter(
    (facet) =>
      !["de", "fr"].every((lang) =>
        facet.translations.find((t) => t.languageCode === lang)
      )
  );

  if (untranslatedFacets.length > 0) {
    console.error("Folgende Facetten haben unvollständige Übersetzungen:");
    untranslatedFacets.forEach((f) =>
      console.log(
        `${f.code}: ${f.translations
          .map((t) => `[${t.languageCode}: "${t.name}"]`)
          .join(", ")}`
      )
    );
    process.exit(-1);
  }

  await assertConfirm("Parsen beendet. Beginne Import?");

  const skuToProductId = await getExistingProducts(
    graphQLClient,
    products.map((p) => p.sku)
  );

  console.log(`Erstelle Kategorien (Facetten und Kollektionen)`);
  const facets: DeepRequired<Facet>[] = await createOrUpdateFacets(
    graphQLClient,
    f
  );

  const facetCodeToId: { [key: string]: ID } = facets.reduce(
    (obj: { [key: string]: ID }, facet) => {
      obj[facet.code] = facet.id;
      return obj;
    },
    {}
  );

  const facetValueCodeToId: { [key: string]: ID } = facets.reduce(
    (obj: { [key: string]: ID }, facet) => {
      return facet.values.reduce((obj: { [key: string]: ID }, value) => {
        obj[value.code] = value.id;
        return obj;
      }, obj);
    },
    {}
  );

  let collections = await getCollections(graphQLClient);
  const categoryFacet = facets.find((f) => f.code === CATEGORY_FACET_CODE);
  const newCollectionIds = !categoryFacet
    ? []
    : await Promise.all(
        categoryFacet.values
          .filter(
            (cat) =>
              !collections.find(
                (coll) =>
                  coll.translations
                    .find((t) => t.languageCode === "de")
                    ?.name.toLocaleLowerCase() ===
                  cat.translations
                    .find((t) => t.languageCode === "de")
                    ?.name.toLocaleLowerCase()
              )
          )
          .map((cat) =>
            createCategoryCollection(
              graphQLClient,
              {
                translations: cat.translations.map((t) => ({
                  description: "",
                  slug: slugify(t.name, SLUGIFY_OPTIONS),
                  ...t,
                })),
              },
              [cat.id]
            )
          )
      );

  console.log(`Importiere insgesamt ${products.length} Produkte.`);

  const loadingBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );

  loadingBar.start(products.length, 0);

  for (const p of products) {
    //we need to find a fitting product type
    let productId = skuToProductId[p.sku];

    if (typeof productId === "string") {
      p.id = productId;
      const pr = <DeepRequired<ProductPrototype>>p;

      // await assertConfirm(
      //   `Produkt "${
      //     p.translations.find((t) => t.languageCode == "de")?.name
      //   }" (${p.sku}) existiert bereits und wird aktualisiert.`,
      //   "y"
      // );

      await updateProduct(graphQLClient, pr, facetValueCodeToId);
    } else {
      // await assertConfirm(
      //   `Produkt "${
      //     p.translations.find((t) => t.languageCode === "de")?.name
      //   }" (${p.sku}) existiert noch nicht und wird neu erstellt.`
      // );

      skuToProductId[p.sku] = await createProduct(
        graphQLClient,
        endpoint,
        token,
        p,
        facetValueCodeToId
      );

      productId = skuToProductId[p.sku];
      p.id = productId;
    }

    const product = <DeepRequired<ProductPrototype>>p;

    try {
      const optionGroups: DeepRequired<
        OptionGroup
      >[] = await createOrUpdateOptionGroups(
        graphQLClient,
        product.optionGroups,
        product.id
      );

      const { variants, variantSkuToId } = await getExistingProductVariants(
        graphQLClient,
        product.id
      );

      const variantsToDelete = variants
        .filter((v) => !product.children.find((p) => p.sku === v.sku))
        .map((v) => v.id);

      const variantUpdates: ProductVariantUpdate[] = [];
      const variantCreations: ProductVariantCreation[] = [];
      const variantBulkDiscounts: {
        sku: string;
        discounts: { quantity: number; price: number }[];
      }[] = [];

      for (const variant of product.children) {
        let variantId = variantSkuToId[variant.sku];
        let exists = variantId ? true : false;

        if (exists && hasAllOptionGroups(variant, variants)) {
          variantUpdates.push({
            id: variantId,
            translations: product.translations.map((t) => ({
              languageCode: t.languageCode,
              name: t.name,
            })),
            facetValueIds: variant.facetValueCodes.map(
              (code) => facetValueCodeToId[code]
            ),
            sku: variant.sku,
            price: variant.price,
            taxCategoryId: 1,
            trackInventory: false,
            customFields: {
              bulkDiscountEnabled: variant.bulkDiscounts.length > 0,
              minimumOrderQuantity: variant.minimumOrderQuantity,
            },
          });
        } else {
          //option groups don't match, delete it and create new one
          if (exists) {
            variantsToDelete.push(variantId);
          }

          const assetIds = await findOrCreateAssets(
            graphQLClient,
            endpoint,
            token,
            variant.assets
          );

          const missingOptions = product.optionGroups.filter(
            (g) =>
              !variant.optionCodes.find(
                ([groupCode, optionCode]) =>
                  groupCode === g.code &&
                  g.options.find((o) => o.code === optionCode)
              )
          );

          if (missingOptions.length > 0) {
            throw new Error(
              `Variante ${
                variant.sku
              } fehlt eine Option in den Gruppen ${missingOptions
                .map((o) => o.code)
                .join(", ")}`
            );
          }

          variantCreations.push({
            productId,
            translations: product.translations.map((t) => ({
              languageCode: t.languageCode,
              name: t.name,
            })),
            facetValueIds: variant.facetValueCodes.map(
              (code) => facetValueCodeToId[code]
            ),
            sku: variant.sku,
            price: variant.price,
            taxCategoryId: 1,
            optionIds: variant.optionCodes.map(([groupCode, optionCode]) => {
              const g = optionGroups.find((g) => g.code === groupCode);
              if (!g) {
                throw new Error(
                  `Es konnte keine Optionsgruppe ${groupCode} in [${optionGroups
                    .map((g) => g.code)
                    .join(", ")}] gefunden werden`
                );
              }
              const o = g.options.find((o) => o.code === optionCode);
              if (!o) {
                throw new Error(
                  `Es konnte keine Option ${optionCode} in [${g.options
                    .map((o) => o.code)
                    .join(", ")}] gefunden werden`
                );
              }
              return o.id;
            }),
            featuredAssetId: assetIds[0],
            assetIds,
            // stockOnHand: null,
            trackInventory: false,
            customFields: {
              bulkDiscountEnabled: variant.bulkDiscounts.length > 0,
              minimumOrderQuantity: variant.minimumOrderQuantity,
            },
          });
        }

        variantBulkDiscounts.push({
          sku: variant.sku,
          discounts: variant.bulkDiscounts,
        });
      }

      // console.log(
      //   `Lösche ${variantsToDelete.length} Produktvarianten von ${
      //     product.translations.find((t) => t.languageCode === "de")?.name
      //   } (${product.sku}):`
      // );

      await deleteProductVariants(graphQLClient, variantsToDelete);

      // console.log(
      //   `Erstelle ${variantCreations.length} neue Produktvarianten für das Produkt ${product.sku}:`
      // );
      // console.log(
      //   "Artikelnummern: " + variantCreations.map((c) => c.sku).join(", ")
      // );

      const newVariants = await createProductVariants(
        graphQLClient,
        variantCreations
      );

      newVariants.forEach((v) => {
        variantSkuToId[v.sku] = v.id;
      });

      // console.log(
      //   `Aktualisiere ${variantUpdates.length} Produktvarianten für das Produkt ${product.sku}:`
      // );
      // console.log("SKUs: " + variantUpdates.map((c) => c.sku).join(", "));

      await updateProductVariants(graphQLClient, variantUpdates);

      // console.log(
      //   `Aktualisiere die Mengenrabatte für alle erstellten und aktualisierten Produktvarianten`
      // );

      await updateProductVariantBulkDiscounts(
        graphQLClient,
        variantBulkDiscounts.map(({ sku, discounts }) => ({
          productVariantId: variantSkuToId[sku],
          discounts,
        }))
      );

      //prevent server overload
      await new Promise((resolve, reject) => setTimeout(resolve, 500));

      loadingBar.increment();
    } catch (e) {
      console.error("Ein Fehler bei folgendem Produkt ist aufgetreten:");
      console.error(util.inspect(product, { showHidden: false, depth: null }));
      console.error("SKU:", product.sku);
      throw e;
    }
  }
  loadingBar.stop();

  console.log("Füge nun noch die Verlinkungen (Cross- und Upsells) ein.");

  const crosssells: { productId: ID; productIds: ID[] }[] = [];
  const upsells: { productId: ID; productIds: ID[] }[] = [];

  for (const product of products) {
    //we need to find a fitting product type
    const productId = skuToProductId[product.sku];

    if (product.crosssellsGroupSKUs.length > 0) {
      crosssells.push({
        productId,
        productIds: product.crosssellsGroupSKUs
          .map((sku) => {
            if (sku in skuToProductId) {
              return skuToProductId[sku];
            }

            console.log(
              `Crosssell Verlinkung von Produkt ${product.sku} (${productId}) zu ${sku} ist fehlgeschlagen. Diese kann noch manuell eingefügt werden.`
            );

            return null;
          })
          .filter(notEmpty),
      });
    }
    if (product.upsellsGroupSKUs.length > 0) {
      upsells.push({
        productId,
        productIds: product.upsellsGroupSKUs
          .map((sku) => {
            if (sku in skuToProductId) {
              return skuToProductId[sku];
            }

            console.log(
              `Upsell Verlinkung von Produkt ${product.sku} (${productId}) zu ${sku} ist fehlgeschlagen. Diese kann noch manuell eingefügt werden.`
            );

            return null;
          })
          .filter(notEmpty),
      });
    }
  }

  await Promise.all([
    updateProductCrosssells(graphQLClient, crosssells),
    updateProductUpsells(graphQLClient, upsells),
  ]);

  console.log("Fertig!");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit();
});
