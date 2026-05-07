#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs/research/ONT_PARAMETER_REVIEW_PACKET.pdf");

const page = { width: 792, height: 612 };

const colors = {
  paper: [0.965, 0.925, 0.855],
  sheet: [1.0, 0.988, 0.955],
  ink: [0.12, 0.105, 0.09],
  muted: [0.36, 0.34, 0.30],
  faint: [0.87, 0.80, 0.72],
  warm: [0.985, 0.944, 0.875],
  clay: [0.49, 0.20, 0.10],
  green: [0.18, 0.35, 0.27],
  line: [0.82, 0.75, 0.67]
};

const cards = [
  {
    title: "Name Rules",
    rows: [
      ["Alphabet", "a-z, 0-9"],
      ["Length", "1-32 chars"],
      ["Case", "lowercase canonical"]
    ],
    ask: "Review alphabet, maximum length, and whether every valid length opens at launch."
  },
  {
    title: "Auction Timing",
    rows: [
      ["Base window", "4,320 blocks"],
      ["Soft close", "144 blocks"],
      ["Extension cap", "none"]
    ],
    ask: "Review ~30 day auctions, ~1 day response windows, and whether no hard cap is acceptable."
  },
  {
    title: "Bid Escalation",
    rows: [
      ["Min raise", "B0.00001000"],
      ["Normal raise", "5%"],
      ["Late raise", "10%"]
    ],
    ask: "Review whether late raises should escalate further to limit close-griefing."
  },
  {
    title: "Winner Bond",
    rows: [
      ["Maturity", "52,560 blocks"],
      ["Before mature", "successor bond"],
      ["After mature", "bond releasable"]
    ],
    ask: "Review fixed ~1 year maturity versus length- or value-based maturity."
  },
  {
    title: "Bond Breaks",
    rows: [
      ["If moved early", "name releases"],
      ["Who can reopen", "anyone"],
      ["Cooldown", "none"]
    ],
    ask: "Review whether early bond breaks should release immediately, reset the floor, and allow instant rebids."
  },
  {
    title: "Destinations",
    rows: [
      ["Storage", "off-chain signed"],
      ["Payload max", "65,535 bytes"],
      ["Ordering", "strict sequence"]
    ],
    ask: "Review launch record types, payload size, resolver retention, and replication expectations."
  }
];

const bondRows = [
  ["1", "1.00000000"],
  ["2", "0.50000000"],
  ["3", "0.25000000"],
  ["4", "0.12500000"],
  ["5", "0.06250000"],
  ["6", "0.03125000"],
  ["7", "0.01562500"],
  ["8", "0.00781250"],
  ["9", "0.00390625"],
  ["10", "0.00195312"],
  ["11", "0.00097656"],
  ["12-32", "0.00050000"]
];

const reviewQuestions = [
  "Are the shortest-name floors high enough without making ownership impossible?",
  "Should the base auction window be shorter than about 30 days?",
  "Is no hard cap acceptable if late bids must clear 10 percent?",
  "Should maturity stay fixed at about 1 year or vary by length or final bond?",
  "When a bond breaks early, should the next auction reset to the length floor?",
  "Should destination records launch with a smaller constrained schema?"
];

function rgb(values) {
  return values.map((value) => value.toFixed(3)).join(" ");
}

function escapePdf(text) {
  return String(text)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function approximateWidth(text, size, font = "sans") {
  let units = 0;
  for (const ch of String(text)) {
    if (ch === " ") units += 0.27;
    else if ("il.,:;!|'`".includes(ch)) units += 0.24;
    else if ("mwMW@".includes(ch)) units += 0.78;
    else if (/[A-Z]/.test(ch)) units += font === "serif" ? 0.63 : 0.61;
    else if (/[0-9]/.test(ch)) units += 0.53;
    else units += font === "serif" ? 0.50 : 0.48;
  }
  return units * size;
}

function wrapText(text, size, maxWidth, font = "sans") {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (approximateWidth(candidate, size, font) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current !== "") lines.push(current);
  return lines;
}

class PdfDocument {
  constructor() {
    this.objects = [];
    this.pages = [];
  }

  addObject(body) {
    this.objects.push(body);
    return this.objects.length;
  }

  addPage(stream) {
    const contentId = this.addObject(
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
    );
    this.pages.push({ contentId });
  }

  build() {
    const helvetica = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const helveticaBold = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const timesBold = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");

    const pageIds = [];
    for (const pageRecord of this.pages) {
      pageIds.push(
        this.addObject(
          `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${helvetica} 0 R /F2 ${helveticaBold} 0 R /F3 ${timesBold} 0 R >> >> /Contents ${pageRecord.contentId} 0 R >>`
        )
      );
    }

    const pagesId = this.addObject(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
    );

    for (const id of pageIds) {
      this.objects[id - 1] = this.objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    }

    const catalogId = this.addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, body] of this.objects.entries()) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${this.objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i < offsets.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, "utf8");
  }
}

function rect(x, y, width, height, fill, stroke = null, strokeWidth = 0.8) {
  let op = `q ${rgb(fill)} rg `;
  if (stroke !== null) op += `${rgb(stroke)} RG ${strokeWidth} w `;
  op += `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${stroke === null ? "f" : "B"} Q\n`;
  return op;
}

function line(x1, y1, x2, y2, stroke = colors.line, strokeWidth = 0.7) {
  return `q ${rgb(stroke)} RG ${strokeWidth} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`;
}

function text(x, y, value, font = "F1", size = 9, color = colors.ink) {
  return `BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(value)}) Tj ET\n`;
}

function textRight(xRight, y, value, font = "F1", size = 9, color = colors.ink) {
  const kind = font === "F3" ? "serif" : "sans";
  return text(xRight - approximateWidth(value, size, kind), y, value, font, size, color);
}

function textBlock({ x, y, width, value, size = 7.3, lineHeight = 9.0, font = "F1", color = colors.muted }) {
  let ops = "";
  let cursor = y;
  for (const row of wrapText(value, size, width, font === "F3" ? "serif" : "sans")) {
    ops += text(x, cursor, row, font, size, color);
    cursor -= lineHeight;
  }
  return { ops, y: cursor };
}

function btcMark(x, y, size = 8, color = colors.ink) {
  let ops = "";
  ops += text(x + size * 0.05, y, "B", "F2", size, color);
  const left = x + size * 0.20;
  const right = x + size * 0.34;
  const top = y + size * 0.92;
  const bottom = y - size * 0.25;
  ops += line(left, bottom, left, top, color, Math.max(0.7, size * 0.075));
  ops += line(right, bottom, right, top, color, Math.max(0.7, size * 0.075));
  return ops;
}

function btcAmount(x, y, amount, size = 7.5, color = colors.ink) {
  let ops = "";
  ops += btcMark(x, y - 0.25, size + 1.2, color);
  ops += text(x + size * 1.75, y, amount, "F2", size, color);
  return ops;
}

function drawTable(x, y, width, rows, options = {}) {
  const rowHeight = options.rowHeight ?? 13.2;
  const labelWidth = options.labelWidth ?? width * 0.50;
  const size = options.size ?? 7.2;
  let ops = "";
  let cursor = y;

  for (const [label, value] of rows) {
    ops += line(x, cursor - 3.5, x + width, cursor - 3.5, colors.faint, 0.45);
    ops += text(x, cursor, label, "F1", size, colors.muted);
    if (String(value).startsWith("B0.")) {
      ops += btcAmount(x + labelWidth, cursor, String(value).slice(1), size, colors.ink);
    } else if (String(value).startsWith("B1.")) {
      ops += btcAmount(x + labelWidth, cursor, String(value).slice(1), size, colors.ink);
    } else {
      ops += textRight(x + width, cursor, value, "F2", size, colors.ink);
    }
    cursor -= rowHeight;
  }

  return ops;
}

function drawCard(x, y, width, height, cardData) {
  let ops = "";
  ops += rect(x, y, width, height, colors.sheet, colors.faint, 0.7);
  ops += text(x + 10, y + height - 17, cardData.title.toUpperCase(), "F2", 7.4, colors.green);
  ops += drawTable(x + 10, y + height - 34, width - 20, cardData.rows, {
    rowHeight: 12.5,
    labelWidth: width * 0.42,
    size: 6.9
  });
  const block = textBlock({
    x: x + 10,
    y: y + 24,
    width: width - 20,
    value: cardData.ask,
    size: 6.7,
    lineHeight: 8.0,
    color: colors.muted
  });
  ops += block.ops;
  return ops;
}

function bulletList(x, y, width, items) {
  let ops = "";
  let cursor = y;
  for (const item of items) {
    ops += rect(x, cursor + 2.2, 3, 3, colors.clay);
    const block = textBlock({
      x: x + 10,
      y: cursor,
      width: width - 10,
      value: item,
      size: 7.0,
      lineHeight: 8.4,
      color: colors.muted
    });
    ops += block.ops;
    cursor = block.y - 2.4;
  }
  return ops;
}

function renderHeader() {
  let ops = "";
  ops += rect(0, 0, page.width, page.height, colors.paper);
  ops += rect(18, 18, page.width - 36, page.height - 36, [0.995, 0.973, 0.925], colors.faint, 0.75);
  ops += text(34, 556, "ONT Parameter Review Packet", "F3", 26, colors.ink);
  ops += text(615, 573, "OPEN NAME TAGS", "F2", 7.4, colors.clay);
  ops += text(615, 561, "discussion draft", "F1", 8.2, colors.muted);
  const intro = textBlock({
    x: 36,
    y: 535,
    width: 520,
    value: "Prototype defaults for review before launch. These are tunable numbers around name validity, opening bond floors, auction timing, bid escalation, maturity, reauction, and destination records.",
    size: 8.8,
    lineHeight: 10.5,
    color: colors.muted
  });
  ops += intro.ops;
  ops += line(34, 512, 758, 512, colors.faint, 0.8);
  return ops;
}

function renderCards() {
  const startX = 34;
  const startY = 384;
  const width = 150;
  const height = 112;
  const gapX = 12;
  const gapY = 12;
  let ops = "";

  for (const [index, cardData] of cards.entries()) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    ops += drawCard(
      startX + col * (width + gapX),
      startY - row * (height + gapY),
      width,
      height,
      cardData
    );
  }

  return ops;
}

function renderBondCard() {
  const x = 532;
  const y = 206;
  const width = 226;
  const height = 290;
  let ops = "";
  ops += rect(x, y, width, height, colors.sheet, colors.faint, 0.7);
  ops += text(x + 12, y + height - 18, "OPENING BOND FLOORS", "F2", 7.6, colors.green);
  ops += rect(x + 12, y + height - 68, width - 24, 43, colors.warm, colors.faint, 0.5);
  ops += text(x + 22, y + height - 38, "Opening bid must clear the higher floor", "F2", 6.9, colors.clay);
  ops += line(x + 22, y + height - 45, x + width - 22, y + height - 45, colors.faint, 0.4);
  ops += text(x + 22, y + height - 56, "Length floor", "F1", 6.5, colors.clay);
  ops += text(x + 94, y + height - 56, "1-char", "F1", 6.5, colors.clay);
  ops += btcAmount(x + 126, y + height - 56, "1.00000000", 6.5, colors.clay);
  ops += text(x + 182, y + height - 56, "halves", "F1", 6.5, colors.clay);
  ops += text(x + 22, y + height - 66, "Minimum floor", "F1", 6.5, colors.clay);
  ops += btcAmount(x + 126, y + height - 66, "0.00050000", 6.5, colors.clay);
  ops += text(x + 12, y + height - 86, "Length", "F2", 6.8, colors.muted);
  ops += textRight(x + width - 12, y + height - 86, "Floor", "F2", 6.8, colors.muted);
  let cursor = y + height - 101;
  for (const [length, amount] of bondRows) {
    ops += line(x + 12, cursor - 3.6, x + width - 12, cursor - 3.6, colors.faint, 0.42);
    ops += text(x + 12, cursor, length, "F1", 7.1, colors.muted);
    ops += btcAmount(x + width - 98, cursor, amount, 7.1, colors.ink);
    cursor -= 13.0;
  }
  return ops;
}

function renderReviewCard() {
  const x = 34;
  const y = 48;
  const width = 474;
  const height = 194;
  let ops = "";
  ops += rect(x, y, width, height, colors.sheet, colors.faint, 0.7);
  ops += text(x + 12, y + height - 18, "HIGHEST-VALUE REVIEW QUESTIONS", "F2", 7.6, colors.green);
  ops += bulletList(x + 14, y + height - 38, 218, reviewQuestions.slice(0, 3));
  ops += bulletList(x + 248, y + height - 38, 206, reviewQuestions.slice(3));
  return ops;
}

function renderNoteCard() {
  const x = 532;
  const y = 48;
  const width = 226;
  const height = 140;
  let ops = "";
  ops += rect(x, y, width, height, colors.warm, colors.faint, 0.7);
  ops += text(x + 12, y + height - 18, "PROTOTYPE CONSTANT TO RESOLVE", "F2", 7.3, colors.clay);
  const block = textBlock({
    x: x + 12,
    y: y + height - 38,
    width: width - 24,
    value: "The auction path currently uses a fixed 52,560 block winner-bond maturity period. Older helper code still supports an experimental epoch-halving maturity schedule. Before launch, ONT should choose one model and remove or clearly quarantine the other.",
    size: 7.2,
    lineHeight: 9.3,
    color: colors.muted
  });
  ops += block.ops;
  return ops;
}

let stream = "";
stream += renderHeader();
stream += renderCards();
stream += renderBondCard();
stream += renderReviewCard();
stream += renderNoteCard();

const pdf = new PdfDocument();
pdf.addPage(stream);

fs.writeFileSync(outputPath, pdf.build());
console.log(outputPath);
