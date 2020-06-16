import { LanguageCode } from "types";

interface ImportFacet {
  translations: {
    languageCode: LanguageCode;
    name: string;
  }[];
  code: string;
  columnKeys: string[];
}

export const IMPORT_OPTION_GROUPS: ImportFacet[] = [
  {
    translations: [
      { languageCode: "de", name: "Ausführung" },
      { languageCode: "fr", name: "Modèle" },
    ],
    code: "model",
    columnKeys: ["Ausführung", "Ausfuehrung", "Modèle", "Modele"],
  },
  {
    translations: [
      { languageCode: "de", name: "Pfeilrichtung" },
      { languageCode: "fr", name: "Sens de la flèche" },
    ],
    code: "arrow-direction",
    columnKeys: ["Pfeilrichtung", "Sens de la flèche", "Sens de la fleche"],
  },
  {
    translations: [
      { languageCode: "de", name: "Grösse" },
      { languageCode: "fr", name: "Taille" },
    ],
    code: "size",
    columnKeys: ["Grösse", "Produkt Grösse", "Taille"],
  },
  {
    translations: [
      { languageCode: "de", name: "Jahr" },
      { languageCode: "fr", name: "An" },
    ],
    code: "year",
    columnKeys: ["Jahr", "An"],
  },
  {
    translations: [
      { languageCode: "de", name: "Farbe" },
      { languageCode: "fr", name: "Couleur" },
    ],
    code: "color",
    columnKeys: ["Farbe", "Couleur"],
  },
  {
    translations: [
      { languageCode: "de", name: "Format" },
      { languageCode: "fr", name: "Format" },
    ],
    code: "format",
    columnKeys: ["Format"],
  },
  {
    translations: [
      { languageCode: "de", name: "Leuchtdichte" },
      { languageCode: "fr", name: "Luminance" },
    ],
    code: "luminance",
    columnKeys: ["Leuchtdichte_mcd", "Leuchtdichte", "Luminance"],
  },
  {
    translations: [
      { languageCode: "de", name: "Material" },
      { languageCode: "fr", name: "Matériau" },
    ],
    code: "material",
    columnKeys: ["Material", "Produkt Material", "Matériau", "Materiau"],
  },
  {
    translations: [
      { languageCode: "de", name: "Norm" },
      { languageCode: "fr", name: "Norme" },
    ],
    code: "norm",
    columnKeys: ["Norm", "Norme"],
  },
  {
    translations: [
      { languageCode: "de", name: "PSPA Klasse" },
      { languageCode: "fr", name: "PSPA Classe" },
    ],
    code: "pspa-class",
    columnKeys: ["PSPA_Class", "Pspa-klasse"],
  },
  {
    translations: [
      { languageCode: "de", name: "Ursprungsland" },
      { languageCode: "fr", name: "Pays d'origine" },
    ],
    code: "country",
    columnKeys: [
      "Ursprungsland",
      "Produkt Ursprungsland",
      "Pays d'origine",
      "Pays",
    ],
  },
  {
    translations: [
      { languageCode: "de", name: "Druckeigenschaft(-en)" },
      { languageCode: "fr", name: "Propriétés d'impression" },
    ],
    code: "print-property",
    columnKeys: [
      "Eigenschaft_Druck",
      "Produkt Druckeigenschaft(-en)",
      "Propriétés d'impression",
    ],
  },
  {
    translations: [
      { languageCode: "de", name: "Einheit" },
      { languageCode: "fr", name: "Unité" },
    ],
    code: "unit",
    columnKeys: ["Einheit", "Produkt Einheit", "Unité"],
  },
  {
    translations: [
      { languageCode: "de", name: "Symbolnummer" },
      { languageCode: "fr", name: "Numéro de symbole" },
    ],
    code: "symbol-number",
    columnKeys: ["Symbolnummer", "Numéro de symbole"],
  },
  {
    translations: [
      { languageCode: "de", name: "Inhalt" },
      { languageCode: "fr", name: "Contenu" },
    ],
    code: "content",
    columnKeys: ["Inhalt", "Contenu"],
  },
  {
    translations: [
      { languageCode: "de", name: "Variante" },
      { languageCode: "fr", name: "Variante" },
    ],
    code: "variant",
    columnKeys: ["Variante", "Variante"],
  },
];

export const IMPORT_ATTRIBUTE_COLUMNS = {
  id: ["ID", "sku"],
  parentId: ["Parent Product ID", "Produktgruppe_Shop"],
  sku: ["Sku", "Artikel_Nummer_Produkt"],
  language: ["WPML Language Code"],
  translationId: ["WPML Translation ID"],
  name: ["Title"],
  slug: ["Slug"],
  description: ["Content"],
  length: ["Length"],
  width: ["Width"],
  height: ["Height"],
  assets: ["Image URL"],
  upSells: ["Up-Sells"],
  crossSells: ["Cross-Sells"],
  price: ["Einzelpreis", "Price"],
  groupSku: ["Produktgruppe_Shop"],
  minimumOrderQuantity: [
    "Mindestbestellmenge",
    "_feuerschutz_min_purchase_qty",
  ],
  unit:
    IMPORT_OPTION_GROUPS.find((group) => group.code === "unit")?.columnKeys ||
    [],
  quantityPerUnit: ["Stückzahl pro Einheit"],
  bulkDiscounts: ["_feuerschutz_bulk_discount"],
  categories: ["Thema"],
  hierarchicalCategories: ["Produktkategorien"],
  resellerDiscountCategories: ["_Rabattberechtigt"],
};

export const IMPORT_COLUMNS_PREFIXES = {
  bulkDiscount: ["VP Staffel"],
};

// export const parentMappings: {[parentIdColumn: string]: () => {}} : {
//   "Parent Product ID": (record) =>
// }
