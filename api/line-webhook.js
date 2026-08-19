// บอทกลุ่มไลน์ Bot Omega — พิมพ์ "สต๊อก" ในกลุ่มแล้วตอบยอดคงเหลือจากฐานข้อมูลเดียวกับหน้าแอป #stock
// ตั้งค่าใน Vercel env: LINE_CHANNEL_SECRET (เช็คลายเซ็นว่ามาจาก LINE จริง), LINE_CHANNEL_ACCESS_TOKEN (ใช้ตอบกลับ)
const crypto = require("crypto");

const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";
const APP_URL = "https://omega-pm.vercel.app/";

// คำที่ทำให้บอทตอบ (พิมพ์คำเดียวล้วนๆ กันบอทเด้งตอบตอนคุยเรื่องอื่นที่มีคำว่าสต๊อกปน)
const KEYWORDS = ["สต๊อก", "สต็อก", "สต๊อค", "สต็อค", "stock"];
// คำสำหรับสต๊อกวัสดุ-อะไหล่ (ตาราง inv_items — หน้า stock.html)
const PARTS_KEYWORDS = ["อะไหล่", "วัสดุ", "สต๊อกของ", "สต็อกของ", "สต๊อกอะไหล่", "สต๊อกวัสดุ", "ของใกล้หมด", "ใกล้หมด"];

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

async function stockSummary() {
  const r = await fetch(SUPABASE_URL + "/rest/v1/stock_items?active=eq.true&order=pos,id&select=grp,name,qty", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  if (!r.ok) throw new Error("supabase " + r.status);
  const items = await r.json();
  if (!items.length) return "ยังไม่มีรายการในสต๊อก\nเพิ่มได้ในแอป: " + APP_URL + "#stock";
  // เวลาไทย (เซิร์ฟเวอร์รันเป็น UTC) + ปี พ.ศ. 2 หลัก ให้เหมือนที่พิมพ์กันในกลุ่ม
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const yy = (th.getUTCFullYear() + 543) % 100;
  const lines = ["📦 สต๊อกเครื่อง " + th.getUTCDate() + "/" + (th.getUTCMonth() + 1) + "/" + yy, ""];
  let total = 0, lastGrp = null;
  for (const it of items) {
    if (it.grp !== lastGrp) {
      if (lastGrp !== null) lines.push("");
      lines.push(it.grp || "อื่นๆ");
      lastGrp = it.grp;
    }
    lines.push(it.name + " " + it.qty + " เครื่อง");
    total += it.qty;
  }
  lines.push("", "รวม " + total + " เครื่อง", "ดู/ตัดสต๊อก: " + APP_URL + "#stock");
  return lines.join("\n");
}

// สรุปสต๊อกวัสดุ-อะไหล่ — เน้นของหมด/ใกล้หมด
async function partsSummary() {
  const r = await fetch(SUPABASE_URL + "/rest/v1/inv_items?active=eq.true&order=category,sort_order&select=category,name,qty,min_qty,unit", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  if (!r.ok) throw new Error("supabase " + r.status);
  const items = await r.json();
  if (!items.length) return "ยังไม่มีรายการวัสดุ-อะไหล่\nเพิ่มได้ในแอป: " + APP_URL + "stock.html";
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const yy = (th.getUTCFullYear() + 543) % 100;
  const lines = ["🧰 สต๊อกวัสดุ-อะไหล่ " + th.getUTCDate() + "/" + (th.getUTCMonth() + 1) + "/" + yy, ""];
  const byCat = {};
  for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;
  for (const c in byCat) lines.push(c + " — " + byCat[c] + " รายการ");
  lines.push("รวม " + items.length + " รายการ");
  const out = items.filter((it) => Number(it.qty) <= 0);
  const near = items.filter((it) => Number(it.qty) > 0 && Number(it.qty) <= Number(it.min_qty));
  const MAX = 15; // ตอบในแชทเอาแค่หัวๆ พอ ดูเต็มๆ ในแอป
  function add(list, head) {
    if (!list.length) return;
    lines.push("", head + " (" + list.length + ")");
    list.slice(0, MAX).forEach((it) => lines.push("• " + it.name + " เหลือ " + Number(it.qty) + " " + it.unit));
    if (list.length > MAX) lines.push("…และอีก " + (list.length - MAX) + " รายการ");
  }
  add(out, "⛔ หมด");
  add(near, "⚠️ ใกล้หมด");
  if (!out.length && !near.length) lines.push("", "✅ ไม่มีของหมด/ใกล้หมด");
  lines.push("", "ดู/รับ-จ่ายของ: " + APP_URL + "stock.html");
  return lines.join("\n");
}

// จำ group id ของกลุ่มไว้ใน bot_state — เอาไว้ให้ api/stock-alert.js push แจ้งเตือนเข้ากลุ่มได้
let savedGroupId = null;
async function rememberGroup(gid) {
  if (!gid || gid === savedGroupId) return;
  savedGroupId = gid;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/bot_state", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([{ key: "line_group_id", value: gid, updated_at: new Date().toISOString() }]),
    });
  } catch (e) { console.error("rememberGroup failed:", e.message); }
}

module.exports = async function (req, res) {
  // เปิดจากเบราว์เซอร์ (GET) = เช็คว่าบอทออนไลน์อยู่
  if (req.method !== "POST") {
    res.status(200).send("Omega stock bot: OK");
    return;
  }
  const secret = process.env.LINE_CHANNEL_SECRET || "";
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

  let raw = await readRaw(req);
  if ((!raw || !raw.length) && req.body) raw = Buffer.from(JSON.stringify(req.body));

  // เช็คลายเซ็นจาก LINE — คนอื่นยิงมาเองจะไม่ผ่าน
  const sig = String(req.headers["x-line-signature"] || "");
  const expect = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  if (!secret || sig !== expect) {
    res.status(403).send("bad signature");
    return;
  }

  let body;
  try { body = JSON.parse(raw.toString("utf8")); } catch (e) { body = {}; }
  let replied = 0;
  for (const ev of body.events || []) {
    // จำ group id ทุกข้อความที่มาจากกลุ่ม (ใช้ push แจ้งของใกล้หมด)
    if (ev.source && ev.source.type === "group" && ev.source.groupId) await rememberGroup(ev.source.groupId);
    if (ev.type !== "message" || !ev.message || ev.message.type !== "text" || !ev.replyToken) continue;
    const text = String(ev.message.text || "").trim().toLowerCase();
    const isMachine = KEYWORDS.indexOf(text) !== -1;
    const isParts = PARTS_KEYWORDS.indexOf(text) !== -1;
    if (!isMachine && !isParts) continue;
    let msg;
    try {
      msg = isParts ? await partsSummary() : await stockSummary();
    } catch (e) {
      msg = isParts
        ? "⚠️ ดึงยอดสต๊อกไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง หรือเปิดดูในแอป: " + APP_URL + "stock.html"
        : "⚠️ ดึงยอดสต๊อกไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง หรือเปิดดูในแอป: " + APP_URL + "#stock";
    }
    replied++;
    if (token) {
      const lr = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ replyToken: ev.replyToken, messages: [{ type: "text", text: msg }] }),
      });
      if (!lr.ok) console.error("LINE reply failed:", lr.status, await lr.text());
    } else {
      console.error("LINE_CHANNEL_ACCESS_TOKEN not set — cannot reply");
    }
  }
  res.status(200).json({ ok: true, replied: replied });
};

// ปิด body parser ของ Vercel — ต้องใช้ตัว body ดิบเป๊ะๆ ในการเช็คลายเซ็น
module.exports.config = { api: { bodyParser: false } };
