'use strict';
const viewTitles = {overview:'Günlük genel bakış',schedule:'Haftalık ders programı',analysis:'Program sonuçları ve denge',teacher:'İzin talebi oluştur',ops:'İzin inceleme ve ders planı'};
function showView(view) {
  if (!Object.hasOwn(viewTitles, view)) view = 'overview';
  document.querySelectorAll('.view-panel, .runtime-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== view));
  document.querySelectorAll('[data-view]').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  $('#view-title').textContent = viewTitles[view];
  document.title = `${viewTitles[view]} · Ata Akademi`;
  if (location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  $('#runtime-main').focus();
}
window.addEventListener('popstate',()=>showView(location.hash.slice(1)));
window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));
document.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) showView(button.dataset.view);
});
$('#today-label').textContent = new Intl.DateTimeFormat('tr-TR',{dateStyle:'full',timeZone:'Europe/Istanbul'}).format(new Date());
$('#overview-refresh').addEventListener('click',async()=>{await loadQueue();});

// Illustrative schedule only. Never submitted to the runtime API.
function renderExampleSchedule() {
  const teacher = $('#schedule-teacher').value;
  const group = $('#schedule-group').value;
  const days = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  const hours = ['10.00','10.50','11.40','12.30'];
  $('#weekly-grid').innerHTML = '<caption>Örnek veri · '+escapeHtml(group)+'</caption><thead><tr><th>Saat</th>'+days.map(day=>`<th>${day}</th>`).join('')+'</tr></thead><tbody>'+hours.map((hour,r)=>'<tr><th scope="row">'+hour+'</th>'+days.map((day,d)=>{
    const name=(r+d)%2?'Ece Kaya':'Deniz Yılmaz';
    if ((r+d)%4===0 || (teacher!=='all' && teacher!==name)) return '<td>—</td>';
    return `<td><div class="lesson"><b>${name==='Ece Kaya'?'Türkçe':'Matematik'}</b>${escapeHtml(name)}<small>Derslik ${d%3+1}</small></div></td>`;
  }).join('')+'</tr>').join('')+'</tbody>';
}
$('#sample-toggle').addEventListener('click',()=>{const open=$('#sample-toggle').getAttribute('aria-expanded')!=='true';$('#sample-toggle').setAttribute('aria-expanded',String(open));$('#sample-toggle').textContent=open?'Örnek görünümü kapat':'Örnek görünümü aç';$('#schedule-example').classList.toggle('hidden',!open);if(open)renderExampleSchedule();});
$('#schedule-group').addEventListener('change',renderExampleSchedule);
$('#schedule-teacher').addEventListener('change',renderExampleSchedule);

async function loadLeaveList() {
  if (!state.accessToken || !getBranchId()) return;
  const target=$('#leave-list');target.innerHTML=loading('İzin talepleri getiriliyor');
  try {
    const {body}=await apiRequest(`/leaves?${new URLSearchParams({branchId:getBranchId()})}`);
    const items=asArray(body,['items','leaves','requests']);
    target.innerHTML=items.length?items.map(leave=>`<article class="card"><h3>${escapeHtml(pick(leave,['teacherName','teacherId'],'Öğretmen'))}</h3><p>${escapeHtml(leave.startsAt)} — ${escapeHtml(leave.endsAt)}</p><p>${escapeHtml(leave.reasonCode)}</p><p>${escapeHtml(pick(leave,['decisionStatus','status'],'Bekliyor'))}</p><button data-action="review-leave" data-leave-id="${escapeHtml(leave.id)}">Talebi incele</button></article>`).join(''):empty('Bu merkezde izin talebi bulunmuyor.');
  }catch(error){renderError(target,error);}
}
let pendingDecision = null;
let decisionBusy = false;
async function reviewLeave(id) {
  if (decisionBusy) return;
  state.contextVersion++;
  let selection = state.contextVersion;
  state.activeLeaveId=id;state.activeLeaveEtag='';state.activeScheduleEventId='';state.activeAssignmentId='';
  $('#candidate-output').innerHTML='';
  const impact = loadImpact(id,'');
  selection = state.contextVersion;
  await impact;
  if (selection !== state.contextVersion) return;
  const target=$('#leave-list');
  try {
    const {body,etag}=await apiRequest(`/leaves/${encodeURIComponent(id)}`);
    // Keep the authoritative token from impact; HTTP ETag here is only a body hash.
    target.innerHTML=renderLeaveCard(body,'Seçilen izin talebi')+`<div class="section-head"><button data-decision="reject" data-reviewed-id="${escapeHtml(id)}" data-reviewed-etag="${escapeHtml(state.activeLeaveEtag)}" class="secondary">İzni reddet</button><button disabled title="Onay için sunucu tarafındaki etki analizi kapısı henüz hazır değil" data-decision="approve" data-reviewed-id="${escapeHtml(id)}" data-reviewed-etag="${escapeHtml(state.activeLeaveEtag)}">İzni onayla</button></div><p class="hint">Onay işlemi sunucudaki etki analizi kapısı tamamlanana kadar kullanılamaz. Ret kararı ve yedek görevlendirme ayrı işlemlerdir.</p>`;
  }catch(error){renderError(target,error);}
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.action==='review-leave')reviewLeave(b.dataset.leaveId);
  if(b.dataset.decision){if(b.disabled || b.dataset.decision==='approve')return;if(b.dataset.reviewedId!==state.activeLeaveId || b.dataset.reviewedEtag!==state.activeLeaveEtag)return announce('Seçim değişti; karar vermek için talebi yeniden inceleyin.','warning');if(!state.activeLeaveEtag)return announce('Kayıt sürümü alınamadı; talebi yeniden açın.','warning');pendingDecision={decision:b.dataset.decision,id:state.activeLeaveId,etag:state.activeLeaveEtag,version:state.contextVersion};$('#decision-title').textContent=pendingDecision.decision==='approve'?'İzin onaylansın mı?':'İzin reddedilsin mi?';$('#decision-record').textContent=$('#leave-list .card')?.textContent || 'Kayıt bilgisi alınamadı';$('#decision-dialog').showModal();}
});
$('#decision-dialog').addEventListener('close',async()=>{
  if($('#decision-dialog').returnValue!=='confirm'||!pendingDecision)return;
  const {decision,id,etag:versionTag,version}=pendingDecision;pendingDecision=null;
  if(decisionBusy || version !== state.contextVersion)return;
  decisionBusy=true;
  document.querySelectorAll('[data-decision]').forEach(b=>b.disabled=true);
  try {
    const {body,etag}=await apiRequest(`/leaves/${encodeURIComponent(id)}/${decision}`,{method:'PATCH',headers:{'If-Match':versionTag}});
    captureLeaveVersion(body,etag);announce('İzin kararı kaydedildi.','success');decisionBusy=false;await reviewLeave(id);await loadQueue();
  }catch(error){if(!error.obsolete){state.activeLeaveEtag='';renderError($('#leave-list'),error);}}finally{decisionBusy=false;document.querySelectorAll('[data-decision]').forEach(b=>b.disabled=b.dataset.decision==='approve');}
});
$('#refresh-leaves').addEventListener('click',async()=>{if(decisionBusy)return;state.contextVersion++;state.activeLeaveId='';state.activeLeaveEtag='';state.activeScheduleEventId='';state.activeAssignmentId='';$('#impact-output').innerHTML='';$('#candidate-output').innerHTML='';await loadLeaveList();});
showView(location.hash.slice(1));
