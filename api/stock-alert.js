// แจ้งของหมด/ใกล้หมด (สต๊อกวัสดุ-อะไหล่ inv_items) เข้ากลุ่ม LINE ผ่าน Bot Omega
// - GET ธรรมดา = พรีวิว (ไม่ส่ง)  ·  GET ?send=1 หรือ Vercel Cron (ทุกเช้า) = ส่งจริง
// - group id ของกลุ่มถูกจับเก็บใน bot_state โดย api/line-webhook.js ตอนมีคนพิมพ์ในกลุ่ม
const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";
const STOCK_URL = "https://omega-pm.vercel.app/stock.html";

function sbHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
}

async function lowItems() {
  const r = await fetch(SUPABASE_URL + "/rest/v1/inv_items?active=eq.true&order=category,sort_order&select=category,name,qty,min_qty,unit", {
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error("supabase " + r.status);
  const items = await r.json();
  return items.filter((it) => Number(it.qty) <= Number(it.min_qty));
}

function buildMessage(low) {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const yy = (th.getUTCFullYear() + 543) % 100;
  const out = low.filter((it) => Number(it.qty) <= 0);
  const near = low.filter((it) => Number(it.qty) > 0);
  const lines = ["🚨 สต๊อกวัสดุ-อะไหล่ ใกล้หมด " + th.getUTCDate() + "/" + (th.getUTCMonth() + 1) + "/" + yy];
  const MAX = 60; // กันข้อความยาวเกินลิมิต LINE
  let shown = 0, hidden = 0;
  function add(list, head) {
    if (!list.length) return;
    lines.push("", head + " (" + list.length + ")");
    for (const it of list) {
      if (shown >= MAX) { hidden++; continue; }
      shown++;
      lines.push("• " + it.name + " เหลือ " + Number(it.qty) + " " + it.unit);
    }
  }
  add(out, "⛔ หมด");
  add(near, "⚠️ ใกล้หมด");
  if (hidden) lines.push("…และอีก " + hidden + " รายการ");
  lines.push("", "เช็ค/เติมสต๊อก: " + STOCK_URL);
  return lines.join("\n");
}

async function groupId() {
  const r = await fetch(SUPABASE_URL + "/rest/v1/bot_state?key=eq.line_group_id&select=value", { headers: sbHeaders() });
  if (!r.ok) throw new Error("supabase " + r.status);
  const rows = await r.json();
  return rows.length ? rows[0].value : "";
}

module.exports = async function (req, res) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const url = new URL(req.url, "http://x");
  const fromCron = String(req.headers["user-agent"] || "").indexOf("vercel-cron") === 0 || !!req.headers["x-vercel-cron"];
  const doSend = fromCron || url.searchParams.get("send") === "1";

  let low;
  try {
    low = await lowItems();
  } catch (e) {
    res.status(500).json({ sent: false, error: "ดึงข้อมูลสต๊อกไม่ได้ (" + e.message + ")" });
    return;
  }

  if (!doSend) {
    res.status(200).json({ sent: false, preview: true, low: low.length, message: buildMessage(low) });
    return;
  }
  if (!low.length) {
    // cron ตอนเช้า: ไม่มีของใกล้หมดก็เงียบไว้ ไม่รบกวนกลุ่ม
    res.status(200).json({ sent: false, low: 0, error: "ไม่มีของหมด/ใกล้หมด" });
    return;
  }
  if (!token) {
    res.status(500).json({ sent: false, error: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Vercel" });
    return;
  }

  let gid = "";
  try { gid = await groupId(); } catch (e) {}
  if (!gid) {
    res.status(200).json({ sent: false, low: low.length, error: "บอทยังไม่รู้จักกลุ่ม — ให้พิมพ์ “สต๊อก” ในกลุ่มไลน์ 1 ครั้งก่อน แล้วลองใหม่" });
    return;
  }

  const lr = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: buildMessage(low) }] }),
  });
  if (!lr.ok) {
    const t = await lr.text();
    console.error("LINE push failed:", lr.status, t);
    res.status(500).json({ sent: false, low: low.length, error: "LINE ตอบ " + lr.status });
    return;
  }
  res.status(200).json({ sent: true, low: low.length, cron: fromCron });
};
