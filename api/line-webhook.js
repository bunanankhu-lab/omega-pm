// บอทกลุ่มไลน์ Bot Omega — พิมพ์ "สต๊อก" ในกลุ่มแล้วตอบยอดคงเหลือจากฐานข้อมูลเดียวกับหน้าแอป #stock
// ตั้งค่าใน Vercel env: LINE_CHANNEL_SECRET (เช็คลายเซ็นว่ามาจาก LINE จริง), LINE_CHANNEL_ACCESS_TOKEN (ใช้ตอบกลับ)
const crypto = require("crypto");

const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";
const APP_URL = "https://omega-pm.vercel.app/";

// คำที่ทำให้บอทตอบ (พิมพ์คำเดียวล้วนๆ กันบอทเด้งตอบตอนคุยเรื่องอื่นที่มีคำว่าสต๊อกปน)
const KEYWORDS = ["สต๊อก", "สต็อก", "สต๊อค", "สต็อค", "stock"];

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
    if (ev.type !== "message" || !ev.message || ev.message.type !== "text" || !ev.replyToken) continue;
    const text = String(ev.message.text || "").trim().toLowerCase();
    if (KEYWORDS.indexOf(text) === -1) continue;
    let msg;
    try {
      msg = await stockSummary();
    } catch (e) {
      msg = "⚠️ ดึงยอดสต๊อกไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง หรือเปิดดูในแอป: " + APP_URL + "#stock";
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
