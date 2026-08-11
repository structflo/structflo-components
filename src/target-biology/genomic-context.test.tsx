// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GenomicContext } from "./genomic-context";

afterEach(cleanup);

const neighbors = [
  { id: "g1", display_label: "Rv1908c", start: 100, end: 400, strand: "-", essentiality: "essential" },
  { id: "g2", display_label: "Rv1909c", start: 450, end: 700, strand: "-", essentiality: null },
];

describe("GenomicContext", () => {
  it("renders one arrow per coordinate-bearing neighbor and marks the current gene", () => {
    render(<GenomicContext centerId="g1" neighbors={neighbors} />);
    expect(screen.getByLabelText("Genomic neighborhood track")).toBeTruthy();
    expect(screen.getByText("Rv1908c")).toBeTruthy(); // current gene label always shows
  });

  it("renders the essentiality legend alongside a valid track", () => {
    render(<GenomicContext centerId="g1" neighbors={neighbors} />);
    expect(screen.getByLabelText("Essentiality legend")).toBeTruthy();
  });

  it("renders nothing with fewer than two placeable neighbors", () => {
    const { container } = render(
      <GenomicContext centerId="g1" neighbors={[neighbors[0]]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("links non-current genes via hrefFor", () => {
    render(<GenomicContext centerId="g1" neighbors={neighbors} hrefFor={(id) => `/x/${id}`} />);
    expect(screen.getByLabelText("Rv1909c").getAttribute("href")).toBe("/x/g2");
  });
});
