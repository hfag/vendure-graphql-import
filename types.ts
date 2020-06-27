export type Record = {
  [key: string]: string | number;
};

export type ID = number | string;
export type AttributeFacet = { name: string; values: string[] };
export type LanguageCode = "de" | "fr";

export interface FacetValue {
  id?: ID;
  code: string;
  translations: { languageCode: LanguageCode; name: string }[];
}

export interface Facet {
  id?: ID;
  code: string;
  translations: { languageCode: LanguageCode; name: string }[];
  values: FacetValue[];
}

export type Collection = {
  id?: ID;
  name: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
    description: string;
  }[];
};

export interface Option {
  id?: ID;
  code: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
  }[];
}

export interface OptionGroup {
  id?: ID;
  code: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
  }[];
  options: Option[];
}

export interface ProductPrototype {
  id?: ID;
  sku: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
    slug: string;
    description: string;
  }[];
  length?: number;
  width?: number;
  height?: number;
  order: number;
  //image urls or filenames
  assets: string[];
  upsellsGroupSKUs: ID[];
  crosssellsGroupSKUs: ID[];
  optionGroupCodes: ID[];
  facetValueCodes: string[];
  children: ProductVariantPrototype[];
  childrenOptionCodes: string[];
}

export interface BulkDiscount {
  quantity: number;
  price: number;
}

export interface ProductVariantPrototype {
  sku: string;
  price: number;
  //image urls or filenames
  assets: string[];
  minimumOrderQuantity: number;
  bulkDiscounts: BulkDiscount[];
  facetValueCodes: string[];
  optionCodes: string[];
}

export type ProductVariantUpdate = {
  id: ID;
  translations: { languageCode: string; name: string }[];
  facetValueIds: ID[];
  sku: string;
  price: number;
  taxCategoryId: number;
  //assets stay the same
  /*featuredAssetId: null,
          assetIds: [],*/
  // stockOnHand: null,
  trackInventory: boolean;
  customFields: {
    bulkDiscountEnabled: boolean;
    minimumOrderQuantity: number;
  };
};
export type ProductVariantCreation = {
  productId: ID;
  translations: { languageCode: string; name: string }[];
  facetValueIds: ID[];
  sku: string;
  price: number;
  taxCategoryId: ID;
  optionIds: ID[];
  featuredAssetId: ID;
  assetIds: ID[];
  trackInventory: boolean;
  customFields: {
    bulkDiscountEnabled: boolean;
    minimumOrderQuantity: number;
  };
};
