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

function parseArgs(argv) {
  const out = {
    plan: null,
    cases: null,
    copyOnly: false,
    mode: "mock",
    actUrl: process.env.HS_ACT_URL || "http://127.0.0.1:8080/api/ai/act",
    token: process.env.HS_TOKEN || "",
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
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
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

function hasAskSignal(actual) {
  if (actual?.plan) {
    const ask = actual.plan.ask;
    return Array.isArray(ask) && ask.some((x) => String(x || "").trim());
  }
  const p = actual?.act;
  if (!p) return false;
  if (Array.isArray(p.ask) && p.ask.some((x) => String(x?.text || x || "").trim())) {
    return true;
  }
  if (p.needConfirm || p.confirm) return true;
  const reply = String(p.reply || p.message || "");
  return /吗\？|\?|哪|哪个|确认/.test(reply);
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
  return tools.some((t) => t === "item.search" || t === "item.stats" || t === "item.listExpiring");
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

async function callAct(actUrl, token, text, history) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-HS-Token"] = token;
  const res = await fetch(actUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, history }),
  });
  const body = await res.json().catch(() => ({}));
  return { httpStatus: res.status, body };
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
  };
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify(planSnap, null, 2) + "\n");

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
          const { httpStatus, body } = await callAct(
            args.actUrl,
            args.token,
            dialogue.text,
            dialogue.history,
          );
          const data = body?.data ?? body;
          const tools = collectToolsFromActPayload(data);
          const actual = { dialogue, httpStatus, act: data, tools, envelope: body };
          result = judgeExpected(caze, actual, "act");
          if (httpStatus >= 400 || body?.ok === false) {
            result.status = "fail";
            result.notes = `act HTTP ${httpStatus} code=${body?.error?.code || body?.code || ""}`;
          }
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
