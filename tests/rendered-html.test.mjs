import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the KLANG product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>KLANG/);
  assert.match(html, /คลังงานกลางของทีม/);
  assert.match(html, /เพิ่มรายการ/);
  assert.match(html, /ค้นหาชื่อ เนื้อหา ลิงก์ หรือหมวด/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});
