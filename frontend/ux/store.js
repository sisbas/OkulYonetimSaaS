// A deliberately isolated, synthetic workspace. Nothing here reads or writes a backend.
export function createDemoStore() {
  const day = "2026-09-14";
  let sequence = 100;
  const roles = {
    TENANT_ADMIN: "Kurum Yöneticisi",
    OPS_STAFF: "Operasyon Yetkilisi",
    TEACHER: "Öğretmen",
    ACADEMIC_STAFF: "Akademik Personel",
    VIEWER: "Salt Okuyucu",
  };
  const store = { role: "TENANT_ADMIN", roles, demoTeacher: "Deniz Demo" };
  const fail = (message) => {
    throw new Error(message);
  };
  const find = (items, id, label) =>
    items.find((item) => item.id === id) || fail(`${label} bulunamadı.`);
  const manager = () =>
    ["TENANT_ADMIN", "OPS_STAFF"].includes(store.role) ||
    fail("Bu işlem için yönetici veya operasyon yetkisi gerekir.");
  const admin = () =>
    store.role === "TENANT_ADMIN" ||
    fail("İzin kararını yalnız kurum yöneticisi verebilir.");
  const lesson = (id) => find(store.lessons, id, "Ders");
  const roster = (item) =>
    store.students.filter((student) => student.group === item.group);
  const editable = (item) =>
    item.status !== "completed" ||
    fail("Yoklaması tamamlanan ders değiştirilemez.");
  const minutes = (value) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const span = (item) => {
    const [start, end] = item.time.split(/[–—-]/).map((value) => value.trim());
    return [minutes(start), end ? minutes(end) : minutes(start) + 40];
  };
  const overlaps = (first, second) => {
    if (first.day !== second.day) return false;
    const [a, b] = span(first);
    const [c, d] = span(second);
    return a < d && c < b;
  };
  const leaveOverlaps = (leave, item) => {
    const [start, end] = span(item);
    const from = `${item.day}T${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const to = `${item.day}T${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    return leave.start < to && from < leave.end;
  };
  const canMark = (item) => {
    if (!["TENANT_ADMIN", "OPS_STAFF", "TEACHER"].includes(store.role))
      fail("Bu rol yoklama düzenleyemez.");
    if (store.role === "TEACHER" && item.activeTeacher !== store.demoTeacher)
      fail("Yalnız kendi dersinizin yoklamasını düzenleyebilirsiniz.");
    if (!["assigned", "attendance_pending", "completed"].includes(item.status))
      fail(
        "Yoklama için önce dersin öğretmen ve çakışma sorunları çözülmelidir.",
      );
  };

  function reset() {
    sequence = 100;
    store.demoTeacher = "Deniz Demo";
    store.role = "TENANT_ADMIN";
    store.teachers = [
      { id: "t1", name: "Ada Demo", course: "Matematik", load: 18 },
      { id: "t2", name: "Bora Demo", course: "Matematik", load: 14 },
      { id: "t3", name: "Deniz Demo", course: "Türkçe", load: 16 },
      { id: "t4", name: "Ece Demo", course: "Fizik", load: 12 },
      { id: "t5", name: "Fırat Demo", course: "Türkçe", load: 10 },
      { id: "t6", name: "Güneş Demo", course: "Matematik", load: 24 },
    ];
    store.groups = [
      { id: "g1", name: "12 SAY 1", level: "12. sınıf" },
      { id: "g2", name: "12 EA 1", level: "12. sınıf" },
      { id: "g3", name: "Mezun SAY", level: "Mezun" },
    ];
    store.courses = ["Matematik", "Türkçe", "Fizik"].map((name, index) => ({
      id: `c${index + 1}`,
      name,
    }));
    store.rooms = [1, 2, 3].map((index) => ({
      id: `r${index}`,
      name: `Derslik ${index}`,
      capacity: 24,
    }));
    store.slots = ["10:00", "10:50", "11:40", "13:00", "13:50"].map(
      (start, index) => {
        const endMinutes = minutes(start) + 40;
        const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
        return { id: `slot${index + 1}`, name: `${start}–${end}`, start, end };
      },
    );
    store.lessons = [
      {
        id: "l1",
        time: "10:00–10:40",
        group: "12 SAY 1",
        course: "Matematik",
        plannedTeacher: "Ada Demo",
        activeTeacher: "",
        room: "Derslik 1",
        status: "needs_teacher",
        leaveId: "lv1",
        day,
      },
      {
        id: "l2",
        time: "10:50–11:30",
        group: "12 EA 1",
        course: "Matematik",
        plannedTeacher: "Ada Demo",
        activeTeacher: "Bora Demo",
        room: "Derslik 2",
        status: "assigned",
        leaveId: "lv1",
        day,
      },
      {
        id: "l3",
        time: "11:40–12:20",
        group: "12 SAY 1",
        course: "Türkçe",
        plannedTeacher: "Deniz Demo",
        activeTeacher: "Deniz Demo",
        room: "Derslik 1",
        status: "attendance_pending",
        leaveId: null,
        day,
      },
      {
        id: "l4",
        time: "10:00–10:40",
        group: "Mezun SAY",
        course: "Fizik",
        plannedTeacher: "Ece Demo",
        activeTeacher: "Ece Demo",
        room: "Derslik 3",
        status: "completed",
        leaveId: null,
        day,
      },
      {
        id: "l5",
        time: "11:40–12:20",
        group: "12 EA 1",
        course: "Türkçe",
        plannedTeacher: "Deniz Demo",
        activeTeacher: "Deniz Demo",
        room: "Derslik 2",
        status: "conflict",
        leaveId: null,
        day,
      },
      {
        id: "l6",
        time: "13:00–13:40",
        group: "Mezun SAY",
        course: "Fizik",
        plannedTeacher: "Ece Demo",
        activeTeacher: "Ece Demo",
        room: "Derslik 3",
        status: "attendance_pending",
        leaveId: null,
        day,
      },
    ];
    store.leaves = [
      {
        id: "lv1",
        teacher: "Ada Demo",
        start: `${day}T09:00`,
        end: `${day}T12:00`,
        type: "Saatlik izin",
        status: "approved",
        reason: "Sentetik izin senaryosu",
        lessonIds: ["l1", "l2"],
      },
      {
        id: "lv2",
        teacher: "Ece Demo",
        start: `${day}T12:30`,
        end: `${day}T14:00`,
        type: "Saatlik izin",
        status: "pending",
        reason: "Demo kişisel izin talebi",
        lessonIds: ["l6"],
      },
    ];
    store.students = store.groups.flatMap((group, groupIndex) =>
      Array.from({ length: 6 }, (_, index) => {
        const number = groupIndex * 6 + index + 1;
        return {
          id: `s${number}`,
          name: `Demo Öğrenci ${String(number).padStart(2, "0")}`,
          group: group.name,
          number: String(1000 + number),
          contact: index === 2 ? "" : `veli${number}@example.invalid`,
          consent: index !== 1,
        };
      }),
    );
    store.marks = {
      l4: Object.fromEntries(
        roster(store.lessons[3]).map((student, index) => [
          student.id,
          index < 3 ? "absent" : "present",
        ]),
      ),
    };
    store.notifications = roster(store.lessons[3])
      .slice(0, 3)
      .map((student, index) => ({
        id: `n${index + 1}`,
        studentId: student.id,
        lessonId: "l4",
        status: "pending",
        consent: student.consent,
        contactEligible: Boolean(student.contact),
        message: `${student.name}, 14 Eylül Fizik dersinde yok olarak işaretlendi. Demo bildirim taslağı.`,
      }));
    return store;
  }

  function candidates(lessonId) {
    const item = lesson(lessonId);
    return store.teachers.map((teacher) => {
      const busy = store.lessons.some(
        (other) =>
          other.id !== item.id &&
          other.activeTeacher === teacher.name &&
          overlaps(item, other),
      );
      const onLeave = store.leaves.some(
        (leave) =>
          leave.teacher === teacher.name &&
          leave.status === "approved" &&
          leaveOverlaps(leave, item),
      );
      const extra = store.lessons.filter(
        (other) =>
          other.activeTeacher === teacher.name &&
          other.plannedTeacher !== teacher.name &&
          other.id !== item.id,
      ).length;
      const checks = [
        { label: "Branş uyumu", ok: teacher.course === item.course },
        { label: "Saat uygunluğu", ok: !busy },
        { label: "İzin uygunluğu", ok: !onLeave },
        {
          label: "24 saat yük sınırı",
          ok:
            teacher.load +
              extra +
              (teacher.name !== item.plannedTeacher ? 1 : 0) <=
            24,
        },
        { label: "Demo şube kaydı", ok: true },
      ];
      return {
        id: teacher.id,
        name: teacher.name,
        checks,
        eligible: checks.every((check) => check.ok),
      };
    });
  }

  function assign(lessonId, teacherId) {
    manager();
    const item = lesson(lessonId);
    editable(item);
    if (!["needs_teacher", "conflict"].includes(item.status))
      fail("Önce mevcut görevlendirmeyi kaldırın.");
    const candidate = find(candidates(lessonId), teacherId, "Öğretmen");
    if (!candidate.eligible)
      fail(
        `Atama yapılamadı: ${candidate.checks
          .filter((check) => !check.ok)
          .map((check) => check.label)
          .join(", ")}.`,
      );
    item.activeTeacher = candidate.name;
    item.status = "assigned";
    return item;
  }

  function clear(lessonId) {
    manager();
    const item = lesson(lessonId);
    editable(item);
    if (!item.activeTeacher) fail("Bu derste kaldırılacak görevlendirme yok.");
    item.activeTeacher = "";
    item.status = "needs_teacher";
    delete store.marks[item.id];
    return item;
  }

  function decideLeave(id, approved) {
    admin();
    const leave = find(store.leaves, id, "İzin");
    if (typeof approved !== "boolean") fail("Onay veya ret kararı seçin.");
    if (leave.status !== "pending")
      fail("Bu izin için daha önce karar verilmiş.");
    const affected = store.lessons.filter(
      (item) =>
        (item.plannedTeacher === leave.teacher ||
          item.activeTeacher === leave.teacher) &&
        leaveOverlaps(leave, item),
    );
    if (approved && affected.some((item) => item.status === "completed"))
      fail("Tamamlanan dersleri etkileyen izin onaylanamaz.");
    leave.status = approved ? "approved" : "rejected";
    leave.lessonIds = affected.map((item) => item.id);
    if (approved)
      affected.forEach((item) => {
        item.leaveId = leave.id;
        if (item.activeTeacher === leave.teacher || !item.activeTeacher) {
          item.activeTeacher = "";
          item.status = "needs_teacher";
          delete store.marks[item.id];
        }
      });
    return leave;
  }

  function createLeave(input = {}) {
    if (!["TENANT_ADMIN", "OPS_STAFF", "TEACHER"].includes(store.role))
      fail("Bu rol izin talebi oluşturamaz.");
    const teacher = store.teachers.find(
      (item) => item.id === input.teacher || item.name === input.teacher,
    );
    if (!teacher) fail("Geçerli bir öğretmen seçin.");
    if (store.role === "TEACHER" && teacher.name !== store.demoTeacher)
      fail("Yalnız kendiniz için izin talebi oluşturabilirsiniz.");
    const normalize = (value, end) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value || "")
        ? `${value}T${end ? "23:59" : "00:00"}`
        : value;
    const start = normalize(input.start, false);
    const end = normalize(input.end, true);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start || "") ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end || "") ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      start >= end
    )
      fail("Geçerli bir başlangıç ve daha sonraki bitiş zamanı girin.");
    if (!String(input.reason || "").trim()) fail("İzin gerekçesini girin.");
    if (
      store.leaves.some(
        (item) =>
          item.teacher === teacher.name &&
          ["pending", "approved"].includes(item.status) &&
          start < item.end &&
          item.start < end,
      )
    )
      fail("Bu zaman aralığında zaten bir izin talebi var.");
    const entry = {
      id: `lv${++sequence}`,
      teacher: teacher.name,
      start,
      end,
      type: String(input.type || "Saatlik izin"),
      status: "pending",
      reason: String(input.reason).trim(),
      lessonIds: [],
    };
    entry.lessonIds = store.lessons
      .filter(
        (item) =>
          (item.plannedTeacher === teacher.name ||
            item.activeTeacher === teacher.name) &&
          leaveOverlaps(entry, item),
      )
      .map((item) => item.id);
    store.leaves.push(entry);
    return entry;
  }

  function setMark(lessonId, studentId, value) {
    const item = lesson(lessonId);
    canMark(item);
    editable(item);
    if (!roster(item).some((student) => student.id === studentId))
      fail("Öğrenci bu sınıfta değil.");
    if (value === "") {
      delete (store.marks[item.id] ||= {})[studentId];
      return value;
    }
    if (!["present", "absent", "late", "excused"].includes(value))
      fail("Geçerli bir yoklama durumu seçin.");
    (store.marks[item.id] ||= {})[studentId] = value;
    return value;
  }

  function markAll(lessonId) {
    const item = lesson(lessonId);
    canMark(item);
    editable(item);
    store.marks[item.id] = Object.fromEntries(
      roster(item).map((student) => [student.id, "present"]),
    );
    return store.marks[item.id];
  }

  function submitAttendance(lessonId) {
    const item = lesson(lessonId);
    canMark(item);
    if (item.status === "completed") return item;
    const students = roster(item);
    const marks = store.marks[item.id] || {};
    if (
      !students.length ||
      students.some(
        (student) =>
          !["present", "absent", "late", "excused"].includes(marks[student.id]),
      )
    )
      fail("Yoklamayı tamamlamak için bütün öğrencileri işaretleyin.");
    students
      .filter((student) => marks[student.id] === "absent")
      .forEach((student) => {
        if (
          !store.notifications.some(
            (notification) =>
              notification.lessonId === item.id &&
              notification.studentId === student.id,
          )
        ) {
          store.notifications.push({
            id: `n${++sequence}`,
            studentId: student.id,
            lessonId: item.id,
            status: "pending",
            consent: student.consent,
            contactEligible: Boolean(student.contact),
            message: `${student.name}, ${item.course} dersinde yok olarak işaretlendi. Demo bildirim taslağı.`,
          });
        }
      });
    item.status = "completed";
    return item;
  }

  function approveNotification(id) {
    manager();
    const item = find(store.notifications, id, "Bildirim");
    const student = find(store.students, item.studentId, "Öğrenci");
    if (item.status !== "pending")
      fail("Yalnız bekleyen bildirim onaylanabilir.");
    if (!item.consent || !student.consent)
      fail("Veli iletişim izni yok; bildirim onaylanamaz.");
    if (!item.contactEligible || !student.contact)
      fail("Uygun iletişim kaydı yok; bildirim onaylanamaz.");
    item.status = "queued";
    return item;
  }

  function cancelNotification(id) {
    manager();
    const item = find(store.notifications, id, "Bildirim");
    if (!["pending", "queued"].includes(item.status))
      fail("Bu bildirim zaten iptal edilmiş.");
    item.status = "cancelled";
    return item;
  }

  function addLesson(input) {
    manager();
    const teacher = store.teachers.find(
      (item) => item.name === input.teacher && item.active !== false,
    );
    const group = store.groups.find(
      (item) => item.name === input.group && item.active !== false,
    );
    const room = store.rooms.find(
      (item) => item.name === input.room && item.active !== false,
    );
    const course = store.courses.find(
      (item) => item.name === input.course && item.active !== false,
    );
    const slot = store.slots.find(
      (item) => `${item.start}–${item.end}` === input.slot,
    );
    if (
      !teacher ||
      !group ||
      !room ||
      !course ||
      !slot ||
      !/^[0-4]$/.test(input.day)
    )
      fail("Geçerli ve aktif program kaynakları seçin.");
    if (teacher.course !== course.name)
      fail("Öğretmenin branşı seçilen dersle uyuşmuyor.");
    const item = {
      id: `lesson${++sequence}`,
      time: input.slot,
      day: `2026-09-${14 + Number(input.day)}`,
      course: course.name,
      group: group.name,
      plannedTeacher: teacher.name,
      activeTeacher: teacher.name,
      room: room.name,
      status: "attendance_pending",
      leaveId: null,
    };
    if (
      store.lessons.some(
        (other) =>
          overlaps(item, other) &&
          (other.group === item.group ||
            other.room === item.room ||
            other.activeTeacher === item.activeTeacher),
      )
    )
      fail("Bu aralıkta öğretmen, sınıf veya derslik çakışması var.");
    if (
      store.leaves.some(
        (leave) =>
          leave.teacher === teacher.name &&
          leave.status === "approved" &&
          leaveOverlaps(leave, item),
      )
    )
      fail("Öğretmen bu zaman aralığında izinli.");
    if (teacher.load >= 24) fail("Öğretmenin örnek haftalık yük sınırı dolu.");
    store.lessons.push(item);
    teacher.load += 1;
    return item;
  }

  Object.assign(store, {
    addLesson,
    candidates,
    assign,
    clear,
    decideLeave,
    createLeave,
    setMark,
    markAll,
    submitAttendance,
    approveNotification,
    cancelNotification,
    reset,
  });
  return reset();
}
