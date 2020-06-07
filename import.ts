import * as fs from "fs";
import slugify from "slugify";
import parse from "csv-parse/lib/sync";
import XLSX from "xlsx";
const util = require("util");
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
  createCategoryCollections,
  findOrCreateFacetValues,
  findOrCreateFacet,
  updateProductCrosssells,
  updateProductUpsells,
  getAssetsIdByName,
  findOrCreateAssets,
} from "./graphql-utils";
import {
  SLUGIFY_OPTIONS,
  hasAllOptionGroups,
  mapWoocommerceRecordsToProducts,
  excelToProducts,
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
  Product,
  AttributeFacet,
  Facet,
} from "./types";

if (process.argv.length < 4) {
  console.error(
    'Syntax: "node import.js path/to/file.ext https://vendure-domain.tld/admin-api" oder "node import.js path/to/file.ext path/to/out.json"'
  );
  process.exit(0);
}

let products: { [productGroupKey: string]: Product } = {};

if (process.argv[2].endsWith(".csv")) {
  console.log("Importiere aus CSV");
  const records = parse(
    fs.readFileSync(process.argv[2], { encoding: "utf-8" }),
    {
      columns: true,
      skip_empty_lines: true,
    }
  );

  products = mapWoocommerceRecordsToProducts(records);
} else if (process.argv[2].endsWith(".xlsx")) {
  console.log("Importiere aus Excel-Datei");
  products = excelToProducts(XLSX.readFile(process.argv[2]));
} else if (process.argv[2].endsWith(".json")) {
  console.log("Importiere aus JSON-Datei");
  products = JSON.parse(
    fs.readFileSync(process.argv[2], { encoding: "utf-8" })
  );
} else {
  throw new Error("Entweder .csv, .json .xlsx Dateien!");
}

if (process.argv[3].endsWith(".json")) {
  console.log("Schreibe JSON Ausgabe: " + process.argv[3]);
  fs.writeFileSync(process.argv[3], JSON.stringify(products));
  process.exit(0);
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

  const skuToProductId = await getExistingProducts(
    graphQLClient,
    Object.keys(products)
  );

  const collections = await getCollections(graphQLClient);

  console.log(
    `Importiere insgesamt ${Object.values(products).length} Produkte.`
  );

  for (const sku in products) {
    //we need to find a fitting product type
    const product = products[sku];
    let productId = skuToProductId[sku];
    let exists = productId ? true : false;

    let optionGroups: OptionGroup[] = [];
    const attributeNameToGroup: { [name: string]: OptionGroup } = {};

    //move some attributes to facets
    const facets: (AttributeFacet | Facet)[] = [
      ...product.facets,
      ...product.attributes.filter(
        (attribute) => attribute.values.length === 1
      ),
    ];

    // console.log(util.inspect(product, { showHidden: false, depth: null }));

    const facetResponses = await Promise.all(
      facets.map((f) => findOrCreateFacet(graphQLClient, f))
    );

    const facetIds: string[] = [].concat.apply(
      [],
      //@ts-ignore
      facetResponses.map((e) => e.facetValueIds)
    );

    //remove them from attributes
    product.attributes = product.attributes.filter(
      (attribute) => attribute.values.length > 1
    );
    //also for the variants
    product.children.forEach((variant) => {
      variant.attributes = variant.attributes.filter(
        (a) =>
          !facets.find((f) =>
            "name" in f
              ? f.name.toLocaleLowerCase() === a.name.toLocaleLowerCase()
              : false
          )
      );
    });

    const {
      facetValueIds: categoryIds,
      newFacetValues: newCategories,
    } = await findOrCreateFacetValues(graphQLClient, "1", product.categories);

    let collectionIds: string[] = [];
    const collectionsToCreate: { name: string; facetValueIds: string[] }[] = [];

    product.categories.forEach((category) => {
      const c = collections.find(
        (collection) =>
          collection.name.toLocaleLowerCase() === category.toLocaleLowerCase()
      );

      if (c) {
        collectionIds.push(c.id);
      } else {
        //this is a new collection, i.e. the category must be new as well
        collectionsToCreate.push({
          name: category,
          //could also use .find() but this way it's already an array (:
          facetValueIds: newCategories
            .filter((c) => c.code === slugify(category, SLUGIFY_OPTIONS))
            .map((c) => c.id),
        });
      }
    });

    const newCollections = await createCategoryCollections(
      graphQLClient,
      collectionsToCreate
    );
    collections.push(...newCollections);
    collectionIds = collectionIds.concat(newCollections.map((c) => c.id));

    if (exists) {
      await assertConfirm(
        `Produkt "${product.name}" (${product.sku}) existiert bereits und wird aktualisiert.`,
        "y"
      );

      optionGroups = await getOptionGroupsByProductId(graphQLClient, productId);

      await updateProduct(
        graphQLClient,
        productId,
        product,
        categoryIds.concat(facetIds)
      );
    } else {
      await assertConfirm(
        `Produkt "${product.name}" (${product.sku}) existiert noch nicht und wird neu erstellt.`
      );

      console.log(
        `Es werden ${product.images.length} Bilder herunter- und dann wieder hochgeladen falls diese noch vorhanden sind.`
      );

      const assetIds = await findOrCreateAssets(
        graphQLClient,
        endpoint,
        token,
        product.images
      );

      skuToProductId[sku] = await createProduct(
        graphQLClient,
        product,
        assetIds,
        categoryIds.concat(facetIds)
      );

      exists = true;
      productId = skuToProductId[sku];
    }

    for (const attribute of product.attributes) {
      const slug = slugify(attribute.name, SLUGIFY_OPTIONS);
      const groups = optionGroups.filter((g) => g.code === slug);
      let group = groups[0];
      if (groups.length === 0) {
        if (
          await rlConfirm(
            `Es existiert bisher kein Attribut mit dem Namen "${slug}, soll es erstellt werden?"`,
            "y"
          )
        ) {
          group = await createOptionGroup(graphQLClient, slug, attribute);
          await assignOptionGroupToProduct(graphQLClient, productId, group.id);
        } else {
          await assertConfirm(
            `Oder soll stattdessen ein anderes Attribut verwendet werden?`,
            "n"
          );
          optionGroups.forEach((g, i) =>
            console.log(
              `${i}) ${g.name} (${g.code}) mit den Werten [${g.options
                .map((o) => o.name)
                .join(", ")}]`
            )
          );

          group = await selection(optionGroups);
        }
      } else if (groups.length > 1) {
        console.log(`Es existieren mehrere Attribute mit dem Namen "${slug}".`);
        console.log(
          `Welchem soll das Produktattribut "${attribute.name}" von ${
            product.name
          } (${product.sku}) zugeordnet werden? (0-${groups.length - 1})`
        );
        console.log(
          `Folgende Attributwerte werden benötigt: [${attribute.values.join(
            ", "
          )}]\n`
        );
        groups.forEach((g, i) =>
          console.log(
            `\t${i}) "${g.name}" (${g.code}) mit den Werten [${g.options
              .map((o) => o.name)
              .join(", ")}]`
          )
        );

        group = await selection(groups);
      }

      const missingValues = attribute.values.filter(
        (v) =>
          !group.options.find((o) => o.code === slugify(v, SLUGIFY_OPTIONS))
      );

      console.log(
        `Erstelle ${missingValues.length} neue Werte im Attribut ${
          attribute.name
        }: [${missingValues.join(", ")}]`
      );

      await createProductOptions(graphQLClient, group.id, missingValues);
      attributeNameToGroup[attribute.name] = group;
    }

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
          translations: ["de"].map((lang) => ({
            languageCode: lang,
            name: product.name,
          })),
          facetValueIds: [],
          sku: variant.sku,
          price: variant.price,
          taxCategoryId: 1,
          trackInventory: false,
          customFields: {
            bulkDiscountEnabled: variant.bulkDiscount.length > 0,
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
          variant.images
        );

        variantCreations.push({
          productId,
          translations: ["de"].map((lang) => ({
            languageCode: lang,
            name: product.name,
          })),
          facetValueIds: [],
          sku: variant.sku,
          price: variant.price * 100 /* weird but that's just how it is */,
          taxCategoryId: 1,
          optionIds: variant.attributes
            .map(({ name, value }) => {
              const slug = slugify(value, SLUGIFY_OPTIONS);
              const group = attributeNameToGroup[name].options.find(
                (o) => o.code === slug
              );

              return group ? group.id : null;
            })
            .filter(notEmpty),
          featuredAssetId: assetIds[0],
          assetIds,
          // stockOnHand: null,
          trackInventory: false,
          customFields: {
            bulkDiscountEnabled: variant.bulkDiscount.length > 0,
            minimumOrderQuantity: variant.minimumOrderQuantity,
          },
        });
      }

      variantBulkDiscounts.push({
        sku: variant.sku,
        discounts: variant.bulkDiscount,
      });
    }

    console.log(
      `Lösche ${variantsToDelete.length} Produktvarianten von ${product.name} (${product.sku}):`
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

  const crosssells: { productId: string; productIds: string[] }[] = [];
  const upsells: { productId: string; productIds: string[] }[] = [];

  for (const sku in products) {
    //we need to find a fitting product type
    const product = products[sku];
    if (product.crosssells.length > 0) {
      crosssells.push({
        productId: skuToProductId[sku],
        productIds: product.crosssells.map((sku) => skuToProductId[sku]),
      });
    }
    if (product.upsells.length > 0) {
      upsells.push({
        productId: skuToProductId[sku],
        productIds: product.upsells.map((sku) => skuToProductId[sku]),
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
