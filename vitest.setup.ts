import "@testing-library/jest-dom/vitest";

// useMeasuredWidth uses ResizeObserver; jsdom doesn't implement it. Without this
// polyfill the hook still works (it falls back to a fixed width), but with it the
// measured-width path is exercised too.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
