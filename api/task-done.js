// แจ้งเข้ากลุ่ม LINE ตอนมีคนติ๊กงานเสร็จในหน้า tasks.html
// POST {id, by} → เช็คใน todo_tasks ว่างานติ๊กเสร็จจริง แล้ว push ✅ เข้ากลุ่มที่ปักไว้
// กลุ่มปักด้วยการพิมพ์ "ตั้งกลุ่มงาน" ในกลุ่มไลน์ (api/line-webhook.js เก็บใน bot_state key line_task_group_id)
const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";
const APP_URL = "https://omega-pm.vercel.app/tasks.html";

function sbHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ sent: false, error: "ต้องยิงแบบ POST" });
    return;
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) {
    res.status(500).json({ sent: false, error: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Vercel" });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== "object") {
    try { body = JSON.parse(String(body || "{}")); } catch (e) { body = {}; }
  }
  const id = Number(body.id);
  const by = String(body.by || "").trim();
  if (!id) {
    res.status(400).json({ sent: false, error: "ไม่มี id งาน" });
    return;
  }

  // เช็คจากฐานข้อมูลจริง — กันคนยิง API ตรงๆ หลอกให้บอทส่งข้อความมั่วเข้ากลุ่ม
  let task, pendingCount = null;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/todo_tasks?id=eq." + id + "&select=title,assignee,done", { headers: sbHeaders() });
    if (!r.ok) throw new Error("supabase " + r.status);
    task = (await r.json())[0];
    const rc = await fetch(SUPABASE_URL + "/rest/v1/todo_tasks?done=eq.false&select=id&limit=500", { headers: sbHeaders() });
    if (rc.ok) pendingCount = (await rc.json()).length;
  } catch (e) {
    res.status(500).json({ sent: false, error: "ดึงข้อมูลงานไม่ได้ (" + e.message + ")" });
    return;
  }
  if (!task) {
    res.status(404).json({ sent: false, error: "ไม่พบงานนี้" });
    return;
  }
  if (!task.done) {
    res.status(200).json({ sent: false, error: "งานนี้ยังไม่ได้ติ๊กเสร็จ" });
    return;
  }

  let gid = "";
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/bot_state?key=eq.line_task_group_id&select=value", { headers: sbHeaders() });
    if (r.ok) {
      const rows = await r.json();
      gid = rows.length ? rows[0].value : "";
    }
  } catch (e) {}
  if (!gid) {
    res.status(200).json({ sent: false, error: "ยังไม่ได้ตั้งกลุ่ม — พิมพ์ “ตั้งกลุ่มงาน” ในกลุ่มไลน์ 1 ครั้ง" });
    return;
  }

  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const yy = (th.getUTCFullYear() + 543) % 100;
  const lines = ["✅ งานเสร็จแล้ว", "", task.title];
  if (task.assignee) lines.push("👤 ผู้รับผิดชอบ: " + task.assignee);
  lines.push("✔️ ติ๊กโดย " + (by || "ไม่ระบุ") + " · " + th.getUTCDate() + "/" + (th.getUTCMonth() + 1) + "/" + yy);
  if (pendingCount !== null) {
    lines.push("", pendingCount === 0 ? "🎉 ไม่มีงานค้างแล้ว เยี่ยมมาก!" : "📋 เหลืองานค้างอีก " + pendingCount + " งาน");
  }
  lines.push("ดูงานทั้งหมด: " + APP_URL);

  const lr = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: lines.join("\n") }] }),
  });
  if (!lr.ok) {
    const t = await lr.text();
    console.error("LINE push failed:", lr.status, t);
    res.status(500).json({ sent: false, error: "LINE ตอบ " + lr.status });
    return;
  }
  res.status(200).json({ sent: true });
};
