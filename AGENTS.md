This is a static portfolio and project showcase website.
It uses plain HTML, CSS, JavaScript, and vendor libraries like Bootstrap, Swiper, Isotope, and GLightbox.

## General Guidelines
- Modify HTML files in the root directory for content updates.
- Site-wide styling goes into `assets/css/style.css`; project detail styling goes into `assets/css/project-page.css` (see below).
- Site-wide JavaScript goes into `assets/js/main.js`; project detail behaviour goes into `assets/js/project-page.js`.

## Structure

- `index.html` — the portfolio itself. Project cards open their detail page in a
  GLightbox dialog (`class="... portfolio-details-lightbox"`, `data-glightbox="type: external"`).
- `detail-*.html` — one page per project, loaded **inside that dialog's iframe**.
- `assets/css/style.css` — design tokens and the main site.
- `assets/css/project-page.css` — the project detail design system (`.rn-*` classes).
- `assets/js/main.js` — main site behaviour (nav, isotope, swiper, lightboxes).
- `assets/js/project-page.js` — detail page behaviour (scroll reveal, gallery viewer, close).
- `assets/img/portfolio/` — card thumbnails, also used as detail page header icons.
- `assets/img/details/` — screenshots used by the detail pages.
- `assets/videos/` — local clips and GIFs used by the detail pages.

## Project detail pages

All `detail-*.html` share one design language, defined once in
`assets/css/project-page.css` and `assets/js/project-page.js`.

**Do not inline a `<style>` or `<script>` block in a detail page.** Add new
components to the shared files so every page stays in sync. (Routino was the
original reference implementation; its styles were extracted into the shared
file, so it is no longer special.)

Every page follows the same skeleton:

```
.rn > .rn-shell
  nav.rn-topbar      breadcrumb + .rn-chips tags
  header.rn-head     .rn-head-icon (76px) + .rn-title + .rn-subtitle
  section.rn-section.rn-detail   media column + .rn-detail-body > .rn-panel
  section.rn-cta     dark action bar — only when the project has an external link
  .rn-footer         signature line
```

Panel contents: `.rn-eyebrow` label, optional `.rn-status` pill, `.rn-meta`
(label/value grid), then `.rn-story` paragraphs and/or `.rn-list` bullets.

Media components:

- **Single image** — `figure.rn-frame` with a `.rn-frame-bar` (three dots + `.rn-frame-title`).
- **Video** — same frame, `<video muted autoplay loop playsinline controls poster="...">`.
  `muted` is required or browsers refuse to autoplay.
- **Tall media** (the paper pages) — wrap the `<img>` in `.rn-stage` so it is
  contained to a fixed height instead of running the full column width.
- **Multiple images** — `figure.rn-frame.rn-viewer[data-viewer]`, containing a
  `.rn-stage` and a `.rn-thumbs` of `button.rn-thumb`. The JS swaps the stage
  image and keeps `.rn-counter` (`01 / 05`) in sync; keep the counter's total
  equal to the number of thumbnails.
- **LinkedIn embeds** — `figure.rn-frame` + `.rn-embed` + `<iframe>`.
- **More than one frame** — wrap them in `.rn-media-stack` inside the media column.

Links: the breadcrumb `a.rn-crumb` carries `data-close-detail`, which asks the
parent window to close the GLightbox dialog (and falls back to its `href` when
the page is opened on its own). Do not add "back to portfolio" / "all projects"
links to the body or footer — closing the dialog is the way back, and any such
link would load the whole site inside the project iframe.

## Conventions

- Stylesheets and scripts carry a `?version=N` cache-buster: `style.css`,
  `project-page.css` and `project-page.js` on detail pages, `main.js` in
  `index.html`. Bump the number when you change the file, or browsers keep
  serving the old copy.
- `.rn` inherits `--font-sans`, `--font-display`, `--radius-full` and `--ease`
  from `style.css`. Detail pages reset `#main { margin-left: 0 }`, because
  `style.css` offsets `#main` for the fixed desktop nav.
- Prefer the clips already in `assets/videos/` over remote
  `user-images.githubusercontent.com` URLs, which rot.
- Every page repeats the same head (fonts, Bootstrap, Bootstrap Icons). Copy an
  existing page rather than writing one from scratch.

## Known rough edges

- `detail-room.html` and `detail-weather.html` are not linked from `index.html`.
- `detail-room.html` and `detail-rooms.html` are both titled "Rooms" but are
  different projects: a procedural generation prototype vs. a first-person puzzle game.
