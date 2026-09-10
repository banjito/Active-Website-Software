import * as XLSX from "xlsx";
import type { ExcelCell, ExcelImportIssue, ExcelSheet, ExcelWorkbookAnalysis } from "@/lib/customForms/excel/types";

export const EXCEL_WORKBOOK_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  partBytes: 12 * 1024 * 1024,
  payloadBytes: 8 * 1024 * 1024,
  zipEntries: 2048,
  sheets: 64,
  storedCells: 250_000,
  cells: 50_000,
  merges: 20_000,
  validations: 10_000,
  names: 10_000,
  textLength: 32_767,
});

const MAX_ROW = 1_048_576;
const MAX_COLUMN = 16_384;
const decoder = new TextDecoder("utf-8", { fatal: true });
/** Own-property check without Object.hasOwn, which this project's ES2020 target lacks. */
const hasOwn = (target: object, key: string) => Object.prototype.hasOwnProperty.call(target, key);
const encoder = new TextEncoder();

function fail(message: string): never {
  throw new Error(`Excel import: ${message}`);
}

function limit(ok: boolean, description: string): asserts ok {
  if (!ok) fail(`${description} limit exceeded. Nothing was imported; split or simplify the workbook.`);
}

function checkFile(fileName: string, size: number) {
  if (!/\.xlsx$/i.test(fileName)) fail("Only .xlsx files are supported. .xls, .xlsm, .xlsb and other formats are not accepted; save a macro-free .xlsx copy in Excel.");
  limit(fileName.length <= 255, "File name length");
  limit(size <= EXCEL_WORKBOOK_LIMITS.fileBytes, "10 MB file size");
  if (size < 22) fail("The file is empty or is not a valid .xlsx ZIP package.");
}

/** Reads locally only. SheetJS parses stored formulas; it never calculates them here. */
export async function readExcelWorkbook(file: File): Promise<ExcelWorkbookAnalysis> {
  checkFile(file.name, file.size);
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    fail("The selected file could not be read.");
  }
  return analyzeExcelWorkbook(buffer, file.name);
}

// Check the DEFLATE stream before handing it to SheetJS. ZIP size headers alone
// cannot bound a forged stream, and SheetJS's inflater does not enforce that bound.
function checkDeflate(data: Uint8Array, expectedSize: number) {
  let bit = 0;
  let produced = 0;
  const bits = (count: number) => {
    if (bit + count > data.length * 8) fail("Truncated ZIP compression stream.");
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value |= ((data[bit >>> 3] >>> (bit & 7)) & 1) << i;
    return value;
  };
  const tree = (lengths: number[]) => {
    const counts = new Array<number>(16).fill(0);
    for (const length of lengths) counts[length]++;
    counts[0] = 0;
    let remaining = 1;
    const next = new Array<number>(16).fill(0);
    for (let length = 1; length <= 15; length++) {
      remaining = remaining * 2 - counts[length];
      if (remaining < 0) fail("Invalid ZIP compression code table.");
      next[length] = (next[length - 1] + counts[length - 1]) * 2;
    }
    const tables = Array.from({ length: 16 }, () => new Map<number, number>());
    lengths.forEach((length, symbol) => {
      if (length) tables[length].set(next[length]++, symbol);
    });
    return tables;
  };
  const symbol = (tables: ReturnType<typeof tree>) => {
    let code = 0;
    for (let length = 1; length <= 15; length++) {
      code = (code << 1) | bits(1);
      const value = tables[length].get(code);
      if (value !== undefined) return value;
    }
    return fail("Invalid ZIP compression code.");
  };
  const lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const distanceBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  let final = 0;
  do {
    final = bits(1);
    const mode = bits(2);
    if (mode === 0) {
      bit = Math.ceil(bit / 8) * 8;
      const length = bits(16);
      if ((length ^ bits(16)) !== 0xffff) fail("Invalid stored ZIP block.");
      bit += length * 8;
      if (bit > data.length * 8) fail("Truncated stored ZIP block.");
      produced += length;
    } else {
      if (mode === 3) fail("Invalid ZIP compression mode.");
      let literals: ReturnType<typeof tree>;
      let distances: ReturnType<typeof tree>;
      if (mode === 1) {
        literals = tree(Array.from({ length: 288 }, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
        distances = tree(new Array(32).fill(5));
      } else {
        const literalCount = bits(5) + 257;
        const distanceCount = bits(5) + 1;
        const codeCount = bits(4) + 4;
        if (literalCount > 286) fail("Invalid ZIP literal count.");
        // RFC 1951 section 3.2.7, written out: the order code lengths are
        // stored in. Anything else misreads every dynamic Huffman block, which
        // is what Excel actually writes.
        const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const codeLengths = new Array(19).fill(0);
        for (let i = 0; i < codeCount; i++) codeLengths[order[i]] = bits(3);
        const codeTree = tree(codeLengths);
        const lengths: number[] = [];
        while (lengths.length < literalCount + distanceCount) {
          const code = symbol(codeTree);
          if (code <= 15) lengths.push(code);
          else {
            if (code === 16 && !lengths.length) fail("Invalid repeated ZIP code.");
            const count = code === 16 ? bits(2) + 3 : code === 17 ? bits(3) + 3 : bits(7) + 11;
            const value = code === 16 ? lengths[lengths.length - 1] : 0;
            if (lengths.length + count > literalCount + distanceCount) fail("Invalid ZIP code lengths.");
            for (let i = 0; i < count; i++) lengths.push(value);
          }
        }
        if (!lengths[256]) fail("Missing ZIP end-of-block code.");
        literals = tree(lengths.slice(0, literalCount));
        distances = tree(lengths.slice(literalCount));
      }
      for (;;) {
        const code = symbol(literals);
        if (code === 256) break;
        if (code < 256) produced++;
        else {
          if (code > 285) fail("Invalid ZIP length code.");
          const index = code - 257;
          const extra = index < 8 || index === 28 ? 0 : Math.floor((index - 4) / 4);
          const length = lengthBase[index] + bits(extra);
          const distanceCode = symbol(distances);
          if (distanceCode > 29) fail("Invalid ZIP distance code.");
          const distance = distanceBase[distanceCode] + bits(distanceCode < 4 ? 0 : Math.floor(distanceCode / 2) - 1);
          if (distance > produced) fail("Invalid ZIP back-reference.");
          produced += length;
        }
        if (produced > expectedSize) fail("ZIP content exceeds its declared size. Nothing was imported.");
      }
    }
    if (produced > expectedSize) fail("ZIP content exceeds its declared size. Nothing was imported.");
  } while (!final);
  if (produced !== expectedSize || Math.ceil(bit / 8) !== data.length) fail("ZIP compressed content size does not match its headers.");
}

interface ZipEntry { name: string; size: number; crc: number }

function checkZip(source: Uint8Array): { bytes: Uint8Array; entries: ZipEntry[] } {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  if (u32(0) !== 0x04034b50) fail("The file does not have an .xlsx ZIP signature (encrypted workbooks are not supported).");
  let end = source.length - 22;
  while (end >= Math.max(0, source.length - 65_557) && u32(end) !== 0x06054b50) end--;
  if (end < Math.max(0, source.length - 65_557) || end + 22 + u16(end + 20) !== source.length) fail("Invalid ZIP directory.");
  const count = u16(end + 10);
  const directory = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count === 0xffff) fail("Split and ZIP64 packages are not supported.");
  limit(count <= EXCEL_WORKBOOK_LIMITS.zipEntries, "ZIP entry count");
  if (!count || directory + u32(end + 12) !== end) fail("Invalid ZIP directory bounds.");
  const bytes = source.slice();
  const patched = new DataView(bytes.buffer);
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const intervals: { start: number; end: number }[] = [];
  let offset = directory;
  let expanded = 0;
  const checkExtra = (start: number, length: number) => {
    const stop = start + length;
    while (start < stop) {
      if (start + 4 > stop || start + 4 + u16(start + 2) > stop) fail("Invalid ZIP extra fields.");
      if (u16(start) === 1) fail("ZIP64 packages are not supported.");
      start += 4 + u16(start + 2);
    }
  };
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail("Invalid ZIP directory entry.");
    const flags = u16(offset + 8);
    const method = u16(offset + 10);
    const crc = u32(offset + 16);
    const compressed = u32(offset + 20);
    const size = u32(offset + 24);
    const nameLength = u16(offset + 28);
    const extraLength = u16(offset + 30);
    const next = offset + 46 + nameLength + extraLength + u16(offset + 32);
    const local = u32(offset + 42);
    if (flags & ~0x080e || (method !== 0 && method !== 8) || u16(offset + 34)) fail("Encrypted or unsupported ZIP entries are not accepted.");
    if (next > end || local + 30 > directory || u32(local) !== 0x04034b50) fail("Invalid ZIP entry bounds.");
    const name = decoder.decode(source.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || name.length > 512 || /[\\\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === "." || p === "..") || names.has(name.toLowerCase())) fail("Unsafe or duplicate ZIP entry path.");
    names.add(name.toLowerCase());
    limit(size <= EXCEL_WORKBOOK_LIMITS.partBytes, "Uncompressed ZIP part size");
    expanded += size;
    limit(expanded <= EXCEL_WORKBOOK_LIMITS.expandedBytes, "Uncompressed workbook size");
    if (u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLength) fail("Conflicting ZIP entry headers.");
    const localExtra = u16(local + 28);
    const start = local + 30 + nameLength + localExtra;
    let stop = start + compressed;
    if (stop > directory || decoder.decode(source.subarray(local + 30, local + 30 + nameLength)) !== name) fail("Invalid local ZIP entry.");
    checkExtra(offset + 46 + nameLength, extraLength);
    checkExtra(local + 30 + nameLength, localExtra);
    if (flags & 8) {
      const descriptor = stop + (stop + 4 <= directory && u32(stop) === 0x08074b50 ? 4 : 0);
      if (descriptor + 12 > directory || u32(descriptor) !== crc || u32(descriptor + 4) !== compressed || u32(descriptor + 8) !== size) fail("Invalid ZIP data descriptor.");
      stop = descriptor + 12;
      // Avoid SheetJS's growable inflater for valid streaming ZIP headers.
      patched.setUint32(local + 18, compressed, true);
      patched.setUint32(local + 22, size, true);
    } else if (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== size) fail("Conflicting ZIP sizes or checksums.");
    if (method === 0) {
      if (compressed !== size) fail("Invalid stored ZIP size.");
    } else checkDeflate(source.subarray(start, start + compressed), size);
    intervals.push({ start: local, end: stop });
    entries.push({ name, size, crc });
    offset = next;
  }
  if (offset !== end) fail("Invalid ZIP directory length.");
  intervals.sort((a, b) => a.start - b.start);
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i].start !== (i ? intervals[i - 1].end : 0)) fail("Overlapping or unlisted ZIP content.");
  }
  if (intervals[intervals.length - 1].end !== directory) fail("Unlisted ZIP content.");
  return { bytes, entries };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type Attributes = Record<string, string>;
interface XmlVisitor {
  open?: (name: string, attrs: Attributes, parent?: string) => void;
  text?: (text: string, parent: string) => void;
  close?: (name: string) => void;
}

function unescapeXml(text: string): string {
  return text.replace(/&([^;\s<&]*);|&/g, (whole, entity: string | undefined) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity && hasOwn(named, entity)) return named[entity];
    if (entity && /^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)) return String.fromCodePoint(code);
    }
    return fail("Unsupported or invalid XML entity. DTDs and external entities are not accepted.");
  });
}

/** Small bounded XML reader: no DOM, DTDs, entity expansion, evaluation or URLs. */
function walkXml(xml: string, visitor: XmlVisitor = {}) {
  const stack: string[] = [];
  let offset = 0;
  let roots = 0;
  let tokens = 0;
  const local = (name: string) => name.slice(name.lastIndexOf(":") + 1);
  while (offset < xml.length) {
    limit(++tokens <= 2_000_000, "XML token count");
    if (xml[offset] !== "<") {
      const end = xml.indexOf("<", offset);
      const text = unescapeXml(xml.slice(offset, end < 0 ? xml.length : end));
      if (!stack.length && text.trim()) fail("Invalid text outside XML root.");
      if (stack.length) visitor.text?.(text, local(stack[stack.length - 1]));
      offset = end < 0 ? xml.length : end;
      continue;
    }
    const special = xml.startsWith("<!--", offset) ? ["-->", 4] as const : xml.startsWith("<![CDATA[", offset) ? ["]]>", 9] as const : xml.startsWith("<?", offset) ? ["?>", 2] as const : undefined;
    if (special) {
      const end = xml.indexOf(special[0], offset + special[1]);
      if (end < 0) fail("Unterminated XML section.");
      if (special[1] === 9) {
        if (!stack.length) fail("Invalid XML CDATA section.");
        visitor.text?.(xml.slice(offset + 9, end), local(stack[stack.length - 1]));
      }
      offset = end + special[0].length;
      continue;
    }
    if (xml.startsWith("<!", offset)) fail("XML declarations, DTDs and external entities are not accepted.");
    let end = offset + 1;
    let quote = "";
    for (; end < xml.length; end++) {
      limit(end - offset <= 65_536, "XML tag length");
      const char = xml[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      else if (char === "<") fail("Invalid XML tag.");
    }
    if (end === xml.length) fail("Unterminated XML tag.");
    const tag = xml.slice(offset + 1, end);
    offset = end + 1;
    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      if (stack.pop() !== name) fail("Mismatched XML tags.");
      visitor.close?.(local(name));
      continue;
    }
    const match = /^([A-Za-z_][\w.:-]*)/.exec(tag);
    if (!match) fail("Invalid XML element.");
    const name = match[1];
    const selfClosing = /\/\s*$/.test(tag);
    const body = selfClosing ? tag.replace(/\/\s*$/, "") : tag;
    const attrs: Attributes = Object.create(null);
    const pattern = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
    let at = name.length;
    while (at < body.length && body.slice(at).trim()) {
      pattern.lastIndex = at;
      const attr = pattern.exec(body);
      if (!attr || hasOwn(attrs, attr[1])) fail("Invalid or duplicate XML attribute.");
      attrs[attr[1]] = unescapeXml(attr[2] ?? attr[3]);
      at = pattern.lastIndex;
    }
    if (!stack.length && ++roots !== 1) fail("Multiple XML roots.");
    visitor.open?.(local(name), attrs, stack.length ? local(stack[stack.length - 1]) : undefined);
    if (selfClosing) visitor.close?.(local(name));
    else {
      stack.push(name);
      limit(stack.length <= 128, "XML nesting depth");
    }
  }
  if (stack.length || roots !== 1) fail("Incomplete XML document.");
}

function address(value: string): XLSX.CellAddress {
  if (!/^\$?[A-Z]{1,3}\$?[1-9][0-9]{0,6}$/.test(value)) fail("Invalid physical cell address.");
  const cell = XLSX.utils.decode_cell(value);
  if (cell.r >= MAX_ROW || cell.c >= MAX_COLUMN) fail("Cell address exceeds Excel's worksheet bounds.");
  return cell;
}
function range(value: string): XLSX.Range {
  const pieces = value.split(":");
  if (pieces.length > 2) fail("Invalid worksheet range.");
  const s = address(pieces[0]);
  const e = address(pieces[1] ?? pieces[0]);
  if (s.r > e.r || s.c > e.c) fail("Reversed worksheet range.");
  return { s, e };
}
function expand(target: XLSX.Range | undefined, addition: XLSX.Range): XLSX.Range {
  if (!target) return { s: { ...addition.s }, e: { ...addition.e } };
  return { s: { r: Math.min(target.s.r, addition.s.r), c: Math.min(target.s.c, addition.s.c) }, e: { r: Math.max(target.e.r, addition.e.r), c: Math.max(target.e.c, addition.e.c) } };
}
function intersects(a: XLSX.Range, b: XLSX.Range) {
  return a.s.r <= b.e.r && a.e.r >= b.s.r && a.s.c <= b.e.c && a.e.c >= b.s.c;
}
function textLimit(value: string) {
  limit(value.length <= EXCEL_WORKBOOK_LIMITS.textLength, "Cell/formula text length");
  return value;
}

interface RawPart { content?: Uint8Array | number[] | string }
function partText(part: RawPart | undefined): string {
  if (!part?.content) fail("Required workbook XML content is unavailable.");
  const content = part.content;
  const text = typeof content === "string" ? content : decoder.decode(content instanceof Uint8Array ? content : Uint8Array.from(content));
  limit(text.length <= EXCEL_WORKBOOK_LIMITS.partBytes, "XML part size");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail("Unsupported XML encoding or control characters.");
  return text.replace(/^\uFEFF/, "");
}

interface RawCell { formula?: string; hasFormula: boolean; value: string; type?: string; hasValue: boolean; inline: string }
interface SheetXml {
  cells: Map<string, RawCell>;
  validations: ExcelSheet["validations"];
  merges: string[];
  arrayFormulas: boolean;
  conditionalFormatting: boolean;
  drawings: boolean;
}
function worksheetXml(xml: string): SheetXml {
  const result: SheetXml = { cells: new Map(), validations: [], merges: [], arrayFormulas: false, conditionalFormatting: false, drawings: false };
  let cell: RawCell | undefined;
  let cellAddress = "";
  let validation: ExcelSheet["validations"][number] | undefined;
  let capture: "formula1" | "formula2" | "range" | undefined;
  walkXml(xml, {
    open(name, attrs, parent) {
      if (name === "c" && parent === "row") {
        if (cell || !attrs.r) fail("Cells without explicit physical addresses are not supported.");
        cellAddress = XLSX.utils.encode_cell(address(attrs.r));
        cell = { hasFormula: false, value: "", type: attrs.t, hasValue: false, inline: "" };
      } else if (cell && name === "f") {
        cell.hasFormula = true;
        cell.formula = "";
        if (attrs.t === "array" || attrs.ref) result.arrayFormulas ||= attrs.t === "array";
        if (attrs.t === "dataTable") fail("Excel data-table formulas cannot be preserved by this importer.");
      } else if (cell && name === "v") cell.hasValue = true;
      if (name === "mergeCell") result.merges.push(XLSX.utils.encode_range(range(attrs.ref ?? "")));
      if (name === "dataValidation") {
        if (validation) fail("Nested data validations are not supported.");
        validation = { range: attrs.sqref ?? "", type: attrs.type ?? "none" };
      } else if (validation && (name === "formula1" || name === "formula2")) {
        capture = name;
        validation[name] = "";
      } else if (validation && name === "sqref") { capture = "range"; validation.range = ""; }
      if (name === "conditionalFormatting") result.conditionalFormatting = true;
      if (name === "drawing" || name === "legacyDrawing") result.drawings = true;
    },
    text(text, parent) {
      if (cell) {
        if (parent === "f") cell.formula = textLimit((cell.formula ?? "") + text);
        else if (parent === "v") cell.value = textLimit(cell.value + text);
        else if (parent === "t") cell.inline = textLimit(cell.inline + text);
      }
      if (validation && capture) validation[capture] = textLimit((validation[capture] ?? "") + text);
    },
    close(name) {
      if (name === "c" && cell) {
        if (result.cells.has(cellAddress)) fail("Duplicate physical cells would lose workbook content.");
        result.cells.set(cellAddress, cell);
        cell = undefined;
      }
      if (name === "formula1" || name === "formula2" || name === "sqref") capture = undefined;
      if (name === "dataValidation" && validation) {
        if (!validation.range.trim()) fail("A data validation has no readable cell range.");
        validation.range = validation.range.trim().split(/\s+/).map(r => XLSX.utils.encode_range(range(r))).join(" ");
        if (validation.type === "list" && /^"[\s\S]*"$/.test(validation.formula1 ?? "")) {
          validation.options = validation.formula1!.slice(1, -1).replace(/""/g, '"').split(",");
        }
        result.validations.push(validation);
        validation = undefined;
      }
    },
  });
  return result;
}

function resolvePart(base: string, target: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || /[\\\x00?#]/.test(target)) fail("Invalid internal workbook relationship.");
  const segments = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!segments.length) fail("Workbook relationship escapes the package."); segments.pop(); }
    else segments.push(segment);
  }
  return segments.join("/");
}
function relationships(xml: string, base: string) {
  const result = new Map<string, { type: string; target: string; external: boolean }>();
  walkXml(xml, { open(name, attrs) {
    if (name !== "Relationship") return;
    if (!attrs.Id || !attrs.Type || !attrs.Target || result.has(attrs.Id)) fail("Invalid workbook relationships.");
    const external = attrs.TargetMode === "External";
    result.set(attrs.Id, { type: attrs.Type, target: external ? attrs.Target : resolvePart(base, attrs.Target), external });
  } });
  return result;
}

function preflight(bytes: Uint8Array, entries: ZipEntry[]) {
  const archive = XLSX.CFB.read(bytes, { type: "array" }) as { FullPaths: string[]; FileIndex: RawPart[] };
  const files = new Map<string, RawPart>();
  archive.FullPaths.forEach((path, i) => files.set(path.replace(/^Root Entry\//, ""), archive.FileIndex[i]));
  let storedCells = 0;
  let merges = 0;
  let validations = 0;
  let names = 0;
  let sheets = 0;
  for (const entry of entries) {
    const content = files.get(entry.name)?.content;
    if (!(content instanceof Uint8Array) && !Array.isArray(content)) fail("ZIP entry content is unavailable.");
    const data = content instanceof Uint8Array ? content : Uint8Array.from(content);
    if (data.length !== entry.size || crc32(data) !== entry.crc) fail("ZIP content failed its size/checksum check.");
    if (!/\.(xml|rels)$/i.test(entry.name)) continue;
    walkXml(partText(files.get(entry.name)), { open(name, attrs, parent) {
      if (name === "c" && parent === "row") {
        limit(++storedCells <= EXCEL_WORKBOOK_LIMITS.storedCells, "Stored worksheet cell count");
        address(attrs.r ?? "");
      }
      if (name === "row" && attrs.r && (!/^\d+$/.test(attrs.r) || Number(attrs.r) < 1 || Number(attrs.r) > MAX_ROW)) fail("Invalid physical row index.");
      if (name === "col" && (!/^\d+$/.test(attrs.min ?? "") || !/^\d+$/.test(attrs.max ?? "") || Number(attrs.min) < 1 || Number(attrs.max) > MAX_COLUMN || Number(attrs.min) > Number(attrs.max))) fail("Invalid column width range.");
      if (name === "mergeCell") { limit(++merges <= EXCEL_WORKBOOK_LIMITS.merges, "Merge count"); range(attrs.ref ?? ""); }
      if (name === "dataValidation") limit(++validations <= EXCEL_WORKBOOK_LIMITS.validations, "Validation count");
      if (name === "definedName") limit(++names <= EXCEL_WORKBOOK_LIMITS.names, "Defined name count");
      if (name === "sheet" && parent === "sheets") limit(++sheets <= EXCEL_WORKBOOK_LIMITS.sheets, "Worksheet count");
    } });
  }
  const rootRels = relationships(partText(files.get("_rels/.rels")), "");
  const office = [...rootRels.values()].find(r => /\/officeDocument$/.test(r.type));
  if (!office || office.external) fail("The ZIP is not a local .xlsx workbook.");
  let xlsx = false;
  let macroEnabled = false;
  walkXml(partText(files.get("[Content_Types].xml")), { open(name, attrs) {
    if (name === "Override" && attrs.PartName === `/${office.target}`) {
      xlsx = attrs.ContentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
      macroEnabled = /macroEnabled/i.test(attrs.ContentType ?? "");
    }
  } });
  if (macroEnabled) fail("Macro-enabled workbook content is not accepted, even if renamed .xlsx. Save a macro-free .xlsx copy.");
  if (!xlsx) fail("The package is not an .xlsx worksheet workbook (renamed .xlsm/.xlsb/.xltx files are not accepted).");
  return office.target;
}

const errorNames: Record<number, string> = { 0: "#NULL!", 7: "#DIV/0!", 15: "#VALUE!", 23: "#REF!", 29: "#NAME?", 36: "#NUM!", 42: "#N/A", 43: "#GETTING_DATA" };

/** Pure, local analysis. Never recalculate formulas or treat this result as certification. */
export function analyzeExcelWorkbook(buffer: ArrayBuffer | Uint8Array, fileName: string): ExcelWorkbookAnalysis {
  checkFile(fileName, buffer.byteLength);
  try {
    const source = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const { bytes, entries } = checkZip(source);
    const workbookPath = preflight(bytes, entries);
    const workbook = XLSX.read(bytes, {
      type: "array", bookFiles: true, bookVBA: false, cellFormula: true,
      cellNF: true, cellText: true, cellStyles: true, cellDates: false,
      cellHTML: false, sheetStubs: true, dense: false, WTF: true,
    });
    const files = (workbook as XLSX.WorkBook & { files?: Record<string, RawPart> }).files;
    if (!files) fail("The spreadsheet reader did not expose workbook XML; formulas and validations cannot be checked.");
    const issues: ExcelImportIssue[] = [];
    const features = new Set<string>();
    const feature = (code: string, message: string) => {
      if (!features.has(code)) { features.add(code); issues.push({ code, message }); }
    };
    feature("UNVERIFIED_WORKBOOK", "Imported content is unverified. Formulas are not executed; cached results may be missing or stale. Human review is required, not an engineering certification.");
    feature("FORMATTING_LIMITATIONS", "Number formats and formatted values are retained. Fonts, fills, borders, alignment, row heights and print settings are not represented by the import contract.");
    feature("FEATURE_DETECTION_LIMITATIONS", "Feature detection inspects package parts, relationships and worksheet XML, not every Excel extension. Absence of a warning does not establish safety or correctness.");
    feature(workbook.Workbook?.WBProps?.date1904 ? "DATE_SYSTEM_1904" : "DATE_SYSTEM_1900", `Workbook uses Excel's ${workbook.Workbook?.WBProps?.date1904 ? "1904" : "1900"} date system. Numeric dates retain their original serial values and number formats.`);
    for (const path of Object.keys(files)) {
      if (/vbaProject|vbaData|macrosheets\//i.test(path)) feature("MACROS", "Macro-related content is present. It is not executed or imported.");
      if (/(?:^|\/)externalLinks\//i.test(path)) feature("EXTERNAL_LINKS", "External workbook links are present. Linked content is never fetched or updated.");
      if (/(?:^|\/)charts\//i.test(path)) feature("CHARTS", "Charts are present and are not converted into form fields.");
      if (/(?:^|\/)media\//i.test(path)) feature("IMAGES", "Embedded media/images are present and are not imported.");
      if (/(?:^|\/)drawings\//i.test(path)) feature("DRAWINGS", "Drawings are present and are not imported; these can include images, signatures, shapes or controls.");
      if (/_xmlsignatures\/|vbaProjectSignature|signatureline/i.test(path)) feature("SIGNATURES", "Signature-related content is present. Signatures are not authenticated or preserved.");
      if (/\.(xml|rels)$/i.test(path)) {
        walkXml(partText(files[path]), { open(name, attrs) {
          if (name === "signatureLine" || name === "Signature") feature("SIGNATURES", "Signature-related XML is present. Signatures are not authenticated or preserved.");
          if (name === "Relationship") {
            if (attrs.TargetMode === "External") feature("EXTERNAL_LINKS", "External relationships are present. Their targets are never opened or fetched.");
            if (/vbaProject|xlMacrosheet/i.test(attrs.Type ?? "")) feature("MACROS", "Macro-related content is present. It is not executed or imported.");
            if (/\/image$/.test(attrs.Type ?? "")) feature("IMAGES", "Image relationships are present. Images are not imported or fetched.");
          }
        } });
      }
    }
    const slash = workbookPath.lastIndexOf("/");
    const relPath = `${workbookPath.slice(0, slash + 1)}_rels/${workbookPath.slice(slash + 1)}.rels`;
    const sheetRels = relationships(partText(files[relPath]), workbookPath);
    const sheetParts: { name: string; path: string; state?: string }[] = [];
    walkXml(partText(files[workbookPath]), { open(name, attrs, parent) {
      if (name !== "sheet" || parent !== "sheets") return;
      const id = Object.entries(attrs).find(([key]) => /:id$/.test(key))?.[1];
      const rel = sheetRels.get(id ?? "");
      if (!attrs.name || !rel || rel.external || !/\/worksheet$/.test(rel.type)) fail("A workbook sheet is not a readable local worksheet. Chart/macro/dialog sheets cannot be imported without loss.");
      sheetParts.push({ name: attrs.name, path: rel.target, state: attrs.state });
    } });
    if (!sheetParts.length || sheetParts.length !== workbook.SheetNames.length || new Set(sheetParts.map(s => s.name)).size !== sheetParts.length) fail("Worksheet metadata is incomplete or ambiguous.");
    const analysis: ExcelWorkbookAnalysis = { fileName, sheets: [], formulaCount: 0, names: [], features: [], issues };
    let cellCount = 0;
    let payloadSize = encoder.encode(JSON.stringify({ fileName })).length;
    const charge = (value: unknown) => {
      payloadSize += encoder.encode(JSON.stringify(value)).length;
      limit(payloadSize <= EXCEL_WORKBOOK_LIMITS.payloadBytes, "Analysis payload size");
    };
    for (const [index, meta] of sheetParts.entries()) {
      const ws = workbook.Sheets[meta.name];
      if (!ws || workbook.SheetNames[index] !== meta.name) fail("The spreadsheet reader omitted or reordered a worksheet.");
      const raw = worksheetXml(partText(files[meta.path]));
      if (raw.conditionalFormatting) feature("CONDITIONAL_FORMATTING", "Conditional formatting is present; its rules and resulting appearance are not evaluated or preserved.");
      if (raw.drawings) feature("DRAWINGS", "Worksheet drawings are present and are not imported; image/signature contents cannot be inferred reliably.");
      if (raw.arrayFormulas) feature("ARRAY_FORMULAS", "Array formulas are present. Anchor formulas and cached cells are retained, but array/spill ranges are not represented by the import contract.");
      if (raw.validations.length) feature("DATA_VALIDATIONS", "Validation ranges and available formulas are retained. Only literal list choices are expanded; range/name-based choices, validation messages and enforcement are not resolved.");
      if (meta.state === "veryHidden") feature("VERY_HIDDEN_SHEETS", "Very-hidden worksheets are retained as hidden; the contract cannot distinguish these visibility states.");
      const sheet: ExcelSheet = { name: meta.name, hidden: meta.state === "hidden" || meta.state === "veryHidden" || !!workbook.Workbook?.Sheets?.[index]?.Hidden, range: "", cells: [], merges: [], columnWidths: [], validations: raw.validations };
      let contentRange: XLSX.Range | undefined;
      for (const [location, sourceCell] of raw.cells) {
        const cell = ws[location] as XLSX.CellObject | undefined;
        const hasFormula = sourceCell.hasFormula || cell?.f !== undefined;
        const meaningful = hasFormula || (cell?.t !== "z" && cell?.v !== undefined && cell.v !== "") || sourceCell.inline !== "" || (sourceCell.hasValue && sourceCell.value !== "");
        if (!meaningful) continue;
        if (!cell) fail("The spreadsheet reader omitted a populated cell or formula. Nothing was imported.");
        let formula = cell.f;
        if (sourceCell.hasFormula && formula === undefined && sourceCell.formula) formula = sourceCell.formula;
        if (hasFormula && formula === undefined) fail("A shared/array formula could not be recovered. Nothing was imported.");
        const result: ExcelCell = { address: location, type: "blank" };
        if (cell.t === "e" || sourceCell.type === "e") {
          result.type = "error";
          result.value = sourceCell.value || errorNames[Number(cell.v)] || cell.w || "#UNKNOWN_ERROR!";
          issues.push({ code: "CACHED_ERROR", message: "This cell contains an Excel error (a formula result, if present, is only cached).", sheet: meta.name, cell: location });
        } else if (typeof cell.v === "number") {
          if (!Number.isFinite(cell.v)) fail("A cell has a non-finite number which cannot be preserved in the analysis payload.");
          result.type = cell.z && XLSX.SSF.is_date(String(cell.z)) ? "date" : "number";
          result.value = cell.v;
        } else if (typeof cell.v === "boolean") { result.type = "boolean"; result.value = cell.v; }
        else if (typeof cell.v === "string") { result.type = "string"; result.value = textLimit(cell.v); }
        else if (cell.v instanceof Date) { result.type = "date"; result.value = cell.v.toISOString(); }
        if (cell.w !== undefined) result.formatted = textLimit(cell.w);
        if (cell.z !== undefined) result.numberFormat = textLimit(String(cell.z));
        if (formula !== undefined) {
          result.formula = textLimit(formula);
          analysis.formulaCount++;
          if (!sourceCell.hasValue || sourceCell.value === "" && sourceCell.type !== "str") issues.push({ code: "MISSING_FORMULA_CACHE", message: "Formula has no stored result; it has not been calculated during import.", sheet: meta.name, cell: location });
          if (/\[[^\]]+\][^!]*!/.test(formula) || /\b(?:WEBSERVICE|RTD|DDE)\s*\(/i.test(formula)) feature("EXTERNAL_LINKS", "Formulas reference external content/services. They are retained as text and never executed or fetched.");
        }
        if (/#REF!/i.test(formula ?? "") || result.type === "error" && result.value === "#REF!") issues.push({ code: "BROKEN_REFERENCE", message: "A formula or cached error contains #REF! and requires correction in the source workbook.", sheet: meta.name, cell: location });
        limit(++cellCount <= EXCEL_WORKBOOK_LIMITS.cells, "Populated cell count");
        charge(result);
        sheet.cells.push(result);
        const point = address(location);
        contentRange = expand(contentRange, { s: point, e: point });
      }
      // Do not iterate !ref: formatting can extend it to a million empty rows.
      // Missing cells inside this compact range are legitimate blank input slots.
      let layoutRange = contentRange;
      if (contentRange) {
        for (const merge of raw.merges) {
          const bounds = range(merge);
          if (intersects(contentRange, bounds)) {
            sheet.merges.push(merge);
            layoutRange = expand(layoutRange, bounds);
          }
        }
        sheet.range = XLSX.utils.encode_range(layoutRange!);
        for (const [column, info] of (ws["!cols"] ?? []).entries()) {
          if (column < layoutRange!.s.c || column > layoutRange!.e.c || !info) continue;
          const width = info.wch ?? info.width;
          if (width !== undefined) {
            if (!Number.isFinite(width) || width < 0) fail("Invalid worksheet column width.");
            sheet.columnWidths.push({ column: XLSX.utils.encode_col(column), width });
          }
        }
      }
      sheet.cells.sort((a, b) => {
        const first = address(a.address), second = address(b.address);
        return first.r - second.r || first.c - second.c;
      });
      charge({ ...sheet, cells: [] });
      analysis.sheets.push(sheet);
    }
    for (const name of workbook.Workbook?.Names ?? []) {
      const result = { name: textLimit(name.Name), reference: textLimit(name.Ref), ...(name.Sheet !== undefined ? { sheetIndex: name.Sheet } : {}) };
      analysis.names.push(result);
      charge(result);
      if (/#REF!/i.test(name.Ref)) issues.push({ code: "BROKEN_DEFINED_NAME", message: "A defined name contains #REF! and requires source workbook review." });
      if (/\[[^\]]+\][^!]*!/.test(name.Ref)) feature("EXTERNAL_LINKS", "A defined name references another workbook. Linked content is not fetched.");
    }
    analysis.features = [...features];
    charge(issues);
    limit(encoder.encode(JSON.stringify(analysis)).length <= EXCEL_WORKBOOK_LIMITS.payloadBytes, "Analysis payload size");
    return analysis;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Excel import:")) throw error;
    // Parser errors can contain workbook values; do not expose them to logs/UI.
    return fail("The workbook is damaged, invalid, or uses unsupported content. Nothing was imported.");
  }
}
