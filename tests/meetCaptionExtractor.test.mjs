import test from "node:test";
import assert from "node:assert/strict";
import { installCaptionDom, loadLmcl } from "./testHelpers.mjs";

function captionElement(HTMLElement, speakerText, captionText, attrs = {
  "aria-live": "polite",
  "aria-label": "Captions"
}) {
  const speaker = new HTMLElement({
    text: speakerText,
    rect: { top: 640, left: 140, width: 120, height: 20, right: 260, bottom: 660 }
  });
  const caption = new HTMLElement({
    text: captionText,
    rect: { top: 664, left: 140, width: 360, height: 24, right: 500, bottom: 688 }
  });

  return {
    caption,
    container: new HTMLElement({
      attrs,
      children: [speaker, caption],
      rect: { top: 620, left: 120, width: 640, height: 80, right: 760, bottom: 700 }
    })
  };
}

test("keeps lowercase leaf caption text under the current speaker", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  const { container } = captionElement(HTMLElement, "Wasif", "sounds good");
  document.rootElements = [container];

  const candidates = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].speaker, "Wasif");
  assert.equal(candidates[0].text, "sounds good");
});

test("uses parsed line content in source hashes for reused caption containers", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  const { caption, container } = captionElement(HTMLElement, "Wasif", "I think we should start with auth");
  document.rootElements = [container];

  const first = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);
  caption.setText("I think we should start with billing");
  const second = LMCL.extractCaptionCandidates(document, 1_820_000_004_000);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0].sourceNodeHash, second[0].sourceNodeHash);
});

test("detects visible Google Meet captions in an unlabelled lower overlay", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  const { container } = captionElement(
    HTMLElement,
    "Michael Shekwolo",
    "Okay.",
    {}
  );
  document.rootElements = [container];

  const candidates = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].speaker, "Michael Shekwolo");
  assert.equal(candidates[0].text, "Okay.");
});

test("uses You as a Meet self-speaker label instead of caption text", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  const { container } = captionElement(
    HTMLElement,
    "You",
    "Did you speak to the designer regarding the design?",
    {}
  );
  document.rootElements = [container];

  const candidates = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].speaker, "You");
  assert.equal(candidates[0].text, "Did you speak to the designer regarding the design?");
});

test("ignores child word fragments when a full speakered caption row exists", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  const speaker = new HTMLElement({
    text: "Wasif",
    rect: { top: 640, left: 140, width: 120, height: 20, right: 260, bottom: 660 }
  });
  const wordNodes = ["hello", "world", "from", "meet"].map((word, index) => new HTMLElement({
    tagName: "span",
    text: word,
    rect: {
      top: 664,
      left: 140 + index * 64,
      width: 56,
      height: 24,
      right: 196 + index * 64,
      bottom: 688
    }
  }));
  const caption = new HTMLElement({
    children: wordNodes,
    rect: { top: 664, left: 140, width: 360, height: 24, right: 500, bottom: 688 }
  });
  const container = new HTMLElement({
    attrs: {
      "aria-live": "polite",
      "aria-label": "Captions"
    },
    children: [speaker, caption],
    rect: { top: 620, left: 120, width: 640, height: 80, right: 760, bottom: 700 }
  });
  document.rootElements = [container];

  const candidates = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].speaker, "Wasif");
  assert.equal(candidates[0].text, "hello world from meet");
});

test("ignores unlabelled lower Meet tiles with only participant names", async () => {
  const LMCL = await loadLmcl();
  const { document, HTMLElement } = installCaptionDom();
  document.rootElements = [
    new HTMLElement({
      text: "Michael Shekwolo",
      rect: { top: 680, left: 24, width: 220, height: 24, right: 244, bottom: 704 }
    })
  ];

  const candidates = LMCL.extractCaptionCandidates(document, 1_820_000_001_000);

  assert.equal(candidates.length, 0);
});
