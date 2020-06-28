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

function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const copy = {} as Pick<T, K>;

  keys.forEach((key) => (copy[key] = obj[key]));

  return copy;
}

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

export const tableToProducts = async (records: Record[], facets: Facet[]) => {
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
      typeof upSellsField === "string" && upSellsField.length > 0
        ? upSellsField.split(SEPERATOR)
        : [];

    column = IMPORT_ATTRIBUTE_COLUMNS.crossSells.find(inRecord);
    const crossSellsField = column && record[column];
    const crossSells =
      typeof crossSellsField === "string" && crossSellsField.length > 0
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

        bulkDiscounts = JSON.parse(bulkDiscountsField).map(
          ({ qty, ppu }: { qty: string | number; ppu: string | number }) => ({
            quantity: parseInt(qty.toString()),
            price: Math.floor(parseFloat(ppu.toString()) * 100),
          })
        );
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

    if (parentId === null) {
      const product = products.find(
        (p) => p.translationId && p.translationId === translationId
      );

      if (product) {
        //just add translations
        product.translations.push({
          languageCode,
          name,
          slug,
          description,
        });
        product.previousIds.push(id);
      } else {
        products.push({
          previousIds: [id],
          translationId,
          sku,
          translations: [
            {
              languageCode,
              name,
              slug,
              description,
            },
          ],
          length,
          width,
          height,
          order: 0,
          //image urls or filenames
          assets,
          upsellsGroupSKUs: upSells,
          crosssellsGroupSKUs: crossSells,
          optionGroups: [],
          facetValueCodes: [],
          children: [],
        });
      }
      //no need for option groups etc
      continue;
    }

    //import option groups
    const groups: OptionGroup[] = [];

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
          options: (parentId ? [value] : value.split(SEPERATOR)).map(
            (name) => ({
              code: slugify(name, SLUGIFY_OPTIONS),
              translations: [{ languageCode, name }],
            })
          ),
        });
      }
    });

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

    //this is a variant
    const variant = variants.find(
      (v) => v.translationId && v.translationId === translationId
    );

    if (variant) {
      //we already got this variant, just add translations
      variant.translations.push({ languageCode, name, slug, description });
      variant.optionGroups.forEach((group) => {
        const g = groups.find((g) => g.code === group.code);
        if (!g) {
          if (
            group.options.length !== 1 ||
            group.options[0].translations.length === 0
          ) {
            throw new Error(
              `Variante ${sku} (${translationId}) auf Zeile ${index} besitzt keinen Wert für ${group.code} obwohl eine andere Übersetzung dies hat.`
            );
          }
          //this translations doesn't have a value but the original translation does. use the first value
          group.options[0].translations.push({
            languageCode,
            name: group.options[0].translations[0].name,
          });
          return;
        }

        //the next two checks are just there as a sanity check, this should actually never be violated

        if (group.options.length !== 1) {
          throw new Error(
            `Variante ${variant.sku} besitzt ${group.options.length} Werte für ${group.code}, sollte aber nur einen haben!`
          );
        }

        if (g.options.length !== 1) {
          throw new Error(
            `Variante ${sku} auf Zeile ${index} besitzt ${g.options.length} Werte für ${group.code}, sollte aber nur einen haben!`
          );
        }

        group.options[0].translations.push(...g.options[0].translations);
      });
    } else {
      variants.push({
        previousIds: [id],
        parentId,
        sku,
        price: Math.floor(price * 100),
        //image urls or filenames
        assets,
        minimumOrderQuantity,
        bulkDiscounts,
        facetValueCodes,
        optionCodes: groups.map((g) => {
          if (g.options.length !== 1) {
            throw new Error(
              `Variante ${sku} auf Zeile ${index} besitzt ${g.options.length} Werte für ${g.code}, sollte aber nur einen haben!`
            );
          }
          return [g.code, g.options[0].code];
        }),
        //product properties
        translationId,
        translations: [{ languageCode, slug, name, description }],
        length,
        width,
        height,
        order: 0,
        upsellsGroupSKUs: upSells,
        crosssellsGroupSKUs: crossSells,
        optionGroups: groups,
        children: [],
      });
    }
  }

  //almost done, now we have to create products for all unmatched variants
  for (const variant of variants) {
    //look for parent
    const parent = products.find((p) =>
      p.previousIds.includes(variant.parentId)
    );

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

      if (parent.children.length === 0) {
        parent.optionGroups = variant.optionGroups;
      } else {
        parent.optionGroups.forEach((group) => {
          //all variants are required to have this group
          const g = variant.optionGroups.find((g) => g.code === group.code);

          if (!g) {
            if (group.options.length === 1) {
              variant.optionGroups.push(group);
              variant.optionCodes.push([group.code, group.options[0].code]);
              return;
            }

            console.log(parent.optionGroups);
            console.log(
              parent.children.map((c) => ({
                sku: c.sku,
                optionCodes: c.optionCodes
                  .map((c) => `(${(c[0], c[1])})`)
                  .join(", "),
              }))
            );
            throw new Error(
              `Variante ${variant.sku} besitzt keinen Wert für ${
                group.code
              } aber einer von ${group.options.map(
                (o) => o.code
              )} wird verlangt!`
            );
          }
          if (g.options.length !== 1) {
            throw new Error(
              `Variante ${variant.sku} besitzt ${g.options.length} Werte (≠1) für ${group.code}!`
            );
          }

          if (!group.options.find((o) => o.code === g.options[0].code)) {
            group.options.push(g.options[0]);
          }
        });
      }

      parent.children.push(variant);
    } else {
      products.push({
        previousIds: [variant.parentId],
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
        optionGroups: variant.optionGroups,
        facetValueCodes: variant.facetValueCodes,
        children: [{ ...variant, facetValueCodes: [] }],
      });
    }
  }

  return { products, facets };
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
    (o) =>
      !variant.optionCodes.find(
        ([groupCode, optionCode]) => o.code === optionCode
      )
  );

  return missingOptions.length === 0;
};
