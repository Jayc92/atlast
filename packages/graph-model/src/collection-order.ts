/**
 * Atlast collection-ordering helpers (ADR-0016 § "Canonical serialization",
 * ADR-0021 § 3): base JCS preserves array order, so the code that assembles
 * a canonical payload must sort named collections — subjects by subject
 * identifier, assertion revisions by assertion identifier, provenance by
 * Evidence identifier — before serialization.
 *
 * S4 supplies only these reusable, pure, non-mutating helpers; the payload
 * builders that compose them are future-slice work (S5 for GraphAssertion
 * identifying payloads, S6 for snapshot canonical payloads — ADR-0021
 * §§ 3, 6). Sorting uses the one explicit locale-free UTF-16 comparator,
 * always on a copied array, never touching the caller's array or elements.
 * Current Atlast identifiers are lowercase ASCII, where UTF-16 code-unit
 * and code-point order coincide; the comparator is stated in UTF-16 terms
 * so any future alphabet expansion inherits the RFC-aligned ordering.
 */
import { compareUtf16CodeUnits } from "./utf16-comparator.ts";

/**
 * Return a new array of identifier strings sorted by raw UTF-16 code units.
 * Deterministic under any input order; the caller's array is not mutated.
 */
export function sortIdentifiers(identifiers: readonly string[]): string[] {
  return [...identifiers].sort(compareUtf16CodeUnits);
}

/**
 * Return a new array of the given elements sorted by an identifier the
 * caller extracts from each element — the generic form behind "subjects by
 * subject identifier, assertion revisions by assertion identifier,
 * provenance by Evidence identifier". Decorate–sort–undecorate: the
 * extractor is evaluated exactly once per element (never once per
 * comparison), the copied decorated array is sorted with the one explicit
 * UTF-16 comparator, and the original element references are returned.
 * Elements are never mutated. Ties (equal identifiers) keep their input
 * order (`Array.prototype.sort` is stable), so callers that require a total
 * order must supply unique identifiers, as every Atlast collection contract
 * does.
 */
export function sortByIdentifier<ElementType>(
  elements: readonly ElementType[],
  extractIdentifier: (element: ElementType) => string,
): ElementType[] {
  const decoratedElements = elements.map((element) => ({
    element,
    identifier: extractIdentifier(element),
  }));
  decoratedElements.sort((firstDecorated, secondDecorated) =>
    compareUtf16CodeUnits(
      firstDecorated.identifier,
      secondDecorated.identifier,
    ),
  );
  return decoratedElements.map((decorated) => decorated.element);
}
