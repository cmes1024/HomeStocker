#!/usr/bin/env node
/**
 * 管家能力评测 runner — 题库只读，答卷誊抄到 runs/
 *
 *   node ai-eval/runner.mjs --plan core-smoke
 *   node ai-eval/runner.mjs --plan daily-use --mode mock
 *   HS_TOKEN=xxx node ai-eval/runner.mjs --plan core-smoke --mode act
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BANK = path.join(ROOT, "bank");
const PLANS = path.join(ROOT, "plans");
const RUNS = path.join(ROOT, "runs");
const FIXTURES = path.join(ROOT, "fixtures");

function parseArgs(argv) {
  const out = {
    plan: null,
    cases: null,
    copyOnly: false,
    mode: "mock",
    actUrl: process.env.HS_ACT_URL || "http://127.0.0.1:8080/api/ai/act",
    apiBase: process.env.HS_API_BASE || "",
    token: process.env.HS_TOKEN || "",
    skipFixture: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") out.plan = argv[++i];
    else if (a === "--cases") out.cases = argv[++i];
    else if (a === "--copy-only") {
      out.copyOnly = true;
      out.mode = "copy-only";
    } else if (a === "--mode") out.mode = argv[++i];
    else if (a === "--act-url") out.actUrl = argv[++i];
    else if (a === "--api-base") out.apiBase = argv[++i];
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--skip-fixture") out.skipFixture = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  if (!out.apiBase) {
    try {
      const u = new URL(out.actUrl);
      out.apiBase = `${u.protocol}//${u.host}`;
    } catch {
      out.apiBase = "http://127.0.0.1:8080";
    }
  }
  return out;
}

function listBankCases() {
  const map = new Map();
  for (const perspective of ["product", "eng", "user"]) {
    const dir = path.join(BANK, perspective);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      const doc = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!doc.id) throw new Error(`missing id in ${file}`);
      if (!doc.expected?.outcome) {
        throw new Error(`missing expected.outcome in ${file}`);
      }
      if (map.has(doc.id)) throw new Error(`duplicate case id ${doc.id}`);
      map.set(doc.id, { file, case: doc });
    }
  }
  return map;
}

function loadPlan(planId) {
  const file = path.join(PLANS, `${planId}.json`);
  if (!fs.existsSync(file)) throw new Error(`plan not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stamp() {
  return (
    new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .replace(/-/g, "")
      .replace("T", "T")
      .slice(0, 15) + "Z"
  );
}

/** @returns {{ text: string, history: {role:string,text:string}[] }} */
function splitDialogue(prompt) {
  if (typeof prompt === "string") {
    return { text: prompt.trim(), history: [] };
  }
  if (!Array.isArray(prompt) || prompt.length === 0) {
    return { text: "", history: [] };
  }
  const rows = prompt.map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    text: String(r.text || "").trim(),
  }));
  let lastUser = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === "user" && rows[i].text) {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return { text: "", history: rows };
  return {
    text: rows[lastUser].text,
    history: rows.slice(0, lastUser).filter((r) => r.text),
  };
}

function collectToolsFromPlan(plan) {
  const tools = [];
  if (!plan || typeof plan !== "object") return tools;
  for (const c of Array.isArray(plan.calls) ? plan.calls : []) {
    if (c && c.use) tools.push(String(c.use));
  }
  return tools;
}

function collectToolsFromActPayload(payload) {
  const tools = [];
  if (!payload || typeof payload !== "object") return tools;
  const dig = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) dig(x);
      return;
    }
    if (obj.use) tools.push(String(obj.use));
    for (const v of Object.values(obj)) dig(v);
  };
  dig(payload.executed);
  dig(payload.calls);
  dig(payload.report);
  dig(payload.data);
  return [...new Set(tools)];
}

function collectActCalls(actual) {
  const found = [];
  const seen = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.use === "string") {
      const key = JSON.stringify({
        use: node.use,
        name: node.name || "",
        names: node.names || [],
        quantity: node.quantity ?? "",
        spaceName: node.spaceName || "",
      });
      const prev = seen.get(key);
      if (prev == null || callScore(node) > callScore(found[prev])) {
        if (prev == null) {
          seen.set(key, found.length);
          found.push(node);
        } else {
          found[prev] = node;
        }
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const payload of actPayloads(actual)) visit(payload);
  return found;
}

function callScore(node) {
  let score = 0;
  for (const key of [
    "name",
    "names",
    "items",
    "quantity",
    "unit",
    "note",
    "spaceName",
    "locationName",
    "ref",
    "refs",
    "tagNames",
  ]) {
    const value = node?.[key];
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    score += 2;
  }
  return score;
}

function callNames(call) {
  const names = [];
  if (call?.name) names.push(String(call.name).trim());
  if (Array.isArray(call?.names)) {
    for (const name of call.names) {
      const text = String(name || "").trim();
      if (text) names.push(text);
    }
  }
  if (Array.isArray(call?.items)) {
    for (const item of call.items) {
      const text = String(item?.name || "").trim();
      if (text) names.push(text);
    }
  }
  return names;
}

function receiptChunks(actual) {
  const chunks = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.title === "string" || typeof node.subtitle === "string") {
      const joined = `${node.title || ""} ${node.subtitle || ""}`.trim();
      if (joined) chunks.push(joined);
    }
    for (const key of ["summary", "lead"]) {
      if (typeof node[key] === "string" && node[key].trim()) chunks.push(node[key]);
    }
    if (Array.isArray(node.lines)) {
      for (const line of node.lines) {
        if (typeof line === "string" && line.trim()) chunks.push(line);
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const payload of actPayloads(actual)) visit(payload);
  return chunks;
}

function nameInChunk(chunk, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(chunk);
}

function receiptMatches(chunk, want) {
  if (want.name && !nameInChunk(chunk, want.name)) return false;
  if (want.quantity != null) {
    const q = String(want.quantity).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?:→|->)\\s*${q}(?!\\d)`).test(chunk)) return false;
  }
  if (want.spaceName && !chunk.includes(String(want.spaceName))) return false;
  if (want.locationName && !chunk.includes(String(want.locationName))) return false;
  if (want.unit && !chunk.includes(String(want.unit))) return false;
  if (want.note && !chunk.includes(String(want.note))) return false;
  if (want.use === "item.update" && !/已改|改成|→|->/.test(chunk)) return false;
  if (want.use && /remove/.test(want.use) && !/已删|删掉/.test(chunk)) return false;
  if (want.use && /create/.test(want.use) && !/已记下|记下/.test(chunk)) return false;
  return Boolean(want.name || want.quantity != null || want.note || want.unit || want.spaceName);
}

function callMatches(call, want) {
  if (!want || typeof want !== "object") return false;
  if (want.use && call.use !== want.use) return false;
  if (want.name && !callNames(call).includes(String(want.name).trim())) return false;
  if (want.quantity != null && Number(call.quantity) !== Number(want.quantity)) return false;
  if (want.spaceName && String(call.spaceName || "") !== String(want.spaceName)) return false;
  if (want.locationName && String(call.locationName || "") !== String(want.locationName)) return false;
  if (want.unit && String(call.unit || "") !== String(want.unit)) return false;
  if (want.note && !String(call.note || "").includes(String(want.note))) return false;
  return true;
}

function actPayloads(actual) {
  const out = [];
  if (actual?.act) out.push(actual.act);
  for (const t of actual?.turns || []) {
    const data = t?.body?.data ?? t?.body;
    if (data && typeof data === "object") out.push(data);
  }
  return out;
}

function hasAskSignal(actual) {
  if (actual?.plan) {
    const ask = actual.plan.ask;
    return Array.isArray(ask) && ask.some((x) => String(x || "").trim());
  }
  for (const p of actPayloads(actual)) {
    if (Array.isArray(p.ask) && p.ask.some((x) => String(x?.question || x?.text || x || "").trim())) {
      return true;
    }
    if (p.status === "confirm") return true;
    if (Array.isArray(p.confirm) && p.confirm.length) return true;
    if (p.needConfirm) return true;
    const reply = String(p.reply || p.message || p.lead || "");
    if (/吗？|吗\?|\?|？|哪|哪个|确认|要不要|要我|是不是/.test(reply)) return true;
  }
  return false;
}

function presentMatches(present, want) {
  if (!present || typeof present !== "object") return false;
  const type = String(present.type || "");
  if (want === "any") return Boolean(type);
  if (want === "bars") return type === "bars" || type === "bar";
  if (want === "pie") return type === "pie" || type === "donut";
  return type === want;
}

function hasPresentInventory(act) {
  const present = act?.present;
  if (!present || typeof present !== "object") return false;
  if (present.type === "table" || present.type === "list") return true;
  if (Array.isArray(present.rows) && present.rows.length) return true;
  if (Array.isArray(present.items) && present.items.length) return true;
  return false;
}

function payloadHasProbe(p) {
  if (!p || typeof p !== "object") return false;
  if (hasPresentInventory(p)) return true;
  if (Array.isArray(p.calls) && p.calls.some((c) => c && (c.ref || c.itemId || /item\.(search|stats|listExpiring)/.test(c.use || "")))) {
    return true;
  }
  const askText = (Array.isArray(p.ask) ? p.ask : [])
    .map((a) => String(a?.question || a?.text || a || ""))
    .join(" ");
  if (/台账|找到|查到|哪边|哪一|哪条|不止一|好几处|加到|并进|临期|过期|还有没有/.test(askText)) {
    return true;
  }
  const opts = [];
  for (const a of p.ask || []) {
    for (const o of a?.options || []) opts.push(String(o?.value || o?.label || ""));
  }
  if (opts.some((v) => /加到|并进|新开|查家里|看看快过期|还有没有|整条删|确认删除/.test(v))) {
    return true;
  }
  const lead = String(p.lead || p.report?.lead || "");
  if (/查到|台账|还有|剩|没找到|没有|临期|到期|过期/.test(lead)) return true;
  if (/临期|到期|过期/.test(askText)) return true;
  return false;
}

function hasProbeSignal(actual) {
  if (actual?.plan) {
    const probe = actual.plan.probe;
    return (
      probe != null &&
      probe !== "" &&
      !(typeof probe === "object" && Object.keys(probe).length === 0)
    );
  }
  const tools = actual?.tools || [];
  if (tools.some((t) => t === "item.search" || t === "item.stats" || t === "item.listExpiring")) {
    return true;
  }
  return actPayloads(actual).some(payloadHasProbe);
}

function enrichActTools(data, tools, actual) {
  const out = [...(tools || [])];
  if (hasPresentInventory(data) && !out.includes("item.search")) {
    out.push("item.search");
  }
  // ask that already lists 临期/到期 facts implies listExpiring/search happened server-side
  for (const p of actual ? actPayloads(actual) : [data]) {
    const askText = (Array.isArray(p?.ask) ? p.ask : [])
      .map((a) => String(a?.question || a?.text || a || ""))
      .join(" ");
    if (/临期|到期|过期/.test(askText)) {
      if (!out.includes("item.listExpiring")) out.push("item.listExpiring");
    }
  }
  return [...new Set(out)];
}

function judgeExpected(caze, actual, mode) {
  const expected = caze.expected || {};
  const checks = [];
  const tools = actual?.tools || [];

  for (const t of expected.requiredTools || []) {
    const ok = tools.includes(t);
    checks.push({
      name: `requiredTool:${t}`,
      ok,
      detail: ok ? "present" : `missing; got [${tools.join(", ")}]`,
    });
  }
  if (Array.isArray(expected.requiredToolsAny) && expected.requiredToolsAny.length) {
    const ok = expected.requiredToolsAny.some((t) => tools.includes(t));
    checks.push({
      name: `requiredToolsAny:${expected.requiredToolsAny.join("|")}`,
      ok,
      detail: ok ? "hit" : `none; got [${tools.join(", ")}]`,
    });
  }
  for (const t of expected.forbiddenTools || []) {
    const ok = !tools.includes(t);
    checks.push({
      name: `forbiddenTool:${t}`,
      ok,
      detail: ok ? "absent" : "present",
    });
  }
  if (expected.mustAsk === true) {
    const ok = hasAskSignal(actual);
    checks.push({ name: "mustAsk", ok, detail: ok ? "ask-like" : "no ask signal" });
  }
  if (expected.mustProbe === true) {
    const ok = hasProbeSignal(actual);
    checks.push({
      name: "mustProbe",
      ok,
      detail: ok ? "probe/search-like" : "no probe signal",
    });
  }
  if (expected.mustPresent) {
    const want = String(expected.mustPresent);
    const hit = actPayloads(actual).find((p) => presentMatches(p?.present, want));
    checks.push({
      name: `mustPresent:${want}`,
      ok: Boolean(hit),
      detail: hit ? `type=${hit.present?.type || ""}` : "no matching present",
    });
  }
  const seenCalls = collectActCalls(actual);
  const receipts = receiptChunks(actual);
  for (const want of expected.callIncludes || []) {
    const namedWant = want?.name ? { ...want, name: undefined } : null;
    const ok =
      seenCalls.some((call) => callMatches(call, want)) ||
      receipts.some((chunk) => receiptMatches(chunk, want)) ||
      (namedWant != null &&
        seenCalls.some((call) => callMatches(call, namedWant)) &&
        receipts.some(
          (chunk) =>
            nameInChunk(chunk, want.name) &&
            (!want.use ||
              (want.use === "item.update" && /已改|→|->/.test(chunk)) ||
              (/remove/.test(want.use) && /已删|删掉/.test(chunk)) ||
              (/create/.test(want.use) && /已记下|记下/.test(chunk))),
        ));
    checks.push({
      name: `callIncludes:${want.use || "*"}:${want.name || ""}:${want.quantity ?? ""}`,
      ok,
      detail: ok ? "matched" : `missing among ${seenCalls.length} calls`,
    });
  }
  for (const want of expected.callExcludes || []) {
    const hit = seenCalls.some((call) => callMatches(call, want));
    checks.push({
      name: `callExcludes:${want.use || "*"}:${want.name || ""}`,
      ok: !hit,
      detail: hit ? "unexpected call present" : "absent",
    });
  }

  const failed = checks.filter((c) => !c.ok);
  let status;
  if (mode === "mock" && !expected.mockPlan && checks.length === 0) {
    status = "pending";
  } else if (checks.length === 0) {
    status = expected.manual ? "manual" : "pending";
  } else {
    status = failed.length ? "fail" : "pass";
  }

  return {
    id: caze.id,
    status,
    judgedAt: new Date().toISOString(),
    mode,
    outcome: expected.outcome || "",
    actual: actual || {},
    checks,
    notes: expected.manual || (status === "pending" ? "待 ai.act 实跑或补 mockPlan" : ""),
  };
}

async function apiPost(apiBase, token, pathName, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-HS-Token"] = token;
  const res = await fetch(`${apiBase}${pathName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const code = json?.error?.code || json?.code || res.status;
    const msg = json?.error?.message || json?.message || res.statusText;
    throw new Error(`${pathName} failed: ${code} ${msg}`);
  }
  return json?.data ?? json;
}

function resolveRelativeDate(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^([+-])(\d+)d$/i);
  if (!m) return s;
  const days = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadFixture(id) {
  const file = path.join(FIXTURES, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`fixture not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function applyFixture(apiBase, token, fixtureId) {
  const fx = loadFixture(fixtureId);
  const spaces = await apiPost(apiBase, token, "/api/space/list", {});
  const spaceList = spaces?.list || spaces?.spaces || [];
  const spaceByName = new Map(spaceList.map((s) => [s.name, s]));

  for (const sp of fx.spaces || []) {
    if (!spaceByName.has(sp.name)) {
      const created = await apiPost(apiBase, token, "/api/space/create", { name: sp.name });
      spaceByName.set(sp.name, created);
    }
    const space = spaceByName.get(sp.name);
    const locs = await apiPost(apiBase, token, "/api/space/listLocations", {
      spaceId: space._id || space.id,
    });
    const locByName = new Map((locs?.list || []).map((l) => [l.name, l]));
    for (const locName of sp.locations || []) {
      if (!locByName.has(locName)) {
        const created = await apiPost(apiBase, token, "/api/space/createLocation", {
          spaceId: space._id || space.id,
          name: locName,
        });
        locByName.set(locName, created);
      }
    }
    space._locByName = locByName;
    const keep = new Set(sp.locations || []);
    for (const [locName, loc] of locByName) {
      if (keep.has(locName)) continue;
      await apiPost(apiBase, token, "/api/space/removeLocation", {
        locationId: loc._id || loc.id,
      });
      locByName.delete(locName);
    }
  }

  // refresh spaces with locations
  for (const [name, space] of spaceByName) {
    if (space._locByName) continue;
    const locs = await apiPost(apiBase, token, "/api/space/listLocations", {
      spaceId: space._id || space.id,
    });
    space._locByName = new Map((locs?.list || []).map((l) => [l.name, l]));
    spaceByName.set(name, space);
  }

  const tags = await apiPost(apiBase, token, "/api/tag/list", {});
  const tagByName = new Map((tags?.list || []).map((t) => [t.name, t]));
  for (const tagName of fx.tags || []) {
    if (!tagByName.has(tagName)) {
      const created = await apiPost(apiBase, token, "/api/tag/create", { name: tagName });
      tagByName.set(tagName, created);
    }
  }

  const items = await apiPost(apiBase, token, "/api/item/list", {});
  const itemList = items?.list || [];
  const keyOf = (name, spaceId, locationId) =>
    `${name}\0${spaceId || ""}\0${locationId || ""}`;

  const wantedKeys = new Set();
  for (const row of fx.items || []) {
    const space = spaceByName.get(row.spaceName);
    if (!space) continue;
    const spaceId = space._id || space.id;
    let locationId = "";
    if (row.locationName) {
      const loc = space._locByName?.get(row.locationName);
      locationId = loc ? loc._id || loc.id : "";
    }
    wantedKeys.add(keyOf(row.name, spaceId, locationId));
  }
  const itemByKey = new Map();
  let removed = 0;
  for (const it of itemList) {
    const key = keyOf(it.name, it.spaceId, it.locationId || "");
    if (!wantedKeys.has(key) || itemByKey.has(key)) {
      await apiPost(apiBase, token, "/api/item/remove", { itemId: it._id || it.id });
      removed++;
      continue;
    }
    itemByKey.set(key, it);
  }

  let created = 0;
  let updated = 0;
  for (const row of fx.items || []) {
    const space = spaceByName.get(row.spaceName);
    if (!space) throw new Error(`fixture space missing after ensure: ${row.spaceName}`);
    const spaceId = space._id || space.id;
    let locationId = "";
    if (row.locationName) {
      const loc = space._locByName?.get(row.locationName);
      if (!loc) throw new Error(`fixture location missing: ${row.spaceName}/${row.locationName}`);
      locationId = loc._id || loc.id;
    }
    const tagIds = [];
    for (const tn of row.tagNames || []) {
      const t = tagByName.get(tn);
      if (t) tagIds.push(t._id || t.id);
    }
    const payload = {
      name: row.name,
      quantity: row.quantity,
      unit: row.unit || "",
      note: row.note || "",
      spaceId,
      locationId: locationId || undefined,
      tagIds,
    };
    if (row.expireDate) payload.expireDate = resolveRelativeDate(row.expireDate);
    if (row.productionDate) payload.productionDate = resolveRelativeDate(row.productionDate);

    const key = keyOf(row.name, spaceId, locationId);
    const existing = itemByKey.get(key);
    if (existing) {
      await apiPost(apiBase, token, "/api/item/update", {
        itemId: existing._id || existing.id,
        quantity: payload.quantity,
        unit: payload.unit,
        note: payload.note,
        spaceId,
        locationId: locationId || null,
        tagIds,
        expireDate: payload.expireDate || null,
      });
      updated++;
    } else {
      const createdItem = await apiPost(apiBase, token, "/api/item/create", payload);
      itemByKey.set(key, createdItem?.item || createdItem);
      created++;
    }
  }
  return { fixtureId, created, updated, removed, spaces: spaceByName.size };
}

function pickAskAffirm(askList, userText = "", optsCfg = {}) {
  const forbidden = new Set(optsCfg.forbiddenTools || []);
  const opts = [];
  for (const a of askList || []) {
    for (const o of a?.options || []) {
      const v = String(o?.value || o?.label || "").trim();
      if (v) opts.push(v);
    }
  }
  const text = String(userText || "");
  const deplete = /用完|没了|去掉|删掉|整条删/.test(text);
  const declineCreate = forbidden.has("item.create") || /没有就算了|先不用记|不用记/.test(text);
  const softNo = /不用|取消|错了|只是问问|先不改/;
  // keep "先不记/先不删" only when not depleting; depleting may need "先不记，只看看"
  const usable = opts.filter((v) => {
    if (declineCreate && /新记|记一笔|记一条|记到|记 \d/.test(v) && !/先不|不用|算了/.test(v)) {
      return false;
    }
    if (softNo.test(v) && !/看看|还有没有|查/.test(v) && !declineCreate) return false;
    if (/先不删/.test(v)) return false;
    return true;
  });
  if (declineCreate) {
    const decline = opts.find((v) => /不用|算了|先不记|先不用|没有就算/.test(v));
    if (decline) return decline;
  }

  // delete confirm / undo
  const del =
    usable.find((v) => /确认删除|整条删掉|删掉这行/.test(v)) ||
    usable.find((v) => /撤销|改回/.test(v));
  if (del) return del;

  if (deplete) {
    const see = usable.find((v) => /还有没有|看看家里|查/.test(v));
    if (see) return see;
    const rm = usable.find((v) => /删|去掉|销账|用完了，记 0/.test(v));
    if (rm) return rm;
  }

  const affirm = usable.find((v) => /确认|好的|对，|是的|就这样/.test(v) && !/先不/.test(v));
  if (affirm) return affirm;

  // expire / probe chips
  const probeChip = usable.find((v) => /看看快过期|查家里|查冰箱|临期|过期情况|库存和到期/.test(v));
  if (probeChip) return probeChip;

  // place hints from user utterance
  if (/冰箱/.test(text)) {
    const hit =
      usable.find((v) => /厨房/.test(v) && /冰箱/.test(v) && /加到|新记/.test(v)) ||
      usable.find((v) => /冰箱/.test(v) && /加到|新记/.test(v));
    if (hit) return hit;
  }
  if (/厨房/.test(text)) {
    const hit = usable.find((v) => /厨房/.test(v) && /加到|新记|记到/.test(v));
    if (hit) return hit;
  }

  // shopping / add ambiguity: prefer merge-into-existing, then create (not when depleting)
  if (!deplete) {
    const add = usable.find((v) => /加到|并进/.test(v));
    if (add) return add;
    const create = usable.find((v) => /新记|新开|记到|记一笔/.test(v));
    if (create) return create;
  }

  return usable[0] || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callAct(actUrl, token, text, history, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-HS-Token"] = token;
  const post = async (body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(actUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      const code = json?.error?.code || json?.code || "";
      if (code === "RATE_LIMITED" && attempt < 3) {
        const wait = 15000 * (attempt + 1);
        console.warn(`rate limited, retry in ${wait}ms…`);
        await sleep(wait);
        continue;
      }
      return { httpStatus: res.status, body: json };
    }
    return { httpStatus: 429, body: { ok: false, error: { code: "RATE_LIMITED" } } };
  };

  let { httpStatus, body } = await post({ text, history });
  let data = body?.data ?? body;
  const turns = [{ httpStatus, body }];

  // confirm gate: execute once
  if (data?.status === "confirm" && Array.isArray(data.calls) && data.calls.length) {
    const again = await post({
      text,
      history,
      confirmed: true,
      calls: data.calls,
    });
    turns.push(again);
    httpStatus = again.httpStatus;
    body = again.body;
    data = body?.data ?? body;
  }

  // ask chip follow (eval harness only); up to 3 clarifying rounds
  let hist = Array.isArray(history) ? [...history] : [];
  let currentText = text;
  for (let round = 0; opts.followAsk && round < 3; round++) {
    data = body?.data ?? body;
    if (data?.status !== "ask" || !Array.isArray(data.ask) || !data.ask.length) break;
    const pick = pickAskAffirm(data.ask, text, opts);
    if (!pick) break;
    hist = [
      ...hist,
      { role: "user", text: currentText },
      {
        role: "assistant",
        text: String(data.ask[0]?.question || data.lead || "请确认"),
      },
    ];
    currentText = pick;
    const again = await post({ text: pick, history: hist });
    turns.push(again);
    httpStatus = again.httpStatus;
    body = again.body;
    data = body?.data ?? body;
    if (data?.status === "confirm" && Array.isArray(data.calls) && data.calls.length) {
      const done = await post({
        text: pick,
        history: hist,
        confirmed: true,
        calls: data.calls,
      });
      turns.push(done);
      httpStatus = done.httpStatus;
      body = done.body;
      break;
    }
  }

  return { httpStatus, body, turns };
}

function writeSummary(runDir, meta, results) {
  const counts = { pass: 0, fail: 0, manual: 0, pending: 0, skipped: 0, error: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const lines = [
    `# Eval run: ${meta.runId}`,
    "",
    `- plan: ${meta.planId}`,
    `- title: ${meta.title}`,
    `- mode: ${meta.mode}`,
    `- at: ${meta.at}`,
    "",
    "## Score",
    "",
    "| status | n |",
    "| --- | --- |",
    `| pass | ${counts.pass} |`,
    `| fail | ${counts.fail} |`,
    `| pending | ${counts.pending} |`,
    `| manual | ${counts.manual} |`,
    `| skipped | ${counts.skipped} |`,
    `| error | ${counts.error} |`,
    "",
    "## Cases",
    "",
  ];
  for (const r of results) {
    lines.push(`- **${r.id}**: ${r.status}`);
    if (r.outcome) lines.push(`  - 预期：${r.outcome}`);
    if (r.notes) lines.push(`  - 备注：${r.notes}`);
    for (const c of r.checks || []) {
      if (!c.ok) lines.push(`  - FAIL ${c.name}: ${c.detail}`);
    }
  }
  lines.push("");
  fs.writeFileSync(path.join(runDir, "summary.md"), lines.join("\n"), "utf8");
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.plan && !args.cases)) {
    console.log(`Usage:
  node ai-eval/runner.mjs --plan <planId> [--mode mock|act|copy-only]
  node ai-eval/runner.mjs --cases id1,id2 [--mode act]
  HS_TOKEN=xxx node ai-eval/runner.mjs --plan core-smoke --mode act`);
    process.exit(args.help ? 0 : 1);
  }

  const bank = listBankCases();
  let caseIds = [];
  let planDoc = null;
  let planId = args.plan || "adhoc";
  if (args.plan) {
    planDoc = loadPlan(args.plan);
    caseIds = [...(planDoc.cases || [])];
  }
  if (args.cases) {
    caseIds = args.cases.split(",").map((s) => s.trim()).filter(Boolean);
  }
  for (const id of caseIds) {
    if (!bank.has(id)) throw new Error(`unknown case id: ${id}`);
  }

  const mode = args.mode;
  const runId = `${stamp()}-${planId}`;
  const runDir = path.join(RUNS, runId);
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  fs.mkdirSync(path.join(runDir, "results"), { recursive: true });

  const planSnap = {
    id: planId,
    title: planDoc?.title || "adhoc",
    description: planDoc?.description || "",
    cases: caseIds,
    copiedAt: new Date().toISOString(),
    mode,
    actUrl: mode === "act" ? args.actUrl : undefined,
    apiBase: mode === "act" ? args.apiBase : undefined,
  };
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify(planSnap, null, 2) + "\n");

  if (mode === "act" && args.token && !args.skipFixture) {
    const fixtureIds = new Set();
    for (const id of caseIds) {
      const fx = bank.get(id)?.case?.setup?.fixture;
      if (fx) fixtureIds.add(fx);
    }
    const fixtureLog = [];
    for (const fxId of fixtureIds) {
      try {
        const info = await applyFixture(args.apiBase, args.token, fxId);
        fixtureLog.push(info);
        console.log(
          `fixture ${fxId}: created=${info.created} updated=${info.updated} removed=${info.removed} spaces=${info.spaces}`,
        );
      } catch (e) {
        console.error(`fixture ${fxId} failed:`, e?.message || e);
        throw e;
      }
    }
    fs.writeFileSync(
      path.join(runDir, "fixture.json"),
      JSON.stringify({ applied: fixtureLog, at: new Date().toISOString() }, null, 2) + "\n",
    );
  }

  const results = [];
  for (const id of caseIds) {
    const entry = bank.get(id);
    fs.copyFileSync(entry.file, path.join(runDir, "cases", `${id}.json`));
    const caze = entry.case;
    const dialogue = splitDialogue(caze.prompt);

    let result;
    if (mode === "copy-only") {
      result = {
        id,
        status: "skipped",
        judgedAt: new Date().toISOString(),
        mode,
        outcome: caze.expected.outcome,
        notes: "copy-only",
        checks: [],
        actual: { dialogue },
      };
    } else if (mode === "act") {
      if (!args.token) {
        result = {
          id,
          status: "error",
          judgedAt: new Date().toISOString(),
          mode,
          outcome: caze.expected.outcome,
          notes: "缺少 HS_TOKEN / --token",
          checks: [],
          actual: { dialogue },
        };
      } else {
        try {
          const toolNeed = [
            ...(caze.expected?.requiredTools || []),
            ...(caze.expected?.requiredToolsAny || []),
          ];
          const forbidden = caze.expected?.forbiddenTools || [];
          const asksOnly =
            caze.expected?.mustAsk &&
            !caze.expected?.mustProbe &&
            toolNeed.length === 0 &&
            forbidden.some((t) => /^(item)\.(create|update|remove)/.test(t));
          const followAsk =
            !asksOnly &&
            Boolean(
              caze.expected?.mustProbe ||
                toolNeed.some((t) =>
                  /^(item|space|tag|habit)\.(create|update|remove|upsert|search|listExpiring|stats)/.test(
                    t,
                  ),
                ),
            );
          const fxId = caze.setup?.fixture;
          if (fxId && !args.skipFixture) {
            await applyFixture(args.apiBase, args.token, fxId);
          }
          const { httpStatus, body, turns } = await callAct(
            args.actUrl,
            args.token,
            dialogue.text,
            dialogue.history,
            {
              followAsk,
              forbiddenTools: caze.expected?.forbiddenTools || [],
            },
          );
          const data = body?.data ?? body;
          let tools = collectToolsFromActPayload(data);
          for (const t of turns || []) {
            tools.push(...collectToolsFromActPayload(t?.body?.data ?? t?.body));
          }
          const actual = { dialogue, httpStatus, act: data, tools: [], envelope: body, turns };
          tools = enrichActTools(data, [...new Set(tools)], actual);
          actual.tools = tools;
          result = judgeExpected(caze, actual, "act");
          if (httpStatus >= 400 || body?.ok === false) {
            result.status = "fail";
            result.notes = `act HTTP ${httpStatus} code=${body?.error?.code || body?.code || ""}`;
          }
          await sleep(Number(process.env.HS_EVAL_GAP_MS || 1200));
        } catch (e) {
          result = {
            id,
            status: "error",
            judgedAt: new Date().toISOString(),
            mode,
            outcome: caze.expected.outcome,
            notes: String(e?.message || e),
            checks: [],
            actual: { dialogue },
          };
        }
      }
    } else {
      // mock
      if (caze.expected.mockPlan) {
        const plan = caze.expected.mockPlan;
        const actual = {
          dialogue,
          plan,
          tools: collectToolsFromPlan(plan),
        };
        result = judgeExpected(caze, actual, "mock");
      } else {
        result = {
          id,
          status: "pending",
          judgedAt: new Date().toISOString(),
          mode: "mock",
          outcome: caze.expected.outcome,
          notes: "无 mockPlan：请用 --mode act 实跑，或补 mockPlan",
          checks: [],
          actual: { dialogue },
        };
      }
    }

    fs.writeFileSync(
      path.join(runDir, "results", `${id}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    results.push(result);
  }

  const counts = writeSummary(
    runDir,
    {
      runId,
      planId,
      title: planSnap.title,
      mode,
      at: planSnap.copiedAt,
    },
    results,
  );

  console.log(`Run written: ${path.relative(process.cwd(), runDir)}`);
  console.log(
    `pass=${counts.pass} fail=${counts.fail} pending=${counts.pending} manual=${counts.manual} skipped=${counts.skipped} error=${counts.error}`,
  );
  if ((counts.fail || 0) > 0 || (counts.error || 0) > 0) process.exitCode = 1;
}

main();
