document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("sectorPanel");
  const closeBtn = panel.querySelector(".sector-panel__close");
  const pin = document.querySelector(".sector-pin");

  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });

  pin.addEventListener("click", () => {
    panel.style.display = "block";
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("sectorPanel");
  const closeBtn = panel.querySelector(".sector-panel__close");
  const pin = document.querySelector(".sector-pin");

  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });

  pin.addEventListener("click", () => {
    panel.style.display = "block";
  });

  // --- District hover animation ---
  // Every element that belongs to a district (dots, label, pin) shares a
  // data-sector value. Hovering (or focusing) any one of them highlights
  // all of them together.
  const districtEls = document.querySelectorAll("[data-sector]");

  const setHover = (sector, isHovered) => {
    document.querySelectorAll(`[data-sector="${sector}"]`).forEach((el) => {
      el.classList.toggle("is-hovered", isHovered);
    });
  };

  districtEls.forEach((el) => {
    const sector = el.dataset.sector;

    el.addEventListener("mouseenter", () => setHover(sector, true));
    el.addEventListener("mouseleave", () => setHover(sector, false));

    // Keyboard/focus support for the pin (it's a real button already)
    el.addEventListener("focus", () => setHover(sector, true));
    el.addEventListener("blur", () => setHover(sector, false));
  });
});
