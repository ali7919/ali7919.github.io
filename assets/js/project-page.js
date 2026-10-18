/**
 * Project detail pages — scroll reveal + gallery viewer.
 * Shared by every detail-*.html page.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Reveal on scroll ---------------- */
  var revealables = document.querySelectorAll('.rn-reveal');

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

    revealables.forEach(function (el) { io.observe(el); });

    /* Failsafe: if the observer never reports anything (e.g. inside some
       embedded frames), show everything instead of leaving it hidden. */
    window.setTimeout(function () {
      if (!document.querySelector('.rn-reveal.is-in')) {
        revealables.forEach(function (el) { el.classList.add('is-in'); });
      }
    }, 2500);
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------------- Gallery viewer ---------------- */
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-viewer]'), function (viewer) {
    var stage = viewer.querySelector('.rn-stage img');
    var counter = viewer.querySelector('.rn-counter');
    var thumbs = Array.prototype.slice.call(viewer.querySelectorAll('.rn-thumb'));

    if (!stage || !thumbs.length) return;

    var current = 0;

    function show(index) {
      var thumb = thumbs[index];
      if (!thumb) return;

      var thumbImg = thumb.querySelector('img');
      if (!thumbImg) return;

      current = index;
      stage.src = thumbImg.getAttribute('data-full') || thumbImg.src;
      stage.alt = thumbImg.alt || '';

      if (counter) {
        counter.textContent = pad(index + 1) + ' / ' + pad(thumbs.length);
      }

      thumbs.forEach(function (item, i) {
        var active = i === index;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-current', active ? 'true' : 'false');
      });

      /* restart the fade-in */
      stage.style.animation = 'none';
      void stage.offsetWidth;
      stage.style.animation = '';
    }

    thumbs.forEach(function (thumb, i) {
      thumb.addEventListener('click', function () { show(i); });
    });

    viewer.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') {
        show((current + 1) % thumbs.length);
      } else if (event.key === 'ArrowLeft') {
        show((current - 1 + thumbs.length) % thumbs.length);
      }
    });

    show(0);
  });
})();
