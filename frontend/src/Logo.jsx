// Wordmark: "Portalul" set small above "Cetățeanului", the name people remember.
export default function Logo({ tagline, className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <span className="logo__word" aria-hidden="true">
        <span className="logo__kicker">Portalul</span>
        <span className="logo__name">Cetățeanului</span>
      </span>
      {tagline && <span className="logo__tagline">{tagline}</span>}
    </span>
  );
}
