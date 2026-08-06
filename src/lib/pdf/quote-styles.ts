/**
 * Paper tokens and the quote PDF stylesheet.
 *
 * Split out of quote-document.tsx purely for length: the rules are ported from
 * the `.pdf` block of design-reference/quoting-tool/app/app.css and are kept in
 * the same order and the same dense one-rule-per-line shape so the two can be
 * diffed by eye. Nothing here reads props — it is a constant sheet.
 */

import { StyleSheet } from "@react-pdf/renderer";

/**
 * The prototype's `--brand` is `oklch(0.605 0.118 233)` — steel / Colorbond
 * blue — converted here because pdfkit parses hex and rgb() only. One constant
 * each, so re-branding the paper is an edit rather than a search.
 */
export const BRAND = "#1b8dbc";
export const BRAND_STRONG = "#0073a2";
export const BRAND_GHOST = "rgb(93, 168, 200)"; // the band's inset mark, brand + 16% white
export const INK = "#1a1d24";
export const INK_SOFT = "#5b616e";
export const HAIRLINE = "#e3e6ec";
export const PANEL = "#f6f8fb";
export const FAINT = "#9aa0ac";
export const ON_BRAND = "#ffffff";

/**
 * The design reference is an on-screen A4 at 96dpi (794px wide); PDF units are
 * points (595.28pt wide). Keeping the CSS pixel figures verbatim and converting
 * at the point of use keeps this file diffable against app.css.
 */
export const pt = (px: number): number => Math.round(px * 75) / 100;

/** CSS tracking is em-relative; React-PDF's letterSpacing is absolute. */
export const track = (px: number, em: number): number => pt(px * em);

export const BOLD = "Helvetica-Bold";

export const s = StyleSheet.create({
  page: { backgroundColor: ON_BRAND, color: INK, fontFamily: "Helvetica", fontSize: pt(12), paddingTop: pt(52), paddingBottom: pt(52), paddingHorizontal: pt(56) },

  // ── Header ───────────────────────────────────────────────────────────────
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: pt(22), borderBottomWidth: pt(3), borderBottomColor: BRAND },
  // The modern band bleeds to the paper edge by cancelling the page padding.
  band: { marginTop: -pt(52), marginHorizontal: -pt(56), marginBottom: pt(26), paddingVertical: pt(32), paddingHorizontal: pt(56), backgroundColor: BRAND, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { flexDirection: "row", alignItems: "center" },
  logoMark: { width: pt(48), height: pt(48), borderRadius: pt(11), backgroundColor: BRAND_STRONG, alignItems: "center", justifyContent: "center", marginRight: pt(13) },
  logoMarkGhost: { backgroundColor: BRAND_GHOST },
  logoName: { fontFamily: BOLD, fontSize: pt(16), lineHeight: 1.18 },
  logoTag: { fontFamily: BOLD, fontSize: pt(10), letterSpacing: track(10, 0.16), textTransform: "uppercase", color: BRAND, marginTop: pt(5) },
  org: { textAlign: "right", fontSize: pt(11), lineHeight: 1.7, color: INK_SOFT },
  orgLic: { fontFamily: BOLD, color: INK },
  onBrand: { color: ON_BRAND },

  // ── Title + meta ─────────────────────────────────────────────────────────
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: pt(26) },
  titleRowModern: { marginTop: 0 },
  title: { fontFamily: BOLD, fontSize: pt(30), lineHeight: 1 },
  meta: { textAlign: "right", fontSize: pt(12), lineHeight: 1.7, color: INK_SOFT },
  metaNumber: { fontFamily: BOLD, color: INK },

  // ── Parties + job ────────────────────────────────────────────────────────
  parties: { flexDirection: "row", marginTop: pt(26) },
  col: { flex: 1 },
  colGap: { marginRight: pt(28) },
  label: { fontFamily: BOLD, fontSize: pt(9.5), letterSpacing: track(9.5, 0.12), textTransform: "uppercase", color: BRAND, marginBottom: pt(8) },
  partyName: { fontFamily: BOLD, fontSize: pt(14), lineHeight: 1.3 },
  partyLine: { fontSize: pt(12), lineHeight: 1.6, color: INK_SOFT },
  job: { marginTop: pt(24), paddingVertical: pt(14), paddingHorizontal: pt(16), backgroundColor: PANEL, borderWidth: 1, borderColor: HAIRLINE, borderRadius: pt(8) },
  jobLabel: { fontFamily: BOLD, fontSize: pt(9), letterSpacing: track(9, 0.1), textTransform: "uppercase", color: INK_SOFT },
  jobValue: { fontFamily: BOLD, fontSize: pt(13), lineHeight: 1.3, marginTop: pt(5) },
  jobOption: { fontFamily: BOLD, fontSize: pt(10), letterSpacing: track(10, 0.1), textTransform: "uppercase", color: BRAND, marginTop: pt(7) },
  jobNote: { marginTop: pt(10), fontSize: pt(12), lineHeight: 1.55, color: INK_SOFT },

  // ── Item tables ──────────────────────────────────────────────────────────
  caption: { fontFamily: BOLD, fontSize: pt(10), letterSpacing: track(10, 0.1), textTransform: "uppercase", color: BRAND, marginTop: pt(32), marginBottom: pt(8) },
  th: { flexDirection: "row", paddingBottom: pt(8), borderBottomWidth: pt(1.5), borderBottomColor: HAIRLINE },
  thText: { fontFamily: BOLD, fontSize: pt(9.5), letterSpacing: track(9.5, 0.05), textTransform: "uppercase", color: INK_SOFT },
  tr: { flexDirection: "row", paddingVertical: pt(9), borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  td: { fontSize: pt(12), lineHeight: 1.4 },
  // The prototype gives Description 52% and lets the rest fall to auto width;
  // React-PDF has no table layout, so the remainder is apportioned explicitly.
  cDesc: { width: "44%", paddingRight: pt(16) },
  cQty: { width: "10%", paddingRight: pt(16), textAlign: "right" },
  cUnit: { width: "12%", paddingRight: pt(16) },
  cPrice: { width: "17%", paddingRight: pt(16), textAlign: "right" },
  cAmount: { width: "17%", textAlign: "right" },
  descText: { fontFamily: BOLD },
  single: { marginTop: pt(18), padding: pt(16), borderWidth: 1, borderColor: HAIRLINE, borderRadius: pt(8), flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  singleDesc: { fontFamily: BOLD, fontSize: pt(13), lineHeight: 1.4, flex: 1, paddingRight: pt(16) },
  singleAmount: { fontFamily: BOLD, fontSize: pt(15) },

  // ── Totals ───────────────────────────────────────────────────────────────
  totals: { marginTop: pt(18), flexDirection: "row", justifyContent: "flex-end" },
  totalsInner: { width: pt(280) },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: pt(7), fontSize: pt(12.5), color: INK_SOFT },
  totalValue: { color: INK },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: pt(6), paddingVertical: pt(13), paddingHorizontal: pt(16), backgroundColor: BRAND, borderRadius: pt(8) },
  grandLabel: { fontFamily: BOLD, fontSize: pt(13), color: ON_BRAND },
  grandValue: { fontFamily: BOLD, fontSize: pt(22), color: ON_BRAND },
  deposit: { marginTop: pt(8) },
  gstNote: { textAlign: "right", fontSize: pt(10), lineHeight: 1.4, color: FAINT, marginTop: pt(6) },
  extrasNote: { fontSize: pt(10.5), lineHeight: 1.5, color: INK_SOFT, marginTop: pt(9) },

  // ── Clauses + photos ─────────────────────────────────────────────────────
  clauses: { flexDirection: "row", marginTop: pt(26) },
  clauseHead: { fontFamily: BOLD, fontSize: pt(9.5), letterSpacing: track(9.5, 0.1), textTransform: "uppercase", color: BRAND, marginBottom: pt(9) },
  clauseRow: { flexDirection: "row", marginBottom: pt(7) },
  clauseIcon: { width: pt(12), marginRight: pt(8), marginTop: pt(2) },
  clauseText: { flex: 1, fontSize: pt(11), lineHeight: 1.5, color: INK_SOFT },
  clauseTextInc: { color: INK },
  photos: { marginTop: pt(24) },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -pt(5) },
  photoCell: { width: "25%", paddingHorizontal: pt(5), marginBottom: pt(10) },
  photo: { height: pt(120), objectFit: "cover", borderRadius: pt(7) },
  photoCap: { fontSize: pt(9), lineHeight: 1.4, color: INK_SOFT, marginTop: pt(4) },

  // ── Footer ───────────────────────────────────────────────────────────────
  foot: { marginTop: pt(26) },
  terms: { fontSize: pt(10.5), lineHeight: 1.55, color: INK_SOFT, paddingVertical: pt(13), paddingHorizontal: pt(15), backgroundColor: PANEL, borderWidth: 1, borderColor: HAIRLINE, borderRadius: pt(8) },
  termsLead: { fontFamily: BOLD, color: INK },
  acceptStmt: { fontFamily: BOLD, fontSize: pt(10.5), lineHeight: 1.5, color: INK, marginTop: pt(18) },
  accept: { flexDirection: "row", marginTop: pt(22) },
  acceptName: { flex: 1.4, marginRight: pt(22) },
  acceptSig: { flex: 1, marginRight: pt(22) },
  acceptDate: { flex: 0.8 },
  acceptLine: { borderBottomWidth: pt(1.5), borderBottomColor: INK, height: pt(26) },
  acceptLabel: { fontFamily: BOLD, fontSize: pt(9), letterSpacing: track(9, 0.08), textTransform: "uppercase", color: INK_SOFT, marginTop: pt(7) },
  legal: { textAlign: "center", fontSize: pt(10), lineHeight: 1.4, color: FAINT, marginTop: pt(26) },
});
