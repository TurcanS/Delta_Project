import map from './assets/city-map.json';
import { useLang } from './i18n';

const labels = {
  ro: { rascani: 'RÂȘCANI', buiucani: 'BUIUCANI', ciocana: 'CIOCANA', botanica: 'BOTANICA', centru: 'CENTRU' },
  ru: { rascani: 'РЫШКАНЬ', buiucani: 'БУЮКАНЬ', ciocana: 'ЧОКАНА', botanica: 'БОТАНИКА', centru: 'ЦЕНТР' },
};
const position = ([x, y]) => ({ left: `${x / map.width * 100}%`, top: `${y / map.height * 100}%` });

export default function CityMap({ selected, panelOpen, onSelect }) {
  const { lang, t } = useLang();
  return (
    <div className="mapcard__map" id="cityMap" aria-label={t.mapLabel}>
      <div className="mapcard__north" aria-hidden="true">↑<span>N</span></div>
      <svg className="city-map" viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true">
        {map.sectors.map((sector) => (
          <g key={sector.id} className={`sector-dots sector-dots--${sector.id}${selected === sector.id ? ' is-selected' : ''}`} data-sector={sector.id} onClick={() => onSelect(sector.id)}>
            <path className="sector-boundary" d={sector.path} fillRule="evenodd" />
            {sector.dots.map(([x, y]) => <rect key={`${x}-${y}`} x={x - 1.5} y={y - 1.5} width="3" height="3" rx="0.8" />)}
          </g>
        ))}
        <g className="map-scale" transform="translate(16 279)">
          <path d={`M0 -3V0H${map.scaleBar}V-3`} /><text x={map.scaleBar + 5} y="3">2 km</text>
        </g>
      </svg>
      {map.sectors.map((sector) => (
        <button key={sector.id} className={`sector-label sector-label--${sector.id}${selected === sector.id ? ' is-selected' : ''}`} data-sector={sector.id} style={position(sector.label)} onClick={() => onSelect(sector.id)} aria-label={t.exploreSectorAria(labels[lang][sector.id])} aria-pressed={selected === sector.id && panelOpen} aria-controls="sectorPanel" type="button">{labels[lang][sector.id]}</button>
      ))}
      {map.neighborhoods.map((neighborhood) => (
        <button key={neighborhood.name} className="neighborhood-marker" type="button" aria-label={t.neighborhoodAria(neighborhood.name, lang === 'ru' ? 'Центр' : 'Centru')} style={position(neighborhood.position)} onClick={() => onSelect(neighborhood.sector)} aria-controls="sectorPanel">
          <span className="neighborhood-label">{neighborhood.name}</span>
        </button>
      ))}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
