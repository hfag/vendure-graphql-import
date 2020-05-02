const fs = require("fs");
const readline = require("readline");
const _get = require("lodash/get");
const parse = require("csv-parse/lib/sync");
const { GraphQLClient } = require("graphql-request");

if (process.argv.length !== 3) {
  console.error(
    "Usage: node import.js path/to/file.csv or node import.js path/to/file.xls"
  );
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const rlQuestion = (question) =>
  new Promise((resolve, reject) => rl.question(question, resolve));

const records = parse(fs.readFileSync(process.argv[2], { encoding: "utf-8" }), {
  columns: true,
  skip_empty_lines: true,
});

const products = {};
for (const record of records) {
  if (record["Typ"] === "variable") {
    if (record["Übergeordnetes Produkt"].length > 0) {
      throw new Error("variable can't have a parent!");
    }

    products[record["Artikelnummer"]] = {
      sku: record["Artikelnummer"],
      name: record["Name"],
      description: record["Beschreibung"],
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
      throw new Error("variation must have a parent!");
    }

    const parent = record["Übergeordnetes Produkt"];

    const product = {
      sku: record["Artikelnummer"],
      price: parseFloat(record["Regulärer Preis"]),
      images: record["Bilder"].split(",").map((x) => x.trim()),
      minOrderQuantity: record["Meta: _feuerschutz_min_order_quantity"],
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

const endpoint = "http://127.0.0.1:8000/graphql/";

const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    authorization:
      "JWT eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Im1lQHR5cmF0b3guY2giLCJleHAiOjE1ODU5OTA3MzgsIm9yaWdJYXQiOjE1ODU5OTA0Mzh9.1b9gjWUqCBS4Sp77qu2bX6aul98ETdMLu9O3lezrxqU",
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

const productTypes = await fetchAllPages(
  (pagination) =>
    `query {
      productTypes(${pagination}){
        edges{
          node{
            id
            name
            variantAttributes{
              name
              values{
                name
              }
            }
          }
        }
        pageInfo{
          hasNextPage
        }
      }
    }`,
  "productTypes"
).sort((a, b) => a.name.localeCompare(b.name));

const attributes = await fetchAllPages(
  (pagination) =>
    `query {
      attributes(${pagination}){
        edges{
          node{
            id
            name
            values{
              id
              name
            }
          }
          cursor
        }
        pageInfo{
          hasNextPage
        }
      }
    }`,
  "attributes"
).sort((a, b) => a.name.localeCompare(b.name));

async function createProducts() {
  const productTypes = response.data.productTypes.edges.map(
    (type) => type.node
  );

  for (const sku in products) {
    //we need to find a fitting product type
    const product = products[sku];

    //first all are possible
    let possibleTypes = productTypes.filter((type) => {
      const unmatchedAttributes = product.attributes.filter(
        (attribute) =>
          !type.variantAttributes.find((e) => e.name === attribute.name)
      );

      return unmatchedAttributes.length === 0;
    });

    let type = null;

    if (possibleTypes.length > 1) {
      //find the number of the most matched attributes
      const mostAttributes = possibleTypes.reduce((most, type) =>
        type.variantAttributes.length > most
          ? type.variantAttributes.length
          : most
      );

      //filter all so that we only have the maximal matches
      possibleTypes = possibleTypes.filter(
        (type) => type.variantAttributes.length === mostAttributes
      );
    }

    if (possibleTypes.length > 1) {
      console.log(
        `Es gibt mehrere mögliche Produkttypen für das Produkt mit Artikelnummer ${sku}`
      );
      console.log(`Möglich wären:`);
      for (let i = 0; i < possibleTypes.length; i++) {
        console.log(
          `${i}) ${possibleTypes[i].name} mit Attributen ${possibleTypes[
            i
          ].variantAttributes
            .map((a) => a.name)
            .join(", ")}`
        );
      }

      const num = await rlQuestion(
        `Welcher Produkttyp soll verwendet werden? Gib seine Nummer(0-${
          possibleTypes.length - 1
        }) ein. Etwas anderes um abzubrechen.`
      );

      const selection = parseInt(num);

      if (
        isNaN(selection) ||
        selection < 0 ||
        selection >= possibleTypes.length
      ) {
        console.log("Import abgebrochen.");
        process.exit(0);
      }

      type = possibleTypes[selection];
    } else if (possibleTypes.length === 1) {
      type = possibleTypes[0];
    } else if (possibleTypes.length === 0) {
      console.log(
        `Es wurde kein Typ mit den Attributen ${product.attributes.map(
          (a) => a.name
        )} gefunden.`
      );
      const input = await rlQuestion(
        `Soll ein Produkttyp mit diesen Attributen erstellt werden? Weitere Eigenschaftswerte können später hinzugefügt werden. (y/n)`
      );
      if (input.toLowerCase() !== "y") {
        console.log(
          "Import abgebrochen. Erstelle den Produkttyp manuell und versuche es dann erneut."
        );
        process.exit(0);
      }

      const name = await rlQuestion(
        `Wie soll die neue Variante mit den Attributen ${product.attributes
          .map((a) => a.name)
          .join(", ")} genannt werden?`
      );
      const isDigital =
        (
          await rlQuestion(`Ist das Produkt ausschliesslich digital (y/n)?`)
        ).toLowerCase() === "y";

      //const taxCode = (await rlQuestion(`Steuercode?`)).toLowerCase() === "y";

      //create product attributes if needed, first filter the ones that already exist
      const newAttributes = product.attributes.filter(
        (a1) => !attributes.find((a2) => a1.name === a2.name)
      );
      console.log(
        `Bisher sind folgende Attribute in der Datenbank: ${attributes
          .map((a) => a.name)
          .join(", ")}`
      );
      const shouldCreateAttributes =
        (await rlQuestion(
          `Die Attribute ${newAttributes
            .map((a) => a.name)
            .join(", ")} müssten erstellt werden, ist das in Ordnung? (y/n)`
        ).toLowerCase()) === "y";

      if (!shouldCreateAttributes) {
        console.log(
          "Import abgebrochen. Erstelle die Attribute mit diesen Namen manuell und versuche es dann erneut."
        );
        process.exit(0);
      }

      for (const attribute of newAttributes) {
        const response = await graphQLClient.request(
          `mutation AttributeCreate($input: AttributeCreateInput!){
            attributeCreate(input: $input){
              attribute{
                id
                name,
                values {
                  id
                  name
                }
              }
            }
          }`,
          {
            input: {
              inputType: "DROPDOWN",
              name: attribute.name,
              values: product.values.map((name) => ({ name })),
              valueRequired: true,
              isVariantOnly: true,
              visibleInStorefront: true,
              filterableInStorefront: true,
              filterableInDashboard: true,
              availableInGrid: true,
            },
          }
        );

        attributes.push(response.data.attributeCreate.attribute);
      }

      console.log(
        "Die neuen Attribute wurden erstellt, erstelle nun die Produktvariante."
      );

      const productTypeCreationResponse = await graphQLClient.request(
        `mutation ProductTypeCreate(input: ProductTypeInput!){
          productTypeCreate(input: $input){
            productType{
              id
            }
          }
        }`,
        {
          input: {
            name,
            hasVariants: true,
            productAttributes: [],
            variantAttributes: product.attributes //now attributes contains all of them
              .map((a1) => {
                const a = attributes.find((a2) => a1.name === a2.name);
                return a ? a.id : null;
              })
              .filter((e) => e) /*filter null values*/,
            isShippingRequired: !isDigital,
            isDigital,
          },
        }
      );

      type = productTypeCreationResponse.data.productTypeCreate.productType;
    }

    //create product

    const productCreationResponse = await graphQLClient.request(
      `mutation ProductCreate(input: ProductInput!){
        productCreate(input: $input){
          product{
            id
          }
        }
      }`,
      {
        input: {
          attributes: [],
          publicationDate: new Date().toISOString(),
          category: xxx,
          chargeTaxes: true,
          collections: [],
          description: "",
          isPublished: true,
          name: product.name,
          basePrice: 0.0,
          seo: {
            title: product.seoTitle,
            description: product.seoDescription,
          },
          sku: product.sku,
          trackInventory: false,
          productType: type.id,
        },
      }
    );

    const productId = productCreationResponse.data.productCreate.product.id;

    for (const variant of product.children) {
      const productVariantCreationResponse = await graphQLClient.request(
        `mutation ProductVariantCreate(input: ProductVariantInput!){
          productVariantCreate(input: $input){
            productVariant{
              id
            }
          }
        }`,
        {
          input: {
            attributes: [],
            priceOverride: variant.price,
            sku: variant.sku,
            trackInventory: false,
            product: productId,
          },
        }
      );
    }
  }

  console.log(JSON.stringify(data, undefined, 2));
}

createProducts().catch((error) => console.error(error));
