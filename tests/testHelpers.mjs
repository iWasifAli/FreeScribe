import { readFile } from "node:fs/promises";
import vm from "node:vm";

let cachedLmcl = null;
let cachedContext = null;

export async function loadLmcl() {
  if (cachedLmcl) {
    return cachedLmcl;
  }

  const source = await readFile(new URL("../test-dist/shared-test.js", import.meta.url), "utf8");
  const context = {
    console,
    crypto: {
      randomUUID: () => "test-uuid"
    },
    Date,
    Math
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "test-dist/shared-test.js" });
  cachedContext = context;
  cachedLmcl = context.LMCL;
  return cachedLmcl;
}

export function getLmclContext() {
  if (!cachedContext) {
    throw new Error("Call loadLmcl before reading the LMCL context.");
  }

  return cachedContext;
}

export function installCaptionDom(elements = []) {
  if (!cachedContext) {
    throw new Error("Call loadLmcl before installing caption DOM test globals.");
  }

  const nodeFilter = {
    SHOW_ELEMENT: 1,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    FILTER_SKIP: 3
  };

  class TestHTMLElement {
    constructor({ tagName = "div", text = "", attrs = {}, children = [], rect = {}, style = {}, className = "" } = {}) {
      this.tagName = tagName.toUpperCase();
      this._text = text;
      this.attrs = new Map(Object.entries(attrs));
      this.children = [];
      this.parentElement = null;
      this.className = className;
      this.style = {
        display: "block",
        visibility: "visible",
        opacity: "1",
        fontFamily: "Arial",
        ...style
      };
      this.rect = {
        top: 640,
        left: 120,
        width: 640,
        height: 36,
        right: 760,
        bottom: 676,
        ...rect
      };

      for (const child of children) {
        this.appendChild(child);
      }
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
    }

    setText(text) {
      this._text = text;
    }

    get textContent() {
      return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join(" ");
    }

    get innerText() {
      return this.textContent;
    }

    getAttribute(name) {
      return this.attrs.has(name) ? this.attrs.get(name) : null;
    }

    hasAttribute(name) {
      return this.attrs.has(name);
    }

    getBoundingClientRect() {
      return this.rect;
    }

    matches(selector) {
      return selector.split(",").some((part) => this.matchesSingleSelector(part.trim()));
    }

    matchesSingleSelector(selector) {
      if (!selector) {
        return false;
      }

      const tagName = this.tagName.toLowerCase();
      if (selector === tagName || selector === this.tagName) {
        return true;
      }

      if (selector === "a[href]") {
        return tagName === "a" && this.hasAttribute("href");
      }

      const exactAttr = selector.match(/^\[([^=\]]+)='([^']+)'\]$/);
      if (exactAttr) {
        return this.getAttribute(exactAttr[1]) === exactAttr[2];
      }

      const containsAttr = selector.match(/^\[([^=\]]+)\*='([^']+)'\s*i\]$/);
      if (containsAttr) {
        return (this.getAttribute(containsAttr[1]) || "").toLowerCase().includes(containsAttr[2].toLowerCase());
      }

      return false;
    }

    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches(selector)) {
          return current;
        }
        current = current.parentElement;
      }

      return null;
    }

    querySelectorAll(selector) {
      const matches = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.matches(selector)) {
            matches.push(child);
          }
          visit(child);
        }
      };

      visit(this);
      return matches;
    }
  }

  class TestDocument {
    constructor(rootElements) {
      this.rootElements = rootElements;
    }

    querySelectorAll(selector) {
      const matches = [];
      const visit = (node) => {
        if (node.matches(selector)) {
          matches.push(node);
        }
        for (const child of node.children) {
          visit(child);
        }
      };

      for (const element of this.rootElements) {
        visit(element);
      }

      return matches;
    }

    createTreeWalker(root, _whatToShow, walkerOptions) {
      const accepted = [];
      const visit = (node) => {
        const decision = walkerOptions.acceptNode(node);
        if (decision === nodeFilter.FILTER_ACCEPT) {
          accepted.push(node);
        }
        if (decision !== nodeFilter.FILTER_REJECT) {
          for (const child of node.children) {
            visit(child);
          }
        }
      };

      for (const child of root.children) {
        visit(child);
      }

      let index = 0;
      return {
        nextNode() {
          return accepted[index++] || null;
        }
      };
    }
  }

  const document = new TestDocument(elements);
  cachedContext.HTMLElement = TestHTMLElement;
  cachedContext.NodeFilter = nodeFilter;
  cachedContext.document = document;
  cachedContext.window = {
    innerHeight: 800,
    getComputedStyle: (element) => element.style
  };

  return { document, HTMLElement: TestHTMLElement };
}

export function baseSession(overrides = {}) {
  return {
    sessionId: "session-1",
    status: "RECORDING",
    meetingTitle: "Weekly Engineering Sync",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    meetingCode: "abc-defg-hij",
    startedAt: 1_820_000_000_000,
    endedAt: null,
    lastCapturedAt: null,
    lines: [],
    aiArtifacts: null,
    ...overrides
  };
}

export function candidate(overrides = {}) {
  return {
    speaker: "Wasif",
    text: "I pushed the backend changes.",
    rawText: "Wasif I pushed the backend changes.",
    observedAt: 1_820_000_001_000,
    ...overrides
  };
}
