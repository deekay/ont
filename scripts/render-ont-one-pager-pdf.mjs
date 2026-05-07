#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs/core/ONT_ONE_PAGER.pdf");

const page = { width: 792, height: 612 };

const colors = {
  paper: [0.965, 0.925, 0.855],
  sheet: [1.0, 0.988, 0.955],
  ink: [0.12, 0.105, 0.09],
  muted: [0.36, 0.32, 0.27],
  faint: [0.91, 0.84, 0.74],
  warm: [0.985, 0.944, 0.875],
  warm2: [0.95, 0.875, 0.77],
  clay: [0.49, 0.20, 0.10],
  copper: [0.72, 0.38, 0.19],
  dark: [0.12, 0.105, 0.09],
  white: [1, 0.982, 0.94],
  green: [0.18, 0.35, 0.27]
};

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
    const courier = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

    const pageIds = [];
    for (const pageRecord of this.pages) {
      pageIds.push(
        this.addObject(
          `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${helvetica} 0 R /F2 ${helveticaBold} 0 R /F3 ${timesBold} 0 R /F4 ${courier} 0 R >> >> /Contents ${pageRecord.contentId} 0 R >>`
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

function line(x1, y1, x2, y2, stroke = colors.faint, strokeWidth = 0.8) {
  return `q ${rgb(stroke)} RG ${strokeWidth} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`;
}

function text(x, y, value, font = "F1", size = 9, color = colors.ink) {
  return `BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(value)}) Tj ET\n`;
}

function textRight(xRight, y, value, font = "F1", size = 9, color = colors.ink) {
  const kind = font === "F3" ? "serif" : "sans";
  return text(xRight - approximateWidth(value, size, kind), y, value, font, size, color);
}

function textCentered(xCenter, y, value, font = "F1", size = 9, color = colors.ink) {
  const kind = font === "F3" ? "serif" : "sans";
  return text(xCenter - approximateWidth(value, size, kind) / 2, y, value, font, size, color);
}

function textBlock({ x, y, width, value, size = 8.6, lineHeight = 11, font = "F1", color = colors.muted }) {
  let ops = "";
  let cursor = y;
  for (const row of wrapText(value, size, width, font === "F3" ? "serif" : "sans")) {
    ops += text(x, cursor, row, font, size, color);
    cursor -= lineHeight;
  }
  return { ops, y: cursor };
}

function heading(x, y, label, kicker = null) {
  let ops = "";
  if (kicker !== null) {
    ops += text(x, y + 17, kicker.toUpperCase(), "F2", 6.8, colors.clay);
  }
  ops += text(x, y, label, "F3", 15.5, colors.ink);
  ops += line(x, y - 5, x + 148, y - 5, colors.faint, 0.8);
  return ops;
}

function bulletList({
  x,
  y,
  width,
  items,
  size = 7.6,
  lineHeight = 9.3,
  itemGap = 2.8,
  color = colors.muted,
  bulletColor = colors.copper
}) {
  let ops = "";
  let cursor = y;
  const bulletSize = Math.max(2.5, size * 0.38);
  const textInset = 13;
  for (const item of items) {
    ops += rect(x, cursor + size * 0.27, bulletSize, bulletSize, bulletColor);
    const lines = wrapText(item, size, width - textInset);
    for (const row of lines) {
      ops += text(x + textInset, cursor, row, "F1", size, color);
      cursor -= lineHeight;
    }
    cursor -= itemGap;
  }
  return { ops, y: cursor };
}

function card(x, y, width, height, fill = colors.sheet, stroke = colors.faint) {
  return rect(x, y, width, height, fill, stroke, 0.75);
}

function chip(x, y, label, width) {
  let ops = "";
  ops += rect(x, y, width, 17, [0.995, 0.958, 0.892], [0.88, 0.77, 0.64], 0.6);
  ops += text(x + 8, y + 5.3, label, "F2", 6.8, colors.clay);
  return ops;
}

function btcMark(x, y, size = 10, color = colors.clay) {
  let ops = "";
  ops += text(x + size * 0.05, y, "B", "F2", size, color);
  const left = x + size * 0.20;
  const right = x + size * 0.34;
  const top = y + size * 0.92;
  const bottom = y - size * 0.25;
  ops += line(left, bottom, left, top, color, Math.max(0.85, size * 0.075));
  ops += line(right, bottom, right, top, color, Math.max(0.85, size * 0.075));
  return ops;
}

function btcAmount(x, y, amount, size = 7.6, color = colors.ink) {
  let ops = "";
  ops += btcMark(x, y - 0.2, size + 1.8, color);
  ops += text(x + size * 2.02, y, amount, "F2", size, color);
  return ops;
}

function decimalAmount(xDecimal, y, amount, size = 7.2, color = colors.ink) {
  const value = String(amount);
  const [whole, fraction] = value.split(".");
  let ops = "";
  if (fraction === undefined) {
    ops += textRight(xDecimal - 0.4, y, whole, "F2", size, color);
    return ops;
  }
  ops += textRight(xDecimal - 0.4, y, whole, "F2", size, color);
  ops += text(xDecimal, y, ".", "F2", size, color);
  ops += text(xDecimal + 2.6, y, fraction, "F2", size, color);
  return ops;
}

function renderHeader() {
  let ops = "";
  ops += rect(0, 0, page.width, page.height, colors.paper);
  ops += rect(24, 24, page.width - 48, page.height - 48, colors.sheet, [0.89, 0.80, 0.67], 0.9);
  ops += rect(24, 454, page.width - 48, 134, [0.97, 0.90, 0.79]);
  ops += text(48, 532, "Open Name Tags", "F3", 27, colors.ink);
  ops += text(48, 506, "Names you can actually own", "F3", 16.2, colors.ink);
  ops += textBlock({
    x: 48,
    y: 484,
    width: 486,
    value: "ONTs are names you can own, verify, and update. Bitcoin anchors ownership; owner-signed off-chain records keep destinations updateable; bonded auctions price scarce names without rent or third-party payments.",
    size: 9.0,
    lineHeight: 11.1,
    color: colors.muted
  }).ops;

  const panelX = 582;
  const panelY = 459;
  const panelWidth = 138;
  const panelHeight = 104;
  ops += line(558, 466, 558, 552, [0.76, 0.50, 0.34], 0.9);
  ops += rect(panelX, panelY, panelWidth, panelHeight, [0.99, 0.948, 0.865], [0.86, 0.75, 0.62], 0.55);
  ops += text(panelX + 14, panelY + panelHeight - 18, "CORE MODEL", "F2", 6.4, colors.clay);
  ops += line(panelX + 14, panelY + panelHeight - 30, panelX + panelWidth - 14, panelY + panelHeight - 30, [0.86, 0.75, 0.62], 0.45);

  const thesis = [
    ["01", "Ownership", "on Bitcoin"],
    ["02", "Records", "off-chain"],
    ["03", "Bonds", "not rent"]
  ];
  const cardWidth = panelWidth - 28;
  const cardHeight = 18;
  const cardGap = 3.6;
  const thesisX = panelX + 14;
  const numberX = thesisX + 11;
  const labelX = thesisX + 43;
  let cardTop = panelY + panelHeight - 35;
  for (const [number, title, detail] of thesis) {
    const cardY = cardTop - cardHeight;
    ops += line(thesisX, cardY + cardHeight, thesisX + cardWidth, cardY + cardHeight, [0.86, 0.75, 0.62], 0.45);
    ops += text(numberX, cardY + 6.4, number, "F2", 6.3, colors.copper);
    ops += text(labelX, cardY + 9.5, title, "F2", 6.8, colors.ink);
    ops += text(labelX, cardY + 2.2, detail, "F1", 5.8, colors.clay);
    cardTop -= cardHeight + cardGap;
  }
  return ops;
}

function renderAliceFlow() {
  const x = 48;
  const y = 300;
  const height = 96;
  const width = 212;
  const gap = 30;
  let ops = "";
  ops += text(x, 436, "HOW ONE NAME RESOLVES", "F2", 7.0, colors.clay);
  ops += text(x, 413, "Alice Example", "F3", 18.0, colors.ink);
  ops += line(x, 402, 744, 402, colors.faint, 0.8);
  const cards = [
    {
      x,
      title: "Bitcoin anchor",
      meta: "alice owner record",
      body: ["owner key: 8f3c...12ab", "bond: self-custodied bitcoin"]
    },
    {
      x: x + width + gap,
      title: "Signed off-chain bundle",
      meta: "alice destinations",
      body: ["bitcoin: bc1qxy...0wlh", "lightning: lno1q...9sa", "email: alice@example.com", "website: alice.example"]
    },
    {
      x: x + (width + gap) * 2,
      title: "Client",
      meta: "resolve alice",
      body: ["checks Bitcoin ownership", "verifies owner signature", "uses website: alice.example"]
    }
  ];

  for (const [index, item] of cards.entries()) {
    ops += card(item.x, y, width, height, index === 1 ? [0.995, 0.965, 0.915] : colors.sheet, [0.87, 0.78, 0.67]);
    ops += text(item.x + 15, y + height - 24, item.title, "F3", 13.8, colors.ink);
    ops += text(item.x + 15, y + height - 40, item.meta, "F2", 7.3, colors.clay);
    let bodyY = y + height - 57;
    for (const row of item.body) {
      ops += text(item.x + 15, bodyY, row, "F4", 7.45, colors.muted);
      bodyY -= 9.7;
    }
    if (index < cards.length - 1) {
      const arrowY = y + height / 2;
      const startX = item.x + width + 7;
      const endX = item.x + width + gap - 7;
      ops += line(startX, arrowY, endX, arrowY, colors.copper, 1.35);
      ops += text(endX - 3.5, arrowY - 3.8, ">", "F2", 9.6, colors.copper);
    }
  }

  ops += rect(x, 250, 696, 36, [0.16, 0.135, 0.105]);
  ops += textCentered(
    396,
    263.5,
    "Bitcoin answers who owns alice. The signed off-chain bundle answers where it points.",
    "F2",
    11.4,
    colors.white
  );
  return ops;
}

function renderBondCard() {
  const x = 48;
  const y = 88;
  const width = 330;
  const height = 150;
  let ops = "";
  ops += card(x, y, width, height, colors.sheet, [0.88, 0.80, 0.70]);
  ops += text(x + 18, y + height - 27, "ALLOCATION COST", "F2", 6.7, colors.clay);
  ops += text(x + 18, y + height - 49, "Bonded Bitcoin", "F3", 17.0, colors.ink);
  ops += textBlock({
    x: x + 18,
    y: y + height - 75,
    width: 134,
    value: "A bond creates real cost without paying a third party.",
    size: 9.2,
    lineHeight: 11.4,
    font: "F3",
    color: colors.ink
  }).ops;
  ops += textBlock({
    x: x + 18,
    y: y + 50,
    width: 132,
    value: "No payment to ONT or a registry. No burn. No annual rent. Bitcoin remains self-custodied.",
    size: 6.9,
    lineHeight: 8.4,
    color: colors.muted
  }).ops;
  ops += textBlock({
    x: x + 18,
    y: y + 18,
    width: 132,
    value: "Bonds mature after 1-3 years; pre-maturity transfers use buyer replacement bonds.",
    size: 6.5,
    lineHeight: 7.5,
    color: colors.muted
  }).ops;

  ops += line(x + 158, y + 26, x + 158, y + height - 66, [0.90, 0.82, 0.72], 0.65);

  const tableX = x + 174;
  const tableWidth = 140;
  const rowH = 10.6;
  const rows = [
    ["1", "1", "$100k"],
    ["2", "0.5", "$50k"],
    ["3", "0.25", "$25k"],
    ["4", "0.125", "$12.5k"],
    ["5", "0.0625", "$6.25k"],
    ["6", "0.03125", "$3.13k"],
    ["...", "...", "..."],
    ["12+", "0.0005", "$50"]
  ];

  ops += text(tableX, y + height - 27, "Example opening floors", "F2", 7.6, colors.clay);
  ops += text(tableX, y + height - 41, "Illustrative; USD assumes", "F1", 6.4, colors.muted);
  ops += btcMark(tableX + 82, y + height - 42.1, 6.0, colors.muted);
  ops += text(tableX + 91, y + height - 41, "1 = $100k.", "F1", 6.4, colors.muted);
  const headerY = y + 94;
  ops += rect(tableX, headerY, tableWidth, 15.8, [0.965, 0.90, 0.80]);
  ops += text(tableX + 7, headerY + 6.0, "Len", "F2", 6.1, colors.clay);
  ops += text(tableX + 48, headerY + 6.0, "Bond", "F2", 6.1, colors.clay);
  ops += btcMark(tableX + 70, headerY + 4.9, 6.2, colors.clay);
  ops += text(tableX + 105, headerY + 6.0, "USD", "F2", 6.1, colors.clay);

  const bondRight = tableX + 88;
  const usdRight = tableX + 132;
  let rowY = headerY - 10;
  for (const row of rows) {
    const isEllipsis = row[0] === "...";
    const rowColor = isEllipsis ? colors.muted : colors.ink;
    ops += text(tableX + 9, rowY, row[0], "F2", 6.8, rowColor);
    ops += textRight(bondRight, rowY, row[1], "F2", 6.7, rowColor);
    ops += textRight(usdRight, rowY, row[2], "F1", 6.4, colors.muted);
    ops += line(tableX + 7, rowY - 4.4, tableX + tableWidth - 7, rowY - 4.4, [0.92, 0.86, 0.78], 0.4);
    rowY -= rowH;
  }
  return ops;
}

function renderAuctionCard() {
  const x = 404;
  const y = 88;
  const width = 344;
  const height = 150;
  let ops = "";
  ops += card(x, y, width, height, colors.sheet, [0.88, 0.80, 0.70]);
  ops += text(x + 18, y + height - 27, "NAME ALLOCATION", "F2", 6.7, colors.clay);
  ops += text(x + 18, y + height - 49, "Public Auctions", "F3", 17.0, colors.ink);
  ops += textBlock({
    x: x + 18,
    y: y + height - 76,
    width: 155,
    value: "After launch, anyone can open a public auction for any valid name. Auctions settle with ordinary Bitcoin transactions; destination records stay off-chain.",
    size: 7.9,
    lineHeight: 9.8,
    color: colors.muted
  }).ops;

  ops += line(x + 188, y + 42, x + 188, y + height - 66, [0.90, 0.82, 0.72], 0.65);
  const auctionItems = [
    "public auction window",
    "opening floor",
    "competing bids raise the bond",
    "winner settles owner key"
  ];
  ops += bulletList({
    x: x + 210,
    y: y + height - 78,
    width: 116,
    items: auctionItems,
    size: 7.1,
    lineHeight: 8.9,
    itemGap: 3.1,
    bulletColor: colors.muted
  }).ops;
  return ops;
}

function renderClosingQuote() {
  let ops = "";
  ops += line(48, 79, 744, 79, [0.88, 0.80, 0.70], 0.6);
  ops += textCentered(396, 61, "If more than one participant cares about a name,", "F3", 11.5, colors.ink);
  ops += textCentered(396, 47, "the auction discovers that.", "F3", 11.5, colors.ink);
  return ops;
}

function renderFooter() {
  let ops = "";
  ops += text(48, 34, "opennametags.org", "F2", 8.2, colors.clay);
  ops += textRight(744, 34, "protocol brief / April 2026", "F1", 7.2, colors.muted);
  return ops;
}

let stream = "";
stream += renderHeader();
stream += renderAliceFlow();
stream += renderBondCard();
stream += renderAuctionCard();
stream += renderClosingQuote();
stream += renderFooter();

const pdf = new PdfDocument();
pdf.addPage(stream);

if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
fs.writeFileSync(outputPath, pdf.build());

const stats = fs.statSync(outputPath);
console.log(`${outputPath}\n${stats.size} bytes`);
