// Scan JSON structure without reserializing. String offsets are safe because
// the build decodes strict UTF-8 and verifies the reconstructed UTF-8 bytes.
function whitespace(text, i) {
  while (i < text.length && " \r\n\t".includes(text[i])) i++;
  return i;
}
function stringEnd(text, start) {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  if (i === text.length) throw Error("Incomplete JSON string");
  return i + 1;
}
function valueEnd(text, start) {
  if (text[start] === '"') return stringEnd(text, start);
  if (text[start] === "{" || text[start] === "[") {
    let depth = 1;
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '"') i = stringEnd(text, i) - 1;
      else if (text[i] === "{" || text[i] === "[") depth++;
      else if ((text[i] === "}" || text[i] === "]") && --depth === 0) return i + 1;
    }
    throw Error("Incomplete JSON container");
  }
  let i = start;
  while (i < text.length && !",]} \r\n\t".includes(text[i])) i++;
  if (i === start) throw Error("Missing JSON value");
  return i;
}
function members(text, start, object) {
  const endChar = object ? "}" : "]";
  const items = [];
  for (let i = whitespace(text, start + 1); text[i] !== endChar;) {
    const begin = i;
    let key;
    if (object) {
      if (text[i] !== '"') throw Error("Expected JSON key");
      const end = stringEnd(text, i);
      key = JSON.parse(text.slice(i, end));
      i = whitespace(text, end);
      if (text[i++] !== ":") throw Error("Expected JSON colon");
      i = whitespace(text, i);
    }
    const value = i, end = valueEnd(text, value), comma = whitespace(text, end);
    items.push({ key, begin, value, end, comma });
    if (text[comma] === endChar) break;
    if (text[comma] !== ",") throw Error("Expected JSON delimiter");
    i = whitespace(text, comma + 1);
  }
  return items;
}

export function stripRequestFields(text) {
  const start = whitespace(text, 0);
  if (text[start] !== "{") throw Error("Expected CAD response object");
  const entries = members(text, start, true);
  // A removed run consumes its following separator. A terminal run
  // consumes the preceding separator instead. Keep the enclosing whitespace.
  const removed = entry => ["revision", "requestToken"].includes(entry.key);
  const spans = [];
  for (let i = 0; i < entries.length;) {
    if (!removed(entries[i])) { i++; continue; }
    const first = i;
    while (i < entries.length && removed(entries[i])) i++;
    spans.push(i < entries.length
      ? [entries[first].begin, entries[i].begin]
      : [first ? entries[first - 1].comma : entries[first].begin, entries[i - 1].end]);
  }
  for (const [a, b] of spans.reverse()) text = text.slice(0, a) + text.slice(b);
  return text;
}

export function packSuccess(text, parts, digest) {
  const entry = members(text, whitespace(text, 0), true).find(m => m.key === "parts");
  if (!entry || text[entry.value] !== "[") throw Error("Missing CAD parts array");
  const fragments = [], refs = [];
  let from = 0;
  for (const part of members(text, entry.value, false)) {
    fragments.push(text.slice(from, part.value));
    const raw = text.slice(part.value, part.end), hash = digest(raw);
    if (Object.hasOwn(parts, hash) && parts[hash] !== raw) throw Error("Part hash collision");
    parts[hash] = raw;
    refs.push(hash);
    from = part.end;
  }
  fragments.push(text.slice(from));
  return { fragments, refs };
}

export function restoreResponse(entry, parts) {
  if (entry?.status === 422 && typeof entry.body === "string") return entry.body;
  const { fragments, refs } = entry ?? {};
  if (entry?.status !== 200 || !Array.isArray(refs) || !Array.isArray(fragments) ||
      fragments.length !== refs.length + 1 || fragments.some(x => typeof x !== "string"))
    throw Error("Invalid CAD record");
  return refs.map((id, i) => {
    if (!Object.hasOwn(parts, id) || typeof parts[id] !== "string")
      throw Error("Missing part reference: " + id);
    return fragments[i] + parts[id];
  }).join("") + fragments.at(-1);
}
