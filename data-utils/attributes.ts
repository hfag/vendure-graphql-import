import { LanguageCode } from "../schema";

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
      { languageCode: LanguageCode.De, name: "Ausführung" },
      { languageCode: LanguageCode.Fr, name: "Modèle" },
    ],
    code: "model",
    columnKeys: ["Ausführung", "Ausfuehrung", "Modèle", "Modele"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Pfeilrichtung" },
      { languageCode: LanguageCode.Fr, name: "Sens de la flèche" },
    ],
    code: "arrow-direction",
    columnKeys: ["Pfeilrichtung", "Sens de la flèche", "Sens de la fleche"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Grösse" },
      { languageCode: LanguageCode.Fr, name: "Taille" },
    ],
    code: "size",
    columnKeys: ["Grösse", "Produkt Grösse", "Taille"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Jahr" },
      { languageCode: LanguageCode.Fr, name: "An" },
    ],
    code: "year",
    columnKeys: ["Jahr", "An"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Farbe" },
      { languageCode: LanguageCode.Fr, name: "Couleur" },
    ],
    code: "color",
    columnKeys: ["Farbe", "Couleur"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Format" },
      { languageCode: LanguageCode.Fr, name: "Format" },
    ],
    code: "format",
    columnKeys: ["Format"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Leuchtdichte" },
      { languageCode: LanguageCode.Fr, name: "Luminance" },
    ],
    code: "luminance",
    columnKeys: ["Leuchtdichte_mcd", "Leuchtdichte", "Luminance"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Material" },
      { languageCode: LanguageCode.Fr, name: "Matériau" },
    ],
    code: "material",
    columnKeys: ["Material", "Produkt Material", "Matériau", "Materiau"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Norm" },
      { languageCode: LanguageCode.Fr, name: "Norme" },
    ],
    code: "norm",
    columnKeys: ["Norm", "Norme"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "PSPA Klasse" },
      { languageCode: LanguageCode.Fr, name: "PSPA Classe" },
    ],
    code: "pspa-class",
    columnKeys: ["PSPA_Class", "Pspa-klasse"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Ursprungsland" },
      { languageCode: LanguageCode.Fr, name: "Pays d'origine" },
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
      { languageCode: LanguageCode.De, name: "Druckeigenschaft(-en)" },
      { languageCode: LanguageCode.Fr, name: "Propriétés d'impression" },
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
      { languageCode: LanguageCode.De, name: "Einheit" },
      { languageCode: LanguageCode.Fr, name: "Unité" },
    ],
    code: "unit",
    columnKeys: ["Einheit", "Produkt Einheit", "Unité"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Symbolnummer" },
      { languageCode: LanguageCode.Fr, name: "Numéro de symbole" },
    ],
    code: "symbol-number",
    columnKeys: ["Symbolnummer", "Numéro de symbole"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Inhalt" },
      { languageCode: LanguageCode.Fr, name: "Contenu" },
    ],
    code: "content",
    columnKeys: ["Inhalt", "Contenu"],
  },
  {
    translations: [
      { languageCode: LanguageCode.De, name: "Variante" },
      { languageCode: LanguageCode.Fr, name: "Variante" },
    ],
    code: "variant",
    columnKeys: ["Variante", "Variante"],
  },
];

export const IMPORT_ATTRIBUTE_COLUMNS = {
  id: ["ID", "sku", "Artikel_Nr"],
  parentId: ["Parent Product ID", "Produktgruppe_Shop"],
  sku: ["Sku", "Artikel_Nummer_Produkt"],
  language: ["WPML Language Code"],
  translationId: ["WPML Translation ID"],
  name: ["Title", "Artikelname_neu"],
  slug: ["Slug"],
  description: ["Content"],
  length: ["Length"],
  width: ["Width", "Breite"],
  height: ["Height", "Höhe"],
  assets: ["Image URL", "Artikel_Bilder_Code"],
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
