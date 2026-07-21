(() => {
  'use strict';
  const SEED = 'OKUL-DEMO-2026-07-21-v1';
  const start = () => ({mode:'draft', validated:false, attendance:{D01:'present',D02:'present',D03:'absent',D04:'present',D05:'late',D06:'present'}, notifications:{N1:'pending',N2:'approved',N3:'sent'}, substitutes:{E1:'',E2:'Demo Öğretmen B',E3:''}});
  let state = start();
  let toastTimer;

  const lessons = [
    ['09:30','TYT Matematik','12-SAY-1','Demo Öğretmen A','Derslik 2'],
    ['11:10','AYT Fizik','MEZ-SAY-2','Demo Öğretmen B','Derslik 4'],
    ['13:30','Türk Dili ve Edebiyatı','12-EA-1','Demo Öğretmen C','Derslik 1'],
    ['15:10','TYT Geometri','MEZ-SAY-1','Demo Öğretmen A','Derslik 3']
  ];
  const events = [
    ['Pazartesi','09:30','TYT Matematik','12-SAY-1','Demo Öğretmen A','D2'],
    ['Pazartesi','13:30','AYT Fizik','MEZ-SAY-2','Demo Öğretmen B','D4'],
    ['Salı','11:10','Türkçe','11-EA-1','Demo Öğretmen C','D1'],
    ['Çarşamba','09:30','TYT Geometri','MEZ-SAY-1','Demo Öğretmen A','D3','conflict'],
    ['Çarşamba','09:30','AYT Matematik','12-SAY-2','Demo Öğretmen A','D5','conflict'],
    ['Perşembe','15:10','Biyoloji','12-SAY-1','Demo Öğretmen D','Lab 1'],
    ['Cuma','11:10','Coğrafya','12-EA-1','Demo Öğretmen E','D6']
  ];
  const leaveRows = [
    ['E1','09:30','TYT Matematik','12-SAY-1','Derslik 2'],
    ['E2','13:30','TYT Geometri','MEZ-SAY-1','Derslik 3'],
    ['E3','15:10','AYT Matematik','12-SAY-2','Derslik 5']
  ];
  const students = [['D01','Demo Öğrenci 01'],['D02','Demo Öğrenci 02'],['D03','Demo Öğrenci 03'],['D04','Demo Öğrenci 04'],['D05','Demo Öğrenci 05'],['D06','Demo Öğrenci 06']];
  const notifications = [
    ['N1','Demo Öğrenci 03','Veli •••• 1203','Bugünkü ilk derse katılmadı.'],
    ['N2','Demo Öğrenci 05','Veli •••• 4518','Derse 18 dakika geç katıldı.'],
    ['N3','Demo Öğrenci 11','Veli •••• 8034','Yoklama sonrası bilgilendirme gönderildi.']
  ];

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const badge = () => '<span class="demo-badge">Demo Verisi</span>';
  const metric = (l,v,n) => `<article class="metric-card"><div class="metric-label">${esc(l)}</div><div class="metric-value">${esc(v)}<span class="metric-trend">demo</span></div><div class="metric-note">${esc(n)}</div></article>`;
  const heading = (k,t,d,a='') => `<div class="screen-heading"><div><div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">${badge()}<span class="tag">${esc(k)}</span></div><h2>${esc(t)}</h2><p>${esc(d)}</p></div><div class="heading-actions">${a}</div></div>`;

  function today(){
    const pending=Object.values(state.notifications).filter(v=>v==='pending').length;
    return `${heading('21 Temmuz 2026 · Salı','Bugünün operasyon görünümü','Dersler, izin etkileri, yoklama ve bildirim akışının sentetik sunum özeti.','<a class="button primary" href="/demo/schedule" data-route>Programı aç</a>')}
    <section class="metric-grid">${metric('Planlanan ders','18','16 hazır · 2 riskli')}${metric('Aktif öğretmen','12','1 izin kaydı')}${metric('Yoklama','6/8','2 oturum bekliyor')}${metric('Bildirim taslağı',pending,'İnsan onayı gerekli')}</section>
    <section class="layout-grid"><article class="panel"><div class="panel-header"><h3>Bugünkü ders akışı</h3><span class="status-chip success">Canlı demo akışı</span></div><div class="panel-body">${lessons.map(l=>`<div class="lesson-row"><div class="time-box">${l[0]}</div><div class="lesson-main"><strong>${l[1]} · ${l[2]}</strong><small>${l[3]}</small></div><span class="room-chip">${l[4]}</span></div>`).join('')}</div></article>
    <aside class="stack"><article class="panel"><div class="panel-header"><h3>Operasyon uyarıları</h3><span class="tag">3 kayıt</span></div><div class="panel-body stack"><div class="alert-card danger"><strong>Program çakışması</strong><p>Çarşamba 09:30 için aynı öğretmene iki ders atanmış.</p></div><div class="alert-card"><strong>İzin etkisi</strong><p>Demo Öğretmen A için üç ders yeniden görevlendirme bekliyor.</p></div><div class="alert-card success"><strong>Veli bildirimleri</strong><p>Onay ve gönderim simülasyonu hazır.</p></div></div></article>
    <article class="panel"><div class="panel-header"><h3>Hızlı geçişler</h3></div><div class="panel-body quick-grid"><a class="quick-link" href="/demo/leave/LV-204" data-route>İzin etkisini çöz</a><a class="quick-link" href="/demo/attendance/session/AT-1204" data-route>Yoklama al</a><a class="quick-link" href="/demo/notifications" data-route>Bildirimleri incele</a><a class="quick-link" href="/demo/schedule" data-route>Haftalık grid</a></div></article></aside></section>`;
  }

  function schedule(){
    const draft=state.mode==='draft';
    const days=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma'], times=['09:30','11:10','13:30','15:10'];
    const actions=`<button class="button" data-action="validate">Çakışmaları doğrula</button><button class="button primary" data-action="new-event" ${draft?'':'disabled'}>Yeni ders ekle</button>`;
    const grid=times.map(time=>`<div class="schedule-time">${time}</div>${days.map(day=>`<div class="schedule-cell">${events.filter(e=>e[0]===day&&e[1]===time).map((e,i)=>`<button class="schedule-event ${!state.validated&&e[6]?'conflict':''}" data-action="event" data-event="${esc(JSON.stringify(e))}"><strong>${e[2]}</strong><span>${e[3]} · ${e[4]}</span><span>${e[5]}</span></button>`).join('')}</div>`).join('')}`).join('');
    return `${heading('2026–2027 · 1. Hafta',draft?'Taslak haftalık program':'Yayınlanmış program',draft?'Yönetim görünümü; etkileşimler yalnız demo state’ini değiştirir.':'Salt okunur yayın görünümü; mutation kapalıdır.',actions)}
    <div class="schedule-toolbar"><div class="tabs"><button class="tab ${draft?'active':''}" data-action="mode" data-mode="draft">Taslak</button><button class="tab ${!draft?'active':''}" data-action="mode" data-mode="published">Yayınlanmış</button></div><div class="legend"><span>Planlı ders</span><span class="conflict">Hard conflict</span></div></div>
    <div class="alert-card ${state.validated?'success':'danger'}" style="margin-bottom:14px"><strong>${state.validated?'Full validation tamamlandı':'SCHEDULE_HARD_CONFLICTS_PRESENT'}</strong><p>${state.validated?'Sentetik program için hard conflict sayısı 0. Gerçek publish çağrısı yapılmaz.':'Çarşamba 09:30 slotunda Demo Öğretmen A için iki event bulunuyor.'}</p></div>
    <div class="schedule-wrap"><div class="schedule-grid"><div class="schedule-head">Saat</div>${days.map(d=>`<div class="schedule-head">${d}</div>`).join('')}${grid}</div></div>`;
  }

  function leave(id){
    const unresolved=leaveRows.filter(r=>!state.substitutes[r[0]]).length;
    return `${heading('İzin kaydı '+id,'Demo Öğretmen A · Tam gün izin','Bugünkü programa etkisi ve sentetik yedek öğretmen seçenekleri.','<button class="button primary" data-action="save-substitutes">Görevlendirmeleri kaydet</button>')}
    <section class="metric-grid">${metric('Etkilenen ders','3','Aynı gün içinde')}${metric('Atanan yedek',3-unresolved,'Yerel demo state’i')}${metric('Açık risk',unresolved,'Görevlendirme bekliyor')}${metric('İzin durumu','Onaylı','21 Temmuz 2026')}</section>
    <section class="layout-grid"><article class="panel"><div class="panel-header"><h3>Etkilenen dersler</h3><span class="status-chip ${unresolved?'warning':'success'}">${unresolved?unresolved+' açık aksiyon':'Tüm dersler atandı'}</span></div><div class="panel-body">${leaveRows.map(r=>`<div class="impact-row"><strong>${r[1]}</strong><div class="lesson-main"><strong>${r[2]} · ${r[3]}</strong><small>${r[4]}</small></div><select class="select" data-substitute="${r[0]}"><option value="">Yedek öğretmen seç</option>${['Demo Öğretmen B','Demo Öğretmen C','Demo Öğretmen D'].map(t=>`<option ${state.substitutes[r[0]]===t?'selected':''}>${t}</option>`).join('')}</select></div>`).join('')}</div></article>
    <aside class="stack"><article class="panel"><div class="panel-header"><h3>İzin özeti</h3>${badge()}</div><div class="panel-body"><dl class="detail-list"><dt>Tür</dt><dd>Tam gün</dd><dt>Neden</dt><dd>Kişisel izin · sentetik</dd><dt>Onaylayan</dt><dd>Demo Yönetici</dd><dt>Branch</dt><dd>Neşet Ertaş KE</dd></dl></div></article><div class="alert-card"><strong>Gerçek işlem yapılmaz</strong><p>Kaydet yalnız tarayıcı belleğindeki demo state’ini günceller.</p></div></aside></section>`;
  }

  function attendance(id){
    const count={present:0,absent:0,late:0}; Object.values(state.attendance).forEach(v=>count[v]++);
    return `${heading('Oturum '+id,'TYT Matematik · 12-SAY-1','Sentetik kayıtlarla yoklama durumlarını değiştirin.','<button class="button success" data-action="complete-attendance">Yoklamayı tamamla</button>')}
    <section class="metric-grid">${metric('Mevcut',count.present,'Derse katılan')}${metric('Devamsız',count.absent,'Bildirim adayı')}${metric('Geç',count.late,'Gecikme kaydı')}${metric('Tamamlanma','100%','6 sentetik kayıt')}</section>
    <article class="panel"><div class="panel-header"><div><h3>Yoklama listesi</h3><div class="metric-note">Bireysel kayıtlar tamamen sentetiktir.</div></div>${badge()}</div><div class="panel-body"><div class="progress"><span style="width:100%"></span></div><div style="overflow-x:auto;margin-top:12px"><table class="attendance-table"><thead><tr><th>Kod</th><th>Öğrenci</th><th>Durum</th></tr></thead><tbody>${students.map(s=>`<tr><td><span class="student-code">${s[0].slice(1)}</span></td><td><strong>${s[1]}</strong><div class="metric-note">Kişisel veri değildir</div></td><td><div class="segmented">${[['present','Var'],['absent','Yok'],['late','Geç']].map(x=>`<button data-action="attendance" data-student="${s[0]}" data-status="${x[0]}" class="${state.attendance[s[0]]===x[0]?'active':''}">${x[1]}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div></div></article>`;
  }

  function notificationCard(n){
    const s=state.notifications[n[0]], label=s==='pending'?'Onay bekliyor':s==='approved'?'Onaylandı':'Gönderildi', cls=s==='pending'?'warning':s==='approved'?'success':'neutral';
    return `<article class="notification-card"><div><h3>${n[1]} · ${n[3]}</h3><p>${n[2]} · Sentetik SMS taslağı.</p><div class="notification-meta"><span class="status-chip ${cls}">${label}</span><span class="tag">${n[0]}</span>${badge()}</div></div><div class="notification-actions">${s==='pending'?`<button class="button small" data-action="approve" data-id="${n[0]}">Onayla</button>`:''}${s==='approved'?`<button class="button small primary" data-action="send" data-id="${n[0]}">Gönderimi simüle et</button>`:''}${s==='sent'?'<span class="status-chip success">Teslim edildi</span>':''}</div></article>`;
  }
  function notificationsView(){
    const vals=Object.values(state.notifications), pending=vals.filter(v=>v==='pending').length;
    return `${heading('İnsan onaylı akış','Veli bilgilendirme kuyruğu','Maskelenmiş sentetik hedeflerle onay ve gönderim akışını deneyin.',`<button class="button primary" data-action="approve-all" ${pending?'':'disabled'}>Bekleyenleri onayla</button>`)}
    <section class="metric-grid">${metric('Bekleyen',pending,'Onay gerekli')}${metric('Onaylı',vals.filter(v=>v==='approved').length,'Gönderime hazır')}${metric('Gönderildi',vals.filter(v=>v==='sent').length,'Demo teslim kaydı')}${metric('Hata','0','Simülasyon stabil')}</section><section class="stack">${notifications.map(notificationCard).join('')}</section>`;
  }

  const routeMap=[
    [/^\/demo\/today\/?$/,'today','Günlük Operasyon',()=>today()],
    [/^\/demo\/schedule\/?$/,'schedule','Ders Programı',()=>schedule()],
    [/^\/demo\/leave\/([^/]+)\/?$/,'leave','İzin Etki Analizi',m=>leave(m[1])],
    [/^\/demo\/attendance\/session\/([^/]+)\/?$/,'attendance','Yoklama Oturumu',m=>attendance(m[1])],
    [/^\/demo\/notifications\/?$/,'notifications','Veli Bildirimleri',()=>notificationsView()]
  ];
  const screen=$('#screen'), title=$('#pageTitle'), modal=$('#modalBackdrop'), modalTitle=$('#modalTitle'), modalBody=$('#modalBody'), toast=$('#toast');
  function render(){
    try{
      const path=location.pathname.replace(/\/+$/,'')||'/demo/today'; const found=routeMap.map(r=>[r,path.match(r[0])]).find(x=>x[1]);
      if(!found){title.textContent='Demo bulunamadı';screen.innerHTML=`<div class="panel empty-state">${badge()}<h2>Ekran bulunamadı</h2><p>Bu adres demo route listesinde yok.</p><a class="button primary" href="/demo/today" data-route>Ana ekrana dön</a></div>`;setNav('');return;}
      const [r,m]=found; title.textContent=r[2]; screen.innerHTML=r[3](m); setNav(r[1]); document.title=`${r[2]} · Okul Yönetim Demo`;
    }catch(e){console.error(e);screen.innerHTML=`<div class="panel empty-state">${badge()}<h2>Güvenli demo modu</h2><p>Beklenmeyen hata yakalandı.</p><button class="button primary" data-action="reset">Sıfırla</button></div>`;}
  }
  function setNav(key){$$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===key));}
  function go(path){history.pushState({},'',path);render();scrollTo({top:0,behavior:'smooth'});}
  function showToast(msg){clearTimeout(toastTimer);toast.textContent=msg;toast.hidden=false;toastTimer=setTimeout(()=>toast.hidden=true,3000);}
  function openModal(t,body){modalTitle.textContent=t;modalBody.innerHTML=body;modal.hidden=false;document.body.style.overflow='hidden';}
  function closeModal(){modal.hidden=true;modalBody.innerHTML='';document.body.style.overflow='';}
  function eventModal(e){const ro=state.mode==='published';openModal(ro?'Yayınlanmış ders detayı':'Ders etkinliğini düzenle',`<div class="modal-content"><div class="form-grid"><div class="field full"><label>Ders</label><input value="${esc(e[2])}" ${ro?'disabled':''}></div><div class="field"><label>Grup</label><input value="${esc(e[3])}" ${ro?'disabled':''}></div><div class="field"><label>Derslik</label><input value="${esc(e[5])}" ${ro?'disabled':''}></div><div class="field full"><label>Öğretmen</label><input value="${esc(e[4])}" ${ro?'disabled':''}></div></div>${ro?'<div class="alert-card" style="margin-top:14px"><strong>Immutable görünüm</strong><p>Yayınlanmış program düzenlenemez.</p></div>':''}</div><div class="modal-footer"><button class="button" data-action="close">Kapat</button>${ro?'':'<button class="button primary" data-action="save-event">Demo değişikliğini kaydet</button>'}</div>`);}
  function newEvent(){openModal('Yeni ders ekle','<div class="modal-content"><div class="form-grid"><div class="field full"><label>Ders</label><select><option>TYT Matematik</option><option>AYT Fizik</option></select></div><div class="field"><label>Gün</label><select><option>Pazartesi</option><option>Salı</option></select></div><div class="field"><label>Saat</label><select><option>09:30</option><option>11:10</option></select></div><div class="field full"><label>Grup</label><select><option>12-SAY-1</option><option>MEZ-SAY-1</option></select></div></div><div class="alert-card" style="margin-top:14px"><strong>Demo-only kayıt</strong><p>Backend çağrısı yapılmaz.</p></div></div><div class="modal-footer"><button class="button" data-action="close">Vazgeç</button><button class="button primary" data-action="save-event">Ekle</button></div>');}

  document.addEventListener('click',e=>{
    const link=e.target.closest('[data-route]'); if(link){e.preventDefault();go(link.getAttribute('href'));return;}
    const b=e.target.closest('[data-action]'); if(!b)return; const a=b.dataset.action;
    if(a==='mode'){state.mode=b.dataset.mode;render();}
    else if(a==='validate'){state.validated=true;render();showToast('Full validation demo sonucu: hard conflict 0.');}
    else if(a==='new-event')newEvent();
    else if(a==='event')eventModal(JSON.parse(b.dataset.event));
    else if(a==='close')closeModal();
    else if(a==='save-event'){closeModal();showToast('Demo değişikliği yerel state’e kaydedildi.');}
    else if(a==='save-substitutes'){$$('[data-substitute]').forEach(s=>state.substitutes[s.dataset.substitute]=s.value);render();showToast('Demo görevlendirmeleri kaydedildi.');}
    else if(a==='attendance'){state.attendance[b.dataset.student]=b.dataset.status;render();}
    else if(a==='complete-attendance')showToast('Yoklama tamamlandı; gerçek kayıt oluşturulmadı.');
    else if(a==='approve'){state.notifications[b.dataset.id]='approved';render();showToast('Demo bildirimi onaylandı.');}
    else if(a==='send'){state.notifications[b.dataset.id]='sent';render();showToast('Gönderim simüle edildi; gerçek SMS gönderilmedi.');}
    else if(a==='approve-all'){Object.keys(state.notifications).forEach(k=>{if(state.notifications[k]==='pending')state.notifications[k]='approved'});render();showToast('Bekleyen demo bildirimleri onaylandı.');}
    else if(a==='reset'){state=start();closeModal();go('/demo/today');}
  });
  $('#resetDemo').addEventListener('click',()=>{state=start();closeModal();go('/demo/today');showToast('Demo başlangıç durumuna getirildi.');});
  $('#closeModal').addEventListener('click',closeModal); modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();}); addEventListener('popstate',render);
  Object.defineProperty(window,'__OKUL_DEMO__',{value:Object.freeze({seed:SEED,routes:['today','schedule','leave','attendance','notifications']})});
  render();
})();
