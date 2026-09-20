/** Generates every dot-joined leaf-key path of a nested string dictionary, e.g. "nav.home". */
export type TranslationPath<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: TranslationPath<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K}`>;
    }[keyof T & string];

export function getByPath(dictionary: unknown, path: string): string {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary);
  if (typeof value !== "string") {
    throw new Error(`Missing translation for key "${path}"`);
  }
  return value;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
