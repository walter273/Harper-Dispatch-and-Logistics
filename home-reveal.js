// Homepage scroll reveal.
// Scrolling is left completely alone. Each section fades and rises into place
// as it enters the viewport, so the page reads as panels arriving rather than
// one continuous wall of content.
//
// Progressive enhancement: if IntersectionObserver is unavailable, or the user
// prefers reduced motion, every section is simply shown and nothing animates.
(function () {
  'use strict';

  function init() {
    var main = document.querySelector('main');
    if (!main) return;

    var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section'));
    if (!sections.length) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // No observer support, or motion suppressed: leave the page untouched.
    // Sections are visible by default, so doing nothing is the safe outcome.
    if (reduce || typeof IntersectionObserver === 'undefined') return;

    main.classList.add('section-flow');
    sections.forEach(function (s) { s.classList.add('reveal'); });

    // Only now, having confirmed the observer exists, opt the page into the
    // animation. Until this line runs every section is plainly visible, so a
    // script failure can never blank the homepage.
    document.documentElement.classList.add('reveal-ready');

    // Anything already on screen at load must appear immediately, not wait for
    // a scroll that may never come.
    var vh = window.innerHeight;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      // Trigger once roughly a quarter of the section is on screen.
      threshold: 0.25,
      rootMargin: '0px 0px -10% 0px'
    });

    sections.forEach(function (s, i) {
      var box = s.getBoundingClientRect();
      // The opening section, and anything already on screen at load, appears
      // instantly with no fade. A hero that animates up from invisible reads
      // as a broken page on a slow connection.
      if (i === 0) {
        s.classList.add('reveal-in', 'reveal-instant');
        return;
      }
      if (box.top < vh * 0.8) {
        s.classList.add('reveal-in', 'reveal-instant');
        return;
      }
      observer.observe(s);
    });

    // A section only gets the "arriving" animation the first time, so scrolling
    // back up does not replay it endlessly.
    var rail = document.createElement('div');
    rail.className = 'flip-controls';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', 'Page section progress');

    var dots = document.createElement('div');
    dots.className = 'flip-dots';

    var progress = document.createElement('span');
    progress.className = 'flip-progress';
    progress.setAttribute('aria-live', 'polite');

    var dotButtons = sections.map(function (ignoredSection, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Go to section ' + (i + 1));
      b.addEventListener('click', function () {
        sections[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      dots.appendChild(b);
      return b;
    });

    rail.appendChild(dots);
    rail.appendChild(progress);
    document.body.appendChild(rail);

    var current = 0;

    function setCurrent(i) {
      if (i === current) return;
      current = i;
      progress.textContent = (i + 1) + ' / ' + sections.length;
      dotButtons.forEach(function (b, n) {
        b.setAttribute('aria-current', n === i ? 'true' : 'false');
      });
    }

    progress.textContent = '1 / ' + sections.length;
    dotButtons[0].setAttribute('aria-current', 'true');

    var settle;
    window.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () {
        var mid = window.innerHeight * 0.4;
        var best = 0;
        var bestDist = Infinity;
        sections.forEach(function (s, i) {
          var d = Math.abs(s.getBoundingClientRect().top - mid);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setCurrent(best);
      }, 90);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
