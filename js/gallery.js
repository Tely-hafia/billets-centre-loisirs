(function () {
  "use strict";
  const track = document.getElementById("carouselTrack"), dotsContainer = document.getElementById("carouselDots");
  if (!track || !dotsContainer) return;
  const images = (window.CalypsoGalleryImages || []).filter(image => /^assets\/gallery\/[a-zA-Z0-9_./-]+\.(webp|jpg|jpeg|png)$/.test(image.src));
  for (let i = images.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [images[i], images[j]] = [images[j], images[i]]; }
  if (images.length) {
    track.replaceChildren();
    images.forEach((image, index) => { const slide = document.createElement("div"); slide.className = "carousel-slide photo-slide"; const photo = document.createElement("img"); photo.dataset.src = image.src; photo.alt = image.alt || "Le centre de loisirs Calypço"; photo.decoding = "async"; if (index === 0) photo.fetchPriority = "high"; slide.append(photo); track.append(slide); });
  }
  const slides = Array.from(track.children); let current = 0, paused = false, visible = true; if (!slides.length) return;
  const dots = slides.map((_, index) => { const dot = document.createElement("button"); dot.type = "button"; dot.className = "carousel-dot"; dot.setAttribute("aria-label", "Afficher l’image " + (index + 1)); dot.addEventListener("click", () => show(index)); dotsContainer.append(dot); return dot; });
  function show(index) { current = (index + slides.length) % slides.length; track.style.transform = `translateX(-${current * 100}%)`; slides.forEach((slide, i) => slide.setAttribute("aria-hidden", String(i !== current))); dots.forEach((dot, i) => { dot.classList.toggle("active", i === current); dot.setAttribute("aria-pressed", String(i === current)); }); const photo = slides[current].querySelector("img[data-src]"); if (photo && !photo.getAttribute("src")) photo.src = photo.dataset.src; }
  document.getElementById("galleryNext").addEventListener("click", () => show(current + 1)); document.getElementById("galleryPrev").addEventListener("click", () => show(current - 1));
  const pause = document.getElementById("galleryPause"); paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches || Boolean(navigator.connection?.saveData);
  function updatePause() { pause.textContent = paused ? "Démarrer le défilement" : "Mettre en pause"; pause.setAttribute("aria-pressed", String(paused)); }
  pause.addEventListener("click", () => { paused = !paused; updatePause(); });
  if (window.IntersectionObserver) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(track);
  setInterval(() => { if (!paused && !document.hidden && visible) show(current + 1); }, 6000); show(0); updatePause();
})();
