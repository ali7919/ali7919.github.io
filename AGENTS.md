Static portfolio site: plain HTML/CSS/JS with vendor libraries (Bootstrap, Bootstrap Icons, Swiper, Isotope, GLightbox).

## Structure
- `index.html` — the portfolio. Project cards open a project page in a GLightbox dialog (`portfolio-details-lightbox`, `data-glightbox="type: external"`). Artwork that isn't a project (e.g. "Chess Pieces") uses `portfolio-lightbox` and links straight to the image.
- `detail-*.html` — one page per project, loaded **inside that dialog's iframe**.
- `assets/css/style.css` + `assets/js/main.js` — the main site.
- `assets/css/project-page.css` + `assets/js/project-page.js` — the project page design system (`.rn-*`).

## Rules
- Don't inline `<style>` or `<script>` in a detail page. Add components to the shared files so all pages stay in sync.
- The breadcrumb `a.rn-crumb` carries `data-close-detail` and closes the dialog: it calls `parent.portfolioDetailsLightbox.close()` when same-origin, and otherwise posts `{ type: 'close-detail' }`, which `main.js` handles. Both paths are needed — the site is often opened from `file://`, where `window.parent` is unreachable. Never add "back to portfolio" links; they load the whole site inside the project iframe.
- Stylesheets and scripts carry `?version=N`. Bump it when you edit the file, or browsers serve the old copy.
- Both lightboxes share `.glightbox-container`, so dialog styling in `style.css` is scoped: the white panel applies only via `:has(.gslide-media.gslide-external)`. Keep image slides transparent and caption-free so artwork opens as a plain image, not a page.

## Known issues
- `detail-room.html` and `detail-weather.html` aren't linked from `index.html`.
- `detail-room.html` and `detail-rooms.html` are both titled "Rooms" but are different projects.
