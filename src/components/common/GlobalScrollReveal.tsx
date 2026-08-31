import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Global Scroll Reveal Animation System
 * Smoothly animates elements, cards, images, and text from left to right as the user scrolls down.
 * Explicitly DISABLED for /manager (Admin Dashboard).
 */
export const GlobalScrollReveal: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // 1. STRICT EXCLUSION: Admin/Manager Dashboard is completely excluded
    if (location.pathname.startsWith('/manager')) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const setupRevealElements = () => {
      if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

      const windowHeight = window.innerHeight;

      // Select target elements across the page
      const selectors = [
        'section',
        '.clinic-card',
        '.grid > div',
        '.space-y-12 > div',
        '.space-y-8 > div',
        'h1',
        'h2',
        'h3',
        'p.text-ink-soft',
        'p.text-ink-mute',
        'img',
        '.feature-box',
        'article',
        'form',
      ];

      const elements = Array.from(
        document.querySelectorAll(selectors.join(', '))
      ) as HTMLElement[];

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;
              target.classList.add('is-revealed');
              observer?.unobserve(target);
            }
          });
        },
        {
          root: null,
          rootMargin: '0px 0px -40px 0px',
          threshold: 0.05,
        }
      );

      elements.forEach((el, index) => {
        // Skip elements inside modals, menus, notifications bell or drawer
        if (
          el.closest('.modal-container') ||
          el.closest('#ai-drawer') ||
          el.closest('#notification-bell') ||
          el.closest('nav')
        ) {
          return;
        }

        // Already processed
        if (el.classList.contains('scroll-reveal-item') || el.classList.contains('scroll-reveal-card')) {
          return;
        }

        const rect = el.getBoundingClientRect();
        const isCard = el.classList.contains('clinic-card') || el.tagName.toLowerCase() === 'img';

        // Assign animation class
        if (isCard) {
          el.classList.add('scroll-reveal-card');
        } else {
          el.classList.add('scroll-reveal-item');
        }

        // Add stagger delay for grid children
        const parent = el.parentElement;
        if (parent && (parent.classList.contains('grid') || parent.classList.contains('flex'))) {
          const siblingIndex = Array.from(parent.children).indexOf(el);
          const staggerClass = `scroll-stagger-${(siblingIndex % 6) + 1}`;
          el.classList.add(staggerClass);
        }

        // If element is already in the viewport on initial page load, reveal it immediately
        if (rect.top < windowHeight * 0.85) {
          el.classList.add('is-revealed');
        } else {
          observer?.observe(el);
        }
      });
    };

    // Initial setup with short delay to allow DOM render
    const timeoutId = setTimeout(setupRevealElements, 80);

    // Watch for dynamically loaded content
    mutationObserver = new MutationObserver(() => {
      setupRevealElements();
    });

    const mainElement = document.querySelector('main') || document.body;
    mutationObserver.observe(mainElement, { childList: true, subtree: true });

    return () => {
      clearTimeout(timeoutId);
      if (observer) observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [location.pathname]);

  return null;
};
