import { useEffect } from 'react';

// Sections settle in once as they enter the viewport. Content is visible without JS or with reduced motion.
export function useReveal(deps = []) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = document.querySelectorAll('[data-reveal]:not([data-revealed])');
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.setAttribute('data-revealed', ''));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute('data-revealed', '');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
