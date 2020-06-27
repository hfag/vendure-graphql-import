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
  uploadFilesToGraphql,
  getExistingProducts,
  assertAuthentication,
  getOptionGroups,
  getOptionGroupsByProductId,
  createProduct,
  createOptionGroup,
  assignOptionGroupToProduct,
  createProductOptions,
  getExistingProductVariants,
  deleteProductVariants,
  createProductVariants,
  updateProductVariants,
  updateProductVariantBulkDiscounts,
  getCollections,
  updateProduct,
  getFacetValues,
  createFacetValues,
  createCategoryCollection,
  findOrCreateFacetValues,
  findOrCreateFacet,
  updateProductCrosssells,
  updateProductUpsells,
  getAssetsIdByName,
  findOrCreateAssets,
  getFacets,
  createFacet,
  createOrUpdateOptionGroups,
  createOrUpdateFacets,
} from "./graphql-utils";
import {
  SLUGIFY_OPTIONS,
  hasAllOptionGroups,
  tableToProducts,
} from "./data-utils";
import {
  downloadFile,
  cleanDownloads,
  downloadFiles,
  notEmpty,
  getFilenameFromUrl,
} from "./utils";
import {
  OptionGroup,
  ProductVariantCreation,
  ProductVariantUpdate,
  ProductPrototype,
  AttributeFacet,
  Facet,
  ID,
  Record,
  FacetValue,
} from "./types";
import { IMPORT_OPTION_GROUPS } from "./data-utils/attributes";
import { DeepRequired } from "ts-essentials";
import { CATEGORY_FACET_CODE } from "./data-utils/facets";

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
  let o: OptionGroup[] = await getOptionGroups(graphQLClient);

  let products: ProductPrototype[] = [];

  const r: {
    products: (ProductPrototype & {
      translationId?: string | number | undefined;
    })[];
    optionGroups: OptionGroup[];
    facets: Facet[];
  } = json ? json : await tableToProducts(records, o, f);
  products = r.products;
  o = r.optionGroups;
  f = r.facets;

  if (process.argv[4] && process.argv[4].endsWith(".json")) {
    console.log("Schreibe JSON Ausgabe: " + process.argv[4]);
    fs.writeFileSync(process.argv[4], JSON.stringify(r));
    process.exit(0);
  }

  console.log("Validiere Produkte...");
  //products only require the german translation
  const untranslatedProducts = products.filter(
    (p) => !p.translations.find((t) => t.languageCode === "de")
  );

  if (untranslatedProducts.length > 0) {
    console.error(
      `Folgende ${untranslatedProducts.length} Produkte haben unvollständige Übersetzungen:`
    );
    untranslatedProducts.forEach((p) =>
      console.log(
        `${p.sku} (${
          "translationId" in p ? p["translationId"] : ""
        }): ${p.translations
          .map((t) => `[${t.languageCode}: "${t.name}"]`)
          .join(", ")}`
      )
    );
    process.exit(-1);
  }

  console.log("Validiere Optionsgruppen...");
  const untranslatedOptiongroups = o.filter(
    (group) =>
      !["de", "fr"].every((lang) =>
        group.translations.find((t) => t.languageCode === lang)
      )
  );

  if (untranslatedOptiongroups.length > 0) {
    console.error(
      "Folgende Optionsgruppen haben unvollständige Übersetzungen:"
    );
    untranslatedOptiongroups.forEach((f) =>
      console.log(
        `${f.code}: ${f.translations
          .map((t) => `[${t.languageCode}: "${t.name}"]`)
          .join(", ")}`
      )
    );
    process.exit(-1);
  }

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

  console.log(`Erstelle Optionsgruppen`);
  const optionGroups: DeepRequired<
    OptionGroup
  >[] = await createOrUpdateOptionGroups(graphQLClient, o);

  const optionGroupCodeToId: { [key: string]: ID } = optionGroups.reduce(
    (obj: { [key: string]: ID }, group) => {
      obj[group.code] = group.id;
      return obj;
    },
    {}
  );

  const optionCodeToId: { [key: string]: ID } = optionGroups.reduce(
    (obj: { [key: string]: ID }, group) => {
      return group.options.reduce((obj: { [key: string]: ID }, option) => {
        obj[option.code] = option.id;
        return obj;
      }, obj);
    },
    {}
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
              { translations: cat.translations },
              [cat.id]
            )
          )
      );

  console.log(`Importiere insgesamt ${products.length} Produkte.`);

  for (const p of products) {
    //we need to find a fitting product type
    let productId = skuToProductId[p.sku];

    if (typeof productId === "string") {
      p.id = productId;
      const pr = <Required<ProductPrototype>>p;

      await assertConfirm(
        `Produkt "${
          p.translations.find((t) => t.languageCode == "de")?.name
        }" (${p.sku}) existiert bereits und wird aktualisiert.`,
        "y"
      );

      await updateProduct(graphQLClient, pr, facetValueCodeToId);
    } else {
      await assertConfirm(
        `Produkt "${
          p.translations.find((t) => t.languageCode === "de")?.name
        }" (${p.sku}) existiert noch nicht und wird neu erstellt.`
      );

      skuToProductId[p.sku] = await createProduct(
        graphQLClient,
        endpoint,
        token,
        p,
        facetValueCodeToId
      );

      productId = skuToProductId[p.sku];
    }

    const product = <Required<ProductPrototype>>p;

    await Promise.all(
      product.optionGroupCodes.map((code) =>
        assignOptionGroupToProduct(
          graphQLClient,
          product.id,
          optionGroupCodeToId[code]
        )
      )
    );

    const { variants, variantSkuToId } = await getExistingProductVariants(
      graphQLClient,
      productId
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
          price: variant.price * 100,
          taxCategoryId: 1,
          optionIds: variant.optionCodes.map((code) => optionCodeToId[code]),
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

    console.log(
      `Lösche ${variantsToDelete.length} Produktvarianten von ${
        product.translations.find((t) => t.languageCode === "de")?.name
      } (${product.sku}):`
    );

    await deleteProductVariants(graphQLClient, variantsToDelete);

    console.log(
      `Erstelle ${variantCreations.length} neue Produktvarianten für das Produkt ${product.sku}:`
    );
    console.log(
      "Artikelnummern: " + variantCreations.map((c) => c.sku).join(", ")
    );

    const newVariants = await createProductVariants(
      graphQLClient,
      variantCreations
    );

    newVariants.forEach((v) => {
      variantSkuToId[v.sku] = v.id;
    });

    console.log(
      `Aktualisiere ${variantUpdates.length} Produktvarianten für das Produkt ${product.sku}:`
    );
    console.log("SKUs: " + variantUpdates.map((c) => c.sku).join(", "));

    await updateProductVariants(graphQLClient, variantUpdates);

    console.log(
      `Aktualisiere die Mengenrabatte für alle erstellten und aktualisierten Produktvarianten`
    );

    await updateProductVariantBulkDiscounts(
      graphQLClient,
      variantBulkDiscounts.map(({ sku, discounts }) => ({
        productVariantId: variantSkuToId[sku],
        discounts,
      }))
    );
  }

  console.log("Füge nun noch die Verlinkungen (Cross- und Upsells) ein.");

  const crosssells: { productId: ID; productIds: ID[] }[] = [];
  const upsells: { productId: ID; productIds: ID[] }[] = [];

  for (const sku in products) {
    //we need to find a fitting product type
    const product = products[sku];
    if (product.crosssellsGroupSKUs.length > 0) {
      crosssells.push({
        productId: skuToProductId[sku],
        productIds: product.crosssellsGroupSKUs.map(
          (sku) => skuToProductId[sku]
        ),
      });
    }
    if (product.upsellsGroupSKUs.length > 0) {
      upsells.push({
        productId: skuToProductId[sku],
        productIds: product.upsellsGroupSKUs.map((sku) => skuToProductId[sku]),
      });
    }
  }

  await Promise.all([
    updateProductCrosssells(graphQLClient, crosssells),
    updateProductUpsells(graphQLClient, upsells),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit();
});
