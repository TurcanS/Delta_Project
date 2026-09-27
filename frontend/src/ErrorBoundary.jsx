import { Component } from 'react';

// Last line of defence: a rendering bug shows a way back instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error(error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash page">
        <h1>Pagina nu a putut fi afișată. / Не удалось отобразить страницу.</h1>
        <p lang="ro">Reîncărcați pagina. Conversațiile salvate nu s-au pierdut.</p>
        <p lang="ru">Обновите страницу. Сохранённые разговоры не потеряны.</p>
        <button className="primary-action" type="button" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Reîncarcă / Обновить</button>
      </main>
    );
  }
}
