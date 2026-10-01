// Mobile composer placeholder marquee, carried over from the original UI.
// Keeps the full prompt readable in the narrow input without changing the
// input's value or accessible label.

export const HOME_PLACEHOLDER = 'App name or App Store link';

function installOnInput(input: HTMLInputElement) {
  if (input.dataset.marqueeInstalled === 'true') return;
  if (input.getAttribute('placeholder') !== HOME_PLACEHOLDER) return;
  const composer = input.closest<HTMLElement>('.composer');
  if (!composer) return;

  input.dataset.marqueeInstalled = 'true';
  input.setAttribute('placeholder', '');
  composer.classList.add('has-marquee-placeholder');

  const viewport = document.createElement('span');
  viewport.className = 'composer-marquee-placeholder';
  viewport.setAttribute('aria-hidden', 'true');
  const track = document.createElement('span');
  track.className = 'composer-marquee-track';
  for (let i = 0; i < 2; i += 1) {
    const copy = document.createElement('span');
    copy.textContent = HOME_PLACEHOLDER;
    track.append(copy);
  }
  viewport.append(track);
  composer.append(viewport);

  const sync = () => viewport.classList.toggle('is-hidden', !!input.value || document.activeElement === input);
  input.addEventListener('input', sync);
  input.addEventListener('focus', sync);
  input.addEventListener('blur', sync);
  sync();
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>('input[data-testid="input-ask"]').forEach(installOnInput);
}

export function installComposerMarquee() {
  if (typeof document === 'undefined') return;
  scan();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('input[data-testid="input-ask"]')) installOnInput(node as HTMLInputElement);
        scan(node);
      });
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLInputElement) installOnInput(mutation.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] });
}
