(function initGalleryAndEvents() {
  "use strict";

  const track = document.getElementById("carouselTrack");
  const dotsContainer = document.getElementById("carouselDots");
  if (!track || !dotsContainer) return;

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function staticImages() {
    return (window.CalypsoGalleryImages || [])
      .filter((image) => /^assets\/gallery\/[a-zA-Z0-9_./-]+\.(webp|jpg|jpeg|png)$/.test(image.src))
      .map((image) => ({ src: image.src, alt: image.alt || "Le centre de loisirs Calypço" }));
  }

  function renderSlides(images) {
    if (!images.length) return;
    track.replaceChildren();
    images.forEach((image, index) => {
      const slide = document.createElement("div");
      slide.className = "carousel-slide photo-slide";
      const photo = document.createElement("img");
      photo.dataset.src = image.src;
      photo.alt = image.alt || "Le centre de loisirs Calypço";
      photo.decoding = "async";
      photo.loading = index === 0 ? "eager" : "lazy";
      if (index === 0) photo.fetchPriority = "high";
      slide.append(photo);
      track.append(slide);
    });
  }

  function renderEvents(events, fileUrl) {
    const list = document.getElementById("upcomingEventsList");
    const status = document.getElementById("upcomingEventsStatus");
    if (!list || !events.length) return;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const upcoming = events.filter((event) => new Date(event.date_evenement).getTime() >= startOfToday.getTime()).slice(0, 8);
    if (!upcoming.length) return;

    list.replaceChildren();
    upcoming.forEach((event) => {
      const eventDate = new Date(event.date_evenement);
      const card = document.createElement("article");
      card.className = "upcoming-event-card dynamic-event-card";

      const visual = document.createElement("div");
      visual.className = "upcoming-event-visual";
      if (event.image_file_id) {
        const image = document.createElement("img");
        image.src = fileUrl(event.image_file_id);
        image.alt = `Affiche de l’événement ${event.titre}`;
        image.loading = "lazy";
        image.decoding = "async";
        visual.append(image);
      } else {
        const icon = document.createElement("span");
        icon.textContent = "📅";
        visual.append(icon);
      }
      const dateBadge = document.createElement("time");
      dateBadge.className = "upcoming-event-date-badge";
      dateBadge.dateTime = event.date_evenement;
      const day = document.createElement("strong");
      day.textContent = eventDate.toLocaleString("fr-FR", { day: "2-digit" });
      const month = document.createElement("span");
      month.textContent = eventDate.toLocaleString("fr-FR", { month: "short" }).replace(".", "");
      dateBadge.append(day, month);
      visual.append(dateBadge);

      const content = document.createElement("div");
      content.className = "upcoming-event-content";
      const label = document.createElement("p");
      label.className = "upcoming-event-label";
      label.textContent = eventDate.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
      const title = document.createElement("h3");
      title.textContent = event.titre;
      const description = document.createElement("p");
      description.textContent = event.description || "Plus d’informations seront communiquées prochainement.";
      content.append(label, title, description);

      const action = document.createElement("a");
      action.className = "upcoming-event-action";
      action.href = `https://wa.me/22400000000?text=${encodeURIComponent(`Bonjour Calypço, je souhaite des informations sur l'événement : ${event.titre}`)}`;
      action.target = "_blank";
      action.rel = "noopener";
      action.textContent = "Demander sur WhatsApp →";
      content.append(action);
      card.append(visual, content);
      list.append(card);
    });
    if (status) status.innerHTML = `<span aria-hidden="true"></span> ${upcoming.length} événement${upcoming.length > 1 ? "s" : ""} à venir`;
  }

  async function start() {
    let content = { gallery: [], events: [], mode: "random" };
    try { content = await window.CalypsoPublicContent?.load() || content; } catch (_) { /* contenu intégré */ }
    window.dispatchEvent(new CustomEvent("calypso:public-content-loaded", { detail: content }));

    let images = content.gallery.map((doc) => ({
      src: window.CalypsoPublicContent.fileUrl(doc.image_file_id),
      alt: [doc.titre, doc.categorie].filter(Boolean).join(" — ") || "Le centre de loisirs Calypço"
    }));
    if (!images.length) images = staticImages();
    if (content.mode !== "manual") images = shuffle(images);
    renderSlides(images);
    renderEvents(content.events, window.CalypsoPublicContent?.fileUrl || (() => ""));

    const slides = Array.from(track.children);
    if (!slides.length) return;
    let current = 0;
    let visible = true;

    const dots = slides.map((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      dot.setAttribute("aria-label", `Afficher l’image ${index + 1}`);
      dot.addEventListener("click", () => show(index));
      dotsContainer.append(dot);
      return dot;
    });

    function show(index) {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      slides.forEach((slide, slideIndex) => slide.setAttribute("aria-hidden", String(slideIndex !== current)));
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("active", dotIndex === current);
        dot.setAttribute("aria-pressed", String(dotIndex === current));
      });
      const photo = slides[current].querySelector("img[data-src]");
      if (photo && !photo.getAttribute("src")) photo.src = photo.dataset.src;
    }

    document.getElementById("galleryNext")?.addEventListener("click", () => show(current + 1));
    document.getElementById("galleryPrev")?.addEventListener("click", () => show(current - 1));
    if (window.IntersectionObserver) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(track);
    }
    window.setInterval(() => { if (!document.hidden && visible) show(current + 1); }, 6000);
    show(0);
  }

  start();
})();
