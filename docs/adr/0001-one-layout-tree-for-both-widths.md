# One Layout Tree for Both Widths

The phone layout and the wide layout (from 1024 px) render the same components in the same
structure, and differ only through CSS (Tailwind's `lg:` classes and container queries). We
chose this over rendering separate wide components from a `matchMedia` hook because a window can
cross 1024 px at any moment (a resize, an iPad turned on its side), and a swapped component tree
would remount: the timer would lose a solve in progress, an open sheet would close, and focus
would be lost. It also leaves one set of components to test.

## Consequences

- Anything that must move between layouts moves with CSS, not with the order in the page. The
  navigation stays after `<main>` and is shown at the top of the wide layout with CSS, so the
  reading and focus order are the same in both (WCAG 2.4.3).
- Sizes that a library needs as numbers, such as a chart's height in uPlot, are read from the
  container's measured size rather than chosen in JavaScript by the window's width.
