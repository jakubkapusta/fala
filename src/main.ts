import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/fraunces/600.css';
import './style.css';

import { Renderer } from './render/renderer';

const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  document.getElementById('ui')!.innerHTML = `<div class="screen show"><h2>Ups</h2><p>Ta przeglądarka nie obsługuje WebGL2.</p></div>`;
  throw e;
}

function frame() {
  renderer.render({ fade: 0 });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
