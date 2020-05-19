const fs = require("fs");
const Writable = require("stream").Writable;
const util = require("util");
const url = require("url");
const path = require("path");
const streamPipeline = util.promisify(require("stream").pipeline);

const rimraf = require("rimraf");
const fetch = require("node-fetch");
const FormData = require("form-data");
const readline = require("readline");
const slugify = require("slugify");
const _get = require("lodash/get");
const parse = require("csv-parse/lib/sync");
const { GraphQLClient, rawRequest } = require("graphql-request");

const SLUGIFY_OPTIONS = { lower: true, strict: true };

if (process.argv.length !== 3) {
  console.error(
    'Syntax: "node import.js path/to/file.csv" oder "node import.js path/to/file.xls"'
  );
  process.exit(0);
}

const mutableStdout = new Writable({
  write: function (chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: true,
});

rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (rl.stdoutMuted) {
    rl.output.write("*");
  } else {
    rl.output.write(stringToWrite);
  }
};

async function downloadFile(fileUrl, fileDirectory) {
  const response = await fetch(fileUrl);
  const parsed = url.parse(fileUrl);

  const f = `${fileDirectory}/${path.basename(parsed.pathname)}`;

  if (!response.ok) {
    throw new Error(`unexpected response ${response.statusText}`);
  }
  await streamPipeline(response.body, fs.createWriteStream(f));

  return f;
}

async function uploadFilesToGraphql(endpoint, authenticationToken, filepaths) {
  const body = new FormData();

  body.append(
    "operations",
    JSON.stringify({
      query: /* GraphQL */ `
        mutation CreateAssets($input: [CreateAssetInput!]!) {
          createAssets(input: $input) {
            id
            name
          }
        }
      `,
      variables: {
        input: filepaths.map((filepath) => ({ file: null })),
      },
    })
  );

  body.append(
    "map",
    JSON.stringify(
      filepaths.reduce((obj, filepath, index) => {
        obj[index] = [`variables.input.${index}.file`];
        return obj;
      }, {})
    )
  );

  filepaths.forEach((filepath, index) => {
    body.append(index, fs.createReadStream(filepath));
  });

  return await fetch(endpoint, {
    method: "POST",
    body,
    headers: new Headers({
      Authorization: "Bearer " + authenticationToken,
    }),
  }).then((r) => r.json());
}

const rlQuestion = (question) =>
  new Promise((resolve, reject) => rl.question(question, resolve));
const rlPasword = (question) =>
  new Promise((resolve, reject) => {
    mutableStdout.muted = false;
    rl.question(question, (answer) => {
      mutableStdout.muted = false;
      resolve(answer);
    });
    mutableStdout.muted = true;
  });

const confirm = (question, defaultAnswer = "n") =>
  new Promise((resolve, reject) => {
    const defaultTrue = "y" === defaultAnswer;
    const nonDefault = defaultTrue ? "n" : "y";

    rl.question(
      question + ` (${defaultTrue ? "Y" : "y"}/${!defaultTrue ? "N" : "n"}) `,
      (answer) => {
        if (answer.toLocaleLowerCase() === nonDefault) {
          resolve(!defaultTrue);
        } else {
          resolve(defaultTrue);
        }
      }
    );
  });
const assertConfirm = async (question, defaultAnswer) => {
  if (await confirm(question, defaultAnswer)) {
    return;
  } else {
    console.log("Nicht bestätigt, beende das Programm.");
    process.exit();
  }
};

const selection = async (options) => {
  let answer = await rlQuestion(`Auswahl: `);
  while (isNaN(answer) || answer < 0 || answer >= options.length) {
    console.log(
      `Diese Antwort ist ungültig. Wähle eine Zahl zwischen 0 und ${
        options.length - 1
      }`
    );
    answer = await rlQuestion(`Auswahl: `);
  }

  return options[answer];
};

const records = parse(fs.readFileSync(process.argv[2], { encoding: "utf-8" }), {
  columns: true,
  skip_empty_lines: true,
});

const products = {};
for (const record of records) {
  if (record["Typ"] === "variable") {
    if (record["Übergeordnetes Produkt"].length > 0) {
      console.error(record);
      throw new Error(
        "Ein variables Produkt kann kein übergeordnetes Produkt besitzen!"
      );
    }

    products[record["Artikelnummer"]] = {
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
      upsells: record["Zusatzverkäufe"],
      crosssells: record["Cross-Sells (Querverkäufe)"],
      order: record["Position"].replace("'", ""),
      attributes: [],
      seoTitle: record["Name"],
      seoDescription: record["Meta: description"],
      minOrderQuantity: record["Meta: _feuerschutz_min_order_quantity"],
      bulkDiscount: record["Meta: _feuerschutz_variable_bulk_discount_enabled"]
        ? true
        : false,
      children: [],
    };

    for (const key in record) {
      const parts = key.split(" ");

      if (parts[0] !== "Attribut") {
        continue;
      }
      const num = parseInt(parts[1]) - 1;
      const type = parts[2];

      if (!products[record["Artikelnummer"]].attributes[num]) {
        products[record["Artikelnummer"]].attributes[num] = {};
      }

      switch (type) {
        case "Name":
          products[record["Artikelnummer"]].attributes[num].name = record[key];
          break;
        case "Wert(e)":
          products[record["Artikelnummer"]].attributes[num].values = record[key]
            .split(",")
            .map((s) => s.trim());
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
      throw new Error("Produktvarianten benötigen ein übergeordnetes Produkt!");
    }

    const parent = record["Übergeordnetes Produkt"];

    const product = {
      sku: record["Artikelnummer"],
      price: parseFloat(record["Regulärer Preis"]),
      images: record["Bilder"].split(",").map((x) => x.trim()),
      minimumOrderQuantity: record["Meta: _feuerschutz_min_order_quantity"],
      bulkDiscount: JSON.parse(
        record["Meta: _feuerschutz_bulk_discount"] || "[]"
      ),
      attributes: [],
    };

    for (const key in record) {
      const parts = key.split(" ");
      if (parts[0] !== "Attribut") {
        continue;
      }
      const num = parseInt(parts[1]) - 1;
      const type = parts[2];

      if (!product.attributes[num]) {
        product.attributes[num] = {};
      }

      switch (type) {
        case "Name":
          product.attributes[num].name = record[key];
          break;
        case "Wert(e)":
          product.attributes[num].value = record[key];
          break;

        default:
          break;
      }
    }

    products[parent].children.push(product);
  }
}

// fs.writeFileSync(
//   "/Users/mac/Downloads/out.json",
//   JSON.stringify(products, undefined, 2)
// );

// process.exit(0);

async function main() {
  const endpoint = "http://localhost:3000/admin-api/";

  const username = await rlQuestion("Benutzername: ");
  const password = await rlPasword("Passwort: ");

  const login = await rawRequest(
    endpoint,
    `mutation Login($username: String!, $password: String!){
      login(username: $username, password: $password){
        user{
          identifier
        }
      }
    }`,
    {
      username,
      password,
    }
  );

  if (login.errors && login.errors.length > 0) {
    console.log("Authentifikation fehlgeschlagen!");
    console.error(login.errors);
    process.exit(0);
  }

  const token = login.headers.get("vendure-auth-token");

  console.log(`Authentifikation erfolgreich! Token: ${token}`);

  const graphQLClient = new GraphQLClient(endpoint, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const fetchAllPages = async (query, pagePath, batchSize = 100) => {
    //all responses (without error) start with a wrapping data element
    pagePath = "data." + pagePath;

    let response = await graphQLClient.request(query(`first:${batchSize}`));
    let page = _get(response, pagePath);

    let data = page.edges.map((e) => e.node);

    while (page.pageInfo.hasNextPage) {
      response = await graphQLClient.request(
        query(`first:${batchSize}, after:${page.pageInfo.endCursor}`)
      );

      page = _get(response, pagePath);
      data = data.concat(page.edges.map((e) => e.node));
    }

    return data;
  };

  const hasAllOptionGroups = (variant, variants) => {
    const v = variants.find((v) => v.sku === variant.sku);
    const missingOptions = v.options.filter(
      (o) =>
        !variant.attributes.find(
          (a) => o.code === slugify(a.value, SLUGIFY_OPTIONS)
        )
    );

    return missingOptions.length === 0;
  };

  const existing = await graphQLClient.request(
    `query GetProductsByGroupKeys($productGroupKeys: [String!]!){
      getProductsByGroupKeys(productGroupKeys: $productGroupKeys){
        id
        customFields {
          groupKey
        }
      }
    }`,
    { productGroupKeys: Object.keys(products) }
  );

  const skuToProductId = {};
  existing.getProductsByGroupKeys.forEach((p) => {
    skuToProductId[p.customFields.groupKey] = p.id;
  });

  for (const sku in products) {
    //we need to find a fitting product type
    const product = products[sku];
    let productId = skuToProductId[sku];
    let exists = productId ? true : false;

    let optionGroups = [];
    const attributeNameToGroup = {};

    if (exists) {
      await assertConfirm(
        `Produkt "${product.name}" (${product.sku}) existiert bereits und wird aktualisiert.`,
        "y"
      );

      const productCreationResponse = await graphQLClient.request(
        `mutation UpdateProduct($input: UpdateProductInput!){
          updateProduct(input: $input){
            id
          }
        }`,
        {
          input: {
            id: productId,
            enabled: true,
            featuredAssetId: null,
            assetIds: [],
            facetValueIds: [],
            translations: ["en", "de"].map((lang) => ({
              languageCode: lang,
              name: product.name,
              slug: slugify(product.name, SLUGIFY_OPTIONS),
              description: product.description,
            })),
            customFields: {
              productRecommendationsEnabled: false,
              groupKey: sku,
            },
          },
        }
      );

      const optionGroupsResponse = await graphQLClient.request(
        `query optionGroups($productId: ID!){
          product(id: $productId){
            optionGroups{
              id
              name
              code
              options{
                id
                name
                code
              }
            }
          }
        }`,
        {
          productId,
        }
      );

      optionGroups = optionGroupsResponse.product.optionGroups;
    } else {
      await assertConfirm(
        `Produkt "${product.name}" (${product.sku}) existiert noch nicht und wird neu erstellt.`
      );

      console.log(
        `Es werden ${product.images.length} Bilder herunter- und dann wieder hochgeladen falls diese noch vorhanden sind.`
      );

      if (!fs.existsSync("./tmp/")) {
        fs.mkdirSync("./tmp");
      } else {
        rimraf.sync("./tmp/*");
      }

      const downloads = (
        await Promise.all(
          product.images.map((url) =>
            downloadFile(url, "./tmp").catch(
              (e) => {
                console.error(e);
                return null;
              } /* ignore errors */
            )
          )
        )
      ).filter((e) => e);

      console.log(
        `${downloads.length} von ${product.images.length} Bilder heruntergeladen. Lade sie nun hoch...`
      );
      const uploadResponse = await uploadFilesToGraphql(
        endpoint,
        token,
        downloads
      );

      rimraf.sync("./tmp/*");

      const assetIds = uploadResponse.data.createAssets.map((a) => a.id);

      //create product
      const productCreationResponse = await graphQLClient.request(
        `mutation CreateProduct($input: CreateProductInput!){
          createProduct(input: $input){
            id
          }
        }`,
        {
          input: {
            featuredAssetId: assetIds[0],
            assetIds,
            facetValueIds: [],
            translations: ["en", "de"].map((lang) => ({
              languageCode: lang,
              name: product.name,
              slug: slugify(product.name, SLUGIFY_OPTIONS),
              description: product.description,
            })),
            customFields: {
              productRecommendationsEnabled: false,
              groupKey: sku,
            },
          },
        }
      );

      skuToProductId[sku] = productCreationResponse.createProduct.id;

      exists = true;
      productId = skuToProductId[sku];
    }

    for (const attribute of product.attributes) {
      const slug = slugify(attribute.name, SLUGIFY_OPTIONS);
      const groups = optionGroups.filter((g) => g.code === slug);
      let group = groups[0];
      if (groups.length === 0) {
        if (
          await confirm(
            `Es existiert bisher kein Attribut mit dem Namen "${slug}, soll es erstellt werden?"`,
            "y"
          )
        ) {
          const productOptionGroupCreationResponse = await graphQLClient.request(
            `mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!){
              createProductOptionGroup(input: $input){
                id
                code
                name
                options{
                  id
                  name
                  code
                }
              }
            }`,
            {
              input: {
                code: slug,
                translations: ["en", "de"].map((lang) => ({
                  languageCode: lang,
                  name: attribute.name,
                })),
                options: attribute.values.map((v) => ({
                  code: slugify(v, SLUGIFY_OPTIONS),
                  translations: ["en", "de"].map((lang) => ({
                    languageCode: lang,
                    name: v,
                  })),
                })),
              },
            }
          );

          group = productOptionGroupCreationResponse.createProductOptionGroup;

          const productOptionGroupAssignmentResponse = await graphQLClient.request(
            `mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!){
              addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId){
                id
              }
            }`,
            {
              productId,
              optionGroupId: group.id,
            }
          );
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

      const productOptionGroupCreationResponses = await Promise.all(
        missingValues.map((value) =>
          graphQLClient.request(
            `mutation createProductOption($input: CreateProductOptionInput!){
              CreateProductOption(input: $input){
                id
                code
                name
              }
            }`,
            {
              input: {
                productOptionGroupId: group.id,
                code: slugify(value, SLUGIFY_OPTIONS),
                translations: ["en", "de"].map((lang) => ({
                  languageCode: lang,
                  name: value,
                })),
              },
            }
          )
        )
      );

      attributeNameToGroup[attribute.name] = group;
    }

    const existingVariants = await graphQLClient.request(
      `query ProductVariants($id: ID!){
        product(id: $id){
          variants{
            id
            sku
            options{
              id
              code
              name
              groupId
            }
          }
        }
      }`,
      { id: productId }
    );

    const variantSkuToId = {};

    existingVariants.product.variants.forEach((v) => {
      variantSkuToId[v.sku] = v.id;
    });

    const variantsToDelete = existingVariants.product.variants
      .filter((v) => !product.children.find((p) => p.sku === v.sku))
      .map((v) => v.id);

    const variantUpdates = [];
    const variantCreations = [];
    const variantBulkDiscounts = [];

    for (const variant of product.children) {
      let variantId = variantSkuToId[variant.sku];
      let exists = variantId ? true : false;

      if (
        exists &&
        hasAllOptionGroups(variant, existingVariants.product.variants)
      ) {
        variantUpdates.push({
          id: variantId,
          translations: ["en", "de"].map((lang) => ({
            languageCode: lang,
            name: product.name,
          })),
          facetValueIds: [],
          sku: variant.sku,
          price: variant.price,
          taxCategoryId: 1,
          featuredAssetId: null,
          assetIds: [],
          // stockOnHand: null,
          trackInventory: false,
          customFields: {
            bulkDiscountEnabled: variant.bulkDiscount.length > 0,
            minimumOrderQuantity: 0,
          },
        });
      } else {
        //option groups don't match, delete it and create new one
        if (exists) {
          variantsToDelete.push(variantId);
        }

        if (!fs.existsSync("./tmp/")) {
          fs.mkdirSync("./tmp");
        } else {
          rimraf.sync("./tmp/*");
        }

        const downloads = (
          await Promise.all(
            variant.images.map((url) =>
              downloadFile(url, "./tmp").catch(
                (e) => {
                  console.error(e);
                  return null;
                } /* ignore errors */
              )
            )
          )
        ).filter((e) => e);

        const uploadResponse = await uploadFilesToGraphql(
          endpoint,
          token,
          downloads
        );

        rimraf.sync("./tmp/*");

        const assetIds = uploadResponse.data.createAssets.map((a) => a.id);

        variantCreations.push({
          productId,
          translations: ["en", "de"].map((lang) => ({
            languageCode: lang,
            name: product.name,
          })),
          facetValueIds: [],
          sku: variant.sku,
          price: variant.price,
          taxCategoryId: 1,
          optionIds: variant.attributes
            .map(({ name, value }) => {
              const slug = slugify(value, SLUGIFY_OPTIONS);
              const group = attributeNameToGroup[name].options.find(
                ({ name, code }) => code === slug
              );

              return group ? group.id : null;
            })
            .filter((e) => e),
          featuredAssetId: assetIds[0],
          assetIds,
          // stockOnHand: null,
          trackInventory: false,
          customFields: {
            bulkDiscountEnabled: variant.bulkDiscount.length > 0,
            minimumOrderQuantity: 0,
          },
        });
      }

      variantBulkDiscounts.push({
        sku: variant.sku,
        discounts: variant.bulkDiscount.map((d) => ({
          quantity: d.qty,
          price: d.ppu,
        })),
      });
    }

    console.log(
      `Lösche ${variantsToDelete.length} Produktvarianten von ${product.name} (${product.sku}):`
    );

    const DeleteVariants = await Promise.all(
      variantsToDelete.map((variantId) =>
        graphQLClient.request(
          `mutation DeleteProductVariant($id: ID!){
            deleteProductVariant(id: $id){
              result
              message
            }
          }`,
          {
            id: variantId,
          }
        )
      )
    );

    console.log(
      `Erstelle ${variantCreations.length} neue Produktvarianten für das Produkt ${product.sku}:`
    );
    console.log(
      "Artikelnummern: " + variantCreations.map((c) => c.sku).join(", ")
    );

    const createProductVariantsResponse = await graphQLClient.request(
      `mutation CreateProductVariants($input: [CreateProductVariantInput!]!){
        createProductVariants(input: $input){
          id
          sku
        }
      }`,
      {
        input: variantCreations,
      }
    );

    createProductVariantsResponse.createProductVariants.forEach((v) => {
      variantSkuToId[v.sku] = v.id;
    });

    console.log(
      `Aktualisiere ${variantUpdates.length} Produktvarianten für das Produkt ${product.sku}:`
    );
    console.log("SKUs: " + variantUpdates.map((c) => c.sku).join(", "));

    const updateProductVariantsResponse = await graphQLClient.request(
      `mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!){
        updateProductVariants(input: $input){
          id
          sku
        }
      }`,
      {
        input: variantUpdates,
      }
    );

    console.log(
      `Aktualisiere die Mengenrabatte für alle erstellten und aktualisierten Produktvarianten`
    );

    const UpdateProductVariantsBulkDicounts = await Promise.all(
      variantBulkDiscounts.map(({ sku, discounts }) =>
        graphQLClient.request(
          `mutation UpdateProductVariantBulkDicounts($productVariantId: ID!, $discounts: [BulkDiscountInput!]!){
            updateProductVariantBulkDiscounts(productVariantId: $productVariantId, discounts: $discounts)
          }`,
          {
            productVariantId: variantSkuToId[sku],
            discounts,
          }
        )
      )
    );
  }

  console.log(JSON.stringify(data, undefined, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit();
});
