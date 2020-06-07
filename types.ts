export type WoocommerceRecord = {
  ID: string;
  Typ: "simple" | "variable" | "variation";
  Artikelnummer: string;
  Name: string;
  Veröffentlicht: "0" | "1";
  "Ist hervorgehoben?": "0" | "1";
  "Sichtbarkeit im Katalog": "visible" | "invisible";
  Kurzbeschreibung: string;
  Beschreibung: string;
  "Datum, an dem Angebotspreis beginnt": string;
  "Datum, an dem Angebotspreis endet": string;
  Steuerstatus: "taxable";
  Steuerklasse: string;
  "Vorrätig?": "0" | "1";
  Lager: string;
  "Geringe Lagermenge": string;
  "Rückstände erlaubt?": "0" | "1";
  "Nur einzeln verkaufen?": "0" | "1";
  "Gewicht (g)": string;
  "Länge (mm)": string;
  "Breite (mm)": string;
  "Höhe (mm)": string;
  "Kundenbewertungen erlauben?": "0" | "1";
  "Hinweis zum Kauf": string;
  Angebotspreis: string;
  "Regulärer Preis": string;
  Kategorien: string;
  Schlagwörter: string;
  Versandklasse: string;
  Bilder: string;
  Downloadlimit: string;
  "Ablauftage des Downloads": string;
  "Übergeordnetes Produkt": string;
  "Gruppierte Produkte": string;
  Zusatzverkäufe: string;
  "Cross-Sells (Querverkäufe)": string;
  "Externe URL": string;
  "Button-Text": string;
  Position: string;
  "Meta: _min_variation_price": string;
  "Meta: _max_variation_price": string;
  "Meta: _min_price_variation_id": string;
  "Meta: _max_price_variation_id": string;
  "Meta: _min_variation_regular_price": string;
  "Meta: _max_variation_regular_price": string;
  "Meta: _min_regular_price_variation_id": string;
  "Meta: _max_regular_price_variation_id": string;
  "Meta: _yoast_wpseo_primary_product_cat": string;
  "Meta: _feuerschutz_variable_bulk_discount_enabled": "" | "0" | "1";
  "Meta: _feuerschutz_bulk_discount": string;
  "Meta: description": string;
  "Meta: _feuerschutz_min_order_quantity": string;
  [key: string]: string; //for attributes
};

export type AttributeFacet = { name: string; values: string[] };
export type Facet = { code: string; values: string[] };

export type Product = {
  sku: string;
  name: string;
  description: string;
  length: number;
  width: number;
  height: number;
  categories: string[];
  images: string[];
  upsells: string[];
  crosssells: string[];
  order: number;
  attributes: AttributeFacet[];
  facets: Facet[];
  minOrderQuantity: number;
  bulkDiscount: boolean;
  children: ProductVariant[];
};

export type ProductVariant = {
  sku: string;
  price: number;
  images: string[];
  minimumOrderQuantity: number;
  bulkDiscount: { quantity: number; price: number }[];
  attributes: { name: string; value: string }[];
};

export type OptionGroup = {
  id: string;
  name: string;
  code: string;
  options: { id: string; name: string; code: string }[];
};

export type ProductVariantUpdate = {
  id: string;
  translations: { languageCode: string; name: string }[];
  facetValueIds: string[];
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
  productId: string;
  translations: { languageCode: string; name: string }[];
  facetValueIds: string[];
  sku: string;
  price: number;
  taxCategoryId: number;
  optionIds: string[];
  featuredAssetId: string;
  assetIds: string[];
  trackInventory: boolean;
  customFields: {
    bulkDiscountEnabled: boolean;
    minimumOrderQuantity: number;
  };
};
