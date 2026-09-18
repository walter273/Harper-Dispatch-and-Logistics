// Homepage section carousel.
// Turns the <main> sections into a snapping horizontal track with
// prev/next controls, dot indicators and a progress counter.
(function () {
  'use strict';

  function init() {
    var main = document.querySelector('main');
    if (!main) return;

    var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section'));
    if (sections.length < 2) return;

    // On narrow screens the CSS stacks the slides vertically, so the wheel
    // would fight normal scrolling. Leave the controls out entirely.
    if (window.matchMedia('(max-width: 820px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    main.classList.add('section-carousel');

    // Give each slide a label for the dots and the live region.
    var labels = sections.map(function (s) {
      var h = s.querySelector('h1, h2');
      return h ? h.textContent.trim() : 'Section';
    });

    var bar = document.createElement('div');
    bar.className = 'carousel-controls';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Homepage section navigation');

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous section');
    prev.innerHTML = '&larr;';

    var dots = document.createElement('div');
    dots.className = 'carousel-dots';

    var progress = document.createElement('span');
    progress.className = 'carousel-progress';
    progress.setAttribute('aria-live', 'polite');

    var next = document.createElement('button');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next section');
    next.innerHTML = '&rarr;';

    var dotButtons = sections.map(function (ignoredSection, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Go to ' + labels[i]);
      b.addEventListener('click', function () { goTo(i); });
      dots.appendChild(b);
      return b;
    });

    bar.appendChild(prev);
    bar.appendChild(dots);
    bar.appendChild(progress);
    bar.appendChild(next);
    document.body.appendChild(bar);

    var current = 0;

    function goTo(i) {
      current = Math.max(0, Math.min(sections.length - 1, i));
      var target = sections[current];
      main.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
      // Also reset the slide's own internal scroll, so arriving at a slide
      // shows it from its beginning rather than midway down.
      target.scrollTo({ top: 0, behavior: 'auto' });
      render();
    }

    // A slide taller than its box must align to the top; a short one centres.
    function measure() {
      var s = sections[current];
      if (!s) return;
      if ((s.scrollHeight - s.clientHeight) > 4) { s.classList.add('overflowing'); }
      else { s.classList.remove('overflowing'); }
    }

    function render() {
      progress.textContent = (current + 1) + ' / ' + sections.length;
      prev.disabled = current === 0;
      next.disabled = current === sections.length - 1;
      dotButtons.forEach(function (b, i) {
        b.setAttribute('aria-current', i === current ? 'true' : 'false');
      });
      sections.forEach(function (s, i) {
        if (i === current) { s.removeAttribute('aria-hidden'); }
        else { s.setAttribute('aria-hidden', 'true'); }
      });
      document.body.classList.add('carousel-active');
      measure();
    }

    window.addEventListener('resize', function () { measure(); });

    prev.addEventListener('click', function () { goTo(current - 1); });
    next.addEventListener('click', function () { goTo(current + 1); });

    // Keyboard: left/right move a slide when the track itself has focus.
    main.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    });

    // Track which slide is in view as the user scrolls or swipes.
    var settle;
    main.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () {
        var best = 0;
        var bestDist = Infinity;
        sections.forEach(function (s, i) {
          var d = Math.abs(s.offsetLeft - main.scrollLeft);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        if (best !== current) { current = best; render(); }
      }, 90);
    }, { passive: true });

    // In-page nav links target section ids. Jump the track to that slide.
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var idx = sections.findIndex(function (s) { return s.id === id; });
      if (idx === -1) return;
      e.preventDefault();
      goTo(idx);
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
