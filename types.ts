import { LanguageCode, ProductOptionGroup, Scalars } from "./schema";

export type Record = {
  [key: string]: string | number;
};

export type ID = Scalars["ID"];

export type Unpacked<T> = T extends (infer U)[] ? U : T;

export interface TranslationPrototype {
  id?: ID;
  languageCode: LanguageCode;
  name: string;
}

export interface FacetValuePrototype {
  id?: ID;
  code: string;
  translations: TranslationPrototype[];
}

export interface FacetPrototype {
  id?: ID;
  code: string;
  translations: TranslationPrototype[];
  values: FacetValuePrototype[];
}

export interface OptionPrototype {
  id?: ID;
  code: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
  }[];
}

export interface OptionGroupPrototype {
  id?: ID;
  code: string;
  translations: {
    languageCode: LanguageCode;
    name: string;
  }[];
  options: OptionPrototype[];
}

export interface ProductPrototype {
  id?: ID;
  previousIds: ID[];
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
  optionGroups: OptionGroupPrototype[];
  facetValueCodes: string[];
  children: ProductVariantPrototype[];
}

export interface ProductVariantPrototype {
  sku: string;
  price: number;
  //image urls or filenames
  assets: string[];
  minimumOrderQuantity: number;
  bulkDiscounts: BulkDiscount[];
  facetValueCodes: string[];
  optionCodes: [string, string][];
}

export interface BulkDiscount {
  quantity: number;
  price: number;
}
