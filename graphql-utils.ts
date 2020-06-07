import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import slugify from "slugify";
import { GraphQLClient, rawRequest } from "graphql-request";
import { SLUGIFY_OPTIONS } from "./data-utils";
import {
  Product,
  OptionGroup,
  Facet,
  ProductVariantCreation,
  ProductVariantUpdate,
  AttributeFacet,
} from "./types";
import {
  downloadFiles,
  cleanDownloads,
  getFilenameFromUrl,
  isValidUrl,
} from "./utils";

export const uploadFilesToGraphql = async (
  endpoint: string,
  authenticationToken: string,
  filepaths: string[]
): Promise<{
  data: {
    createAssets: {
      id: string;
      name: string;
    }[];
  };
}> => {
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
      filepaths.reduce((obj: { [key: number]: string[] }, filepath, index) => {
        obj[index] = [`variables.input.${index}.file`];
        return obj;
      }, {})
    )
  );

  filepaths.forEach((filepath, index) => {
    body.append(index.toString(), fs.createReadStream(filepath));
  });

  return await fetch(endpoint, {
    method: "POST",
    body,
    headers: { Authorization: "Bearer " + authenticationToken },
  }).then((r) => r.json());
};

export const assertAuthentication = async (
  endpoint: string,
  username: string,
  password: string
) => {
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

  const token = login.headers.get("vendure-auth-token");

  if ((login.errors && login.errors.length > 0) || token === null) {
    console.log("Authentifikation fehlgeschlagen!");
    console.error(login.errors);
    process.exit(0);
  }

  return token;
};

export const getCollections = async (graphQLClient: GraphQLClient) => {
  const response: {
    collections: {
      items: {
        id: string;
        name: string;
      }[];
    };
  } = await graphQLClient.request(
    `query {
      collections{
        items{
          id
          name
        }
      }
    }`
  );

  return response.collections.items;
};
export const createCategoryCollections = async (
  graphQLClient: GraphQLClient,
  collections: { name: string; facetValueIds: string[] }[]
): Promise<{ id: string; name: string }[]> => {
  return await Promise.all(
    collections.map((collection) =>
      graphQLClient
        .request(
          `mutation Collections($input: CreateCollectionInput!){
            createCollection(input: $input){
              id
              name
            }
          }`,
          {
            input: {
              isPrivate: false,
              translations: ["de"].map((lang) => ({
                languageCode: lang,
                name: collection.name,
                description: "",
              })),
              filters: [
                {
                  code: "facet-value-filter",
                  arguments: [
                    {
                      name: "facetValueIds",
                      type: "facetValueIds",
                      value: JSON.stringify(collection.facetValueIds),
                    },
                    {
                      name: "containsAny",
                      type: "boolean",
                      value: "false",
                    },
                  ],
                },
              ],
            },
          }
        )
        .then((response) => {
          return {
            //@ts-ignore
            id: response.createCollection.id,
            //@ts-ignore
            name: response.createCollection.name,
          };
        })
    )
  );
};

export const getExistingProducts = async (
  graphQLClient: GraphQLClient,
  productGroupKeys: string[]
) => {
  const existing: {
    getProductsByGroupKeys: {
      id: string;
      customFields: { groupKey: string };
    }[];
  } = await graphQLClient.request(
    `query GetProductsByGroupKeys($productGroupKeys: [String!]!){
      getProductsByGroupKeys(productGroupKeys: $productGroupKeys){
        id
        customFields {
          groupKey
        }
      }
    }`,
    { productGroupKeys }
  );

  const skuToProductId: { [sku: string]: string } = {};
  existing.getProductsByGroupKeys.forEach(
    (p: { id: string; customFields: { groupKey: string } }) => {
      skuToProductId[p.customFields.groupKey] = p.id;
    }
  );

  return skuToProductId;
};

export const getFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId = "1"
) => {
  const response: {
    facet: {
      id: string;
      values: { id: string; name: string; code: string }[];
    };
  } = await graphQLClient.request(
    `query Facet($id: ID!){
      facet(id: $id){
        id
        values {
          id
          name
          code
        }
      }
    }`,
    { id: facetId }
  );

  return response.facet.values;
};

export const createFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId = "1",
  values: string[]
): Promise<{ id: string; code: string }[]> => {
  if (values.length === 0) {
    return [];
  }

  const response: {
    createFacetValues: {
      id: string;
      code: string;
    }[];
  } = await graphQLClient.request(
    `mutation CreateFacetValues($input: [CreateFacetValueInput!]!){
      createFacetValues(input: $input){
        id
        code
      }
    }`,
    {
      input: values.map((v) => ({
        facetId,
        code: slugify(v, SLUGIFY_OPTIONS),
        translations: ["de"].map((lang) => ({
          languageCode: lang,
          name: v,
        })),
      })),
    }
  );

  return response.createFacetValues;
};

export const findOrCreateAssets = async (
  graphQLClient: GraphQLClient,
  endpoint: string,
  token: string,
  urls: string[]
): Promise<string[]> => {
  const assetIdsByName = await getAssetsIdByName(
    graphQLClient,
    urls.map((image) => getFilenameFromUrl(image))
  );

  // console.log(
  //   `${Object.values(assetIdsByName).length} von ${
  //     urls.length
  //   } Bilder konnten bereits in der Datenbank gefunden werden.`
  // );

  const unmatched = urls.filter(
    (image) => !(getFilenameFromUrl(image) in assetIdsByName)
  );

  const invalid = unmatched.filter((s) => !isValidUrl(s));

  if (invalid.length > 0) {
    throw new Error(
      `${invalid.join(
        ", "
      )} wurden nicht hochgeladen und sind auch keine gültigen URLs!`
    );
  }

  const downloads = await downloadFiles(unmatched);

  // console.log(
  //   `${downloads.length} von ${unmatched.length} Bilder heruntergeladen. Lade sie nun hoch...`
  // );
  const uploadResponse = await uploadFilesToGraphql(endpoint, token, downloads);

  cleanDownloads();

  return [
    ...Object.values(assetIdsByName),
    ...uploadResponse.data.createAssets.map((a) => a.id),
  ];
};

export const getAssetsIdByName = async (
  graphQLClient: GraphQLClient,
  names: string[]
): Promise<{ [key: string]: string }> => {
  const mappings = await Promise.all(
    names.map(async (name) => {
      const value: {
        assetByName: { id: number };
      } = await graphQLClient.request(
        `query AssetByName($name: String!){
        assetByName(name: $name){
          id
        }
      }`,
        { name }
      );

      return value.assetByName ? { name, id: value.assetByName.id } : null;
    })
  );

  return mappings.reduce((object: { [key: string]: any }, mapping) => {
    if (mapping) {
      object[mapping.name] = mapping.id;
    }
    return object;
  }, {});
};

export const findOrCreateFacet = async (
  graphQLClient: GraphQLClient,
  facet: Facet | AttributeFacet
) => {
  const searchResponse: {
    facets: {
      items: { id: string; code: string }[];
    };
  } = await graphQLClient.request(
    `query {
        facets {
          items{
            id
            code
          }
        }
      }`
  );

  const f = searchResponse.facets.items.find(
    (f) =>
      f.code ===
      ("code" in facet ? facet.code : slugify(facet.name, SLUGIFY_OPTIONS))
  );

  if (f) {
    return findOrCreateFacetValues(graphQLClient, f.id, facet.values);
  } else {
    const response: {
      createFacet: {
        id: string;
        code: string;
        values: { id: string; code: string }[];
      };
    } = await graphQLClient.request(
      `mutation CreateFacet($input: CreateFacetInput!) {
        createFacet(input: $input) {
            id
            code
            values{
              id
              code
            }
          }
        }`,
      {
        input: {
          code:
            "code" in facet ? facet.code : slugify(facet.name, SLUGIFY_OPTIONS),
          isPrivate: false,
          translations: ["de"].map((lang) => ({
            languageCode: lang,
            name: "name" in facet ? facet.name : facet.code,
          })),
          values: facet.values.map((v) => ({
            code: slugify(v, SLUGIFY_OPTIONS),
            translations: ["de"].map((lang) => ({
              languageCode: lang,
              name: v,
            })),
          })),
        },
      }
    );

    return {
      facetValueIds: response.createFacet.values.map((v) => v.id),
      newFacetValues: response.createFacet.values,
    };
  }
};

export const findOrCreateFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId: string,
  input: string[]
) => {
  const existing = await getFacetValues(graphQLClient, facetId);

  let facetIds: string[] = [];
  const facetsToCreate: string[] = [];

  input.forEach((category) => {
    const c = existing.find(
      (cat) =>
        cat.code.toLocaleLowerCase() === slugify(category, SLUGIFY_OPTIONS)
    );

    if (c) {
      facetIds.push(c.id);
    } else {
      facetsToCreate.push(category);
    }
  });

  const newFacetValues = await createFacetValues(
    graphQLClient,
    facetId,
    facetsToCreate
  );

  return {
    facetValueIds: facetIds.concat(newFacetValues.map((c) => c.id)),
    newFacetValues,
  };
};

export const createProduct = async (
  graphQLClient: GraphQLClient,
  product: Product,
  assetIds: string[],
  facetValueIds: string[]
): Promise<string> => {
  //create product
  const response: {
    createProduct: { id: string };
  } = await graphQLClient.request(
    `mutation CreateProduct($input: CreateProductInput!){
      createProduct(input: $input){
        id
      }
    }`,
    {
      input: {
        featuredAssetId: assetIds[0],
        assetIds,
        facetValueIds,
        translations: ["de"].map((lang) => ({
          languageCode: lang,
          name: product.name,
          slug: slugify(product.name, SLUGIFY_OPTIONS),
          description: product.description,
        })),
        customFields: {
          productRecommendationsEnabled: false,
          groupKey: product.sku,
        },
      },
    }
  );

  return response.createProduct.id;
};

export const updateProduct = async (
  graphQLClient: GraphQLClient,
  productId: string,
  product: Product,
  facetValueIds: string[]
) => {
  return await graphQLClient.request(
    `mutation UpdateProduct($input: UpdateProductInput!){
      updateProduct(input: $input){
        id
      }
    }`,
    {
      input: {
        id: productId,
        enabled: true,
        //assets stay the same
        /*featuredAssetId: null,
        assetIds: [],*/
        facetValueIds,
        translations: ["de"].map((lang) => ({
          languageCode: lang,
          name: product.name,
          slug: slugify(product.name, SLUGIFY_OPTIONS),
          description: product.description,
        })),
        customFields: {
          productRecommendationsEnabled: false,
          groupKey: product.sku,
        },
      },
    }
  );
};

export const getOptionGroupsByProductId = async (
  graphQLClient: GraphQLClient,
  productId: string
): Promise<OptionGroup[]> => {
  const optionGroupsResponse: {
    product: {
      optionGroups: {
        id: string;
        name: string;
        code: string;
        options: { id: string; name: string; code: string }[];
      }[];
    };
  } = await graphQLClient.request(
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

  return optionGroupsResponse.product.optionGroups;
};

export const createOptionGroup = async (
  graphQLClient: GraphQLClient,
  slug: string,
  attribute: AttributeFacet
): Promise<OptionGroup> => {
  const response: {
    createProductOptionGroup: {
      id: string;
      code: string;
      name: string;
      options: { id: string; name: string; code: string }[];
    };
  } = await graphQLClient.request(
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
        translations: ["de"].map((lang) => ({
          languageCode: lang,
          name: attribute.name,
        })),
        options: attribute.values.map((v) => ({
          code: slugify(v, SLUGIFY_OPTIONS),
          translations: ["de"].map((lang) => ({
            languageCode: lang,
            name: v,
          })),
        })),
      },
    }
  );

  return response.createProductOptionGroup;
};

export const assignOptionGroupToProduct = async (
  graphQLClient: GraphQLClient,
  productId: string,
  optionGroupId: string
) => {
  const productOptionGroupAssignmentResponse: {
    addOptionGroupToProduct: { id: string };
  } = await graphQLClient.request(
    `mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!){
      addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId){
        id
      }
    }`,
    {
      productId,
      optionGroupId,
    }
  );
};

export const createProductOptions = async (
  graphQLClient: GraphQLClient,
  optionGroupId: string,
  options: string[]
) => {
  const productOptionGroupCreationResponses = await Promise.all(
    options.map((value) =>
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
            productOptionGroupId: optionGroupId,
            code: slugify(value, SLUGIFY_OPTIONS),
            translations: ["de"].map((lang) => ({
              languageCode: lang,
              name: value,
            })),
          },
        }
      )
    )
  );
};

export const getExistingProductVariants = async (
  graphQLClient: GraphQLClient,
  productId: string
): Promise<{
  variants: {
    id: string;
    sku: string;
    options: { id: string; code: string; name: string; groupId: string }[];
  }[];
  variantSkuToId: { [sku: string]: string };
}> => {
  const existingVariants: {
    product: {
      variants: {
        id: string;
        sku: string;
        options: { id: string; code: string; name: string; groupId: string }[];
      }[];
    };
  } = await graphQLClient.request(
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

  const variantSkuToId: { [sku: string]: string } = {};

  existingVariants.product.variants.forEach((v) => {
    variantSkuToId[v.sku] = v.id;
  });

  return { variants: existingVariants.product.variants, variantSkuToId };
};

export const deleteProductVariants = async (
  graphQLClient: GraphQLClient,
  variantIds: string[]
) => {
  const DeleteVariants = await Promise.all(
    variantIds.map((variantId) =>
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
};

export const createProductVariants = async (
  graphQLClient: GraphQLClient,
  variantCreations: ProductVariantCreation[]
): Promise<{ id: string; sku: string }[]> => {
  const response: {
    createProductVariants: { id: string; sku: string }[];
  } = await graphQLClient.request(
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

  return response.createProductVariants;
};

export const updateProductVariants = async (
  graphQLClient: GraphQLClient,
  variantUpdates: ProductVariantUpdate[]
) => {
  const response: {
    updateProductVariants: { id: string; sku: string }[];
  } = await graphQLClient.request(
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
};

export const updateProductVariantBulkDiscounts = async (
  graphQLClient: GraphQLClient,
  variantBulkDiscounts: {
    productVariantId: string;
    discounts: { quantity: number; price: number }[];
  }[]
) => {
  const UpdateProductVariantsBulkDicounts = await Promise.all(
    variantBulkDiscounts.map(({ productVariantId, discounts }) =>
      graphQLClient.request(
        `mutation UpdateProductVariantBulkDicounts($productVariantId: ID!, $discounts: [BulkDiscountInput!]!){
          updateProductVariantBulkDiscounts(productVariantId: $productVariantId, discounts: $discounts)
        }`,
        {
          productVariantId,
          discounts,
        }
      )
    )
  );
};

export const updateProductCrosssells = async (
  graphQLClient: GraphQLClient,
  crosssells: {
    productId: string;
    productIds: string[];
  }[]
) => {
  const response = await Promise.all(
    crosssells.map(({ productId, productIds }) =>
      graphQLClient.request(
        `mutation UpdateCrossSellingProducts($productId: ID!, $productIds: [ID!]!){
          updateCrossSellingProducts(productId: $productId, productIds: $productIds)
        }`,
        {
          productId,
          productIds,
        }
      )
    )
  );
};

export const updateProductUpsells = async (
  graphQLClient: GraphQLClient,
  upsells: {
    productId: string;
    productIds: string[];
  }[]
) => {
  const response = await Promise.all(
    upsells.map(({ productId, productIds }) =>
      graphQLClient.request(
        `mutation UpdateUpSellingProducts($productId: ID!, $productIds: [ID!]!){
          updateUpSellingProducts(productId: $productId, productIds: $productIds)
        }`,
        {
          productId,
          productIds,
        }
      )
    )
  );
};
