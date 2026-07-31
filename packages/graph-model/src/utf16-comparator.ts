/**
 * The single ordering comparator for every S4 sorting path (ADR-0021 §§ 1, 3,
 * 7): raw UTF-16 code-unit comparison, exactly what RFC 8785 § 3.2.3 requires
 * for property names and what Atlast collection ordering reuses.
 *
 * ECMAScript's `<`/`>` on strings compare raw UTF-16 code units, so this
 * explicit comparator is locale-free by construction. ADR-0021 closes the
 * comparator decision to exactly this form: no `localeCompare`, no Unicode
 * normalization, no code-point comparison — code-unit and code-point order
 * differ for supplementary-plane characters (a surrogate pair's first unit
 * sorts below BMP characters in U+E000–U+FFFF), and only code-unit order
 * agrees with conformant JCS implementations.
 */
export function compareUtf16CodeUnits(first: string, second: string): number {
  if (first < second) {
    return -1;
  }
  if (first > second) {
    return 1;
  }
  return 0;
}
