// สร้าง PDF สัญญาด้วย Chromium จริงบนเซิร์ฟเวอร์ — สระ/วรรณยุกต์ไทยตรงเป๊ะเหมือนสั่งพิมพ์
// (ตัววาดฝั่งเบราว์เซอร์ html2canvas วางสระไทยเพี้ยน จึงย้ายมาทำที่นี่)
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("POST only");
  }
  let browser = null;
  try {
    const raw = await readRaw(req);
    const body = JSON.parse(raw.toString("utf8") || "{}");
    const html = body.html;
    if (!html || typeof html !== "string" || html.length > 4000000) {
      res.statusCode = 400;
      return res.end("bad html");
    }
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 794, height: 1123 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
    try { await page.evaluate("document.fonts.ready"); } catch (e) {}
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "8mm", right: "18mm", bottom: "14mm", left: "18mm" },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(Buffer.from(pdf));
  } catch (e) {
    res.statusCode = 500;
    res.end("pdf error: " + e.message);
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
  }
};
