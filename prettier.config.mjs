// Near-default Prettier configuration per ADR-0007: deviations are limited to
// explicit, justified options in this one file.
export default {
  // Markdown documentation keeps its authored line breaks — reflowing prose
  // would churn every docs diff (ADR-0007: "diffs contain only meaning").
  proseWrap: "preserve",
};
