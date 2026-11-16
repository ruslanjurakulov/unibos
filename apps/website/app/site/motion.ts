"use client";

import { useEffect } from "react";

/** Progressive scroll reveals: content stays visible without JS or with reduced motion. */
export function useMotionReveals(rootSelector = ".p3-site") {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || query.matches || !("IntersectionObserver" in window)) {
      return;
    }

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>("[data-motion-reveal]"),
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.classList.add("is-motion-entering", "is-motion-visible");
          let timeout = 0;
          const finish = (event?: TransitionEvent) => {
            if (
              event &&
              (event.target !== target ||
                !["opacity", "transform"].includes(event.propertyName))
            ) {
              return;
            }
            target.classList.remove("is-motion-entering");
            target.removeEventListener("transitionend", onTransitionEnd);
            window.clearTimeout(timeout);
          };
          const onTransitionEnd = (event: TransitionEvent) => finish(event);
          target.addEventListener("transitionend", onTransitionEnd);
          timeout = window.setTimeout(() => finish(), 1100);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -28px 0px" },
    );

    root.dataset.motionReady = "true";
    for (const target of targets) observer.observe(target);

    const heroArt =
      root.dataset.page === "home"
        ? root.querySelector<HTMLElement>(".p3-hero-art img")
        : null;
    let animationFrame = 0;
    const updateParallax = () => {
      if (
        !heroArt ||
        animationFrame ||
        query.matches ||
        window.innerWidth < 768
      ) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const bounds = heroArt.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > window.innerHeight) return;
        const progress =
          (window.innerHeight - bounds.top) /
          (window.innerHeight + bounds.height);
        const offset = Math.max(-8, Math.min(8, (progress - 0.5) * -16));
        heroArt.style.setProperty("--p3-parallax-y", `${offset.toFixed(1)}px`);
      });
    };
    const syncParallax = () => {
      if (query.matches) {
        for (const element of root.querySelectorAll(".is-motion-entering")) {
          element.classList.remove("is-motion-entering");
        }
      }
      if (!heroArt) return;
      if (query.matches || window.innerWidth < 768) {
        window.removeEventListener("scroll", updateParallax);
        heroArt.style.removeProperty("--p3-parallax-y");
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        return;
      }
      window.addEventListener("scroll", updateParallax, { passive: true });
      updateParallax();
    };
    syncParallax();
    query.addEventListener("change", syncParallax);
    window.addEventListener("resize", syncParallax, { passive: true });

    return () => {
      observer.disconnect();
      query.removeEventListener("change", syncParallax);
      window.removeEventListener("resize", syncParallax);
      window.removeEventListener("scroll", updateParallax);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      heroArt?.style.removeProperty("--p3-parallax-y");
      delete root.dataset.motionReady;
    };
  }, [rootSelector]);
}
