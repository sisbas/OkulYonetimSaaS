import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../../frontend/ux/store.js", import.meta.url),
  "utf8",
);
const { createDemoStore } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
test("leave to substitution to attendance to notification is coherent and idempotent", () => {
  const s = createDemoStore();
  assert.throws(() => s.assign("l1", "t1"), /İzin uygunluğu/);
  s.assign("l1", "t2");
  assert.equal(s.lessons[0].activeTeacher, "Bora Demo");
  assert.throws(() => s.submitAttendance("l1"), /bütün öğrencileri/);
  s.markAll("l1");
  s.setMark("l1", "s1", "absent");
  s.submitAttendance("l1");
  const n = s.notifications.find((n) => n.lessonId === "l1");
  assert.ok(n);
  const count = s.notifications.length;
  s.submitAttendance("l1");
  assert.equal(s.notifications.length, count);
  s.approveNotification(n.id);
  assert.equal(n.status, "queued");
  assert.throws(() => s.approveNotification(n.id));
  assert.throws(() => s.clear("l1"), /tamamlanan/);
});
test("teacher ownership and manager permissions are enforced in the synthetic adapter", () => {
  const s = createDemoStore();
  s.role = "TEACHER";
  assert.throws(() => s.assign("l1", "t2"));
  assert.throws(() => s.markAll("l2"), /kendi dersiniz/);
  s.markAll("l3");
  s.setMark("l3", "s1", "");
  assert.throws(() => s.submitAttendance("l3"));
  assert.throws(() => s.approveNotification("n1"));
  s.role = "OPS_STAFF";
  assert.throws(() => s.decideLeave("lv2", true));
  s.role = "VIEWER";
  assert.throws(() => s.markAll("l3"));
});
test("approved leave removes teacher only from impacted lesson, overlapping requests rejected", () => {
  const s = createDemoStore();
  s.decideLeave("lv2", true);
  assert.equal(s.lessons.find((l) => l.id === "l6").status, "needs_teacher");
  assert.equal(s.lessons.find((l) => l.id === "l4").status, "completed");
  assert.throws(
    () =>
      s.createLeave({
        teacher: "Ece Demo",
        start: "2026-09-14T13:00",
        end: "2026-09-14T14:00",
        reason: "Demo",
      }),
    /zaten bir izin/,
  );
  assert.throws(() => s.decideLeave("lv2", true), /daha önce/);
});
test("consent and contact failures block queue approval", () => {
  const s = createDemoStore();
  assert.throws(() => s.approveNotification("n2"), /izni/);
  assert.throws(() => s.approveNotification("n3"), /iletişim/);
});
test("manual timetable validates overlapping intervals, branch and leave before adding", () => {
  const s = createDemoStore();
  const input = {
    teacher: "Bora Demo",
    group: "12 SAY 1",
    room: "Derslik 1",
    course: "Matematik",
    slot: "10:00–10:40",
    day: "0",
  };
  assert.throws(() => s.addLesson(input), /çakışması/);
  assert.throws(
    () =>
      s.addLesson({
        ...input,
        teacher: "Ada Demo",
        day: "0",
        room: "Derslik 2",
        group: "12 EA 1",
      }),
    /izinli/,
  );
  assert.throws(
    () => s.addLesson({ ...input, teacher: "Deniz Demo", day: "1" }),
    /branşı/,
  );
  s.addLesson({ ...input, day: "1" });
  assert.equal(s.lessons.at(-1).day, "2026-09-15");
});
test("production entry has no synthetic adapter or persistent browser token storage", () => {
  const start = readFileSync(
    new URL("../../frontend/app/start.js", import.meta.url),
    "utf8",
  );
  const ui = readFileSync(
    new URL("../../frontend/app/ui.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(start, /store\.js|createDemoStore/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|atob\(/);
  const config = JSON.parse(
    readFileSync(new URL("../../vercel.json", import.meta.url)),
  );
  assert.ok(
    config.headers
      .find((x) => x.source === "/ux/(.*)")
      .headers.find((x) => x.key === "Content-Security-Policy")
      .value.includes("connect-src 'none'"),
  );
  assert.ok(config.rewrites.some((x) => x.source === "/api/v1/:path*"));
});
