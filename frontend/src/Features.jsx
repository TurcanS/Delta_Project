import { useLang } from './i18n';
import { Camera } from './Icons';

export default function Features({ onReport }) {
  const { t } = useLang();
  return (
    <section className="features page" aria-label={t.navAssistant} data-reveal>
      <article className="feature-card feature-card--assistant">
        <h2 className="feature-card__title">{t.featureAssistantTitle}</h2>
        <p className="feature-card__body">{t.featureAssistantBody}</p>
        <figure className="excerpt" lang="ro">
          <blockquote>Investiția totală din buget: <mark>9 300 000 MDL</mark> pentru grădinița din sectorul Centru.</blockquote>
          <figcaption>{t.featureExcerptSource}: Extinderea Grădiniței nr. 125</figcaption>
        </figure>
        <a className="feature-card__cta" href="#/asistent">{t.featureAssistantCta}</a>
      </article>
      <article className="feature-card" id="raporteaza">
        <h2 className="feature-card__title">{t.featureReportTitle}</h2>
        <p className="feature-card__body">{t.featureReportBody}</p>
        <ol className="feature-steps">
          {t.reportSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <div className="feature-card__ctas">
          <button className="feature-card__cta" type="button" onClick={onReport}><Camera />{t.featureReportCta}</button>
          <a className="text-action" href="#/probleme">{t.featureReportBoard}</a>
        </div>
      </article>
    </section>
  );
}
