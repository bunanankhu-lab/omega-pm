// ดูดพิกัดจากลิงก์ Google Maps ที่แปะไว้ในช่องที่อยู่ของร้าน (pm_stores.address)
// สำหรับร้านที่ยังไม่มี lat/lng — ใช้กับปุ่ม "🔄 อัปเดตพิกัด" ในแผนที่ละเอียด
// วิธีใช้ของทีม: ร้านไหนไม่มีหมุด → แชร์ลิงก์จาก Google Maps มาแปะในช่องที่อยู่ → กดอัปเดตพิกัด
const SUPABASE_URL = "https://vhrexjmzdcvlojzanvum.supabase.co";
const SUPABASE_KEY = "sb_publishable_47xRsvJMYfqk1XSlW6qjaQ_8ABKblB5";

const BOUNDS = { latMin: 13.8, latMax: 18.7, lngMin: 100.8, lngMax: 106.2 }; // กรอบภาคอีสานกันพิกัดหลุดโลก
const MAX_PER_RUN = 25; // กันฟังก์ชันรันเกินเวลา — กดซ้ำได้ถ้ามีค้าง

function sbHeaders(json) {
  const h = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function coordsFromUrl(u) {
  let m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/); // พิกัดหมุดจริง แม่นกว่า @ (จุดกลางจอ)
  if (m) return [Number(m[1]), Number(m[2])];
  m = u.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = u.match(/\/maps\/search\/(-?\d+\.\d+)(?:,|%2C)\s*\+?(-?\d+\.\d+)/); // ลิงก์แชร์แบบ search/lat,+lng
  if (m) return [Number(m[1]), Number(m[2])];
  m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  return null;
}

async function resolveLink(url) {
  let cur = url;
  for (let hop = 0; hop < 6; hop++) {
    const direct = coordsFromUrl(cur);
    if (direct) return direct;
    const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const loc = r.headers.get("location");
    if (loc) { cur = new URL(loc, cur).toString(); continue; }
    if (r.ok) {
      const html = await r.text();
      // ลิงก์แบบ q=ชื่อร้าน ไม่มีพิกัดใน URL — จุดกลางแผนที่ (center=) คือตำแหน่งร้านที่ค้นเจอ
      const m = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
        html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
      if (m) return [Number(m[1]), Number(m[2])];
    }
    break;
  }
  return null;
}

module.exports = async function (req, res) {
  let stores;
  try {
    // ร้านที่ยังไม่มีพิกัด + ร้านพิกัดจากค้นชื่อ (osm) ที่มีลิงก์แปะแล้ว — ลิงก์แม่นกว่า ให้ทับได้
    const r = await fetch(SUPABASE_URL + "/rest/v1/pm_stores?active=eq.true&or=(lat.is.null,geo_src.eq.osm)&select=id,name,address", {
      headers: sbHeaders(),
    });
    if (!r.ok) throw new Error("supabase " + r.status);
    stores = await r.json();
  } catch (e) {
    res.status(500).json({ updated: 0, error: "อ่านข้อมูลร้านไม่ได้ (" + e.message + ")" });
    return;
  }

  const withLink = stores.filter((s) => /maps\.app\.goo\.gl|google\.[a-z.]+\/maps|goo\.gl\/maps/.test(s.address || ""));
  const batch = withLink.slice(0, MAX_PER_RUN);
  let updated = 0;
  const done = [], failed = [];

  for (const s of batch) {
    const m = String(s.address).match(/https?:\/\/\S+/);
    if (!m) { failed.push(s.name); continue; }
    let c = null;
    try { c = await resolveLink(m[0]); } catch (e) {}
    if (!c || c[0] < BOUNDS.latMin || c[0] > BOUNDS.latMax || c[1] < BOUNDS.lngMin || c[1] > BOUNDS.lngMax) {
      failed.push(s.name);
      continue;
    }
    const up = await fetch(SUPABASE_URL + "/rest/v1/pm_stores?id=eq." + encodeURIComponent(s.id), {
      method: "PATCH", headers: sbHeaders(true),
      body: JSON.stringify({ lat: c[0], lng: c[1], geo_src: "gmap" }),
    });
    if (up.ok) { updated++; done.push(s.name); } else failed.push(s.name);
  }

  res.status(200).json({
    checked: withLink.length,
    updated: updated,
    remaining: Math.max(0, withLink.length - batch.length),
    names: done,
    failed: failed,
  });
};
