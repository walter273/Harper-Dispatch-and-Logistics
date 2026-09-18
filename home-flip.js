// Homepage vertical section flip.
// Sections stack normally and each fills about one screen. Scrolling snaps
// between them so a wheel notch or a flick flips one section at a time.
// The controls are a convenience; plain scroll-snap does the real work.
(function () {
  'use strict';

  var BREAKPOINT = 960;

  function init() {
    var main = document.querySelector('main');
    if (!main) return;

    var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section'));
    if (sections.length < 2) return;

    // On narrow screens the CSS drops snapping; skip the controls entirely.
    if (window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    main.classList.add('section-flip');

    var labels = sections.map(function (s) {
      var h = s.querySelector('h1, h2');
      return h ? h.textContent.trim() : 'Section';
    });

    var bar = document.createElement('div');
    bar.className = 'flip-controls';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Homepage section navigation');

    var up = document.createElement('button');
    up.type = 'button';
    up.setAttribute('aria-label', 'Previous section');
    up.innerHTML = '&uarr;';

    var dots = document.createElement('div');
    dots.className = 'flip-dots';

    var progress = document.createElement('span');
    progress.className = 'flip-progress';
    progress.setAttribute('aria-live', 'polite');

    var down = document.createElement('button');
    down.type = 'button';
    down.setAttribute('aria-label', 'Next section');
    down.innerHTML = '&darr;';

    var current = 0;

    var dotButtons = sections.map(function (ignoredSection, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Go to ' + labels[i]);
      b.addEventListener('click', function () { goTo(i); });
      dots.appendChild(b);
      return b;
    });

    bar.appendChild(up);
    bar.appendChild(dots);
    bar.appendChild(progress);
    bar.appendChild(down);
    document.body.appendChild(bar);

    // Ask the browser to snap this section to the top of the viewport.
    function goTo(i) {
      current = Math.max(0, Math.min(sections.length - 1, i));
      sections[current].scrollIntoView({ behavior: 'smooth', block: 'start' });
      render();
    }

    // A section taller than the viewport gets top alignment so its content is
    // readable from the beginning rather than being centred and cut off.
    function measure() {
      sections.forEach(function (s) {
        if (s.scrollHeight > window.innerHeight - 140) { s.classList.add('taller-than-view'); }
        else { s.classList.remove('taller-than-view'); }
      });
    }

    function render() {
      progress.textContent = (current + 1) + ' / ' + sections.length;
      up.disabled = current === 0;
      down.disabled = current === sections.length - 1;
      dotButtons.forEach(function (b, i) {
        b.setAttribute('aria-current', i === current ? 'true' : 'false');
      });
      measure();
    }

    up.addEventListener('click', function () { goTo(current - 1); });
    down.addEventListener('click', function () { goTo(current + 1); });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'PageDown') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'PageUp') { e.preventDefault(); goTo(current - 1); }
    });

    // Track which section occupies the viewport as the user scrolls.
    var settle;
    window.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () {
        var best = 0;
        var bestDist = Infinity;
        sections.forEach(function (s, i) {
          var d = Math.abs(s.getBoundingClientRect().top);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        if (best !== current) { current = best; render(); }
      }, 80);
    }, { passive: true });

    window.addEventListener('resize', function () { measure(); render(); });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
