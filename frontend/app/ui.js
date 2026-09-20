/* Shared presentation only. Production never imports the synthetic data adapter. */
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  today: "M3 4h18v16H3z M3 9h18 M8 2v4 M16 2v4",
  schedule: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
  leave: "M8 3h12v18H4V7z M8 3v5H4 M8 12h8 M8 16h5",
  attendance: "M8 4h12v17H4V8 M3 4l2 2 4-4 M8 12l2 2 5-5",
  message: "M3 4h18v13H8l-5 4z M7 8h10 M7 12h7",
  definitions: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  reports: "M4 20V9 M10 20V4 M16 20v-8 M22 20H2",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M19 8v6 M16 11h6",
  settings:
    "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[n] || icons.today}"/></svg>`;
const statuses = {
  needs_teacher: ["Öğretmen gerekli", "warning"],
  assigned: ["Görevlendirildi", "info"],
  attendance_pending: ["Yoklama bekliyor", "warning"],
  completed: ["Tamamlandı", "success"],
  conflict: ["Çakışma", "danger"],
  pending: ["Onay bekliyor", "warning"],
  approved: ["Onaylandı", "success"],
  rejected: ["Reddedildi", "danger"],
  draft: ["Taslak", ""],
  queued: ["Onaylandı · gönderim yok", "info"],
  cancelled: ["İptal edildi", ""],
  present: ["Geldi", "success"],
  absent: ["Gelmedi", "danger"],
  late: ["Geç", "warning"],
  excused: ["İzinli", "info"],
};
const badge = (s) =>
  `<span class="badge ${statuses[s]?.[1] || ""}">${esc(statuses[s]?.[0] || s)}</span>`;
const columns = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const button = (label, action, id = "", cls = "") =>
  `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const field = (label, name, type = "text", value = "", extra = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value = "") =>
  `<label class="field">${label}<select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
export function mount({ mode, store = null }) {
  const demo = mode === "prototype",
    base = demo ? "/ux" : "/app";
  let filter = "all",
    activeTab = "Genel",
    notice = "",
    viewState = "normal",
    drawerReturn = null,
    token = "",
    loginBusy = false,
    scheduleView = "group",
    scheduleScope = "all";
  const $ = (s) => document.querySelector(s),
    link = (path, label, cls = "") =>
      `<a class="${cls}" href="${base}/${path}" data-route>${label}</a>`;
  const heading = (title, desc, actions = "") =>
    `<header class="page-head"><div><div class="eyebrow">Günlük eğitim operasyonu</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${actions}</div></header>`;
  const empty = (title, desc, actions = "") =>
    `<div class="empty"><div class="symbol">${icon("today")}</div><h2>${title}</h2><p>${desc}</p><div class="actions">${actions}</div></div>`;
  const panel = (title, body, action = "") =>
    `<section class="panel"><div class="panel-head"><h2>${title}</h2>${action}</div>${body}</section>`;
  const teacher = () => demo && store.role === "TEACHER";
  const canManage = () =>
    demo && ["TENANT_ADMIN", "OPS_STAFF"].includes(store.role);
  const teacherName = () => store?.demoTeacher;
  const visibleLessons = () =>
    teacher()
      ? store.lessons.filter((x) => x.activeTeacher === teacherName())
      : store.lessons;
  function path() {
    const p = location.pathname;
    if (p === "/login") return "login";
    if (p === "/403") return "403";
    return p.replace(new RegExp(`^${base}/?`), "") || "today";
  }
  function navigate(p) {
    history.pushState({}, "", p);
    filter = "all";
    activeTab = "Genel";
    notice = "";
    render();
    $("#main").focus();
  }
  function nav() {
    const items = [
      ["today", "Bugün", "today"],
      ["schedule", "Program", "schedule"],
      [
        teacher() ? "my-leaves" : "leave",
        teacher() ? "İzinlerim" : "İzinler",
        "leave",
      ],
      ["attendance", "Yoklama", "attendance"],
      ["parent-notifications", "Veli Bilgilendirme", "message"],
      ["definitions/teachers", "Tanımlar", "definitions"],
      ["reports", "Raporlar", "reports"],
      ["users", "Yönetim", "users"],
    ];
    const allowed = !demo
      ? ["today"]
      : teacher()
        ? ["today", "schedule", "my-leaves", "attendance"]
        : store.role === "VIEWER"
          ? ["schedule", "reports"]
          : store.role === "ACADEMIC_STAFF"
            ? ["today", "attendance", "definitions/teachers", "reports"]
            : items.map((x) => x[0]);
    return items
      .filter(([r]) => allowed.includes(r))
      .map(
        ([r, l, i]) =>
          `<a href="${base}/${r}" data-route ${path() === r || path().startsWith(r + "/") ? 'aria-current="page"' : ""}>${icon(i)}<span class="nav-text">${l}</span></a>`,
      )
      .join("");
  }
  function shell(body) {
    const identity = demo
      ? store.roles[store.role]
      : token
        ? "Oturum açık"
        : "Oturum açılmadı";
    return `<div class="layout"><aside class="sidebar" id="sidebar" aria-label="Ana menü"><a class="brand" href="${base}/today" data-route><img src="/app/mark.svg" alt=""><span class="brand-text">Okul Yönetim<small>Akış görünür, karar net.</small></span></a><nav class="nav" aria-label="Ana gezinme">${nav()}<p class="nav-label">${demo ? "İnceleme" : "Yardım"}</p>${link("review", icon("settings") + '<span class="nav-text">' + (demo ? "İnceleme araçları" : "Bağlantı durumu") + "</span>")}</nav><div class="sidebar-foot"><p>Bir sonraki adım, tek bakışta.</p>${button("Menüyü daralt", "collapse")}</div></aside><div class="shell"><header class="context"><div class="actions">${button("☰", "menu", "", "mobile-menu")}<div><div class="small">${demo ? "ÖRNEK EĞİTİM KURUMU · SENTETİK" : "OKUL YÖNETİM"}</div><strong>${demo ? "Merkez Şube" : "Kurum bağlantısı bekleniyor"}</strong></div></div><div class="context-right"><div class="identity"><strong>${esc(identity)}</strong><div class="small">${demo ? "14 Eylül 2026, Pazartesi" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date())}</div></div><div class="avatar" aria-hidden="true">${demo ? "ÖK" : "OY"}</div>${!demo ? (token ? button("Çıkış", "logout") : link("login", "Oturum aç", "btn")) : ""}</div></header>${demo ? `<div class="banner"><span><strong>UX PROTOTİPİ · SENTETİK VERİ</strong> — İşlemler yalnız bu oturumda denenir. Gerçek kayıt veya gönderim yapılmaz.</span><a href="/app/today">Üretim arayüzü</a></div>` : ""}<main class="main" id="main" tabindex="-1">${notice ? `<div class="notice" role="status">${esc(notice)}</div>` : ""}${body}</main></div></div><dialog class="drawer" id="drawer" aria-labelledby="drawer-title"></dialog><dialog class="confirm" id="confirm" aria-labelledby="confirm-title"></dialog>`;
  }
  function production() {
    if (path() === "login") return loginView();
    const label =
      {
        today: "Bugün",
        schedule: "Ders programı",
        leave: "İzin talepleri",
        attendance: "Yoklama",
        "parent-notifications": "Veli bilgilendirme",
        reports: "Raporlar",
        users: "Kullanıcılar",
        roles: "Roller ve yetkiler",
        review: "Bağlantı durumu",
      }[path().split("/")[0]] || "Kurum operasyonu";
    return (
      heading(
        label,
        "Dersleri, bekleyen kararları ve günün operasyonunu tek yerden takip edin.",
        `<a class="btn" href="/runtime">Mevcut operasyon ekranı</a>`,
      ) +
      `<div class="connection">${panel(token ? "Oturum doğrulandı · kurum bağlamı bekleniyor" : "Gününüze buradan başlayın", empty(token ? "Kurum bağlantısı tamamlanmalı" : "Kurumunuzla güvenle çalışın", token ? "Hesap doğrulandı. Yetkili şube ve ekran bilgileri henüz bu arayüze aktarılmıyor. Bu bilgiler gelmeden kurum verileri gösterilemez." : "Kurum kayıtlarını görüntülemek için oturum açın. Yeni arayüzü örnek kayıtlarla incelemek için tasarım alanını kullanabilirsiniz.", `${token ? "" : link("login", "Oturum aç", "btn primary")}<a class="btn ${token ? "primary" : ""}" href="/ux/today">Arayüzü incele</a>`))}<div class="panel panel-pad"><h2>Bağlantı durumu</h2><div class="step"><b>01</b><div><strong>Kimlik doğrulama</strong><p>Mevcut güvenli oturum servisi kullanılır.</p></div></div><div class="step"><b>02</b><div><strong>Kurum, şube ve yetkili ekranlar</strong><p>Bağlantı geliştirmesi bekleniyor. Kullanıcıdan teknik kimlik istenmez.</p></div></div><div class="step"><b>03</b><div><strong>Yoklama ve veli bilgilendirme</strong><p>Üretim bağlantısı hazır değil. Tasarım alanındaki kayıtlar örnektir.</p></div></div></div></div>`
    );
  }
  function loginView() {
    return (
      heading(
        "Oturum aç",
        "Kurumunuzun verdiği hesap bilgileriyle devam edin.",
      ) +
      `<section class="panel panel-pad login-card"><div class="eyebrow">Güvenli kurum erişimi</div><h2>Tekrar hoş geldiniz</h2><form id="login-form">${field("E-posta", "email", "email", "", 'required autocomplete="username"')}${field("Şifre", "password", "password", "", 'required autocomplete="current-password"')}<button class="primary" type="submit" ${loginBusy ? "disabled" : ""}>${loginBusy ? "Doğrulanıyor…" : "Oturum aç"}</button></form><p class="meta">Hesap veya kurum erişimi sorunu için kurum yöneticinize başvurun.</p><a href="/ux/today">Örnek verilerle arayüzü incele →</a></section>`
    );
  }
  function metrics() {
    const list = visibleLessons().filter((l) => l.day === "2026-09-14");
    const values = [
      list.length,
      list.filter((l) => l.status !== "completed").length,
      new Set(list.filter((l) => l.leaveId).map((l) => l.plannedTeacher)).size,
      list.filter((l) => l.status === "needs_teacher").length,
      list.filter((l) => l.status !== "completed").length,
      store.notifications.filter((n) => ["draft", "pending"].includes(n.status))
        .length,
    ];
    return `<div class="metrics">${["Bugünkü ders", "Açık operasyon", "İzinli öğretmen", "Görevlendirme bekleyen", "Eksik yoklama", "Bildirim bekleyen"].map((t, i) => (!canManage() && [2, 3, 5].includes(i) ? "" : `<div class="metric ${i === 3 ? "attention" : ""}"><span>${t}</span><strong>${values[i]}</strong></div>`)).join("")}</div>`;
  }
  function today() {
    const lessons = visibleLessons()
      .filter((l) => l.day === "2026-09-14")
      .filter(
        (l) =>
          filter === "all" ||
          (filter === "action" && l.status !== "completed") ||
          filter === l.status,
      );
    const row = (l) => [
      `${esc(l.time)}<small>40 dakika</small>`,
      `<strong>${esc(l.group)}</strong>`,
      esc(l.course),
      esc(l.plannedTeacher),
      esc(l.activeTeacher || "Görevlendirme bekliyor"),
      esc(l.room),
      badge(l.status),
      button("Dersi aç", "lesson", l.id),
    ];
    return (
      heading(
        teacher() ? "Bugünkü derslerim" : "Bugün",
        "Öncelikleri görün, bekleyen işleri tamamlayın.",
        `${link("schedule", "Haftalık program", "btn")}${teacher() ? "" : link("reports", "Gün sonu", "btn primary")}`,
      ) +
      metrics() +
      `<div class="split">${panel(
        "Ders akışı",
        `<div class="filters" aria-label="Ders durumuna göre filtrele">${[
          ["all", "Tümü"],
          ["action", "Aksiyon gereken"],
          ["needs_teacher", "Öğretmen gerekli"],
          ["attendance_pending", "Yoklama eksik"],
          ["completed", "Tamamlanan"],
        ]
          .map(
            ([v, l]) =>
              `<button data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`,
          )
          .join(
            "",
          )}</div><div class="desktop-table">${lessons.length ? columns(["Saat", "Sınıf", "Ders", "Planlanan", "Aktif öğretmen", "Derslik", "Durum", "Aksiyon"], lessons.map(row)) : empty("Bu filtrede ders yok", "Farklı bir durum seçerek devam edebilirsiniz.")}</div><div class="mobile-cards">${lessons.map((l) => `<div class="queue-card"><div class="actions">${badge(l.status)}<span class="meta">${esc(l.time)}</span></div><h3>${esc(l.course)} · ${esc(l.group)}</h3><p>${esc(l.activeTeacher || "Öğretmen bekleniyor")} · ${esc(l.room)}</p>${button("Dersi aç", "lesson", l.id)}</div>`).join("")}</div><div class="footnote">Görevlendirme ve yoklama değişiklikleri bu listede birlikte izlenir.</div>`,
        `<span class="meta">14 Eylül · Pazartesi</span>`,
      )}<aside>${panel(
        "Öncelik sırası",
        visibleLessons()
          .filter((l) => l.status === "needs_teacher")
          .map(
            (l) =>
              `<div class="queue-card">${badge("needs_teacher")}<h3>${esc(l.course)} · ${esc(l.group)}</h3><p>${esc(l.time)} · ${esc(l.plannedTeacher)} izinli</p>${link("leave/" + l.leaveId, "Etkiyi incele →")}</div>`,
          )
          .join("") ||
          empty(
            "Görevlendirmeler tamam",
            "Yoklama ve bildirim durumlarını takip edebilirsiniz.",
          ),
      )}${panel("Günün kontrol listesi", `<div class="queue-card"><p>Öğretmen görevlendirmeleri</p>${link(teacher() ? "my-leaves" : "leave", teacher() ? "İzinlerim →" : "İzinleri incele →")}</div><div class="queue-card"><p>Eksik yoklamalar</p>${link("attendance", "Yoklamalara git →")}</div>${canManage() ? `<div class="queue-card"><p>Veli bildirim taslakları</p>${link("parent-notifications", "Bildirimleri incele →")}</div>` : ""}`)}</aside></div>`
    );
  }
  function leaveList() {
    const own = teacher() || path() === "my-leaves";
    const rows = store.leaves
      .filter((l) => !own || l.teacher === teacherName())
      .filter((l) => filter === "all" || l.status === filter);
    return (
      heading(
        own ? "İzinlerim" : "İzin talepleri",
        "Taleplerin derslere etkisini ve karşılanmayı bekleyen görevleri inceleyin.",
        link("leave/new", "+ Yeni izin talebi", "btn primary"),
      ) +
      panel(
        "Talepler",
        `<div class="filters">${[
          ["all", "Tümü"],
          ["pending", "Onay bekleyen"],
          ["approved", "Onaylanan"],
          ["rejected", "Reddedilen"],
        ]
          .map(
            ([v, l]) =>
              `<button data-filter="${v}" aria-pressed="${filter === v}">${l}</button>`,
          )
          .join("")}</div>${
          rows.length
            ? columns(
                ["Öğretmen", "Tarih", "Süre", "Etkilenen ders", "Durum", ""],
                rows.map((l) => [
                  esc(l.teacher),
                  esc(l.start),
                  esc(l.type),
                  String(l.lessonIds.length),
                  badge(l.status),
                  link("leave/" + l.id, "İncele", "btn"),
                ]),
              )
            : empty(
                "Talep bulunmuyor",
                "Yeni bir izin talebi oluşturabilirsiniz.",
              )
        }`,
      )
    );
  }
  function leaveForm() {
    return (
      heading(
        "Yeni izin talebi",
        "İzin süresini belirtin; etkilenen dersler talep incelemesinde görünür.",
        link("my-leaves", "İzinlerime dön", "btn"),
      ) +
      `<section class="panel panel-pad"><form id="leave-form"><div class="form-grid">${select(
        "İzin türü",
        "type",
        [
          ["hourly", "Saatlik"],
          ["full_day", "Tam gün"],
          ["multi_day", "Çok gün"],
        ],
      )}${select("Gerekçe kategorisi", "reason", [
        ["İdari görev", "İdari görev"],
        ["Sağlık", "Sağlık"],
        ["Yıllık izin", "Yıllık izin"],
        ["Diğer", "Diğer"],
      ])}${field("Başlangıç", "start", "datetime-local", "2026-09-14T09:00", "required")}${field("Bitiş", "end", "datetime-local", "2026-09-14T10:00", "required")}<p class="meta wide">Özel sağlık bilgisi veya belge eklemeyin. Talep, inceleme alanında sentetik kayıt olarak oluşturulur.</p></div><div id="form-error" role="alert"></div><div class="form-foot">${link("my-leaves", "Vazgeç", "btn")}<button type="submit" class="primary">Talebi oluştur</button></div></form></section>`
    );
  }
  function leaveDetail(id) {
    const l = store.leaves.find((l) => l.id === id);
    if (!l) return notFound();
    if (teacher() && l.teacher !== teacherName()) return forbidden();
    const lessons = store.lessons.filter((x) => l.lessonIds.includes(x.id));
    return (
      heading(
        "İzin etki analizi",
        `${esc(l.teacher)} · ${esc(l.start)} — ${esc(l.end)}`,
        link("leave", "Taleplere dön", "btn"),
      ) +
      `<div class="split"><div>${panel(
        "Etkilenen dersler",
        `<div class="panel-pad"><div class="actions">${badge(l.status)}<span>${lessons.length} ders etkileniyor</span></div></div>${columns(
          ["Saat", "Sınıf / Ders", "Planlanan", "Aktif", "Durum", ""],
          lessons.map((x) => [
            esc(x.time),
            `${esc(x.group)}<small>${esc(x.course)}</small>`,
            esc(x.plannedTeacher),
            esc(x.activeTeacher || "Bekleniyor"),
            badge(x.status),
            button("İncele", "lesson", x.id),
          ]),
        )}${!lessons.length ? empty("Etkilenen ders yok", "Bu örnek talep için ders etkisi kaydı bulunmuyor.") : ""}`,
      )}</div><aside>${panel("Yönetici kararı", `<div class="panel-pad"><p class="muted">Önce etkilenen derslerin görevlendirmelerini inceleyin.</p><div class="actions">${store.role === "TENANT_ADMIN" && l.status === "pending" ? button("Onayla", "approve-leave", id, "primary") + button("Reddet", "reject-leave", id, "danger") : '<p class="meta">Bu görünümde karar işlemi yok.</p>'}</div><p class="meta">Bu alan yalnız karar deneyimini gösterir. Gerçek izin onayı backend geliştirmesi bekliyor.</p></div>`)}</aside></div>`
    );
  }
  function lessonDrawer(id) {
    const l = store.lessons.find((l) => l.id === id);
    if (!l) return;
    if (teacher() && l.activeTeacher !== teacherName()) {
      notice = "Bu dersi görüntüleme yetkiniz bulunmuyor.";
      render();
      return;
    }
    const candidates = store.candidates(id).filter((c) => c.eligible);
    openDrawer(
      "Ders detayı",
      `<div class="actions">${badge(l.status)}<span class="meta">${esc(l.time)}</span></div><h2>${esc(l.course)} · ${esc(l.group)}</h2><dl>${[
        ["Planlanan öğretmen", l.plannedTeacher],
        ["Aktif öğretmen", l.activeTeacher || "Görevlendirme bekleniyor"],
        ["Derslik", l.room],
        ["Süre", "40 dakika"],
      ]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
        .join(
          "",
        )}</dl>${canManage() && (l.leaveId || l.status === "conflict") ? `<hr><h3>Yerine görevlendirme</h3><p class="meta">Aşağıdaki uygunluklar yalnız sentetik senaryonun sonuçlarıdır.</p>${candidates.map((c) => `<div class="panel panel-pad"><h3>${esc(c.name)}</h3><p class="meta">${c.checks.map((c) => esc(c.label)).join(" · ")}</p>${button("Görevlendir", "assign", id + "|" + c.id, "primary")}</div>`).join("")}${l.status === "assigned" ? button("Görevlendirmeyi kaldır", "clear", id, "danger") : ""}` : ""}<hr><div class="actions">${["assigned", "attendance_pending", "completed"].includes(l.status) ? link("attendance/session/" + id, l.status === "completed" ? "Yoklamayı görüntüle" : "Yoklama al", "btn primary") : ""}${l.leaveId ? link("leave/" + l.leaveId, "İzin etkisini aç", "btn") : ""}</div>`,
    );
  }
  function attendance() {
    return (
      heading(
        teacher() ? "Ders yoklamalarım" : "Yoklama takibi",
        "İşaretlenmeyen öğrenci devamsız sayılmaz.",
        link("attendance/absences", "Devamsızlıkları incele", "btn"),
      ) +
      panel(
        "Ders oturumları",
        columns(
          ["Ders", "Sınıf", "Öğretmen", "Saat", "Durum", ""],
          visibleLessons().map((l) => [
            esc(l.course),
            esc(l.group),
            esc(l.activeTeacher || "Görevlendirme bekleniyor"),
            esc(l.time),
            badge(
              l.status === "completed" ? "completed" : "attendance_pending",
            ),
            l.activeTeacher
              ? link(
                  "attendance/session/" + l.id,
                  l.status === "completed" ? "Görüntüle" : "Yoklama al",
                  "btn",
                )
              : badge("needs_teacher"),
          ]),
        ),
      )
    );
  }
  function attendanceSession(id) {
    const l = store.lessons.find((x) => x.id === id);
    if (!l) return notFound();
    if (teacher() && l.activeTeacher !== teacherName()) return forbidden();
    const students = store.students.filter((s) => s.group === l.group),
      marks = store.marks[id] || {},
      locked =
        l.status === "completed" ||
        !["assigned", "attendance_pending"].includes(l.status);
    return (
      heading(
        "Ders yoklaması",
        `${esc(l.course)} · ${esc(l.group)} · ${esc(l.time)}`,
        link("attendance", "Yoklamalara dön", "btn"),
      ) +
      `<section class="panel"><div class="panel-head"><div><h2>${esc(l.activeTeacher || "Öğretmen atanmadı")}</h2><span class="meta">${students.length} öğrenci · ${esc(l.room)}</span></div>${locked ? badge(l.status) : button("Tümünü geldi işaretle", "mark-all", id)}</div><form id="attendance-form" data-id="${esc(id)}">${students
        .map(
          (s) =>
            `<div class="list-row"><div><strong>${esc(s.name)}</strong><p class="meta">${esc(s.number)} · ${esc(s.group)}</p></div><label class="field"><span class="sr-only">${esc(s.name)} devam durumu</span><select data-student="${s.id}" data-lesson="${id}" ${locked ? "disabled" : ""}><option value="">İşaretlenmedi</option>${[
              ["present", "Geldi"],
              ["absent", "Gelmedi"],
              ["late", "Geç"],
              ["excused", "İzinli"],
            ]
              .map(
                ([v, t]) =>
                  `<option value="${v}" ${marks[s.id] === v ? "selected" : ""}>${t}</option>`,
              )
              .join("")}</select></label></div>`,
        )
        .join(
          "",
        )}<div class="panel-pad"><p id="attendance-summary">${attendanceSummary(id, students)}</p>${locked ? "" : `<button type="submit" class="primary" ${l.activeTeacher ? "" : "disabled"}>Yoklamayı tamamla</button>`}<p class="meta">Kayıt yalnız inceleme oturumunda tutulur; gerçek devamsızlık veya bildirim gönderimi oluşmaz.</p></div></form></section>`
    );
  }
  function attendanceSummary(id, students) {
    const m = store.marks[id] || {};
    return [
      ["present", "geldi"],
      ["absent", "gelmedi"],
      ["late", "geç"],
      ["excused", "izinli"],
      ["", "işaretlenmedi"],
    ]
      .map(
        ([v, t]) =>
          `${students.filter((s) => (m[s.id] || "") === v).length} ${t}`,
      )
      .join(" · ");
  }
  function absences() {
    const rows = [];
    for (const l of visibleLessons().filter((l) => l.status === "completed"))
      for (const s of store.students.filter((s) => s.group === l.group)) {
        const mark = store.marks[l.id]?.[s.id];
        if (["absent", "late"].includes(mark))
          rows.push([
            esc(s.name),
            esc(l.group),
            esc(l.course),
            esc(l.time),
            badge(mark),
            link("parent-notifications", "Bildirimleri aç", "btn"),
          ]);
      }
    return (
      heading(
        "Devamsızlıklar",
        "Yalnız tamamlanan yoklamaların sonuçları gösterilir.",
      ) +
      panel(
        "Devam kayıtları",
        rows.length
          ? columns(["Öğrenci", "Sınıf", "Ders", "Saat", "Durum", ""], rows)
          : empty(
              "Devamsızlık kaydı yok",
              "Tamamlanan yoklamada gelmedi veya geç işaretlenen öğrenciler burada görünür.",
            ),
      )
    );
  }
  function notifications() {
    if (teacher()) return forbidden();
    return (
      heading(
        "Veli bilgilendirme",
        "Devamsızlık bildirimlerini inceleyin; iletişim uygunluğunu kontrol edin.",
      ) +
      `<div class="notice">İnceleme alanında gerçek SMS, e-posta veya WhatsApp gönderimi yapılmaz.</div>` +
      panel(
        "Bildirim kuyruğu",
        store.notifications.length
          ? columns(
              ["Öğrenci", "Ders", "Uygunluk", "Durum", ""],
              store.notifications.map((n) => [
                esc(store.students.find((s) => s.id === n.studentId)?.name),
                esc(store.lessons.find((l) => l.id === n.lessonId)?.course),
                n.consent && n.contactEligible
                  ? badge("Uygun")
                  : badge("Kontrol gerekiyor"),
                badge(n.status),
                link("parent-notifications/" + n.id, "İncele", "btn"),
              ]),
            )
          : empty(
              "Bildirim taslağı yok",
              "Yoklama tamamlandığında uygun devamsızlık kayıtları burada görünür.",
            ),
      )
    );
  }
  function notificationDetail(id) {
    if (!canManage()) return forbidden();
    const n = store.notifications.find((n) => n.id === id);
    if (!n) return notFound();
    const s = store.students.find((s) => s.id === n.studentId),
      l = store.lessons.find((l) => l.id === n.lessonId);
    return (
      heading(
        "Bildirim incelemesi",
        `${esc(s?.name)} · ${esc(l?.course)}`,
        link("parent-notifications", "Kuyruğa dön", "btn"),
      ) +
      `<div class="split">${panel("Mesaj önizlemesi", `<div class="panel-pad"><p>${esc(n.message)}</p><p class="meta">Kaynak: tamamlanan ders yoklaması</p>${badge(n.status)}</div>`)}${panel("İletişim kontrolü", `<div class="panel-pad"><p>İletişim: ${s?.contact ? "v••••@example.invalid" : "Kayıt eksik"}</p><p>İzin durumu: ${n.consent ? "Uygun" : "Doğrulama gerekiyor"}</p><p>İletişim kaydı: ${n.contactEligible ? "Uygun" : "Eksik"}</p><div class="actions">${["draft", "pending"].includes(n.status) ? `<button data-action="approve-notification" data-id="${esc(n.id)}" class="primary" ${n.consent && n.contactEligible ? "" : "disabled"}>Taslağı onayla</button>${button("İptal et", "cancel-notification", n.id)}` : ""}</div><p class="meta">Onay, sentetik kuyruğa taşır. Gönderim yapılmaz.</p></div>`)}</div>`
    );
  }
  function schedule() {
    const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
    const key =
      scheduleView === "teacher"
        ? "activeTeacher"
        : scheduleView === "room"
          ? "room"
          : "group";
    const all = visibleLessons();
    const data = all.filter(
      (l) => scheduleScope === "all" || l[key] === scheduleScope,
    );
    return (
      heading(
        "Ders programı",
        "14–18 Eylül 2026 · Haftalık ders dağılımı",
        canManage()
          ? link("schedule/builder", "Program düzenleyici", "btn primary")
          : "",
      ) +
      panel(
        "Haftalık görünüm",
        `<div class="panel-pad">${select(
          "Görünüm",
          "schedule-view",
          [
            ["group", "Sınıfa göre"],
            ["teacher", "Öğretmene göre"],
            ["room", "Dersliğe göre"],
          ],
          scheduleView,
        )}${select("Kapsam", "schedule-scope", [["all", "Tümü"], ...Array.from(new Set(all.map((l) => l[key]).filter(Boolean))).map((v) => [v, v])], scheduleScope)}</div><div class="table-wrap"><div class="calendar"><div class="cal-head">Saat</div>${days.map((d) => `<div class="cal-head">${d}</div>`).join("")}${data.map((l, i) => `<div class="cal-time">${esc(l.time.split("–")[0])}</div>${days.map((_, day) => `<div class="cal-cell">${day === new Date(l.day + "T12:00").getDay() - 1 ? `<button class="cal-event ${i % 2 ? "teal" : ""}" data-action="lesson" data-id="${l.id}"><strong>${esc(l.course)}</strong><span>${esc(l.group)}</span><span>${esc(l.activeTeacher || l.plannedTeacher)}</span><span>${esc(l.room)}</span></button>` : ""}</div>`).join("")}`).join("")}</div></div><div class="footnote">Örnek dersler pazartesi gününe aittir. Diğer günler için kayıt eklenmemiştir.</div>`,
      )
    );
  }
  function builder() {
    return (
      heading(
        "Program düzenleyici",
        "Kaynakları inceleyin; manuel ders atamasını deneyin.",
        link("schedule", "Programa dön", "btn"),
      ) +
      `<div class="builder"><aside class="panel panel-pad"><h2>Kaynaklar</h2><p class="meta">Dersler</p>${store.courses.map((c) => `<div class="list-row">${esc(c.name)}</div>`).join("")}</aside><div>${panel(
        "Manuel ders atama",
        `<form id="schedule-form" class="panel-pad"><div class="form-grid">${select(
          "Sınıf",
          "group",
          store.groups.map((x) => [x.name, x.name]),
        )}${select(
          "Ders",
          "course",
          store.courses.map((x) => [x.name, x.name]),
        )}${select(
          "Öğretmen",
          "teacher",
          store.teachers.map((x) => [x.name, x.name]),
        )}${select(
          "Derslik",
          "room",
          store.rooms.map((x) => [x.name, x.name]),
        )}${select(
          "Zaman dilimi",
          "slot",
          store.slots.map((x) => [
            x.start + "–" + x.end,
            x.start + "–" + x.end,
          ]),
        )}${select("Gün", "day", [
          ["0", "Pazartesi"],
          ["1", "Salı"],
          ["2", "Çarşamba"],
          ["3", "Perşembe"],
          ["4", "Cuma"],
        ])}</div><div id="schedule-error" role="alert"></div><div class="form-foot"><button type="submit" class="primary">Örnek programa ekle</button></div></form>`,
      )}${panel("Otomatik program", empty("Çözümleyici bağlantısı bekleniyor", "Otomatik program ve yayınlama, onaylı çözümleyici ve sunucu doğrulaması olmadan çalıştırılamaz.", link("schedule/conflicts", "Teşhis ekranı", "btn")))}</div><aside class="panel panel-pad"><h2>Kontroller</h2><p class="muted">Öğretmen, sınıf ve derslik çakışmaları örnek veriler üzerinde denetlenir.</p><p class="meta">Bu kontrol üretim uygunluk değerlendirmesi değildir.</p><button disabled>Programı yayınla</button></aside></div>`
    );
  }
  function conflicts() {
    const found = store.lessons.filter((l) => l.status === "conflict");
    return (
      heading(
        "Program teşhisi",
        "Sorunu, nedenini ve uygulanabilecek adımı birlikte görün.",
        link("schedule/builder", "Düzenleyiciye dön", "btn"),
      ) +
      panel(
        "Kontrol sonuçları",
        found.length
          ? columns(
              ["Sorun", "Neden", "Önerilen aksiyon"],
              found.map((l) => [
                esc(l.course + " · " + l.group),
                "Örnek programda çakışma kaydı",
                button("Dersi incele", "lesson", l.id),
              ]),
            )
          : empty(
              "Örnek kayıtlarda açık çakışma yok",
              "Bu sonuç üretim yayınlama doğrulaması yerine geçmez.",
            ),
      )
    );
  }
  const defLabels = {
    teachers: "Öğretmenler",
    groups: "Sınıflar / Şubeler",
    students: "Öğrenciler",
    courses: "Dersler",
    rooms: "Derslikler",
    slots: "Zaman dilimleri",
  };
  function definitions(kind, id) {
    kind = kind === "time-slots" ? "slots" : kind;
    if (!defLabels[kind]) return notFound();
    if (id) return definitionDetail(kind, id);
    const records = store[kind] || [];
    const filtered = records.filter(
      (x) =>
        filter === "all" ||
        JSON.stringify(x)
          .toLocaleLowerCase("tr")
          .includes(filter.toLocaleLowerCase("tr")),
    );
    return (
      heading(
        defLabels[kind],
        "Kurumun temel kayıtlarını ve operasyon bağlantılarını yönetin.",
        canManage()
          ? button("+ Kayıt ekle", "add-definition", kind, "primary")
          : "",
      ) +
      `<section class="panel"><nav class="filters" aria-label="Tanım türü">${Object.entries(
        defLabels,
      )
        .map(([k, l]) =>
          link("definitions/" + (k === "slots" ? "time-slots" : k), l, "btn"),
        )
        .join(
          "",
        )}</nav><div class="panel-pad"><input class="search" aria-label="Kayıt ara" placeholder="İsim veya sınıf ara…" data-search value="${filter === "all" ? "" : esc(filter)}"></div>${columns(
        ["Kayıt", "Açıklama", "Durum", ""],
        filtered.map((x) => [
          esc(x.name),
          esc(
            x.group ||
              x.course ||
              x.level ||
              (x.capacity
                ? x.capacity + " kişilik"
                : x.start
                  ? x.start + "–" + x.end
                  : "Kurum kaydı"),
          ),
          badge(x.active === false ? "Pasif" : "Aktif"),
          link(
            "definitions/" +
              (kind === "slots" ? "time-slots" : kind) +
              "/" +
              x.id,
            "Detay",
            "btn",
          ),
        ]),
      )}${filtered.length ? "" : empty("Eşleşen kayıt yok", "Arama ifadesini değiştirin.")}</section>`
    );
  }
  function tabs(labels) {
    return `<div class="tabs" role="tablist" aria-label="Detay bölümleri">${labels.map((l, i) => `<button id="tab-${i}" role="tab" data-tab="${esc(l)}" aria-selected="${activeTab === l}" aria-controls="tab-content" tabindex="${activeTab === l ? "0" : "-1"}">${l}</button>`).join("")}</div>`;
  }
  function definitionDetail(kind, id) {
    const x = store[kind]?.find((x) => x.id === id);
    if (!x) return notFound();
    const labels =
      kind === "teachers"
        ? ["Genel", "Müsaitlik", "Program", "İzinler", "Yük"]
        : kind === "students"
          ? ["Genel", "Yoklama", "Veli iletişimi", "İletişim izni"]
          : kind === "groups"
            ? ["Genel", "Öğrenciler", "Program", "Yoklama"]
            : ["Genel"];
    let content = `<h2>${esc(x.name)}</h2><p>${esc(x.group || x.course || x.level || "Kurum kaydı")}</p>${badge(x.active === false ? "Pasif" : "Aktif")}`;
    if (activeTab === "Veli iletişimi")
      content = `<h2>Veli iletişim durumu</h2><p>${x.contact ? "v••••@example.invalid" : "İletişim kaydı yok"}</p>`;
    if (activeTab === "İletişim izni")
      content = `<h2>İletişim izni</h2><p>${x.consent ? "Örnek senaryoda uygun" : "Doğrulama gerekiyor"}</p>`;
    if (activeTab === "Program")
      content = link("schedule", "Haftalık programı görüntüle", "btn");
    if (activeTab === "Yoklama")
      content = link("attendance", "Yoklama kayıtları", "btn");
    if (activeTab === "İzinler")
      content = link("leave", "İzin talepleri", "btn");
    if (activeTab === "Yük")
      content = `<h2>Haftalık ders yükü</h2><p>${esc(x.load || "Henüz hesaplanmadı")}</p>`;
    if (activeTab === "Öğrenciler")
      content = columns(
        ["Öğrenci", "Sınıf"],
        store.students
          .filter((s) => s.group === x.name)
          .map((s) => [esc(s.name), esc(s.group)]),
      );
    if (activeTab === "Müsaitlik")
      content = `<h2>Haftalık müsaitlik</h2><p class="meta">Uygunluk, atama öncesi sunucu tarafından doğrulanmalıdır.</p>${["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"].map((d) => `<details><summary>${d}</summary><p>Bu öğretmen için onaylı müsaitlik kaynağı bekleniyor.</p></details>`).join("")}`;
    return (
      heading(
        esc(x.name),
        defLabels[kind],
        link(
          "definitions/" + (kind === "slots" ? "time-slots" : kind),
          "Listeye dön",
          "btn",
        ),
      ) +
      `<section class="panel">${tabs(labels)}<div id="tab-content" role="tabpanel" aria-labelledby="tab-${labels.indexOf(activeTab)}" class="panel-pad">${content}</div></section>`
    );
  }
  function users() {
    if (store.role !== "TENANT_ADMIN") return forbidden();
    return (
      heading(
        path() === "roles" ? "Roller ve yetkiler" : "Kullanıcı yönetimi",
        "Yetkiler kurum ve şube kapsamına göre belirlenir.",
        link(
          path() === "roles" ? "users" : "roles",
          path() === "roles" ? "Kullanıcılar" : "Roller ve yetkiler",
          "btn",
        ),
      ) +
      panel(
        "Erişim görünümü",
        columns(
          ["Rol", "Ekran kapsamı", "Durum"],
          Object.entries(store.roles).map(([r, n]) => [
            esc(n),
            r === "TEACHER"
              ? "Kendi dersleri, izinleri ve yoklaması"
              : r === "VIEWER"
                ? "Program ve rapor görüntüleme"
                : "Rol kapsamındaki operasyon ekranları",
            badge("Tasarım örneği"),
          ]),
        ) +
          `<div class="footnote">Bu matris yetki vermez. Davet ve rol atama işlemleri onaylı sunucu bağlantısı bekliyor.</div>`,
      )
    );
  }
  function reports() {
    const open = store.lessons.filter((l) => l.status !== "completed").length,
      pending = store.notifications.filter((n) =>
        ["draft", "pending"].includes(n.status),
      ).length,
      queued = store.notifications.filter((n) => n.status === "queued").length;
    return (
      heading(
        "Gün sonu raporu",
        "Açık dersleri, yoklamaları ve bildirim durumunu birlikte inceleyin.",
      ) +
      metrics() +
      `<div class="split">${panel("Operasyon kapanışı", `<div class="panel-pad"><div class="step"><b>01</b><div><strong>Dersler ve yoklamalar</strong><p>${open} ders tamamlanmayı bekliyor.</p>${link("attendance", "Yoklamaları incele →")}</div></div><div class="step"><b>02</b><div><strong>Bildirim onayları</strong><p>${pending} taslak inceleme bekliyor. ${queued} onaylı kayıt sentetik kuyrukta.</p>${link("parent-notifications", "Bildirimleri incele →")}</div></div><div class="step"><b>03</b><div><strong>Gerçek teslimat</strong><p>Gönderim yapılmadı. Bildirimlerin teslim edildiği veya üretim gününün kapandığı iddia edilmez.</p></div></div><p>${open || pending ? "Örnek akışta açık işler bulunuyor." : "Örnek inceleme adımları tamamlandı; gerçek gün sonu kapanışı yapılmadı."}</p></div>`)}${panel(
        "Öğretmen yükü",
        columns(
          ["Öğretmen", "Haftalık yük"],
          store.teachers.map((t) => [esc(t.name), esc(t.load)]),
        ),
      )}</div>`
    );
  }
  function review() {
    return (
      heading(
        "İnceleme araçları",
        "Rol, durum ve kapsam kontrolleri. Bu araçlar üretim yetkisi vermez.",
      ) +
      `<div class="panel panel-pad"><div class="form-grid">${select("Örnek kullanıcı rolü", "role", Object.entries(store.roles), store.role)}${
        teacher()
          ? select(
              "Örnek öğretmen",
              "demo-teacher",
              store.teachers.map((t) => [t.name, t.name]),
              store.demoTeacher,
            )
          : ""
      }${select(
        "Ekran durumu",
        "viewState",
        [
          ["normal", "Normal"],
          ["loading", "Yükleniyor"],
          ["empty", "Boş"],
          ["forbidden", "Yetkisiz"],
          ["stale", "Veri değişti"],
          ["conflict", "Çakışma"],
          ["offline", "Çevrimdışı"],
          ["eligibility", "Uygunluk hazır değil"],
          ["unexpected", "Beklenmeyen yanıt"],
        ],
        viewState,
      )}</div><p class="meta">Seçilen durum sonraki ekranlarda görünür. Normal duruma dönmek için burayı kullanın.</p>${button("Örnek verileri sıfırla", "reset")}</div><div class="review-grid">${[
        [
          "A · Mevcut ekranı genişlet",
          "Düşük geçiş maliyeti; büyüyen ekranlarda kod bağımlılığı artar.",
        ],
        [
          "B · Ortak kabuk, ayrı veri girişleri",
          "Seçilen mimari. Mevcut API korunur; üretim ve sentetik inceleme ayrıdır.",
        ],
        [
          "C · React / Next geçişi",
          "Genişleme imkânı; bu aşamada ek build, yönlendirme ve taşıma riski.",
        ],
      ]
        .map(
          ([t, p]) =>
            `<section class="panel"><h2>${t}</h2><p>${p}</p></section>`,
        )
        .join(
          "",
        )}</div>${panel("Kapsam ve bağımlılıklar", `<div class="panel-pad"><p>Program → İzin → Etki → Görevlendirme → Yoklama → Bildirim taslağı → Onay incelemesi.</p><p>Onaylı oturum/şube bağlamı, insan tarafından okunabilir ders referansları, izin onayı, yoklama ve bildirim API bağlantıları bekleniyor.</p><p>Ödeme, muhasebe, CRM, sınav modülü, veli/öğrenci uygulaması ve Faz 2–3 bu teslimatta yok.</p><p>Manrope/Inter font aileleri tanımlı; yerel font yoksa sistem fontları kullanılır. Klavye ve altı ekran genişliği doğrulama kapsamındadır.</p><a href="/ux/spec.md">Ekran envanteri, durum matrisi ve kabul raporu</a></div>`)}`
    );
  }
  function forbidden() {
    return (
      heading("Erişim sınırı", "") +
      panel(
        "Bu ekran görüntülenemiyor",
        empty(
          "Bu ekran için yetkiniz bulunmuyor",
          "Yetkili olduğunuz ekranlardan devam edin.",
          link("today", "Bugüne dön", "btn"),
        ),
      )
    );
  }
  function notFound() {
    return (
      heading("Kayıt bulunamadı", "") +
      empty(
        "Bu kayıt görüntülenemiyor",
        "Bağlantıyı kontrol edin veya listeye dönün.",
        link("today", "Bugüne dön", "btn"),
      )
    );
  }
  function stateView() {
    const texts = {
      loading: ["Bilgiler yükleniyor", ""],
      empty: ["Gösterilecek kayıt bulunmuyor", "Seçilen kapsamda kayıt yok."],
      forbidden: ["Bu işlemi görüntüleme yetkiniz bulunmuyor", ""],
      stale: [
        "Bu kayıt başka bir işlemle güncellendi",
        "Güncel bilgileri yeniden yükleyin.",
      ],
      conflict: [
        "Ders veya görev çakışması",
        "Programı inceleyip yeniden deneyin.",
      ],
      offline: [
        "Bağlantı kurulamadı",
        "Bağlantınızı kontrol edip yeniden deneyin.",
      ],
      eligibility: [
        "Öğretmen uygunluk bilgisi henüz tamamlanmadı",
        "Uygunluk hazır olduğunda yeniden deneyin.",
      ],
      unexpected: [
        "Beklenmeyen bir sunucu yanıtı alındı",
        "İşlem tamamlanamadı.",
      ],
    };
    const [t, p] = texts[viewState];
    return (
      heading("Durum incelemesi", "Sentetik hata ve kurtarma örneği") +
      panel(
        t,
        empty(t, p, button("Normal görünüme dön", "normal", "", "primary")),
      )
    );
  }
  function render() {
    if (!demo) {
      $("#app").innerHTML = shell(production());
      return;
    }
    const p = path();
    let body;
    const restricted =
      (store.role === "VIEWER" &&
        !["schedule", "reports", "review"].includes(p)) ||
      (store.role === "ACADEMIC_STAFF" &&
        ![
          "today",
          "attendance",
          "attendance/absences",
          "reports",
          "review",
        ].includes(p) &&
        !p.startsWith("definitions/")) ||
      (teacher() &&
        ["leave", "parent-notifications", "reports", "users", "roles"].includes(
          p,
        ));
    if (restricted) {
      $("#app").innerHTML = shell(forbidden());
      return;
    }
    if (viewState !== "normal" && p !== "review") body = stateView();
    else if (p === "today") body = today();
    else if (p === "schedule") body = schedule();
    else if (p === "schedule/builder")
      body = canManage() ? builder() : forbidden();
    else if (p === "schedule/conflicts") body = conflicts();
    else if (p === "leave" || p === "my-leaves") body = leaveList();
    else if (p === "leave/new") body = leaveForm();
    else if (p.startsWith("leave/")) body = leaveDetail(p.split("/")[1]);
    else if (p === "attendance") body = attendance();
    else if (p === "attendance/absences") body = absences();
    else if (p.startsWith("attendance/session/"))
      body = attendanceSession(p.split("/")[2]);
    else if (p === "parent-notifications") body = notifications();
    else if (p.startsWith("parent-notifications/"))
      body = notificationDetail(p.split("/")[1]);
    else if (p.startsWith("definitions/"))
      body =
        teacher() || store.role === "VIEWER"
          ? forbidden()
          : definitions(p.split("/")[1], p.split("/")[2]);
    else if (["users", "roles"].includes(p)) body = users();
    else if (p === "reports") body = reports();
    else if (p === "review") body = review();
    else if (p === "login")
      body =
        heading("Giriş ekranı", "İnceleme alanı hesap bilgisi istemez.") +
        empty(
          "Demo oturumu açık",
          "Gerçek giriş ekranını üretim alanında görüntüleyebilirsiniz.",
          '<a class="btn" href="/login">Giriş tasarımını aç</a>',
        );
    else if (p === "403") body = forbidden();
    else body = notFound();
    $("#app").innerHTML = shell(body);
    document.title =
      "Okul Yönetim · " + ($("#main h1")?.textContent || "Bugün");
  }
  function openDrawer(title, body) {
    drawerReturn = document.activeElement;
    const d = $("#drawer");
    d.innerHTML = `<div class="drawer-head"><h2 id="drawer-title">${title}</h2>${button("Kapat", "close-drawer")}</div><div class="drawer-body">${body}</div>`;
    d.showModal();
    d.addEventListener(
      "close",
      () => drawerReturn?.isConnected && drawerReturn.focus(),
      { once: true },
    );
  }
  function confirmAction(title, desc, fn) {
    drawerReturn = document.activeElement;
    const d = $("#confirm");
    d.innerHTML = `<h2 id="confirm-title">${title}</h2><p>${desc}</p><div class="actions">${button("Vazgeç", "cancel-confirm")}<button id="confirm-submit" class="primary">Onayla</button></div>`;
    d.showModal();
    $("#confirm-submit").onclick = () => {
      d.close();
      try {
        fn();
        notice = "Örnek kayıt güncellendi. Gerçek işlem yapılmadı.";
      } catch (e) {
        notice = e.message;
      }
      render();
      $("#main").focus();
    };
    d.addEventListener(
      "close",
      () => drawerReturn?.isConnected && drawerReturn.focus(),
      { once: true },
    );
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (a && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigate(a.getAttribute("href"));
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.filter) {
      filter = b.dataset.filter;
      render();
      return;
    }
    if (b.dataset.tab) {
      activeTab = b.dataset.tab;
      render();
      $(`[data-tab="${activeTab}"]`)?.focus();
      return;
    }
    const id = b.dataset.id,
      act = b.dataset.action;
    if (act === "menu") {
      $("#sidebar").classList.toggle("open");
      return;
    }
    if (act === "collapse") {
      $("#sidebar").classList.toggle("collapsed");
      $(".layout").classList.toggle("collapsed");
      b.textContent = $("#sidebar").classList.contains("collapsed")
        ? "→"
        : "Menüyü daralt";
      return;
    }
    if (act === "logout") {
      token = "";
      notice = "Oturum kapatıldı.";
      render();
      return;
    }
    if (act === "close-drawer") {
      $("#drawer").close();
      return;
    }
    if (act === "cancel-confirm") {
      $("#confirm").close();
      return;
    }
    if (!demo) return;
    try {
      if (act === "lesson") lessonDrawer(id);
      if (act === "assign") {
        const [l, t] = id.split("|");
        store.assign(l, t);
        $("#drawer").close();
        notice = "Örnek görevlendirme oluşturuldu; ders akışı güncellendi.";
        render();
      }
      if (act === "clear")
        confirmAction(
          "Görevlendirme kaldırılsın mı?",
          "Ders yeniden görevlendirme bekleyen duruma dönecek.",
          () => store.clear(id),
        );
      if (act === "approve-leave" || act === "reject-leave")
        confirmAction(
          act === "approve-leave"
            ? "Örnek izin onaylansın mı?"
            : "Örnek izin reddedilsin mi?",
          "Bu karar yalnız sentetik inceleme kaydını değiştirir.",
          () => store.decideLeave(id, act === "approve-leave"),
        );
      if (act === "mark-all") {
        store.markAll(id);
        render();
      }
      if (act === "approve-notification")
        confirmAction(
          "Taslak onaylansın mı?",
          "Bildirim sentetik kuyruğa taşınacak. Gerçek gönderim yapılmayacak.",
          () => store.approveNotification(id),
        );
      if (act === "cancel-notification")
        confirmAction(
          "Taslak iptal edilsin mi?",
          "Örnek bildirim iptal olarak işaretlenecek.",
          () => store.cancelNotification(id),
        );
      if (act === "normal") {
        viewState = "normal";
        render();
      }
      if (act === "reset") {
        store.reset();
        notice = "Örnek veriler sıfırlandı.";
        render();
      }
      if (act === "add-definition")
        openDrawer(
          "Örnek kayıt ekle",
          `<form id="definition-form" data-kind="${id}">${field("Ad / başlık", "name", "text", "", 'required maxlength="80"')}<p class="meta">Yalnız sentetik tanım kaydı oluşturulur.</p><button type="submit" class="primary">Örnek kaydı ekle</button></form>`,
        );
    } catch (err) {
      notice = err.message;
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#sidebar")?.classList.remove("open");
    }
    const t = e.target.closest("[role=tab]");
    if (t && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const all = [...document.querySelectorAll("[role=tab]")],
        i = all.indexOf(t),
        next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? all.length - 1
              : (i + (e.key === "ArrowRight" ? 1 : -1) + all.length) %
                all.length;
      all[next].click();
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("[data-search]")) {
      const n = e.target.selectionStart;
      filter = e.target.value || "all";
      render();
      $("[data-search]").focus();
      $("[data-search]").setSelectionRange(n, n);
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "demo-teacher" && demo) {
      store.demoTeacher = el.value;
      render();
    }
    if (el.name === "role" && demo) {
      store.role = el.value;
      render();
    }
    if (el.name === "viewState") {
      viewState = el.value;
    }
    if (el.name === "type") {
      const f = el.form;
      for (const n of ["start", "end"]) {
        f.elements[n].type = el.value === "hourly" ? "datetime-local" : "date";
        f.elements[n].value = "";
      }
    }
    if (el.dataset.student && demo) {
      try {
        store.setMark(el.dataset.lesson, el.dataset.student, el.value);
        $("#attendance-summary").textContent = attendanceSummary(
          el.dataset.lesson,
          store.students.filter(
            (s) =>
              s.group ===
              store.lessons.find((l) => l.id === el.dataset.lesson).group,
          ),
        );
        $("#live").textContent = "Öğrenci durumu güncellendi.";
      } catch (err) {
        notice = err.message;
        render();
      }
    }
    if (el.name === "schedule-scope" && demo) {
      scheduleScope = el.value;
      render();
    }
    if (el.name === "schedule-view" && demo) {
      scheduleView = el.value;
      scheduleScope = "all";
      render();
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    e.preventDefault();
    if (f.id === "login-form" && !demo) {
      if (loginBusy) return;
      loginBusy = true;
      const data = new FormData(f),
        email = data.get("email"),
        password = data.get("password");
      f.querySelector("button").disabled = true;
      try {
        const response = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        let body;
        try {
          body = await response.json();
        } catch {
          throw Error(
            "Beklenmeyen bir sunucu yanıtı alındı. İşlem tamamlanamadı.",
          );
        }
        if (!response.ok)
          throw Error(
            response.status === 401
              ? "E-posta veya şifre doğrulanamadı."
              : "Oturum açılamadı. Kurum erişiminizi kontrol edip yeniden deneyin.",
          );
        if (typeof body?.accessToken !== "string" || !body.accessToken)
          throw Error("Oturum bilgisi doğrulanamadı.");
        token = body.accessToken;
        history.pushState({}, "", base + "/today");
        notice = "Oturum doğrulandı. Kurum bağlantısı bekleniyor.";
      } catch (err) {
        notice =
          err instanceof TypeError
            ? "Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin."
            : err.message;
      } finally {
        loginBusy = false;
        render();
      }
      return;
    }
    if (!demo) return;
    try {
      if (f.id === "leave-form") {
        const data = Object.fromEntries(new FormData(f)),
          start = new Date(data.start),
          end = new Date(data.end);
        if (
          !Number.isFinite(+start) ||
          !Number.isFinite(+end) ||
          (data.type === "hourly" ? end <= start : end < start)
        )
          throw Error("Bitiş zamanı başlangıç zamanından sonra olmalıdır.");
        store.createLeave({ ...data, teacher: teacherName(), lessonIds: [] });
        navigate(base + "/my-leaves");
        notice = "Örnek izin talebi oluşturuldu.";
        render();
      }
      if (f.id === "attendance-form") {
        store.submitAttendance(f.dataset.id);
        notice =
          "Örnek yoklama tamamlandı. Devamsızlık taslakları güncellendi.";
        render();
      }
      if (f.id === "definition-form") {
        const kind = f.dataset.kind,
          name = new FormData(f).get("name").trim();
        if (!name) throw Error("Ad alanı zorunludur.");
        store[kind].push({
          id: "ux-" + Date.now(),
          name,
          active: true,
          group: kind === "students" ? store.groups[0].name : undefined,
        });
        $("#drawer").close();
        notice = "Örnek kayıt eklendi.";
        render();
      }
      if (f.id === "schedule-form") {
        const d = Object.fromEntries(new FormData(f));
        store.addLesson(d);
        navigate(base + "/schedule");
        notice = "Ders örnek programa eklendi.";
        render();
      }
    } catch (err) {
      const target = f.querySelector("[role=alert]");
      if (target) {
        target.textContent = err.message;
        target.tabIndex = -1;
        target.focus();
      } else {
        notice = err.message;
        render();
      }
    }
  });
  addEventListener("popstate", () => {
    filter = "all";
    activeTab = "Genel";
    render();
  });
  render();
}
