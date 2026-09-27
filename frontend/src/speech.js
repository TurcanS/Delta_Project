import { useEffect, useRef, useState } from 'react';

// Browser speech: dictation for questions, read-aloud for answers. Both are progressive
// enhancements; the controls only render where the browser supports the language.
const LOCALES = { ro: 'ro-RO', ru: 'ru-RU' };
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const canDictate = Boolean(Recognition);

export function useDictation(lang, onText) {
  const [listening, setListening] = useState(false);
  const recognition = useRef(null);
  const latest = useRef(onText);
  latest.current = onText;

  useEffect(() => () => recognition.current?.abort(), []);

  function toggle() {
    if (!Recognition) return;
    if (listening) { recognition.current?.stop(); return; }
    const session = new Recognition();
    session.lang = LOCALES[lang] || 'ro-RO';
    session.interimResults = true;
    session.continuous = false;
    session.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0].transcript).join(' ');
      latest.current(text, event.results[event.results.length - 1].isFinal);
    };
    session.onend = () => setListening(false);
    session.onerror = () => setListening(false);
    recognition.current = session;
    setListening(true);
    session.start();
  }

  return { listening, toggle };
}

function voiceFor(lang) {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith(lang));
}

export function useVoice(lang) {
  const [available, setAvailable] = useState(() => Boolean(typeof window !== 'undefined' && voiceFor(lang)));
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const update = () => setAvailable(Boolean(voiceFor(lang)));
    update();
    synth.addEventListener?.('voiceschanged', update);
    return () => synth.removeEventListener?.('voiceschanged', update);
  }, [lang]);
  return available;
}

export function speak(text, lang, onEnd) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LOCALES[lang] || 'ro-RO';
  utterance.voice = voiceFor(lang) || null;
  utterance.rate = 0.95;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  synth.speak(utterance);
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();
