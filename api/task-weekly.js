// สรุปงานประจำสัปดาห์เข้ากลุ่ม LINE — งานที่เสร็จรอบ 7 วัน + เตือนงานค้างทั้งหมด (เรียงแบบหน้าเว็บ)
// - GET ธรรมดา = พรีวิว (ไม่ส่ง)  ·  GET ?send=1 หรือ Vercel Cron (จันทร์ 08:00) = ส่งจริง
// - กลุ่มเป้าหมาย = bot_state key line_task_group_id (ย้ายกลุ่มได้ด้วยการพิมพ์ "ตั้งกลุ่มงาน" ในกลุ่มใหม่)
const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";
const APP_URL = "https://omega-pm.vercel.app/tasks.html";
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function sbHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
}

async function fetchTasks() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rp = await fetch(SUPABASE_URL + "/rest/v1/todo_tasks?done=eq.false&select=title,assignee,due_date,urgent&order=created_at.asc&limit=300", { headers: sbHeaders() });
  if (!rp.ok) throw new Error("supabase " + rp.status);
  const rd = await fetch(SUPABASE_URL + "/rest/v1/todo_tasks?done=eq.true&done_at=gte." + encodeURIComponent(since) + "&select=title,assignee&order=done_at.desc&limit=100", { headers: sbHeaders() });
  if (!rd.ok) throw new Error("supabase " + rd.status);
  return { pending: await rp.json(), doneWeek: await rd.json() };
}

function buildMessage(pending, doneWeek) {
  // เวลาไทย (เซิร์ฟเวอร์รันเป็น UTC) + ปี พ.ศ. 2 หลัก ให้เหมือนที่พิมพ์กันในกลุ่ม
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const yy = (th.getUTCFullYear() + 543) % 100;
  const today = Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate());
  function dueInfo(d) {
    if (!d) return "";
    const p = String(d).slice(0, 10).split("-");
    const diff = Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - today) / 86400000);
    if (diff < 0) return " ⛔เลยกำหนด " + Math.abs(diff) + " วัน";
    if (diff === 0) return " 📅วันนี้";
    if (diff === 1) return " 📅พรุ่งนี้";
    return " 📅" + Number(p[2]) + " " + TH_M[+p[1] - 1];
  }
  // ด่วนขึ้นก่อน → ใกล้กำหนดขึ้นก่อน (ไม่มีกำหนดไว้ท้าย) — ลำดับเดียวกับหน้าเว็บ
  pending.sort(function (a, b) {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    const da = a.due_date || "9999-12-31", db = b.due_date || "9999-12-31";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const lines = ["🗓️ สรุปงานประจำสัปดาห์ " + th.getUTCDate() + "/" + (th.getUTCMonth() + 1) + "/" + yy, ""];
  const MAX_DONE = 10, MAX_PENDING = 25;
  if (doneWeek.length) {
    lines.push("✅ เสร็จรอบ 7 วัน " + doneWeek.length + " งาน");
    doneWeek.slice(0, MAX_DONE).forEach(function (t) {
      lines.push("• " + t.title + (t.assignee ? " — " + t.assignee : ""));
    });
    if (doneWeek.length > MAX_DONE) lines.push("…และอีก " + (doneWeek.length - MAX_DONE) + " งาน");
  } else {
    lines.push("✅ รอบ 7 วันนี้ยังไม่มีงานติ๊กเสร็จ");
  }
  lines.push("");
  if (pending.length) {
    lines.push("📋 งานค้าง " + pending.length + " งาน");
    pending.slice(0, MAX_PENDING).forEach(function (t) {
      lines.push("• " + (t.urgent ? "🔥" : "") + t.title + (t.assignee ? " — " + t.assignee : "") + dueInfo(t.due_date));
    });
    if (pending.length > MAX_PENDING) lines.push("…และอีก " + (pending.length - MAX_PENDING) + " งาน");
  } else {
    lines.push("🎉 ไม่มีงานค้าง เยี่ยมมาก!");
  }
  lines.push("", "ดู/ติ๊กเสร็จ: " + APP_URL);
  return lines.join("\n");
}

async function groupId() {
  const r = await fetch(SUPABASE_URL + "/rest/v1/bot_state?key=eq.line_task_group_id&select=value", { headers: sbHeaders() });
  if (!r.ok) throw new Error("supabase " + r.status);
  const rows = await r.json();
  return rows.length ? rows[0].value : "";
}

module.exports = async function (req, res) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const url = new URL(req.url, "http://x");
  const fromCron = String(req.headers["user-agent"] || "").indexOf("vercel-cron") === 0 || !!req.headers["x-vercel-cron"];
  const doSend = fromCron || url.searchParams.get("send") === "1";

  let data;
  try {
    data = await fetchTasks();
  } catch (e) {
    res.status(500).json({ sent: false, error: "ดึงข้อมูลงานไม่ได้ (" + e.message + ")" });
    return;
  }
  const message = buildMessage(data.pending, data.doneWeek);

  if (!doSend) {
    res.status(200).json({ sent: false, preview: true, pending: data.pending.length, doneWeek: data.doneWeek.length, message: message });
    return;
  }
  if (!token) {
    res.status(500).json({ sent: false, error: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Vercel" });
    return;
  }

  let gid = "";
  try { gid = await groupId(); } catch (e) {}
  if (!gid) {
    res.status(200).json({ sent: false, error: "ยังไม่ได้ตั้งกลุ่ม — พิมพ์ “ตั้งกลุ่มงาน” ในกลุ่มไลน์ 1 ครั้ง" });
    return;
  }

  const lr = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: message }] }),
  });
  if (!lr.ok) {
    const t = await lr.text();
    console.error("LINE push failed:", lr.status, t);
    res.status(500).json({ sent: false, error: "LINE ตอบ " + lr.status });
    return;
  }
  res.status(200).json({ sent: true, cron: fromCron, pending: data.pending.length, doneWeek: data.doneWeek.length });
};
