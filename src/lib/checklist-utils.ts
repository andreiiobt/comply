export interface ChecklistItem {
  text: string;
  requires_photo: boolean;
}

/** Normalize raw JSONB items to ChecklistItem[]. Handles both old string[] and new object[] formats. */
export function normalizeItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item, requires_photo: false };
    if (item && typeof item === "object" && "text" in item) {
      return { text: String(item.text), requires_photo: Boolean(item.requires_photo) };
    }
    return { text: String(item), requires_photo: false };
  });
}

/** Get display text from a normalized or raw item */
export function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "text" in item) return String((item as any).text);
  return String(item);
}
