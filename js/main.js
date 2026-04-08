/**
 * CelebClub – Shared Navigation
 * Handles sidebar nav + hamburger menu for both model and manager views.
 */

document.addEventListener("DOMContentLoaded", () => {

    // Today's date in header
    const dateEl = document.getElementById("headerDate");
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString("de-DE", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        });
    }

    // Sidebar navigation
    const navItems    = document.querySelectorAll(".nav-item");
    const sections    = document.querySelectorAll(".section");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const mobileMenu   = document.getElementById("mobileMenu");
    const mobileItems  = document.querySelectorAll(".mobile-menu li");

    window.navigateTo = function(target) {
        navItems.forEach(i => i.classList.toggle("active", i.dataset.section === target));
        sections.forEach(s => s.classList.toggle("active", s.id === target));
        document.querySelector(".main-content")?.scrollTo(0, 0);
    };

    navItems.forEach(item => {
        item.addEventListener("click", () => navigateTo(item.dataset.section));
    });

    mobileItems.forEach(item => {
        item.addEventListener("click", () => {
            navigateTo(item.dataset.section);
            mobileMenu?.classList.remove("open");
        });
    });

    hamburgerBtn?.addEventListener("click", () => mobileMenu?.classList.toggle("open"));
});
