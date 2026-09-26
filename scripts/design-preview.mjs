#!/usr/bin/env node
// DESIGN.md(Google design.md 형식)를 읽어 토큰을 색·글꼴·컴포넌트로 그려 보여주는 정적 미리보기 페이지를 만든다.
//
// 사용: node scripts/design-preview.mjs DESIGN.md [DESIGN-admin.md ...] [--out _site]
//   첫 파일은 index.html, 나머지는 <파일명 소문자>.html로 저장한다.
//
// 외부 의존성이 없어 다른 프로젝트에도 이 파일 하나만 복사해 쓸 수 있다.
// YAML은 design.md가 쓰는 범위(블록 매핑, 한 줄 flow 매핑, 따옴표 문자열, 주석)만 읽는다.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// 웹폰트 CDN이 Google Fonts에 없는 글꼴만 따로 적는다.
const FONT_CSS = {
  Pretendard: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css",
};

const TOKEN_SECTIONS = [
  { group: "colors", title: "Colors", match: /^colou?rs?\b/i },
  { group: "typography", title: "Typography", match: /^typography\b/i },
  { group: "spacing", title: "Layout", match: /^(layout|spacing)\b/i },
  { group: "rounded", title: "Shapes", match: /^(shapes?|radius|rounded|corners?)\b/i },
  { group: "components", title: "Components", match: /^components?\b/i },
];

function main() {
  const args = process.argv.slice(2);
  let outDir = "_site";
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") outDir = args[++i];
    else inputs.push(args[i]);
  }
  if (inputs.length === 0 || !outDir) {
    console.error("사용: node scripts/design-preview.mjs DESIGN.md [다른 DESIGN.md ...] [--out _site]");
    process.exit(1);
  }

  const docs = inputs.map((file, n) => {
    const rel = toPosix(path.relative(process.cwd(), path.resolve(file)));
    const out = n === 0 ? "index.html" : `${path.basename(file, path.extname(file)).toLowerCase()}.html`;
    let parsed;
    try {
      parsed = parseDesign(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`${file}: ${error.message}`);
      process.exit(1);
    }
    return { file, rel, out, ...parsed };
  });

  const site = {
    docs,
    pages: new Map(docs.map((d) => [d.rel, d.out])),
    source: sourceBase(),
    sha: (process.env.GITHUB_SHA || "").slice(0, 7),
  };

  mkdirSync(outDir, { recursive: true });
  for (const doc of docs) {
    const target = path.join(outDir, doc.out);
    writeFileSync(target, renderPage(doc, site));
    console.log(`${doc.file} → ${target}`);
  }
}

// ── 입력 ────────────────────────────────────────────────────────────

function parseDesign(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) throw new Error("맨 위에 --- 로 감싼 YAML front matter가 없습니다.");
  return { fm: parseYaml(m[1]) ?? {}, fmText: m[1], body: text.slice(m[0].length) };
}

function parseYaml(src) {
  const lines = src
    .split(/\r?\n/)
    .map((raw) => stripComment(raw).replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "");
  let i = 0;
  const indentOf = (line) => line.length - line.trimStart().length;

  function block(indent) {
    const isList = lines[i].trimStart().startsWith("- ");
    const out = isList ? [] : {};
    while (i < lines.length) {
      const line = lines[i];
      const ind = indentOf(line);
      if (ind < indent) break;
      if (ind > indent) throw new Error(`YAML 들여쓰기를 읽을 수 없습니다: "${line.trim()}"`);
      const text = line.trim();
      if (isList) {
        if (!text.startsWith("- ")) break;
        i++;
        out.push(parseValue(text.slice(2)));
        continue;
      }
      const m = /^("[^"]*"|'[^']*'|[^:]+?):(?:\s+(.*))?$/.exec(text);
      if (!m) throw new Error(`YAML 줄을 읽을 수 없습니다: "${text}"`);
      i++;
      const key = unquote(m[1].trim());
      if (m[2] !== undefined && m[2] !== "") {
        if (/^[|>]/.test(m[2])) throw new Error(`여러 줄 문자열(| >)은 지원하지 않습니다: "${key}"`);
        out[key] = parseValue(m[2]);
      } else if (i < lines.length && (indentOf(lines[i]) > indent || (indentOf(lines[i]) === indent && lines[i].trimStart().startsWith("- ")))) {
        out[key] = block(indentOf(lines[i]));
      } else {
        out[key] = null;
      }
    }
    return out;
  }

  return lines.length ? block(indentOf(lines[0])) : null;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseValue(raw) {
  const s = raw.trim();
  if (s.startsWith("{")) {
    if (!s.endsWith("}")) throw new Error(`여러 줄 flow 매핑은 지원하지 않습니다: "${s}"`);
    const out = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      if (!part.trim()) continue;
      const idx = flowColon(part);
      if (idx < 0) throw new Error(`flow 매핑 항목을 읽을 수 없습니다: "${part.trim()}"`);
      out[unquote(part.slice(0, idx).trim())] = parseValue(part.slice(idx + 1));
    }
    return out;
  }
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new Error(`여러 줄 flow 목록은 지원하지 않습니다: "${s}"`);
    return splitFlow(s.slice(1, -1)).filter((p) => p.trim()).map(parseValue);
  }
  return unquote(s);
}

function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

// 따옴표와 괄호 밖의 쉼표로만 나눈다.
function splitFlow(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function flowColon(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ":" && (i + 1 === s.length || /\s/.test(s[i + 1]))) return i;
  }
  return -1;
}

// colors 블록 안의 주석 줄을 그룹 제목으로 쓴다. "# 고객 화면 — 구현: ..." → "고객 화면"
function colorGroups(fmText) {
  const groups = [];
  let inColors = false;
  let current = null;
  for (const line of fmText.split(/\r?\n/)) {
    if (/^colors:\s*$/.test(line)) {
      inColors = true;
      continue;
    }
    if (!inColors) continue;
    if (/^\S/.test(line)) break;
    const comment = /^\s+#\s*(.+)$/.exec(line);
    if (comment) {
      const label = comment[1].split(/\s+[—–-]\s+/)[0].trim();
      current = { label: /^구현\s*:/.test(label) ? "" : label, keys: [] };
      groups.push(current);
      continue;
    }
    const key = /^\s+("?)([\w-]+)\1\s*:/.exec(line);
    if (key) {
      if (!current) groups.push((current = { label: "", keys: [] }));
      current.keys.push(key[2]);
    }
  }
  return groups.filter((g) => g.keys.length);
}

function sourceBase() {
  const { GITHUB_SERVER_URL: host, GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: ref } = process.env;
  if (host && repo) return `${host}/${repo}/blob/${ref || "main"}/`;
  try {
    const url = execSync("git config --get remote.origin.url", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\/\/[^@/]+@/, "//") // URL에 섞인 인증 정보는 버린다
      .replace(/\.git$/, "");
    return /^https:\/\//.test(url) ? `${url}/blob/main/` : null;
  } catch {
    return null;
  }
}

// ── 토큰 ────────────────────────────────────────────────────────────

function tokenTools(fm) {
  const resolve = (value, depth = 0) => {
    if (typeof value !== "string") return value;
    const ref = /^\{([\w-]+(?:\.[\w-]+)+)\}$/.exec(value.trim());
    if (!ref) return value;
    if (depth > 8) return undefined;
    let node = fm;
    for (const key of ref[1].split(".")) node = node && typeof node === "object" ? node[key] : undefined;
    return node === undefined ? undefined : resolve(node, depth + 1);
  };
  return { resolve };
}

function hexToRgb(value) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  else if (h.length === 6 || h.length === 8) h = h.slice(0, 6);
  else return null;
  return [0, 2, 4].map((n) => parseInt(h.slice(n, n + 2), 16));
}

function contrast(a, b) {
  const lum = (rgb) =>
    rgb
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, n) => sum + c * [0.2126, 0.7152, 0.0722][n], 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function typeCss(t) {
  if (!t || typeof t !== "object") return "";
  const css = [];
  if (t.fontFamily) css.push(`font-family:"${t.fontFamily}",var(--sans)`);
  if (t.fontSize) css.push(`font-size:${t.fontSize}`);
  if (t.fontWeight) css.push(`font-weight:${t.fontWeight}`);
  if (t.lineHeight) css.push(`line-height:${t.lineHeight}`);
  if (t.letterSpacing) css.push(`letter-spacing:${t.letterSpacing}`);
  if (t.fontFeature) css.push(`font-feature-settings:${t.fontFeature}`);
  if (t.fontVariation) css.push(`font-variation-settings:${t.fontVariation}`);
  return css.join(";");
}

// ── 토큰 시각화 ──────────────────────────────────────────────────────

function colorsViz(doc, tools) {
  const colors = doc.fm.colors ?? {};
  const groups = colorGroups(doc.fmText);
  const seen = new Set(groups.flatMap((g) => g.keys));
  const rest = Object.keys(colors).filter((k) => !seen.has(k));
  if (rest.length) groups.push({ label: groups.length ? "기타" : "", keys: rest });
  return groups
    .map((g) => {
      const cards = g.keys
        .filter((k) => k in colors)
        .map((name) => {
          const value = tools.resolve(colors[name]) ?? "";
          const rgb = hexToRgb(value);
          const onWhite = rgb ? contrast(rgb, [255, 255, 255]) : null;
          const onBlack = rgb ? contrast(rgb, [0, 0, 0]) : null;
          const fg = rgb && onWhite >= onBlack ? "#fff" : "#000";
          const tip = rgb ? `흰 글씨 대비 ${onWhite.toFixed(2)} · 검은 글씨 대비 ${onBlack.toFixed(2)}` : "";
          return `<div class="sw" title="${escAttr(tip)}"><div class="sw-color" style="${escAttr(`background:${value};color:${fg}`)}">Aa</div><div class="sw-body"><div class="sw-name">${esc(name)}</div><div class="sw-hex">${esc(value)}</div></div></div>`;
        })
        .join("");
      return `${g.label ? `<h3 class="viz-sub">${esc(g.label)}</h3>` : ""}<div class="swatches">${cards}</div>`;
    })
    .join("");
}

function typographyViz(doc, tools, korean) {
  const long = korean ? "다람쥐 헌 쳇바퀴에 타고파 Aa 0123456789" : "The quick brown fox jumps over the lazy dog 0123456789";
  const short = korean ? "다람쥐 헌 쳇바퀴에 타고파" : "The quick brown fox";
  return Object.entries(doc.fm.typography ?? {})
    .map(([name, raw]) => {
      const t = tools.resolve(raw) ?? {};
      const meta = [t.fontSize, t.fontWeight, t.lineHeight, t.letterSpacing].filter(Boolean).join(" · ");
      const extra = [t.fontFamily, t.fontFeature ? `feature ${t.fontFeature}` : ""].filter(Boolean).join(" · ");
      const sample = parseFloat(t.fontSize) >= 28 ? short : long;
      return `<div class="type-row"><div class="type-meta"><div class="n">${esc(name)}</div><div class="v">${esc(meta)}</div><div class="v">${esc(extra)}</div></div><div class="type-sample" style="${escAttr(typeCss(t))}">${esc(sample)}</div></div>`;
    })
    .join("");
}

function spacingViz(doc, tools) {
  return `<div class="space-list">${Object.entries(doc.fm.spacing ?? {})
    .map(([name, raw]) => {
      const value = String(tools.resolve(raw) ?? "");
      const px = /^(\d*\.?\d+)px$/.exec(value);
      const bar = px
        ? `<div class="bar${Number(px[1]) > 720 ? " over" : ""}" style="${escAttr(`width:min(${value},100%)`)}"></div>`
        : `<div class="bar-note">수치(단위 없음)</div>`;
      return `<div class="space-row"><code class="n">${esc(name)}</code><span class="v">${esc(value)}</span>${bar}</div>`;
    })
    .join("")}</div>`;
}

function roundedViz(doc, tools) {
  return `<div class="radii">${Object.entries(doc.fm.rounded ?? {})
    .map(([name, raw]) => {
      const value = String(tools.resolve(raw) ?? "");
      return `<div class="rad"><div class="rad-box" style="${escAttr(`border-radius:${value}`)}"></div><div class="rad-name">${esc(name)}</div><div class="rad-v">${esc(value)}</div></div>`;
    })
    .join("")}</div>`;
}

const PROP_LABEL = { backgroundColor: "bg", textColor: "text", typography: "type", rounded: "r", padding: "p", height: "h", width: "w", size: "size" };

function componentsViz(doc, tools) {
  const comps = doc.fm.components ?? {};
  const names = Object.keys(comps);

  // button-primary-hover처럼 이름이 다른 컴포넌트로 시작하면, 적지 않은 속성은 그 컴포넌트에서 이어받아 그린다.
  const baseOf = (name) =>
    names.filter((o) => o !== name && name.startsWith(`${o}-`)).sort((a, b) => b.length - a.length)[0];
  const merged = (name, depth = 0) => {
    const base = baseOf(name);
    return base && depth < 8 ? { ...merged(base, depth + 1), ...comps[name] } : { ...comps[name] };
  };

  const families = new Map();
  for (const name of names) {
    const key = name.split("-")[0];
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(name);
  }

  const renderItem = (name) => {
    const raw = merged(name);
    const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, tools.resolve(v)]));
    const typo = p.typography && typeof p.typography === "object" ? p.typography : null;
    const hasText = Boolean(typo || raw.textColor);
    const heightPx = /^(\d*\.?\d+)px$/.exec(String(p.height ?? ""));
    const isLine = !hasText && heightPx && Number(heightPx[1]) <= 2;
    // 모서리가 없거나 글자가 없는 요소는 화면 폭을 채우는 띠·면으로 그린다.
    const block = (!raw.rounded || !hasText) && !p.width && !p.size;
    const css = ["display:flex", "align-items:center"];
    if (p.backgroundColor) css.push(`background:${p.backgroundColor}`);
    if (p.textColor) css.push(`color:${p.textColor}`);
    if (typo) css.push(typeCss(typo));
    if (p.rounded) css.push(`border-radius:${p.rounded}`);
    if (p.padding) css.push(`padding:${p.padding}`);
    else if (p.backgroundColor && hasText && !p.size) css.push("padding:0 16px");
    if (p.size) css.push(`width:${p.size}`, `height:${p.size}`, "justify-content:center");
    if (p.height) css.push(`height:${p.height}`);
    if (p.width) css.push(`width:${p.width}`);
    // 입력칸류는 글자 폭이 아니라 칸처럼 보이도록 최소 폭을 준다(미리보기 전용).
    else if (hasText && p.height && !p.size && /(^|-)(input|search|select|control)(-|$)/.test(name)) css.push("min-width:min(260px,100%)");
    if (block || isLine) css.push("width:100%");
    if (!hasText && !p.height && !p.size) css.push("min-height:56px");
    if (!raw.backgroundColor && !isLine) css.push("box-shadow:none");
    const label = !hasText ? "" : p.size ? "Aa" : name;

    let badge = "";
    const bg = hexToRgb(p.backgroundColor);
    const fg = hexToRgb(p.textColor);
    if (bg && fg && hasText) {
      const ratio = contrast(bg, fg);
      badge = ratio < 4.5 ? `<span class="pill bad">대비 ${ratio.toFixed(2)} · AA 미달</span>` : `<span class="pill">대비 ${ratio.toFixed(2)}</span>`;
    }
    const broken = Object.entries(raw).filter(([, v]) => tools.resolve(v) === undefined).map(([k]) => k);
    if (broken.length) badge += `<span class="pill bad">참조 오류: ${esc(broken.join(", "))}</span>`;

    return `<div class="item${block || isLine ? " block" : ""}"><div class="el${isLine ? " line" : ""}" style="${escAttr(css.join(";"))}">${esc(label)}</div><div class="cap"><b>${esc(name)}</b>${badge}</div></div>`;
  };

  const propsOf = (name) =>
    Object.entries(comps[name])
      .map(([key, value]) => {
        const ref = /^\{([\w-]+)\.([\w-]+(?:\.[\w-]+)*)\}$/.exec(String(value));
        const resolved = tools.resolve(value);
        let shown = esc(String(value));
        if (ref) {
          shown = esc(ref[2]);
          if (ref[1] === "colors" && hexToRgb(resolved)) shown = `${dot(resolved)}${shown}`;
          if (ref[1] === "rounded") shown += ` <span class="dim">${esc(resolved ?? "?")}</span>`;
        }
        return `<span class="kv"><i>${esc(PROP_LABEL[key] ?? key)}</i>${shown}</span>`;
      })
      .join("");

  return `<div class="fams">${[...families.entries()]
    .map(
      ([key, members]) =>
        `<div class="fam${members.length >= 5 ? " wide" : ""}"><div class="fam-head"><span>${esc(key)}</span><span class="dim">${members.length}</span></div><div class="stage">${members.map(renderItem).join("")}</div><dl class="props">${members.map((n) => `<div><dt>${esc(n)}</dt><dd>${propsOf(n)}</dd></div>`).join("")}</dl></div>`,
    )
    .join("")}</div>`;
}

// ── 마크다운 ─────────────────────────────────────────────────────────

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function startsBlock(lines, i) {
  const line = lines[i];
  return (
    /^#{1,6}\s/.test(line) ||
    /^```/.test(line) ||
    /^\s*>/.test(line) ||
    LIST_RE.test(line) ||
    (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))
  );
}

function renderMarkdown(md, ctx) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  const blank = (line) => line.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (blank(line)) {
      i++;
    } else if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const level = m[1].length;
      out.push(`<h${level} id="${slug(m[2])}">${inline(m[2], ctx)}</h${level}>`);
      i++;
    } else if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    } else if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const align = rows[1].map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : ""));
      const cell = (tag, c, n) => `<${tag}${align[n] ? ` style="text-align:${align[n]}"` : ""}>${inline(c, ctx)}</${tag}>`;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${rows[0].map((c, n) => cell("th", c, n)).join("")}</tr></thead><tbody>${rows
          .slice(2)
          .map((r) => `<tr>${r.map((c, n) => cell("td", c, n)).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
    } else if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"), ctx)}</blockquote>`);
    } else if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && !blank(lines[i])) {
        const lm = LIST_RE.exec(lines[i]);
        if (lm) items.push({ indent: lm[1].length, ordered: /\d/.test(lm[2]), text: lm[3] });
        else if (/^\s+\S/.test(lines[i])) items[items.length - 1].text += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      out.push(renderList(items, ctx));
    } else {
      const buf = [];
      while (i < lines.length && !blank(lines[i]) && (buf.length === 0 || !startsBlock(lines, i))) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(" "), ctx)}</p>`);
    }
  }
  return out.join("\n");
}

function renderList(items, ctx) {
  let idx = 0;
  const build = (indent) => {
    const tag = items[idx].ordered ? "ol" : "ul";
    let html = `<${tag}>`;
    while (idx < items.length && items[idx].indent >= indent) {
      if (items[idx].indent > indent) {
        html += build(items[idx].indent);
        continue;
      }
      html += `<li>${inline(items[idx++].text, ctx)}`;
      if (idx < items.length && items[idx].indent > indent) html += build(items[idx].indent);
      html += "</li>";
    }
    return `${html}</${tag}>`;
  };
  let html = "";
  while (idx < items.length) html += build(items[idx].indent);
  return html;
}

function splitRow(line) {
  const cells = [];
  let cur = "";
  let code = false;
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "`") {
      code = !code;
      cur += c;
    } else if (c === "|" && !code) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function inline(text, ctx) {
  const slots = [];
  const put = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, c) => put(codeHtml(c, ctx)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => put(`<a href="${escAttr(linkHref(href, ctx))}">${emphasis(label)}</a>`));
  s = emphasis(s);
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
  return s;
}

function emphasis(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
}

// {colors.x} 참조와 #hex 값에는 색 점을 붙인다.
function codeHtml(code, ctx) {
  const ref = /^\{colors\.([\w-]+)\}$/.exec(code.trim());
  const color = ref ? ctx.tools.resolve(code.trim()) : /^#[0-9a-f]{3,8}$/i.test(code.trim()) ? code.trim() : null;
  return `<code>${hexToRgb(color) ? dot(color) : ""}${esc(code)}</code>`;
}

function linkHref(href, ctx) {
  if (/^([a-z][a-z0-9+.-]*:|#)/i.test(href)) return href;
  const [file, hash] = href.split("#");
  const target = path.posix.normalize(path.posix.join(ctx.dir, file));
  const suffix = hash ? `#${hash}` : "";
  if (ctx.pages.has(target)) return ctx.pages.get(target) + suffix;
  return ctx.source ? `${ctx.source}${target}${suffix}` : href;
}

// ── 페이지 ──────────────────────────────────────────────────────────

function splitSections(body) {
  const intro = [];
  const sections = [];
  for (const line of body.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) sections.push({ title: h[1], md: [] });
    else (sections.length ? sections[sections.length - 1].md : intro).push(line);
  }
  return {
    intro: intro.filter((line) => !/^#\s/.test(line)).join("\n"),
    sections: sections.map((s) => ({ ...s, md: s.md.join("\n") })),
  };
}

function renderPage(doc, site) {
  const fm = doc.fm;
  const tools = tokenTools(fm);
  const ctx = { tools, pages: site.pages, source: site.source, dir: path.posix.dirname(doc.rel) };
  const korean = /[가-힣]/.test(doc.body + (fm.description ?? ""));
  const name = fm.name || doc.rel;
  const accent = hexToRgb(tools.resolve(fm.colors?.primary)) ? tools.resolve(fm.colors.primary) : "#2563eb";

  const counts = {
    colors: Object.keys(fm.colors ?? {}).length,
    typography: Object.keys(fm.typography ?? {}).length,
    spacing: Object.keys(fm.spacing ?? {}).length,
    rounded: Object.keys(fm.rounded ?? {}).length,
    components: Object.keys(fm.components ?? {}).length,
  };
  const viz = {
    colors: () => colorsViz(doc, tools),
    typography: () => typographyViz(doc, tools, korean),
    spacing: () => spacingViz(doc, tools),
    rounded: () => roundedViz(doc, tools),
    components: () => componentsViz(doc, tools),
  };

  const { intro, sections } = splitSections(doc.body);
  const used = new Set();
  for (const section of sections) {
    const spec = TOKEN_SECTIONS.find((t) => t.match.test(section.title) && !used.has(t.group));
    if (spec && counts[spec.group]) {
      section.group = spec.group;
      used.add(spec.group);
    }
  }
  for (const spec of TOKEN_SECTIONS) {
    if (!used.has(spec.group) && counts[spec.group]) sections.push({ title: spec.title, md: "", group: spec.group });
  }

  const sectionHtml = sections
    .map((s, n) => {
      const vizHtml = s.group
        ? `<div class="viz"><p class="viz-label">front matter · ${s.group} · ${counts[s.group]}개</p>${viz[s.group]()}</div>`
        : "";
      const prose = s.md.trim() ? `<div class="prose">${renderMarkdown(s.md, ctx)}</div>` : "";
      return `<section id="${slug(s.title)}"><p class="eyebrow">${String(n + 1).padStart(2, "0")} — ${esc(s.title.toUpperCase())}</p><h2>${inline(s.title, ctx)}</h2>${vizHtml}${prose}</section>`;
    })
    .join("\n");

  const toc = sections.map((s, n) => `<a href="#${slug(s.title)}"><span>${String(n + 1).padStart(2, "0")}</span>${esc(s.title)}</a>`).join("");
  const docNav = site.docs.length > 1
    ? `<nav class="docs">${site.docs.map((d) => `<a href="${escAttr(d.out)}"${d === doc ? ' class="on" aria-current="page"' : ""}><b>${esc(d.fm.name || d.rel)}</b><span>${esc(d.rel)}</span></a>`).join("")}</nav>`
    : "";

  const families = new Map();
  for (const t of Object.values(fm.typography ?? {})) {
    const r = tools.resolve(t);
    if (!r?.fontFamily) continue;
    if (!families.has(r.fontFamily)) families.set(r.fontFamily, new Set());
    if (r.fontWeight) families.get(r.fontFamily).add(Number(r.fontWeight));
  }
  const fontLinks = [...families.entries()]
    .map(([family, weights]) => {
      const href =
        FONT_CSS[family] ??
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}${weights.size ? `:wght@${[...weights].sort((a, b) => a - b).join(";")}` : ""}&display=swap`;
      return `<link rel="stylesheet" href="${escAttr(href)}">`;
    })
    .join("\n");
  const baseFont = families.size ? `"${[...families.keys()][0]}",` : "";

  const strip = Object.values(fm.colors ?? {})
    .map((v) => tools.resolve(v))
    .filter((v) => hexToRgb(v))
    .map((v) => `<i style="${escAttr(`background:${v}`)}"></i>`)
    .join("");
  const stats = [
    ["색", counts.colors],
    ["글꼴", counts.typography],
    ["간격", counts.spacing],
    ["모서리", counts.rounded],
    ["컴포넌트", counts.components],
  ]
    .filter(([, c]) => c)
    .map(([label, c]) => `<span><b>${c}</b>${label}</span>`)
    .join("");
  const sourceLink = site.source ? `<a class="btn" href="${escAttr(site.source + doc.rel)}">원본 ${esc(doc.rel)} 보기</a>` : "";
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${accent}"/></svg>`)}`;

  return `<!doctype html>
<html lang="${korean ? "ko" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} · DESIGN.md 미리보기</title>
<meta name="description" content="${escAttr(fm.description ?? "")}">
<link rel="icon" href="${escAttr(favicon)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks}
<style>
:root{--bg:#fff;--side:#fafafa;--ink:#18181b;--body:#3f3f46;--muted:#71717a;--line:#e4e4e7;--soft:#f4f4f5;--stage:#f1f1f4;--accent:${accent};--sans:${baseFont}system-ui,-apple-system,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,${baseFont}monospace}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 var(--sans);word-break:keep-all;overflow-wrap:break-word}
a{color:var(--accent)}
.layout{display:grid;grid-template-columns:272px minmax(0,1fr)}
aside{position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid var(--line);background:var(--side);padding:28px 18px}
.brand{font:700 13px var(--mono);letter-spacing:.04em;margin:0 0 20px;padding:0 10px;color:var(--ink)}
.docs{display:grid;gap:6px;margin-bottom:26px}
.docs a{display:block;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;text-decoration:none;color:var(--ink)}
.docs a b{display:block;font-size:13.5px;font-weight:600;line-height:1.4}
.docs a span{font:11.5px var(--mono);color:var(--muted)}
.docs a.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.toc{display:grid;gap:2px}
.toc a{display:flex;gap:10px;padding:6px 10px;border-radius:8px;color:var(--body);text-decoration:none;font-size:14px}
.toc a span{font:12px/2 var(--mono);color:var(--muted)}
.toc a:hover{background:var(--soft)}
.toc a.on{background:color-mix(in srgb,var(--accent) 10%,#fff);color:var(--ink);font-weight:600}
main{min-width:0;padding:64px clamp(16px,5vw,72px) 96px;max-width:1200px}
.toc-m{display:none}
.hero{padding-bottom:48px}
.hero .eyebrow{margin-bottom:14px}
.hero h1{font-size:clamp(34px,5vw,52px);line-height:1.15;letter-spacing:-.025em;margin:0 0 18px;font-weight:700}
.hero .desc{font-size:18px;line-height:1.75;color:var(--body);max-width:820px;margin:0}
.strip{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:32px 0 20px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.strip i{flex:1}
.stats{display:flex;flex-wrap:wrap;gap:8px 22px;color:var(--muted);font-size:14px}
.stats b{color:var(--ink);font-size:20px;margin-right:4px;font-weight:700}
.hero-foot{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:26px}
.btn{display:inline-flex;align-items:center;height:38px;padding:0 16px;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-size:14px;font-weight:600}
.intro{margin-top:28px;padding:18px 20px;border:1px solid var(--line);border-radius:12px;background:var(--side);font-size:14px}
.intro p{margin:0 0 6px}.intro p:last-child{margin:0}
section{padding:72px 0;border-top:1px solid var(--line);scroll-margin-top:12px}
.eyebrow{font:600 12px var(--mono);letter-spacing:.08em;color:var(--muted);margin:0 0 8px}
h2{font-size:34px;line-height:1.2;letter-spacing:-.02em;margin:0 0 32px;font-weight:700}
.viz{margin-bottom:48px}
.viz-label{font:600 11.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 16px}
.viz-sub{font-size:15px;margin:28px 0 12px;font-weight:600}
.viz-sub:first-of-type{margin-top:0}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.sw{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.sw-color{height:96px;display:flex;align-items:flex-end;padding:10px 12px;font-weight:700;font-size:14px;border-bottom:1px solid var(--line)}
.sw-body{padding:10px 12px 12px}
.sw-name{font-weight:600;font-size:13.5px;overflow-wrap:anywhere;line-height:1.45}
.sw-hex{font:12px var(--mono);color:var(--muted);text-transform:uppercase}
.type-row{display:grid;grid-template-columns:230px minmax(0,1fr);gap:28px;padding:22px 0;border-top:1px solid var(--line);align-items:center}
.type-row:first-of-type{border-top:0}
.type-meta .n{font:600 13px var(--mono)}
.type-meta .v{font:12px/1.6 var(--mono);color:var(--muted);overflow-wrap:anywhere}
.type-sample{min-width:0;overflow-wrap:anywhere;color:var(--ink)}
.space-list{display:grid}
.space-row{display:grid;grid-template-columns:150px 80px minmax(0,1fr);gap:16px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.space-row:first-child{border-top:0}
.space-row .n{font:600 13px var(--mono);background:none;border:0;padding:0}
.space-row .v{font:12.5px var(--mono);color:var(--muted)}
.bar{height:14px;border-radius:3px;background:var(--accent);min-width:2px}
.bar.over{-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent);mask-image:linear-gradient(90deg,#000 85%,transparent)}
.bar-note{font-size:12.5px;color:var(--muted)}
.radii{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:14px}
.rad{border:1px solid var(--line);border-radius:12px;padding:16px;background:#fff}
.rad-box{aspect-ratio:1.5;background:color-mix(in srgb,var(--accent) 12%,#fff);border:2px solid var(--accent);margin-bottom:12px}
.rad-name{font:600 13px var(--mono)}
.rad-v{font:12px var(--mono);color:var(--muted)}
.fams{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:18px;align-items:start}
.fam{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;min-width:0;display:flex;flex-direction:column}
.fam.wide{grid-column:1/-1}
.fam-head{display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--line);font:600 13px var(--mono)}
.stage{background:var(--stage);padding:26px 22px;display:flex;flex-wrap:wrap;gap:22px 26px;align-items:flex-start;flex:1}
.item{display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:0;max-width:100%}
.item.block{flex-basis:100%;align-items:stretch}
.el{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;box-shadow:0 0 0 1px rgba(15,23,42,.1)}
.el.line{box-shadow:none}
.cap{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font:11.5px/1.5 var(--mono);color:var(--muted)}
.cap b{color:var(--ink);font-weight:600}
.pill{padding:0 7px;border-radius:99px;border:1px solid var(--line);background:#fff;white-space:nowrap}
.pill.bad{background:#fff7ed;border-color:#fdba74;color:#9a3412}
.props{margin:0;padding:12px 16px 14px;display:grid;gap:6px;border-top:1px solid var(--line)}
.props div{display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr);gap:12px;font:12px/1.6 var(--mono)}
.props dt{font-weight:600;overflow-wrap:anywhere}
.props dd{margin:0;color:var(--body);display:flex;flex-wrap:wrap;gap:2px 12px}
.kv i{font-style:normal;color:var(--muted);margin-right:5px}
.dim{color:var(--muted);font-weight:400}
.dot{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:5px;vertical-align:-.06em;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.prose{max-width:820px;color:var(--body)}
.prose h3{font-size:19px;color:var(--ink);margin:40px 0 12px;letter-spacing:-.01em}
.prose h4{font-size:16px;color:var(--ink);margin:28px 0 8px}
.prose > :first-child{margin-top:0}
.prose p{margin:0 0 14px}
.prose ul,.prose ol{margin:0 0 16px;padding-left:22px}
.prose li{margin:4px 0}
.prose li > ul,.prose li > ol{margin:4px 0 0}
.prose strong{color:var(--ink)}
.prose code,.intro code{font:.86em var(--mono);background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 5px;overflow-wrap:anywhere}
.prose pre{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow:auto}
.prose pre code{border:0;padding:0;background:none}
.prose blockquote{margin:0 0 16px;padding:4px 16px;border-left:3px solid var(--accent);color:var(--body)}
.table-wrap{overflow-x:auto;margin:0 0 20px;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:0}
th{background:var(--soft);color:var(--ink);font-weight:600;white-space:nowrap}
footer{margin-top:24px;padding-top:28px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media (max-width:960px){
.layout{grid-template-columns:minmax(0,1fr)}
aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);padding:18px 16px}
aside .toc{display:none}
.docs{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:0}
main{padding-top:36px}
.toc-m{display:block;margin:28px 0 0;border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.toc-m summary{cursor:pointer;font-weight:600;font-size:14px}
.toc-m .toc{display:grid;margin-top:8px}
section{padding:52px 0}
h2{font-size:28px}
.type-row{grid-template-columns:minmax(0,1fr);gap:10px}
.space-row{grid-template-columns:110px 64px minmax(0,1fr)}
.props div{grid-template-columns:minmax(0,1fr);gap:0}
}
</style>
</head>
<body>
<div class="layout">
<aside>
<p class="brand">DESIGN.md PREVIEW</p>
${docNav}
<nav class="toc" aria-label="목차">${toc}</nav>
</aside>
<main>
<header class="hero">
<p class="eyebrow">${esc(doc.rel)}${fm.version ? ` · version ${esc(String(fm.version))}` : ""}</p>
<h1>${esc(name)}</h1>
${fm.description ? `<p class="desc">${esc(fm.description)}</p>` : ""}
${strip ? `<div class="strip" aria-hidden="true">${strip}</div>` : ""}
<div class="stats">${stats}</div>
<div class="hero-foot">${sourceLink}</div>
${intro.trim() ? `<div class="intro">${renderMarkdown(intro, ctx)}</div>` : ""}
<details class="toc-m"><summary>목차</summary><nav class="toc">${toc}</nav></details>
</header>
${sectionHtml}
<footer>이 페이지는 ${esc(doc.rel)}에서 자동으로 만들어졌습니다${site.sha ? ` (커밋 ${esc(site.sha)})` : ""}. 내용을 고치려면 원본 파일을 수정하세요.</footer>
</main>
</div>
<script>
(() => {
  const links = [...document.querySelectorAll("aside .toc a")];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove("on"));
      byId.get(e.target.id)?.classList.add("on");
    }
  }, { rootMargin: "-15% 0px -75% 0px" });
  document.querySelectorAll("main section[id]").forEach((s) => io.observe(s));
})();
</script>
</body>
</html>
`;
}

// ── 공용 ────────────────────────────────────────────────────────────

function dot(color) {
  return `<i class="dot" style="${escAttr(`background:${color}`)}"></i>`;
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

main();
