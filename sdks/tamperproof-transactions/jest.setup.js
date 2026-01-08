// Polyfill AbortController for older Node versions
if (typeof global.AbortController === 'undefined') {
  global.AbortController = class AbortController {
    constructor() {
      this.signal = {
        aborted: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    }
    abort() {
      this.signal.aborted = true;
    }
  };
}

// Mock fetch for tests
global.fetch = jest.fn();

