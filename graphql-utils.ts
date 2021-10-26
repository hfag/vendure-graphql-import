import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import slugify from "slugify";
import { GraphQLClient, rawRequest } from "graphql-request";
import { SLUGIFY_OPTIONS } from "./data-utils";
import {
  downloadFiles,
  cleanDownloads,
  getFilenameFromUrl,
  isValidUrl,
} from "./utils";
import {
  Asset,
  BulkDiscountUpdate,
  Collection,
  CollectionList,
  CreateAssetResult,
  CreateCollectionInput,
  CreateFacetInput,
  CreateFacetValueInput,
  CreateProductOptionGroupInput,
  CreateProductOptionInput,
  CreateProductVariantInput,
  Facet,
  FacetList,
  FacetValue,
  LanguageCode,
  Maybe,
  Mutation,
  Product,
  ProductOption,
  ProductOptionGroup,
  ProductVariant,
  Query,
  UpdateFacetInput,
  UpdateProductInput,
  UpdateProductOptionGroupInput,
  UpdateProductOptionInput,
  UpdateProductVariantInput,
} from "./schema";
import {
  FacetPrototype,
  FacetValuePrototype,
  ID,
  OptionGroupPrototype,
  OptionPrototype,
  ProductPrototype,
} from "./types";

export const uploadFilesToGraphql = async (
  endpoint: string,
  authenticationToken: string,
  filepaths: string[]
): Promise<Asset[]> => {
  const body = new FormData();

  body.append(
    "operations",
    JSON.stringify({
      query: /* GraphQL */ `
        mutation CreateAssets($input: [CreateAssetInput!]!) {
          createAssets(input: $input) {
            ... on Asset {
              id
              name
            }
            ... on MimeTypeError {
              errorCode
              message
            }
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

  const results: {
    data: { createAssets: Mutation["createAssets"] };
  } = await fetch(endpoint, {
    method: "POST",
    body,
    headers: { Authorization: "Bearer " + authenticationToken },
  }).then((r) => r.json());

  const assets: Asset[] = [];

  results.data.createAssets.forEach((result) => {
    if ("id" in result) {
      assets.push(result);
    } else {
      throw new Error(
        `Error Code: ${result.errorCode}. Message: ${result.message}`
      );
    }
  });

  return assets;
};

export const assertAuthentication = async (
  endpoint: string,
  username: string,
  password: string
) => {
  const login = await rawRequest(
    endpoint,
    /* GraphQL */ `
      mutation Login($username: String!, $password: String!) {
        login(username: $username, password: $password) {
          ... on CurrentUser {
            identifier
          }
          ... on InvalidCredentialsError {
            errorCode
            message
          }
          ... on NativeAuthStrategyError {
            errorCode
            message
          }
        }
      }
    `,
    {
      username,
      password,
    }
  );

  const token = login.headers.get("vendure-auth-token");

  if (
    (login.errors && login.errors.length > 0) ||
    //@ts-ignore
    login?.data?.login?.errorCode ||
    token === null
  ) {
    console.log("Authentifikation fehlgeschlagen!");
    console.error(login.errors);
    //@ts-ignore
    console.error(login?.data?.login?.errorCode);
    //@ts-ignore
    console.error(login?.data?.login?.message);
    process.exit(0);
  }

  return token;
};

export const getCollections = async (
  graphQLClient: GraphQLClient
): Promise<Collection[]> => {
  const response: {
    collections: Query["collections"];
  } = await graphQLClient.request(/* GraphQL */ `
    query {
      collections {
        items {
          id
          name
          translations {
            languageCode
            name
            description
            slug
          }
        }
      }
    }
  `);

  return response.collections.items;
};

export const getFacets = async (
  graphQLClient: GraphQLClient
): Promise<Facet[]> => {
  const response: {
    facets: Query["facets"];
  } = await graphQLClient.request(/* GraphQL */ `
    query {
      facets {
        items {
          id
          code
          translations {
            languageCode
            name
          }
          values {
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    }
  `);

  return response.facets.items;
};

export const createCategoryCollection = async (
  graphQLClient: GraphQLClient,
  collection: {
    translations: {
      languageCode: LanguageCode;
      name: string;
      description: string;
      slug: string;
    }[];
  },
  facetValueIds: ID[],
  isPrivate = false
): Promise<ID> => {
  const input: CreateCollectionInput = {
    parentId: "1",
    isPrivate,
    translations: collection.translations,
    filters: [
      {
        code: "facet-value-filter",
        arguments: [
          {
            name: "facetValueIds",
            value: JSON.stringify(facetValueIds),
          },
          {
            name: "containsAny",
            value: "false",
          },
        ],
      },
    ],
  };

  const response: {
    createCollection: Mutation["createCollection"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation CreateCollection($input: CreateCollectionInput!) {
        createCollection(input: $input) {
          id
          name
        }
      }
    `,
    {
      input,
    }
  );

  return response.createCollection.id;
};

export const getExistingProducts = async (
  graphQLClient: GraphQLClient,
  productGroupKeys: string[]
) => {
  const existing: {
    getProductsByGroupKeys: Product[];
  } = await graphQLClient.request(
    /* GraphQL */ `
      query GetProductsByGroupKeys($productGroupKeys: [String!]!) {
        getProductsByGroupKeys(productGroupKeys: $productGroupKeys) {
          id
          customFields {
            groupKey
          }
        }
      }
    `,
    { productGroupKeys }
  );

  const skuToProductId: { [sku: string]: ID } = {};
  existing.getProductsByGroupKeys.forEach((p) => {
    if (p.customFields && p.customFields.groupKey) {
      skuToProductId[p.customFields.groupKey] = p.id;
    } else {
      throw new Error(
        `customFields.groupKey is undefined for product with the id ${p.id}`
      );
    }
  });

  return skuToProductId;
};

export const getFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId: ID = "1"
) => {
  const response: {
    facet: Facet;
  } = await graphQLClient.request(
    /* GraphQL */ `
      query Facet($id: ID!) {
        facet(id: $id) {
          id
          values {
            id
            name
            code
          }
        }
      }
    `,
    { id: facetId }
  );

  return response.facet.values;
};

export const createFacetValues = async (
  graphQLClient: GraphQLClient,
  facetId: ID = "1",
  values: FacetValuePrototype[]
): Promise<FacetValue[]> => {
  if (values.length === 0) {
    return [];
  }

  const input: CreateFacetValueInput[] = values.map((v) => ({
    facetId,
    code: v.code,
    translations: v.translations,
  }));

  const response: {
    createFacetValues: Mutation["createFacetValues"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation CreateFacetValues($input: [CreateFacetValueInput!]!) {
        createFacetValues(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    `,
    {
      input,
    }
  );

  return response.createFacetValues;
};

export const updateFacetValues = async (
  graphQLClient: GraphQLClient,
  values: (FacetValuePrototype & { id: ID })[]
): Promise<FacetValue[]> => {
  if (values.length === 0) {
    return [];
  }

  const input: UpdateFacetInput[] = values.map((v) => ({
    id: v.id,
    code: v.code,
    translations: v.translations,
  }));

  const response: {
    updateFacetValues: Mutation["updateFacetValues"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateFacetValues($input: [UpdateFacetValueInput!]!) {
        updateFacetValues(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    `,
    {
      input,
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
    console.error(
      `[${invalid.join(
        ", "
      )}] wurden nicht hochgeladen und sind auch keine gültigen URLs!`
    );
  }

  const downloads = await downloadFiles(unmatched.filter(isValidUrl));

  // console.log(
  //   `${downloads.length} von ${unmatched.length} Bilder heruntergeladen. Lade sie nun hoch...`
  // );
  const uploadResponse = await uploadFilesToGraphql(endpoint, token, downloads);

  cleanDownloads();

  return [...Object.values(assetIdsByName), ...uploadResponse.map((a) => a.id)];
};

export const getAssetsIdByName = async (
  graphQLClient: GraphQLClient,
  names: string[]
): Promise<{ [key: string]: string }> => {
  const mappings = await Promise.all(
    names.map(async (name) => {
      const value: {
        assetByName: Query["assetByName"];
      } = await graphQLClient.request(
        /* GraphQL */ `
          query AssetByName($name: String!) {
            assetByName(name: $name) {
              id
            }
          }
        `,
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
  facets: FacetPrototype[]
): Promise<Facet[]> => {
  return Promise.all(
    facets.map(async (f) => {
      let facet: Facet;
      if (f.id) {
        facet = await updateFacet(graphQLClient, { ...f, id: f.id });
      } else {
        facet = await createFacet(graphQLClient, f);
      }

      const u: (FacetValuePrototype & { id: ID })[] = [];
      const c: FacetValuePrototype[] = [];

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

      return assertGetFacet(graphQLClient, facet.id);
    })
  );
};

export const assertGetFacet = async (
  graphQLClient: GraphQLClient,
  id: ID
): Promise<Facet> => {
  const response: { facet: Query["facet"] } = await graphQLClient.request(
    /* GraphQL */ `
      query Facet($id: ID!) {
        facet(id: $id) {
          id
          code
          translations {
            languageCode
            name
          }
          values {
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    `,
    { id }
  );

  if (!response.facet) {
    throw new Error(`The facet with id ${id} does not exist!`);
  }

  return response.facet;
};

export const createFacet = async (
  graphQLClient: GraphQLClient,
  facet: FacetPrototype,
  isPrivate = false
): Promise<Facet> => {
  const input: CreateFacetInput = {
    code: facet.code,
    isPrivate,
    translations: facet.translations,
  };

  const response: {
    createFacet: Mutation["createFacet"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation CreateFacet($input: CreateFacetInput!) {
        createFacet(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
          values {
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    `,
    {
      input,
    }
  );

  return response.createFacet;
};

export const updateFacet = async (
  graphQLClient: GraphQLClient,
  facet: FacetPrototype & { id: ID },
  isPrivate = false
): Promise<Facet> => {
  const input: UpdateFacetInput = {
    id: facet.id,
    code: facet.code,
    isPrivate,
    translations: facet.translations,
  };

  const response: {
    updateFacet: Mutation["updateFacet"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateFacet($input: UpdateFacetInput!) {
        updateFacet(input: $input) {
          id
          code
          translations {
            languageCode
            name
          }
          values {
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    `,
    {
      input,
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
    facets: Query["facets"];
  } = await graphQLClient.request(/* GraphQL */ `
    query {
      facets {
        items {
          id
          code
        }
      }
    }
  `);

  const f = searchResponse.facets.items.find(
    (f: Facet) => f.code === facet.code
  );

  if (f) {
    return findOrCreateFacetValues(graphQLClient, f.id, facet.values);
  } else {
    const input: CreateFacetInput = {
      code: facet.code,
      isPrivate,
      translations: facet.translations,
      values: facet.values.map((v) => ({
        code: v.code,
        translations: v.translations,
      })),
    };

    const response: {
      createFacet: Mutation["createFacet"];
    } = await graphQLClient.request(
      /* GraphQL */ `
        mutation CreateFacet($input: CreateFacetInput!) {
          createFacet(input: $input) {
            id
            code
            values {
              id
              code
            }
          }
        }
      `,
      {
        input,
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
    const c = existing.find((cat) => cat.code.toLowerCase() === value.code);

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
    /* GraphQL */ `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        featuredAssetId: assetIds[0],
        assetIds: assetIds,
        facetValueIds: product.facetValueCodes.map((code) => {
          if (!(code in facetValueCodeToId)) {
            throw new Error(
              `Es wurde keine ID für ${code} in [${Object.keys(
                facetValueCodeToId
              ).join(", ")}] grefunden!`
            );
          }

          return facetValueCodeToId[code];
        }),
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
  product: ProductPrototype & { id: ID },
  facetValueCodeToId: { [code: string]: ID }
): Promise<Product> => {
  const input: UpdateProductInput = {
    id: product.id,
    enabled: true,
    //assets stay the same
    /*featuredAssetId: null,
    assetIds: [],
    facetValueIds: product.facetValueCodes.map((code) => {
      if (!(code in facetValueCodeToId)) {
        throw new Error(
          `Es wurde keine ID für ${code} in [${Object.keys(
            facetValueCodeToId
          ).join(", ")}] grefunden!`
        );
      }

      return facetValueCodeToId[code];
    }),*/
    // translations: product.translations,
    customFields: {
      productRecommendationsEnabled: false,
      groupKey: product.sku,
    },
  };

  const response: {
    updateProduct: Mutation["updateProduct"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateProduct($input: UpdateProductInput!) {
        updateProduct(input: $input) {
          id
        }
      }
    `,
    {
      input,
    }
  );

  return response.updateProduct;
};

export const getOptionGroups = async (
  graphQLClient: GraphQLClient
): Promise<ProductOptionGroup[]> => {
  const optionGroupsResponse: {
    productOptionGroups: Query["productOptionGroups"];
  } = await graphQLClient.request(/* GraphQL */ `
    query {
      productOptionGroups {
        id
        code
        translations {
          languageCode
          name
        }
        options {
          id
          code
          translations {
            languageCode
            name
          }
        }
      }
    }
  `);

  return optionGroupsResponse.productOptionGroups;
};

export const getOptionGroupsByProductId = async (
  graphQLClient: GraphQLClient,
  productId: ID
): Promise<ProductOptionGroup[]> => {
  const optionGroupsResponse: {
    product: Query["product"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      query optionGroups($productId: ID!) {
        product(id: $productId) {
          optionGroups {
            id
            code
            translations {
              languageCode
              name
            }
            options {
              id
              code
              translations {
                languageCode
                name
              }
            }
          }
        }
      }
    `,
    {
      productId,
    }
  );

  if (!optionGroupsResponse.product) {
    throw new Error(
      `Produkt mit der Id ${productId} konnte nicht gefunden werden!`
    );
  }

  return optionGroupsResponse.product.optionGroups;
};

export const createOrUpdateOptionGroups = async (
  graphQLClient: GraphQLClient,
  optionGroups: OptionGroupPrototype[],
  productId: ID
): Promise<ProductOptionGroup[]> => {
  const existingOptionGroups = await getOptionGroupsByProductId(
    graphQLClient,
    productId
  );

  const response: ProductOptionGroup[] = [];

  let deletedVariants = false;

  for (const g of optionGroups) {
    let group: ProductOptionGroup;
    const existingGroup = existingOptionGroups.find((gr) => gr.code === g.code);

    if (existingGroup) {
      group = await updateOptionGroup(graphQLClient, {
        ...g,
        id: existingGroup.id,
      });
    } else {
      if (!deletedVariants) {
        //since we have to create a new option group, all existing variants have to be deleted
        const variantIds = (
          await getExistingProductVariants(graphQLClient, productId)
        ).variants.map((v) => v.id);

        if (variantIds.length > 0) {
          await deleteProductVariants(graphQLClient, variantIds);
        }
        deletedVariants = true;
      }
      group = await createOptionGroup(graphQLClient, g);
      await assignOptionGroupToProduct(graphQLClient, productId, group.id);
    }

    const u: (OptionPrototype & { id: ID })[] = [];
    const c: OptionPrototype[] = [];

    g.options.forEach((option) => {
      const existingOption = group.options.find((o) => o.code === option.code);

      if (existingOption) {
        return u.push({ ...option, id: existingOption.id });
      } else {
        c.push(option);
      }
    });

    await Promise.all([
      updateProductOptions(graphQLClient, u),
      createProductOptions(graphQLClient, group.id, c),
    ]);

    response.push(await getOptionGroup(graphQLClient, group.id));
  }

  return response;
};

export const getOptionGroup = async (
  graphQLClient: GraphQLClient,
  id: ID
): Promise<ProductOptionGroup> => {
  const optionGroupsResponse: {
    productOptionGroup: Query["productOptionGroup"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      query ProductOptionGroup($id: ID!) {
        productOptionGroup(id: $id) {
          id
          code
          translations {
            languageCode
            name
          }
          options {
            id
            code
            translations {
              languageCode
              name
            }
          }
        }
      }
    `,
    { id }
  );

  if (!optionGroupsResponse.productOptionGroup) {
    throw new Error(
      `Produkt Optionsgruppe mit der Id ${id} konnte nicht gefunden werden!`
    );
  }

  return optionGroupsResponse.productOptionGroup;
};

export const createOptionGroup = async (
  graphQLClient: GraphQLClient,
  optionGroup: {
    code: string;
    translations: { languageCode: LanguageCode; name: string }[];
  }
): Promise<ProductOptionGroup> => {
  const input: CreateProductOptionGroupInput = {
    code: optionGroup.code,
    translations: optionGroup.translations,
    options: [],
  };

  const response: {
    createProductOptionGroup: Mutation["createProductOptionGroup"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation CreateProductOptionGroup(
        $input: CreateProductOptionGroupInput!
      ) {
        createProductOptionGroup(input: $input) {
          id
          code
          name
          options {
            id
            name
            code
          }
        }
      }
    `,
    {
      input,
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
): Promise<ProductOptionGroup> => {
  const input: UpdateProductOptionGroupInput = {
    id: optionGroup.id,
    code: optionGroup.code,
    translations: optionGroup.translations,
  };

  const response: {
    updateProductOptionGroup: Mutation["updateProductOptionGroup"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateProductOptionGroup(
        $input: UpdateProductOptionGroupInput!
      ) {
        updateProductOptionGroup(input: $input) {
          id
          code
          name
          options {
            id
            name
            code
          }
        }
      }
    `,
    {
      input,
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
    addOptionGroupToProduct: Mutation["addOptionGroupToProduct"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {
        addOptionGroupToProduct(
          productId: $productId
          optionGroupId: $optionGroupId
        ) {
          id
          optionGroups {
            id
          }
        }
      }
    `,
    {
      productId,
      optionGroupId,
    }
  );
};

export const createProductOptions = async (
  graphQLClient: GraphQLClient,
  optionGroupId: ID,
  options: OptionPrototype[]
): Promise<ProductOption[]> => {
  return Promise.all(
    options.map(async (option) => {
      const input: CreateProductOptionInput = {
        productOptionGroupId: optionGroupId,
        code: option.code,
        translations: option.translations,
      };

      const response: {
        createProductOption: Mutation["createProductOption"];
      } = await graphQLClient.request(
        /* GraphQL */ `
          mutation CreateProductOption($input: CreateProductOptionInput!) {
            createProductOption(input: $input) {
              id
              code
              translations {
                languageCode
                name
              }
            }
          }
        `,
        {
          input,
        }
      );

      return response.createProductOption;
    })
  );
};

export const updateProductOptions = async (
  graphQLClient: GraphQLClient,
  options: (OptionPrototype & { id: ID })[]
): Promise<ProductOption[]> => {
  return Promise.all(
    options.map(async (option) => {
      const input: UpdateProductOptionInput = {
        id: option.id,
        code: option.code,
        translations: option.translations,
      };

      const response: {
        updateProductOption: Mutation["updateProductOption"];
      } = await graphQLClient.request(
        /* GraphQL */ `
          mutation UpdateProductOption($input: UpdateProductOptionInput!) {
            updateProductOption(input: $input) {
              id
              code
              translations {
                languageCode
                name
              }
            }
          }
        `,
        {
          input,
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
    assetIds: ID[];
  }[];
  variantSkuToId: { [sku: string]: string };
}> => {
  const existingVariants: {
    product: Query["product"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      query ProductVariants($id: ID!) {
        product(id: $id) {
          variants {
            id
            sku
            options {
              id
              code
              name
              groupId
            }
            assets {
              id
            }
          }
        }
      }
    `,
    { id: productId }
  );

  if (!existingVariants.product) {
    throw new Error(
      `Produkt mit der ID ${productId} konnte nicht gefunden werden!`
    );
  }

  const variantSkuToId: { [sku: string]: string } = {};

  existingVariants.product.variants.forEach((v) => {
    variantSkuToId[v.sku] = v.id;
  });

  return {
    variants: existingVariants.product.variants.map((v) => ({
      ...v,
      assetIds: v.assets.map((a) => a.id),
    })),
    variantSkuToId,
  };
};

export const deleteProductVariants = async (
  graphQLClient: GraphQLClient,
  variantIds: string[]
) => {
  const DeleteVariants = await Promise.all(
    variantIds.map((variantId) => {
      const response: Promise<{
        deleteProductVariant: Mutation["deleteProductVariant"];
      }> = graphQLClient.request(
        /* GraphQL */ `
          mutation DeleteProductVariant($id: ID!) {
            deleteProductVariant(id: $id) {
              result
              message
            }
          }
        `,
        {
          id: variantId,
        }
      );

      return response;
    })
  );
};

export const createProductVariants = async (
  graphQLClient: GraphQLClient,
  variantCreations: CreateProductVariantInput[]
): Promise<ProductVariant[]> => {
  const response: {
    createProductVariants: Mutation["createProductVariants"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) {
          id
          sku
        }
      }
    `,
    {
      input: variantCreations,
    }
  );

  const variants: ProductVariant[] = [];

  response.createProductVariants.forEach((v) => {
    if (v) {
      variants.push(v);
    } else {
      throw new Error(
        `Fehler: Es konnten nicht alle Produktvarianten erstellt werden.`
      );
    }
  });

  return variants;
};

export const updateProductVariants = async (
  graphQLClient: GraphQLClient,
  variantUpdates: UpdateProductVariantInput[]
) => {
  const response: {
    updateProductVariants: Mutation["updateProductVariants"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!) {
        updateProductVariants(input: $input) {
          id
          sku
        }
      }
    `,
    {
      input: variantUpdates,
    }
  );

  return response.updateProductVariants;
};

export const updateBulkDiscounts = async (
  graphQLClient: GraphQLClient,
  bulkDiscounts: BulkDiscountUpdate[]
) => {

  const request: {
    updateProductVariantBulkDiscounts: Mutation["updateBulkDiscounts"];
  } = await graphQLClient.request(
    /* GraphQL */ `
      mutation UpdateBulkDiscounts(
        $updates: [BulkDiscountUpdate!]!
      ) {
        updateBulkDiscounts(updates: $updates)
      }
    `,
    {
      updates: bulkDiscounts,
    }
  );

  return request.updateProductVariantBulkDiscounts;
};

export const updateProductCrosssells = async (
  graphQLClient: GraphQLClient,
  crosssells: {
    productId: ID;
    productIds: ID[];
  }[]
) => {
  const response = await Promise.all(
    crosssells.map(({ productId, productIds }) => {
      const request: Promise<{
        updateCrossSellingProducts: Mutation["updateCrossSellingProducts"];
      }> = graphQLClient.request(
        /* GraphQL */ `
          mutation UpdateCrossSellingProducts(
            $productId: ID!
            $productIds: [ID!]!
          ) {
            updateCrossSellingProducts(
              productId: $productId
              productIds: $productIds
            )
          }
        `,
        {
          productId,
          productIds,
        }
      );

      return request;
    })
  );

  return response;
};

export const updateProductUpsells = async (
  graphQLClient: GraphQLClient,
  upsells: {
    productId: ID;
    productIds: ID[];
  }[]
) => {
  const response = await Promise.all(
    upsells.map(({ productId, productIds }) => {
      const request: Promise<{
        updateUpSellingProducts: Mutation["updateUpSellingProducts"];
      }> = graphQLClient.request(
        /* GraphQL */ `
          mutation UpdateUpSellingProducts(
            $productId: ID!
            $productIds: [ID!]!
          ) {
            updateUpSellingProducts(
              productId: $productId
              productIds: $productIds
            )
          }
        `,
        {
          productId,
          productIds,
        }
      );

      return request;
    })
  );

  return response;
};
