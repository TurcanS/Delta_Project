import { Arrow } from './Icons';

export default function Features({ onReport }) {
  return (
    <section className="features" aria-label="Cum te putem ajuta">
      <div className="features__inner">
        <article className="feature-card feature-card--assistant">
          <p className="feature-card__eyebrow"><span className="feature-number">01 / INFORMEAZĂ-TE</span>Direct la sursă</p>
          <h2 className="feature-card__title">Mai puține căutări.<br />Un punct de pornire clar.</h2>
          <p className="feature-card__body">De la înscrierea la grădiniță până la o audiență la pretură. Explorează serviciile și consultă informațiile instituției responsabile.</p>
          <a className="feature-card__cta" href="#intreaba">Explorează serviciile<Arrow /></a>
          <span className="feature-decoration" aria-hidden="true">↗</span>
        </article>
        <article className="feature-card" id="raporteaza">
          <p className="feature-card__eyebrow"><span className="feature-number">02 / IMPLICĂ-TE</span>Începe cu strada ta</p>
          <h2 className="feature-card__title">Un oraș mai bun începe<br />cu o problemă semnalată.</h2>
          <p className="feature-card__body">Un felinar stins, un trotuar deteriorat, deșeuri neridicate. Pregătește o sesizare și află unde o poți trimite.</p>
          <button className="feature-card__cta" type="button" onClick={onReport}>Pregătește o sesizare<Arrow /></button>
        </article>
      </div>
    </section>
  );
}
