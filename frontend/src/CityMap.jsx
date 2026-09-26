import map from './assets/city-map.json';

const labels = { rascani: 'RÂȘCANI', buiucani: 'BUIUCANI', ciocana: 'CIOCANA', botanica: 'BOTANICA', centru: 'CENTRU' };
const position = ([x, y]) => ({ left: `${x / map.width * 100}%`, top: `${y / map.height * 100}%` });

export default function CityMap({ selected, panelOpen, onSelect }) {
  return (
    <div className="mapcard__map" id="cityMap" aria-label="Harta sectoarelor orașului Chișinău">
      <div className="mapcard__north" aria-hidden="true">↑<span>N</span></div>
      <svg className="city-map" viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true">
        {map.sectors.map((sector) => (
          <g key={sector.id} className={`sector-dots sector-dots--${sector.id}${selected === sector.id ? ' is-selected' : ''}`} data-sector={sector.id} onClick={() => onSelect(sector.id)}>
            <path className="sector-boundary" d={sector.path} fillRule="evenodd" />
            {sector.dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />)}
          </g>
        ))}
        <g className="map-scale" transform="translate(16 279)">
          <path d={`M0 -3V0H${map.scaleBar}V-3`} /><text x={map.scaleBar + 5} y="3">2 km</text>
        </g>
      </svg>
      {map.sectors.map((sector) => (
        <button key={sector.id} className={`sector-label sector-label--${sector.id}${selected === sector.id ? ' is-selected' : ''}`} data-sector={sector.id} style={position(sector.label)} onClick={() => onSelect(sector.id)} aria-label={`Explorează sectorul ${labels[sector.id]}`} aria-pressed={selected === sector.id && panelOpen} aria-controls="sectorPanel" type="button">{labels[sector.id]}</button>
      ))}
      {map.neighborhoods.map((neighborhood) => (
        <button key={neighborhood.name} className="neighborhood-marker" type="button" aria-label="Telecentru, cartier în sectorul Centru" style={position(neighborhood.position)} onClick={() => onSelect(neighborhood.sector)} aria-controls="sectorPanel">
          <span className="neighborhood-label">{neighborhood.name}</span>
        </button>
      ))}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
