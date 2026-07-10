import jsPDF from "jspdf";

/**
 * Shared PDF foundation used by every document generator in this app
 * (service reports, job applications, …).
 *
 *  - `THEME`               — colors, fonts, spacing. One source of truth.
 *  - `loadImageAsDataUrl`  — CORS-safe image → data URL for embedding.
 *  - `ReportPdf`           — a chainable layout builder that owns the vertical
 *                            cursor, page breaks, and reusable primitives, so a
 *                            document composes as a list of intents rather than
 *                            raw coordinate math.
 *
 * UI-independent (no React, no DOM screenshotting): renders identically in any
 * theme, produces selectable text, and is reusable on the client or (with a
 * `save` → buffer swap) on the server.
 */

// ── Theme ────────────────────────────────────────────────────────────────────
export type RGB = readonly [number, number, number];

export const THEME = {
  marginMm: 16,
  lineHmm: 5,
  color: {
    orange: [249, 115, 22] as RGB,
    dark: [15, 23, 42] as RGB,
    grey: [100, 116, 139] as RGB,
    green: [22, 163, 74] as RGB,
    line: [226, 232, 240] as RGB,
    faint: [241, 245, 249] as RGB,
  },
  font: { h1: 18, h2: 11, body: 9.5, small: 8, footer: 7.5 },
} as const;

// ── Image loading (CORS-safe) ────────────────────────────────────────────────
export interface LoadedImage { dataUrl: string; width: number; height: number }

/** Load an external image URL into a PNG data URL; resolves null if unloadable. */
export function loadImageAsDataUrl(url: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── Layout builder ───────────────────────────────────────────────────────────
/**
 * A thin declarative wrapper over jsPDF. Owns the vertical cursor (`y`), page
 * breaks, theme, and reusable primitives. All methods are chainable.
 */
export class ReportPdf {
  readonly pdf: jsPDF;
  readonly pageW: number;
  readonly pageH: number;
  readonly margin = THEME.marginMm;
  readonly contentW: number;
  private y: number;

  constructor() {
    this.pdf = new jsPDF("p", "mm", "a4");
    this.pageW = this.pdf.internal.pageSize.getWidth();
    this.pageH = this.pdf.internal.pageSize.getHeight();
    this.contentW = this.pageW - this.margin * 2;
    this.y = this.margin;
  }

  private ink(c: RGB) { this.pdf.setTextColor(c[0], c[1], c[2]); }
  private stroke(c: RGB) { this.pdf.setDrawColor(c[0], c[1], c[2]); }
  private fill(c: RGB) { this.pdf.setFillColor(c[0], c[1], c[2]); }
  private type(style: "normal" | "bold", size: number, color: RGB) {
    this.pdf.setFont("helvetica", style);
    this.pdf.setFontSize(size);
    this.ink(color);
  }

  /** Reserve vertical space; start a new page if it wouldn't fit. */
  reserve(mm: number): this {
    if (this.y + mm > this.pageH - this.margin) { this.pdf.addPage(); this.y = this.margin; }
    return this;
  }

  gap(mm: number): this { this.y += mm; return this; }

  divider(): this {
    this.stroke(THEME.color.line);
    this.pdf.line(this.margin, this.y, this.pageW - this.margin, this.y);
    this.y += 5;
    return this;
  }

  header(title: string, subtitle: string, badge: string): this {
    this.fill(THEME.color.orange);
    this.pdf.rect(0, 0, this.pageW, 3, "F");
    this.y = this.margin + 3;
    this.type("bold", THEME.font.h1, THEME.color.dark);
    this.pdf.text(title, this.margin, this.y);
    this.type("normal", THEME.font.body, THEME.color.grey);
    this.pdf.text(subtitle, this.margin, this.y + 5);
    this.type("bold", 10, THEME.color.orange);
    this.pdf.text(badge, this.pageW - this.margin, this.y, { align: "right" });
    this.y += 11;
    return this.divider().gap(2);
  }

  sectionTitle(title: string): this {
    this.reserve(14).gap(3);
    this.type("bold", THEME.font.h2, THEME.color.orange);
    this.pdf.text(title, this.margin, this.y);
    this.y += 1.5;
    this.stroke(THEME.color.orange);
    this.pdf.setLineWidth(0.4);
    this.pdf.line(this.margin, this.y, this.margin + 26, this.y);
    this.pdf.setLineWidth(0.2);
    this.y += 5;
    return this;
  }

  /** Aligned label→value rows (label in a fixed left column). Good for metadata. */
  keyValues(rows: Array<[string, string]>, labelW = 32): this {
    for (const [label, value] of rows) {
      const lines = this.pdf.splitTextToSize(value, this.contentW - labelW);
      this.reserve(lines.length * THEME.lineHmm + 1);
      this.type("bold", THEME.font.body, THEME.color.grey);
      this.pdf.text(label.toUpperCase(), this.margin, this.y);
      this.type("normal", THEME.font.body, THEME.color.dark);
      this.pdf.text(lines, this.margin + labelW, this.y);
      this.y += Math.max(THEME.lineHmm + 1, lines.length * THEME.lineHmm);
    }
    return this;
  }

  /** Form-style field: small label on its own line, wrapped value below it.
   *  Suited to long-form answers (addresses, notes) where a fixed column cramps. */
  field(label: string, value: string): this {
    const lines = this.pdf.splitTextToSize(value || "—", this.contentW);
    this.reserve(lines.length * THEME.lineHmm + 6);
    this.type("bold", THEME.font.small, THEME.color.grey);
    this.pdf.text(label.toUpperCase(), this.margin, this.y);
    this.y += 4.5;
    this.type("normal", THEME.font.body, THEME.color.dark);
    this.pdf.text(lines, this.margin, this.y);
    this.y += lines.length * THEME.lineHmm + 3;
    return this;
  }

  /** A question (left, wraps) with its answer (right-aligned) and a hairline.
   *  Suited to short answers (yes/no clinical Q&A). */
  qaRow(question: string, answer: string, answerW = 30): this {
    const qLines = this.pdf.splitTextToSize(question, this.contentW - answerW - 4);
    const aLines = this.pdf.splitTextToSize(answer, answerW);
    const rowH = Math.max(qLines.length, aLines.length) * THEME.lineHmm + 3;
    this.reserve(rowH);
    this.type("bold", THEME.font.body, THEME.color.dark);
    this.pdf.text(qLines, this.margin, this.y);
    this.type("normal", THEME.font.body, THEME.color.grey);
    this.pdf.text(aLines, this.pageW - this.margin, this.y, { align: "right" });
    this.y += rowH;
    this.stroke(THEME.color.faint);
    this.pdf.line(this.margin, this.y - 1.5, this.pageW - this.margin, this.y - 1.5);
    return this;
  }

  checkItem(label: string, done: boolean): this {
    const lines = this.pdf.splitTextToSize(label, this.contentW - 9);
    const rowH = lines.length * THEME.lineHmm + 1.5;
    this.reserve(rowH);
    this.type("bold", THEME.font.body, done ? THEME.color.green : THEME.color.grey);
    this.pdf.text(done ? "[x]" : "[  ]", this.margin, this.y);
    this.type("normal", THEME.font.body, THEME.color.dark);
    this.pdf.text(lines, this.margin + 9, this.y);
    this.y += rowH;
    return this;
  }

  paragraph(text: string): this {
    this.type("normal", THEME.font.body, THEME.color.dark);
    const lines = this.pdf.splitTextToSize(text, this.contentW);
    this.reserve(lines.length * THEME.lineHmm);
    this.pdf.text(lines, this.margin, this.y);
    this.y += lines.length * THEME.lineHmm;
    return this;
  }

  /** Draw a labelled signature at a fixed x on the current row (does not advance y). */
  signature(label: string, image: LoadedImage | null, x: number, boxW = 62, maxH = 22): this {
    this.type("bold", THEME.font.small, THEME.color.grey);
    this.pdf.text(label.toUpperCase(), x, this.y);
    let lineY = this.y + 20;
    if (image) {
      const h = Math.min(maxH, (boxW * image.height) / image.width);
      this.pdf.addImage(image.dataUrl, "PNG", x, this.y + 2, boxW, h);
      lineY = this.y + 2 + h + 2;
    }
    this.stroke(THEME.color.line);
    this.pdf.line(x, lineY, x + boxW, lineY);
    return this;
  }

  /** Stamp a footer (left text + "Page N of M") on every page. Call last. */
  footer(text: string): this {
    const pages = this.pdf.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      this.pdf.setPage(p);
      this.type("normal", THEME.font.footer, THEME.color.grey);
      this.pdf.text(text, this.margin, this.pageH - 8);
      this.pdf.text(`Page ${p} of ${pages}`, this.pageW - this.margin, this.pageH - 8, { align: "right" });
    }
    return this;
  }

  save(filename: string): void { this.pdf.save(filename); }
}
