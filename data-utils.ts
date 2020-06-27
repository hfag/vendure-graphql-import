import slugify from "slugify";
import {
  Record,
  ProductPrototype,
  ProductVariantPrototype,
  AttributeFacet,
  Facet,
  BulkDiscount,
  ID,
  LanguageCode,
  OptionGroup,
  Option,
  FacetValue,
} from "./types";
import {
  IMPORT_OPTION_GROUPS,
  IMPORT_ATTRIBUTE_COLUMNS,
} from "./data-utils/attributes";
import { selection } from "./rl-utils";
import {
  CATEGORY_FACET_CODE,
  RESELLER_DISCOUNT_FACET_CODE,
} from "./data-utils/facets";

export const SLUGIFY_OPTIONS = { lower: true, strict: true };
export const SEPERATOR = "|";
export const HIERARCHY_SEPERATOR = ">";

const getIntegerValue = <T>(
  value: string | number | undefined,
  fallback: T
) => {
  if (typeof value === "string" && value.length > 0) {
    return parseInt(value);
  } else if (typeof value === "number") {
    return value;
  } else {
    return fallback;
  }
};

const getFloatingPointValue = <T>(
  value: string | number | undefined,
  fallback: T
) => {
  if (typeof value === "string" && value.length > 0) {
    return parseFloat(value);
  } else if (typeof value === "number") {
    return value;
  } else {
    return fallback;
  }
};

const findItemByUnknownLocaleString = async <
  ObjectTranslation extends { languageCode: LanguageCode; name: string },
  Obj extends { code: string; translations: ObjectTranslation[] },
  ItemTranslation extends { languageCode: LanguageCode; name: string },
  Item extends { code: string; translations: ItemTranslation[] }
>(
  object: Obj,
  value: string,
  languageCode: LanguageCode,
  objectToItems: (object: Obj) => Item[],
  suggestions: Item[] = []
): Promise<Item | null> => {
  const items = objectToItems(object);
  const v = value.trim().toLowerCase();

  suggestions = suggestions.filter(
    (s) =>
      !s.translations.find((t) => t.languageCode === languageCode) ||
      s.translations.find((t) => t.name.trim().toLowerCase() === v)
  );

  const betterSuggestions = suggestions.filter((s) =>
    s.translations.find((t) => t.name.trim().toLowerCase() === v)
  );

  const matches =
    suggestions.length > 0
      ? betterSuggestions.length > 0
        ? betterSuggestions
        : suggestions
      : items.filter((item) =>
          item.translations.find((t) => v === t.name.trim().toLowerCase())
        );

  const untranslated = items.filter(
    (o) => !o.translations.find((t) => t.languageCode === languageCode)
  );

  if (matches.length === 1) {
    return matches[0];
  } else if (untranslated.length === 0) {
    //no potential translations
    return null;
  } else {
    const s = await selection(
      `Es konnte nicht automatisch entschieden werden, ob die Option
[${languageCode}]: "${value}" in der Kategorie ${
        object.code
      }: ${object.translations.map(
        (t) => `[${t.languageCode}]: "${t.name}"`
      )} bereits existiert.
Wählen Sie die entsprechende Option aus.`,
      matches.length > 0 ? matches : items, //if we had multiple matches, present them. otherwise show all options
      (o) =>
        `${o.code}, ${o.translations.map(
          (t) => `[${t.languageCode}]: "${t.name}"`
        )}`,
      true
    );

    return s;
  }
};

export const tableToProducts = async (
  records: Record[],
  optionGroups: OptionGroup[],
  facets: Facet[]
) => {
  const products: (ProductPrototype & { translationId?: ID })[] = [];
  const variants: (ProductVariantPrototype &
    ProductPrototype & { parentId: string; translationId?: ID })[] = [];

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const inRecord = (column: string) => column in record;

    let column = IMPORT_ATTRIBUTE_COLUMNS.id.find(inRecord);
    if (!column) {
      throw new Error(
        `Es wurde keine Spalte für IDs gefunden. Gültig sind ${IMPORT_ATTRIBUTE_COLUMNS.id.join(
          ", "
        )}`
      );
    }
    const id: ID = record[column];

    column = IMPORT_ATTRIBUTE_COLUMNS.parentId.find(inRecord);
    if (!column) {
      throw new Error(
        `Es wurde keine Spalte für übergeordnete IDs gefunden. Gültig sind ${IMPORT_ATTRIBUTE_COLUMNS.parentId.join(
          ", "
        )}`
      );
    }
    const parentId: string | null =
      record[column] == 0 || record[column] === "0"
        ? null
        : record[column].toString();

    column = IMPORT_ATTRIBUTE_COLUMNS.sku.find(inRecord);
    if (!column) {
      throw new Error(
        `Es wurde keine Spalte für Artikelnummern gefunden. Gültig sind ${IMPORT_ATTRIBUTE_COLUMNS.sku.join(
          ", "
        )}`
      );
    }

    const sku: string = record[column].toString().trim();

    if (sku.length === 0) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} besitzt keine gültige Artikelnummer!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.language.find(inRecord);

    const languageField = column && record[column];
    let languageCode: LanguageCode;
    switch (languageField) {
      case "fr":
        languageCode = "fr";
        break;
      case "de":
      default:
        languageCode = "de";
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.translationId.find(inRecord);
    const translationId = column && record[column];

    column = IMPORT_ATTRIBUTE_COLUMNS.name.find(inRecord);
    const nameField = column && record[column].toString().trim();
    if (typeof nameField !== "string" || nameField.length === 0) {
      throw new Error(
        `Auf Zeile ${index} wurde kein Name gefunden. Gültig sind ${IMPORT_ATTRIBUTE_COLUMNS.name.join(
          ", "
        )}`
      );
    }
    let name: string = nameField;

    column = IMPORT_ATTRIBUTE_COLUMNS.description.find(inRecord);
    const descriptionField = column && record[column];
    const description: string =
      typeof descriptionField === "string" ? descriptionField : "";

    column = IMPORT_ATTRIBUTE_COLUMNS.slug.find(inRecord);
    const slugField = column && record[column];
    const slug: string =
      typeof slugField === "string"
        ? slugField
        : slugify(name, SLUGIFY_OPTIONS);

    column = IMPORT_ATTRIBUTE_COLUMNS.price.find(inRecord);
    if (!column) {
      throw new Error(
        `Auf Zeile ${index} wurde keine Preisspalte gefunden. Gültig sind ${IMPORT_ATTRIBUTE_COLUMNS.price.join(
          ", "
        )}`
      );
    }
    const priceField = record[column];
    let price: number;

    if (typeof priceField === "number") {
      price = priceField;
    } else if (!isNaN(parseFloat(priceField))) {
      price = parseFloat(priceField);
    } else if (priceField.includes("CHF")) {
      price = parseFloat(priceField.replace("CHF", "").trim());
    } else {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} besitzt folgenden Inhalt: '${priceField}'. Das ist ein ungültiges Preisformat!`
      );
    }

    if (price < 0) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} enthält einen negativen Preis!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.minimumOrderQuantity.find(inRecord);
    const minimumOrderQuantity: number = getIntegerValue(
      column && record[column],
      0
    );

    if (isNaN(minimumOrderQuantity)) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} enthält eine ungültige Mindestbestellmenge!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.length.find(inRecord);
    const length: number | undefined = getFloatingPointValue(
      column && record[column],
      undefined
    );
    if (length && isNaN(length)) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} enthält eine ungültige Länge!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.width.find(inRecord);
    const width: number | undefined = getFloatingPointValue(
      column && record[column],
      undefined
    );
    if (width && isNaN(width)) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} enthält eine ungültige Breite!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.height.find(inRecord);
    const height: number | undefined = getFloatingPointValue(
      column && record[column],
      undefined
    );
    if (height && isNaN(height)) {
      throw new Error(
        `Spalte ${column} auf Zeile ${index} enthält eine ungültige Höhe!`
      );
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.assets.find(inRecord);
    const assetField = column && record[column];
    const assets: string[] =
      typeof assetField === "string" ? assetField.split(SEPERATOR) : [];

    column = IMPORT_ATTRIBUTE_COLUMNS.upSells.find(inRecord);
    const upSellsField = column && record[column];
    const upSells =
      typeof upSellsField === "string" ? upSellsField.split(SEPERATOR) : [];

    column = IMPORT_ATTRIBUTE_COLUMNS.crossSells.find(inRecord);
    const crossSellsField = column && record[column];
    const crossSells =
      typeof crossSellsField === "string"
        ? crossSellsField.split(SEPERATOR)
        : [];

    const categories: string[] = [];

    column = IMPORT_ATTRIBUTE_COLUMNS.categories.find(inRecord);
    const categoriesField = column && record[column];
    if (typeof categoriesField === "string") {
      categories.push(...categoriesField.split(SEPERATOR));
    }

    column = IMPORT_ATTRIBUTE_COLUMNS.hierarchicalCategories.find(inRecord);
    const hierarchicalCategoriesField = column && record[column];
    if (typeof hierarchicalCategoriesField === "string") {
      categories.push(
        ...hierarchicalCategoriesField.split(SEPERATOR).map((c) => {
          const cat = c.split(HIERARCHY_SEPERATOR);
          return cat[cat.length - 1];
        })
      );
    }

    const resellerDiscountCategories: string[] = [];

    column = IMPORT_ATTRIBUTE_COLUMNS.resellerDiscountCategories.find(inRecord);
    const resellerDiscountCategoriesField = column && record[column];
    if (typeof resellerDiscountCategoriesField === "string") {
      resellerDiscountCategories.push(
        ...resellerDiscountCategoriesField.split(SEPERATOR)
      );
    }

    //dirty stuff

    //modify some option group columns before processing them alltogether

    const unitColumn = IMPORT_ATTRIBUTE_COLUMNS.unit.find(inRecord);
    const quantityPerUnitColumn = IMPORT_ATTRIBUTE_COLUMNS.quantityPerUnit.find(
      inRecord
    );

    if (quantityPerUnitColumn && unitColumn) {
      const unit = record[unitColumn];
      const quantityPerUnitField = record[quantityPerUnitColumn];
      let quantityPerUnit: number;

      if (typeof unit !== "string") {
        throw new Error(
          `Spalte ${unitColumn} auf Zeile ${index} enthält eine ungültige Einheit! Zahlen sind keine Einheiten!`
        );
      }

      if (typeof quantityPerUnitField === "string") {
        quantityPerUnit = parseFloat(quantityPerUnitField);
      } else {
        quantityPerUnit = quantityPerUnitField;
      }

      if (isNaN(quantityPerUnit)) {
        throw new Error(
          `Spalte ${unitColumn} auf Zeile ${index} enthält eine ungültige Stückzahl pro Einheit!`
        );
      }

      record[unitColumn] = `${unit} (${quantityPerUnit} STK)`;
    }

    //find bulk discounts
    column = IMPORT_ATTRIBUTE_COLUMNS.bulkDiscounts.find(inRecord);
    const bulkDiscountsField = column && record[column];
    let bulkDiscounts: BulkDiscount[] = [];

    if (bulkDiscountsField) {
      try {
        if (typeof bulkDiscountsField !== "string") {
          //go to other error handler
          throw new Error();
        }

        bulkDiscounts = JSON.parse(bulkDiscountsField);
      } catch (e) {
        throw new Error(
          `Spalte ${column} auf Zeile ${index} enthält nicht eine gültige JSON-Codierung von Mengenrabatt!`
        );
      }
    } else {
      //if there's no bulk discount field check for the multi column format

      for (let column in record) {
        if (column.indexOf("VP Staffel ") !== -1) {
          const pricePerUnit = parseFloat(
            record[column].toString().replace("CHF", "").trim()
          );
          const quantity = parseInt(
            column.replace("VP Staffel ", "").trim(),
            10
          );

          if (pricePerUnit > 0 && quantity > 0) {
            bulkDiscounts.push({
              price: pricePerUnit,
              quantity: quantity,
            });
          }
        }
      }
    }
    //end dirty stuff

    //import option groups
    const groups: {
      translations: { languageCode: LanguageCode; name: string }[];
      code: string;
      values: string[];
    }[] = [];

    IMPORT_OPTION_GROUPS.forEach((attribute) => {
      const columnKey = attribute.columnKeys.find(inRecord);
      if (columnKey && record[columnKey]) {
        const value = record[columnKey];
        if (typeof value !== "string") {
          throw new Error(
            `Spalte ${column} auf Zeile ${index} enthält nicht einen ungültigen Wert!`
          );
        }

        groups.push({
          translations: attribute.translations,
          code: attribute.code,
          values: parentId ? [value] : value.split(SEPERATOR),
        });
      }
    });

    const optionCodes: string[] = [];

    //add extracted option groups and values (and its translations)
    for (const group of groups) {
      const optionGroup = optionGroups.find((g) => g.code === group.code);

      if (optionGroup) {
        for (const value of group.values) {
          let suggestions: Option[] = [];

          if (translationId) {
            const existingVariant = variants.find(
              (v) => v.translationId === translationId
            );

            if (existingVariant) {
              suggestions = optionGroup.options.filter((i) =>
                existingVariant.optionCodes.includes(i.code)
              );
            } else {
              const existingProduct = products.find(
                (p) => p.translationId === translationId
              );
              if (existingProduct) {
                suggestions = optionGroup.options.filter((i) =>
                  existingProduct.childrenOptionCodes.includes(i.code)
                );
              }
            }
          }

          const option = await findItemByUnknownLocaleString(
            optionGroup,
            value,
            languageCode,
            (optionGroup) => optionGroup.options,
            suggestions
          );

          if (option) {
            if (
              !option.translations.find((t) => t.languageCode === languageCode)
            ) {
              option.translations.push({ languageCode, name: value });
            }

            optionCodes.push(option.code);
          } else {
            const code = slugify(value, SLUGIFY_OPTIONS);
            optionGroup.options.push({
              code,
              translations: [{ languageCode, name: value }],
            });

            optionCodes.push(code);
          }
        }
      } else {
        //not found yet, add it
        const options = group.values.map((value) => ({
          code: slugify(value, SLUGIFY_OPTIONS),
          translations: [{ languageCode, name: value }],
        }));

        optionGroups.push({
          code: group.code,
          translations: group.translations,
          options,
        });

        optionCodes.push(...options.map((o) => o.code));
      }
    }

    const facetValueCodes: string[] = [];

    //add category facets
    for (const c of categories) {
      const f = facets.find((f) => f.code === CATEGORY_FACET_CODE);

      if (f) {
        let suggestions: FacetValue[] = [];
        if (translationId) {
          const existingVariant = variants.find(
            (v) => v.translationId === translationId
          );

          if (existingVariant) {
            suggestions = f.values.filter((v) =>
              existingVariant.facetValueCodes.includes(v.code)
            );
          } else {
            const existingProduct = products.find(
              (p) => p.translationId === translationId
            );
            if (existingProduct) {
              suggestions = f.values.filter((v) =>
                existingProduct.facetValueCodes.includes(v.code)
              );
            }
          }
        }

        const v = await findItemByUnknownLocaleString(
          f,
          c,
          languageCode,
          (facet) => facet.values,
          suggestions
        );

        if (v) {
          if (!v.translations.find((t) => t.languageCode === languageCode)) {
            v.translations.push({ languageCode, name: c });
          }
          facetValueCodes.push(v.code);
        } else {
          const code = slugify(c, SLUGIFY_OPTIONS);
          f.values.push({
            code,
            translations: [{ languageCode, name: c }],
          });
          facetValueCodes.push(code);
        }
      } else {
        console.error(`Facet ${CATEGORY_FACET_CODE} is required to exist!`);
        process.exit(-1);
      }
    }

    //add reseller discount category facets
    for (const c of resellerDiscountCategories) {
      const f = facets.find((f) => f.code === RESELLER_DISCOUNT_FACET_CODE);

      if (f) {
        let suggestions: FacetValue[] = [];
        if (translationId) {
          const existingVariant = variants.find(
            (v) => v.translationId === translationId
          );

          if (existingVariant) {
            suggestions = f.values.filter((v) =>
              existingVariant.facetValueCodes.includes(v.code)
            );
          } else {
            const existingProduct = products.find(
              (p) => p.translationId === translationId
            );
            if (existingProduct) {
              suggestions = f.values.filter((v) =>
                existingProduct.facetValueCodes.includes(v.code)
              );
            }
          }
        }

        const v = await findItemByUnknownLocaleString(
          f,
          c,
          languageCode,
          (facet) => facet.values,
          suggestions
        );

        if (v) {
          v.translations.push({ languageCode, name: c });
          facetValueCodes.push(v.code);
        } else {
          const code = slugify(c, SLUGIFY_OPTIONS);
          f.values.push({
            code,
            translations: [{ languageCode, name: c }],
          });

          facetValueCodes.push(code);
        }
      } else {
        console.error(
          `Facet ${RESELLER_DISCOUNT_FACET_CODE} is required to exist!`
        );
        process.exit(-1);
      }
    }

    if (parentId === null) {
      const product = products.find(
        (p) => p.translationId && p.translationId === translationId
      );

      if (product) {
        //this product is a translation!
        product.translations.push({ languageCode, slug, name, description });
      } else {
        products.push({
          sku,
          translationId,
          translations: [{ languageCode, slug, name, description }],
          length,
          width,
          height,
          order: 0,
          //image urls or filenames
          assets,
          upsellsGroupSKUs: upSells,
          crosssellsGroupSKUs: crossSells,
          optionGroupCodes: groups.map((g) => g.code),
          facetValueCodes,
          children: [],
          childrenOptionCodes: optionCodes,
        });
      }
    } else {
      //this is a variation

      const variant = variants.find(
        (v) => v.translationId && v.translationId === translationId
      );

      if (variant) {
        //we already got this variant, just add translations
        variant.translations.push({ languageCode, name, slug, description });
      } else {
        variants.push({
          parentId,
          sku,
          price,
          //image urls or filenames
          assets,
          minimumOrderQuantity,
          bulkDiscounts,
          facetValueCodes,
          optionCodes,
          //product properties
          translationId,
          translations: [{ languageCode, slug, name, description }],
          length,
          width,
          height,
          order: 0,
          upsellsGroupSKUs: upSells,
          crosssellsGroupSKUs: crossSells,
          optionGroupCodes: groups.map((g) => g.code),
          children: [],
          childrenOptionCodes: [],
        });
      }
    }
  }

  //almost done, now we have to create products for all unmatched variants
  for (const variant of variants) {
    //look for parent
    const parent = products.find((p) => p.id === variant.parentId);

    if (parent) {
      parent.facetValueCodes = parent.facetValueCodes.filter(
        (facetValueCode) => {
          if (!variant.facetValueCodes.includes(facetValueCode)) {
            //this is a facet value code not all variants have

            //assign it to all individual variants that have it
            parent.children.forEach((v) =>
              v.facetValueCodes.push(facetValueCode)
            );
            //remove it from the parent
            return false;
          }

          return true;
        }
      );

      variant.facetValueCodes = variant.facetValueCodes.filter(
        (facetValueCode) => {
          if (parent.facetValueCodes.includes(facetValueCode)) {
            //is already in the parent, can be removed from variant
            return false;
          }
          return true;
        }
      );

      parent.children.push(variant);
      parent.childrenOptionCodes.push(...variant.optionCodes);
    } else {
      products.push({
        sku: variant.parentId,
        translationId: variant.translationId,
        translations: variant.translations,
        length: variant.length,
        width: variant.width,
        height: variant.height,
        order: variant.order,
        //image urls or filenames
        assets: variant.assets,
        upsellsGroupSKUs: variant.upsellsGroupSKUs,
        crosssellsGroupSKUs: variant.crosssellsGroupSKUs,
        optionGroupCodes: variant.optionGroupCodes,
        facetValueCodes: variant.facetValueCodes,
        children: [{ ...variant, facetValueCodes: [] }],
        childrenOptionCodes: variant.optionCodes,
      });
    }
  }

  return { products, optionGroups, facets };
};

export const hasAllOptionGroups = (
  variant: ProductVariantPrototype,
  variants: { sku: string; options: { code: string }[] }[]
) => {
  const v = variants.find((v) => v.sku === variant.sku);
  if (!v) {
    throw new Error(
      "variants has to be in variants for hasAllOptionGroups to be called"
    );
  }
  const missingOptions = v.options.filter(
    (o) => !variant.optionCodes.find((c) => o.code === c)
  );

  return missingOptions.length === 0;
};
