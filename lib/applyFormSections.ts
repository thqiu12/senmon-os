import type { FieldConfigEntry } from "@/lib/applyFieldVisibility";

export interface SectionField { fieldKey: string; displayOrder: number; }
export interface FormSection { section: string; fields: SectionField[]; }

type Entry = FieldConfigEntry & { section?: string; displayOrder?: number };

export function buildFormSections(config: Entry[]): FormSection[] {
  const groups = new Map<string, SectionField[]>();
  for (const c of config) {
    if (c.isEnabled === false) continue;
    const sec = c.section || "その他";
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec)!.push({ fieldKey: c.fieldKey, displayOrder: c.displayOrder ?? 0 });
  }
  const sections: FormSection[] = [];
  groups.forEach((fields, section) => {
    fields.sort((a, b) => a.displayOrder - b.displayOrder);
    sections.push({ section, fields });
  });
  sections.sort((a, b) => {
    const minA = Math.min(...a.fields.map(f => f.displayOrder));
    const minB = Math.min(...b.fields.map(f => f.displayOrder));
    return minA - minB;
  });
  return sections;
}
