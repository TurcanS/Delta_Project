// Sector data arrives in Romanian with a `ru` block; the UI shows whichever language is active.
export function localizeSector(sector, lang) {
  if (lang !== 'ru' || !sector?.ru) return sector;
  return {
    ...sector,
    label: sector.ru.label,
    description: sector.ru.description,
    categories: sector.categories.map((category) => (category.ru ? { ...category, ...category.ru } : category)),
  };
}
