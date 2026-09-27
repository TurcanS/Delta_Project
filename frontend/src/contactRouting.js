// Picks where a citizen should go next, from words in the question and the answer.
// Every destination is an official site that appears in the assistant's document corpus;
// nothing here is generated, so the routing works even when the model abstains.
const SECTOR_NAMES = {
  centru: ['centru', 'центр'],
  botanica: ['botanica', 'ботаник'],
  buiucani: ['buiucani', 'буюкан'],
  ciocana: ['ciocana', 'чокан'],
  rascani: ['rascani', 'râșcani', 'rîșcani', 'рышкан', 'рышкэн'],
};
const PETITION_WORDS = ['petiți', 'petiti', 'sesizar', 'reclamați', 'audienț', 'петици', 'жалоб', 'обращени', 'приём', 'прием'];

// Service topics → the municipal enterprise or directorate that handles them.
// `bySector` lists destinations that differ per sector; only those topics ask for a sector.
export const TOPICS = [
  { id: 'transport', url: 'https://rtec.md/', extra: [{ url: 'https://mobilitatechisinau.md/' }],
    words: ['troleibuz', 'autobuz', 'transport public', 'rută', 'ruta ', 'rtec', 'bilet', 'abonament', 'stați', 'троллейбус', 'автобус', 'общественн', 'маршрут', 'проездн', 'билет', 'остановк'] },
  { id: 'waste', url: 'https://autosalubritate.md/',
    words: ['deșeu', 'deseu', 'gunoi', 'salubr', 'colectare', 'containere', 'мусор', 'отход', 'вывоз', 'контейнер'] },
  { id: 'greenery', url: 'https://agsv.md/',
    words: ['spații verzi', 'spatii verzi', 'spațiul verde', 'parc', 'scuar', 'arbor', 'copac', 'tăiere', 'зелён', 'зелен', 'парк', 'сквер', 'дерев'] },
  { id: 'roads', url: 'https://exdrupo.md/',
    words: ['drum', 'stradă', 'strada', 'străzii', 'asfalt', 'groap', 'trotuar', 'carosabil', 'pasaj', 'дорог', 'улиц', 'асфальт', 'яма', 'ямы', 'тротуар', 'переход'] },
  { id: 'social', url: 'https://dgams.md/',
    words: ['asistență socială', 'asistenta sociala', 'ajutor social', 'compensați', 'dizabilit', 'vârstnic', 'medical', 'spital', 'sănătate', 'социальн', 'пособи', 'компенсац', 'инвалид', 'пожил', 'больниц', 'здоров', 'медицин'] },
  { id: 'education', words: ['grădiniț', 'gradinit', 'școal', 'scoal', 'liceu', 'înscriere', 'educați', 'детский сад', 'детского сада', 'садик', 'школ', 'лице', 'образован', 'зачислен'],
    bySector: { botanica: 'https://detsbotanica.md/', buiucani: 'https://buiucanidets.md/', rascani: 'https://detsriscani.md/' } },
  { id: 'projects', url: 'https://proiecte.chisinau.md/',
    words: ['proiect', 'investiți', 'investit', 'reabilit', 'renovat', 'проект', 'инвестиц', 'реконструк', 'ремонт'] },
];

export const PRIMARIA = { url: 'https://www.chisinau.md/', label: 'chisinau.md' };

const normalize = (value) => value.toLowerCase().normalize('NFC').replace(/ş/g, 'ș').replace(/ţ/g, 'ț');
export const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function contactsFor(text, sectors) {
  const haystack = normalize(text);
  const matched = sectors.filter((sector) => SECTOR_NAMES[sector.id]?.some((name) => haystack.includes(name)));
  const aboutPetitions = PETITION_WORDS.some((word) => haystack.includes(word));
  const topics = TOPICS.filter((topic) => topic.words.some((word) => haystack.includes(word))).slice(0, 2);
  // A sector is needed only when the destination depends on it and the text does not name one.
  const needsSector = matched.length === 0 && (aboutPetitions || topics.some((topic) => topic.bySector));
  return { sectors: matched, aboutPetitions, topics, needsSector };
}

// The concrete destination of a topic, once the sector (if any) is known.
export function topicLinks(topic, sector) {
  if (topic.bySector) {
    const url = sector && topic.bySector[sector.id];
    return url ? [url] : sector ? [sector.website] : [];
  }
  return [topic.url, ...(topic.extra || []).map((item) => item.url)];
}
