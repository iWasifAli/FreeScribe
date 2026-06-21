import test from "node:test";
import assert from "node:assert/strict";
import { installCaptionDom, loadLmcl } from "./testHelpers.mjs";

function captionElement(HTMLElement, speakerText, captionText) {
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
      attrs: {
        "aria-live": "polite",
        "aria-label": "Captions"
      },
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
