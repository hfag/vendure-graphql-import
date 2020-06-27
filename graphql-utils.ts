import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import slugify from "slugify";
import { GraphQLClient, rawRequest } from "graphql-request";
import { DeepRequired } from "ts-essentials";
import { SLUGIFY_OPTIONS } from "./data-utils";
import {
  ProductPrototype,
  OptionGroup,
  Facet,
  ProductVariantCreation,
  ProductVariantUpdate,
  AttributeFacet,
  LanguageCode,
  ID,
  Collection,
  FacetValue,
  Option,
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

export const getCollections = async (
  graphQLClient: GraphQLClient
): Promise<DeepRequired<Collection>[]> => {
  const response: {
    collections: {
      items: {
        id: ID;
        name: string;
        translations: {
          languageCode: LanguageCode;
          name: string;
          description: string;
        }[];
      }[];
    };
  } = await graphQLClient.request(
    `query {
      collections{
        items{
          id
          name
          translations {
            languageCode
            name
            description
          }
        }
      }
    }`
  );

  return response.collections.items;
};

export const getFacets = async (
  graphQLClient: GraphQLClient
): Promise<DeepRequired<Facet>[]> => {
  const response: {
    facets: {
      items: {
        id: ID;
        code: string;
        translations: {
          languageCode: LanguageCode;
          name: string;
        }[];
        values: {
          id: ID;
          code: string;
          translations: {
            languageCode: LanguageCode;
            name: string;
          }[];
        }[];
      }[];
    };
  } = await graphQLClient.request(
    `query {
      facets{
        items{
          id
          code
          translations {
            languageCode
            name
          }
          values{
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    }`
  );

  return response.facets.items;
};

export const createCategoryCollection = async (
  graphQLClient: GraphQLClient,
  collection: {
    translations: {
      languageCode: LanguageCode;
      name: string;
      description?: string;
    }[];
  },
  facetValueIds: ID[],
  isPrivate = false
): Promise<ID> => {
  const response: {
    createCollection: {
      id: string;
      name: string;
    };
  } = await graphQLClient.request(
    `mutation Collections($input: CreateCollectionInput!){
      createCollection(input: $input){
        id
        name
      }
    }`,
    {
      input: {
        isPrivate,
        translations: collection.translations,
        filters: [
          {
            code: "facet-value-filter",
            arguments: [
              {
                name: "facetValueIds",
                type: "facetValueIds",
                value: JSON.stringify(facetValueIds),
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
  );

  return response.createCollection.id;
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

  const skuToProductId: { [sku: string]: ID } = {};
  existing.getProductsByGroupKeys.forEach(
    (p: { id: string; customFields: { groupKey: string } }) => {
      skuToProductId[p.customFields.groupKey] = p.id;
    }
  );

  return skuToProductId;
};

export const getFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId: ID = "1"
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
  facetId: ID = "1",
  values: FacetValue[]
): Promise<DeepRequired<FacetValue>[]> => {
  if (values.length === 0) {
    return [];
  }

  const response: {
    createFacetValues: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
    }[];
  } = await graphQLClient.request(
    `mutation CreateFacetValues($input: [CreateFacetValueInput!]!){
      createFacetValues(input: $input){
        id
        code
        translations{
          languageCode
          name
        }
      }
    }`,
    {
      input: values.map((v) => ({
        facetId,
        code: v.code,
        translations: v.translations,
      })),
    }
  );

  return response.createFacetValues;
};

export const updateFacetValues = async (
  graphQLClient: GraphQLClient,
  values: DeepRequired<FacetValue>[]
): Promise<DeepRequired<FacetValue>[]> => {
  if (values.length === 0) {
    return [];
  }

  const response: {
    updateFacetValues: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
    }[];
  } = await graphQLClient.request(
    `mutation UpdateFacetValues($input: [UpdateFacetValueInput!]!){
      updateFacetValues(input: $input){
        id
        code
        translations{
          languageCode
          name
        }
      }
    }`,
    {
      input: values.map((v) => ({
        id: v.id,
        code: v.code,
        translations: v.translations,
      })),
    }
  );

  return response.updateFacetValues;
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

export const createOrUpdateFacets = async (
  graphQLClient: GraphQLClient,
  facets: Facet[]
): Promise<DeepRequired<Facet>[]> => {
  return Promise.all(
    facets.map(async (f) => {
      let facet: DeepRequired<Facet>;
      if (f.id) {
        facet = await updateFacet(graphQLClient, { ...f, id: f.id });
      } else {
        facet = await createFacet(graphQLClient, f);
      }

      const u: DeepRequired<FacetValue>[] = [];
      const c: FacetValue[] = [];

      f.values.forEach((v) => {
        if (v.id) {
          u.push({ ...v, id: v.id });
        } else {
          c.push(v);
        }
      });

      await Promise.all([
        createFacetValues(graphQLClient, facet.id, c),
        updateFacetValues(graphQLClient, u),
      ]);

      return getFacet(graphQLClient, facet.id);
    })
  );
};

export const getFacet = async (
  graphQLClient: GraphQLClient,
  id: ID
): Promise<DeepRequired<Facet>> => {
  const response: {
    facet: {
      id: ID;
      code: string;
      translations: {
        languageCode: LanguageCode;
        name: string;
      }[];
      values: {
        id: ID;
        code: string;
        translations: {
          languageCode: LanguageCode;
          name: string;
        }[];
      }[];
    };
  } = await graphQLClient.request(
    `query Facet($id: ID!) {
      facet(id: $id){
        id
        code
        translations {
          languageCode
          name
        }
        values{
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    }`,
    { id }
  );

  return response.facet;
};

export const createFacet = async (
  graphQLClient: GraphQLClient,
  facet: {
    code: string;
    translations: { languageCode: LanguageCode; name: string }[];
  },
  isPrivate = false
): Promise<DeepRequired<Facet>> => {
  const response: {
    createFacet: {
      id: ID;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      values: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
    };
  } = await graphQLClient.request(
    `mutation CreateFacet($input: CreateFacetInput!) {
      createFacet(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
          values{
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }`,
    {
      input: {
        code: facet.code,
        isPrivate,
        translations: facet.translations,
      },
    }
  );

  return response.createFacet;
};

export const updateFacet = async (
  graphQLClient: GraphQLClient,
  facet: {
    id: ID;
    code: string;
    translations: { languageCode: LanguageCode; name: string }[];
  },
  isPrivate = false
): Promise<DeepRequired<Facet>> => {
  const response: {
    updateFacet: {
      id: ID;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      values: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
    };
  } = await graphQLClient.request(
    `mutation UpdateFacet($input: UpdateFacetInput!) {
      updateFacet(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
          values{
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }`,
    {
      input: {
        id: facet.id,
        code: facet.code,
        isPrivate,
        translations: facet.translations,
      },
    }
  );

  return response.updateFacet;
};

export const findOrCreateFacet = async (
  graphQLClient: GraphQLClient,
  facet: Facet,
  isPrivate = false
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

  const f = searchResponse.facets.items.find((f) => f.code === facet.code);

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
          code: facet.code,
          isPrivate,
          translations: facet.translations,
          values: facet.values.map((v) => ({
            code: v.code,
            translations: v.translations,
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
  facetId: ID,
  values: FacetValue[]
) => {
  const existing = await getFacetValues(graphQLClient, facetId);

  let facetIds: ID[] = [];
  const facetsToCreate: FacetValue[] = [];

  values.forEach((value) => {
    const c = existing.find(
      (cat) => cat.code.toLocaleLowerCase() === value.code
    );

    if (c) {
      facetIds.push(c.id);
    } else {
      facetsToCreate.push(value);
    }
  });

  const newFacetValues = await createFacetValues(
    graphQLClient,
    facetId,
    facetsToCreate
  );

  return {
    facetValueIds: facetIds.concat(newFacetValues.map((v) => v.id)),
    newFacetValues,
  };
};

export const createProduct = async (
  graphQLClient: GraphQLClient,
  endpoint: string,
  token: string,
  product: ProductPrototype,
  facetValueCodeToId: { [code: string]: ID }
): Promise<ID> => {
  const assetIds = await findOrCreateAssets(
    graphQLClient,
    endpoint,
    token,
    product.assets
  );

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
        assetIds: assetIds,
        facetValueIds: product.facetValueCodes.map(
          (code) => facetValueCodeToId[code]
        ),
        translations: product.translations,
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
  product: Required<ProductPrototype>,
  facetValueCodeToId: { [code: string]: ID }
) => {
  return await graphQLClient.request(
    `mutation UpdateProduct($input: UpdateProductInput!){
      updateProduct(input: $input){
        id
      }
    }`,
    {
      input: {
        id: product.id,
        enabled: true,
        //assets stay the same
        /*featuredAssetId: null,
        assetIds: [],*/
        facetValueIds: product.facetValueCodes.map(
          (code) => facetValueCodeToId[code]
        ),
        translations: product.translations,
        customFields: {
          productRecommendationsEnabled: false,
          groupKey: product.sku,
        },
      },
    }
  );
};

export const getOptionGroups = async (
  graphQLClient: GraphQLClient
): Promise<DeepRequired<OptionGroup>[]> => {
  const optionGroupsResponse: {
    productOptionGroups: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      options: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
    }[];
  } = await graphQLClient.request(
    `query {
      productOptionGroups{
        id
        code
        translations {
          languageCode
          name
        }
        options{
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    }`
  );

  return optionGroupsResponse.productOptionGroups;
};

export const getOptionGroupsByProductId = async (
  graphQLClient: GraphQLClient,
  productId: string
): Promise<Required<OptionGroup>[]> => {
  const optionGroupsResponse: {
    product: {
      optionGroups: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
        options: {
          id: string;
          code: string;
          translations: { languageCode: LanguageCode; name: string }[];
        }[];
      }[];
    };
  } = await graphQLClient.request(
    `query optionGroups($productId: ID!){
      product(id: $productId){
        optionGroups{
          id
          code
          translations {
            languageCode
            name
          }
          options{
            id
            code
            translations {
              languageCode
              name
            }
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

export const createOrUpdateOptionGroups = async (
  graphQLClient: GraphQLClient,
  optionGroups: OptionGroup[]
): Promise<DeepRequired<OptionGroup>[]> => {
  return Promise.all(
    optionGroups.map(async (g) => {
      let group: DeepRequired<OptionGroup>;
      if (g.id) {
        group = await updateOptionGroup(graphQLClient, { ...g, id: g.id });
      } else {
        group = await createOptionGroup(graphQLClient, g);
      }

      const u: DeepRequired<Option>[] = [];
      const c: Option[] = [];

      g.options.forEach((o) => {
        if (o.id) {
          return u.push({ ...o, id: o.id });
        } else {
          c.push(o);
        }
      });

      await Promise.all([
        updateProductOptions(graphQLClient, group.id, u),
        createProductOptions(graphQLClient, group.id, c),
      ]);

      return getOptionGroup(graphQLClient, group.id);
    })
  );
};

export const getOptionGroup = async (
  graphQLClient: GraphQLClient,
  id: ID
): Promise<DeepRequired<OptionGroup>> => {
  const optionGroupsResponse: {
    productOptionGroup: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      options: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
    };
  } = await graphQLClient.request(
    `query ProductOptionGroup(id: ID!){
      productOptionGroup(id: $id){
        id
        code
        translations {
          languageCode
          name
        }
        options{
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    }`,
    { id }
  );

  return optionGroupsResponse.productOptionGroup;
};

export const createOptionGroup = async (
  graphQLClient: GraphQLClient,
  optionGroup: {
    code: string;
    translations: { languageCode: LanguageCode; name: string }[];
  }
): Promise<DeepRequired<OptionGroup>> => {
  const response: {
    createProductOptionGroup: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      options: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
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
        code: optionGroup.code,
        translations: optionGroup.translations,
        options: [],
      },
    }
  );

  return response.createProductOptionGroup;
};

export const updateOptionGroup = async (
  graphQLClient: GraphQLClient,
  optionGroup: {
    id: ID;
    code: string;
    translations: { languageCode: LanguageCode; name: string }[];
  }
): Promise<DeepRequired<OptionGroup>> => {
  const response: {
    updateProductOptionGroup: {
      id: string;
      code: string;
      translations: { languageCode: LanguageCode; name: string }[];
      options: {
        id: string;
        code: string;
        translations: { languageCode: LanguageCode; name: string }[];
      }[];
    };
  } = await graphQLClient.request(
    `mutation UpdateProductOptionGroup($input: UpdateProductOptionGroupInput!){
      updateProductOptionGroup(input: $input){
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
        id: optionGroup.id,
        code: optionGroup.code,
        translations: optionGroup.translations,
      },
    }
  );

  return response.updateProductOptionGroup;
};

export const assignOptionGroupToProduct = async (
  graphQLClient: GraphQLClient,
  productId: ID,
  optionGroupId: ID
) => {
  const productOptionGroupAssignmentResponse: {
    addOptionGroupToProduct: { id: ID };
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
  optionGroupId: ID,
  options: Option[]
): Promise<DeepRequired<Option>[]> => {
  return Promise.all(
    options.map(async (option) => {
      const response: {
        createProductOption: {
          id: ID;
          code: string;
          translations: { languageCode: LanguageCode; name: string }[];
        };
      } = await graphQLClient.request(
        `mutation CreateProductOption($input: CreateProductOptionInput!){
            createProductOption(input: $input){
              id
              code
              translations {
                languageCode
                name
              }
            }
          }`,
        {
          input: {
            productOptionGroupId: optionGroupId,
            code: option.code,
            translations: option.translations,
          },
        }
      );

      return response.createProductOption;
    })
  );
};

export const updateProductOptions = async (
  graphQLClient: GraphQLClient,
  optionGroupId: ID,
  options: DeepRequired<Option>[]
): Promise<DeepRequired<Option>[]> => {
  return Promise.all(
    options.map(async (option) => {
      const response: {
        updateProductOption: {
          id: ID;
          code: string;
          translations: { languageCode: LanguageCode; name: string }[];
        };
      } = await graphQLClient.request(
        `mutation UpdateProductOption($input: UpdateProductOptionInput!){
            updateProductOption(input: $input){
              id
              code
              translations {
                languageCode
                name
              }
            }
          }`,
        {
          input: {
            id: option.id,
            productOptionGroupId: optionGroupId,
            code: option.code,
            translations: option.translations,
          },
        }
      );

      return response.updateProductOption;
    })
  );
};

export const getExistingProductVariants = async (
  graphQLClient: GraphQLClient,
  productId: ID
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
    productId: ID;
    productIds: ID[];
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
    productId: ID;
    productIds: ID[];
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
