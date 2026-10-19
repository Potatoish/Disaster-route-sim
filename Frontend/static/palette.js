// Canvas and map renderers use the exact CSS palette, including PDF maps.
window.agnasPalette = (() => {
  const styles = getComputedStyle(document.documentElement);
  const token = name => styles.getPropertyValue(name).trim();
  const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  // Computed custom properties have their var() aliases resolved already.
  const color = token;
  return Object.freeze({
    flood: Object.freeze([null, ...['low', 'medium', 'high'].map(level => Object.freeze({
      fill: color(`--flood-${level}`), edge: color(`--flood-${level}-edge`),
    }))]),
    liquefaction: Object.freeze({fill: color('--liquefaction-fill'), edge: color('--liquefaction-edge')}),
    shaking: Object.freeze(['--shaking-high', '--shaking-medium', '--shaking-low'].map(name => rgb(color(name)))),
    amber: Object.freeze({
      near: rgb(token('--amber-700')), far: rgb(token('--amber-400')),
      medium: token('--amber-600'), high: token('--amber-700'), edge: token('--amber-900'),
    }),
  });
})();
