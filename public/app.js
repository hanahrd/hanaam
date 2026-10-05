/* Hana AI Market v1.2: participant/admin UI. 닉네임 전용 식별, 서버 세션 기반. */
(() => {
"use strict";
let portal=document.body.dataset.portal||"member";
let boot=null,csrf="",activeTab="overview",selected=new Set(),filter="전체",query="",sort="new";
let serverOffset=0,clockTimer=null,pollTimer=null,toastTimer=null,currentDetail=null,loginPublic=null,myNickname=null;
let pendingFiles=[],tempUploaded=[],uploadBusy=false;
let nicknameCheckTimer=null;
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const h=(v="")=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ICONS={
spark:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 8h18"/>',
slide:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0 5-3 5 3M7 11V8m5 3V6m5 5V9"/>',
image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="16" cy="8" r="1.5"/><path d="m3 17 6-6 9 10"/>',
video:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
play:'<path d="m9 5 11 7-11 7V5Z"/>',
flow:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h7a2 2 0 0 1 2 2v7m-4-4 4 4 4-4M6 9v10"/>',
search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v3h16v-3"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
close:'<path d="m6 6 12 12M6 18 18 6"/>',
check:'<path d="m5 12 4 4L19 6"/>',
circle:'<circle cx="12" cy="12" r="9"/>',
ballot:'<path d="M4 12 2 17v4h20v-4l-2-5M2 17h20M9 13h6"/><path d="m8 3 9 2-2 10-9-2Z"/><path d="m9 8 1 2 3-3"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/>',
page:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/>',
logout:'<path d="M9 3H4v18h5m6-5 5-4-5-4m-7 4h12"/>',
arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
share:'<path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>',
copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
award:'<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-3 6 3-2-9"/>',
refresh:'<path d="M20 8a8 8 0 1 0 1 7M20 3v5h-5"/>'
};
function icon(name,extra=""){return `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.page}</svg>`;}
const categoryIcon=c=>({PPT:"slide","이미지":"image","영상":"video","업무자동화":"flow","기타":"spark"}[c]||"page");
const ERR={
wrong_password:"비밀번호가 일치하지 않습니다. 다시 확인해 주세요.",
unauthorized:"접속 시간이 만료되었습니다. 다시 로그인해 주세요.",
invalid_input:"입력한 내용과 글자 수를 확인해 주세요.",
nickname_invalid:"닉네임 형식을 확인해 주세요. 한글·영문·숫자·밑줄(_) 2~12자만 가능합니다.",
nickname_reserved:"사용할 수 없는 닉네임입니다. 다른 닉네임을 입력해 주세요.",
nickname_taken:"이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.",
recovery_invalid:"닉네임 또는 복구코드가 일치하지 않습니다.",
already_registered:"이미 닉네임이 설정된 세션입니다.",
account_blocked:"차단된 계정입니다. 운영팀에 문의해 주세요.",
participant_required:"닉네임 설정 또는 복구코드 입장이 필요합니다.",
invalid_dates:"날짜와 시간을 올바르게 입력해 주세요.",date_order:"제출마감 ≤ 투표시작 < 투표마감 순서로 설정해 주세요.",
invalid_count:"1인당 선정 개수는 1~20개로 설정해 주세요.",
submissions_closed:"지금은 제작물 접수 기간이 아닙니다.",voting_closed:"현재는 투표 기간이 아닙니다. 기간을 확인해 주세요.",
selection_count:"관리자가 정한 개수만큼 정확히 선택해 주세요.",invalid_selection:"선택한 작품을 다시 확인해 주세요.",
self_vote:"본인이 제출한 작품에는 투표할 수 없습니다.",
already_voted:"이미 투표한 계정입니다. 재투표할 수 없습니다.",
consent_required:"안내 사항 확인 및 동의가 필요합니다.",
file_required:"파일을 1~5개 첨부해 주세요.",invalid_file:"지원하는 파일 형식인지 확인해 주세요.",
invalid_file_content:"파일 내용이 확장자와 일치하지 않거나 지원하지 않는 파일입니다. 원본 파일을 확인해 주세요.",
upload_incomplete:"파일 업로드가 완료되지 않았습니다. 다시 시도해 주세요.",
file_too_large:"파일 하나의 최대 크기는 50MB입니다.",total_too_large:"첨부 파일의 총 크기는 100MB 이하여야 합니다.",
upload_interrupted:"업로드가 중단되었습니다. 연결을 확인하고 다시 시도해 주세요.",
request_too_large:"입력 내용 또는 파일 크기가 너무 큽니다.",
not_found:"작품 또는 파일을 찾을 수 없습니다.",not_enough_works:"공개 작품 수가 1인당 선정 개수보다 적습니다. 작품을 공개하거나 선정 개수를 줄여 주세요.",
rules_locked:"투표가 접수되어 제출마감·투표시작·선정 개수는 변경할 수 없습니다.",
works_locked:"투표 중이거나 접수된 투표가 있어 작품의 공개 상태·삭제를 변경할 수 없습니다.",
end_extend_only:"투표가 접수된 후에는 투표마감 시간을 연장하는 것만 가능합니다.",
settings_conflict:"다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 입력해 주세요.",
too_many_requests:"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
csrf_denied:"접속 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.",
origin_denied:"허용되지 않은 요청입니다. 같은 사이트에서 다시 접속해 주세요.",
server_error:"처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.",
network_error:"서버에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요."
};
function fail(code){const e=new Error(ERR[code]||code);e.code=code;throw e;}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3600);}
function errText(e){return ERR[e.code]||e.message||ERR.server_error;}
function setError(el,e){if(el)el.textContent=typeof e==="string"?e:errText(e);}
const dateInput=iso=>new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,16);
const kstValue=v=>v+":00+09:00";
function fmtDate(iso){if(!iso)return "—";const p=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(iso));const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}.${o.month}.${o.day} ${o.hour}:${o.minute}`;}
function bytes(n){return n<1024*1024?(n/1024).toFixed(1)+"KB":(n/1024/1024).toFixed(1)+"MB";}
function computedPhase(settings){const n=Date.now()+serverOffset;return n>=Date.parse(settings.voteStart)&&n<Date.parse(settings.voteEnd)?"voting":n>=Date.parse(settings.voteEnd)?"ended":n<Date.parse(settings.submissionDeadline)?"submitting":"waiting";}
const phaseName=p=>({submitting:"제작물 접수 중",waiting:"투표 오픈 대기",voting:"우수 작품 투표 중",ended:"공모전 종료"}[p]);
function logo(sub=false){const name=boot?.settings?.siteName||loginPublic?.siteName||"하나증권 AI 마켓";return `<div class="logo text-brand"><div>${h(name==="하나증권 AI 마켓"?"하나 AI 마켓":name)}${sub?"<small>ADMIN CONSOLE</small>":""}</div></div>`;}

async function api(path,{method="GET",data}={}){
 let r;try{r=await fetch(path,{method,credentials:"same-origin",headers:{...(data?{"Content-Type":"application/json"}:{}),...(method!=="GET"?{"X-CSRF-Token":csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});}catch{fail("network_error");}
 let d={};try{d=await r.json();}catch{}
 if(!r.ok)fail(d.error||"server_error");
 return d;
}
/** Storage 서명 URL로 브라우저가 직접 PUT한다. 함수가 파일 본문을 중계하지 않는다 (SSOT 6.3). */
function putToSignedUrl(url,file,onProgress){
 return new Promise((resolve,reject)=>{
  const x=new XMLHttpRequest();x.open("PUT",url);
  x.setRequestHeader("Content-Type",file.type||"application/octet-stream");
  x.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded/e.total);};
  x.onerror=()=>{const e=new Error(ERR.network_error);e.code="network_error";reject(e);};
  x.onload=()=>{if(x.status>=200&&x.status<300)resolve();else{const e=new Error(ERR.upload_interrupted);e.code="upload_interrupted";reject(e);}};
  x.send(file);
 });
}
/** ①②③ 업로드 3단계: 서명 URL 발급 → 직접 PUT → 완료 확인 (SSOT 6.3). */
async function uploadOne(file,onProgress){
 const staged=await api("/api/uploads",{method:"POST",data:{name:file.name,size:file.size}});
 await putToSignedUrl(staged.uploadUrl,file,onProgress);
 await api(`/api/uploads/${staged.id}/complete`,{method:"POST"});
 return staged;
}
function rolePath(suffix){return portal==="admin"?"/api/admin/"+suffix:"/api/"+suffix;}

async function initialize(){
 try{loginPublic=await api("/api/public");}catch{loginPublic={siteName:"하나증권 AI 마켓",welcome:"하나증권 AI 마켓에 오신 것을 환영합니다."};}
 if(portal==="admin"){
  try{await loadBoot();renderApp();}catch(e){renderLogin(e.code==="unauthorized"?"":errText(e));}
  return;
 }
 try{
  const me=await api("/api/me");
  csrf=me.csrf;
  if(!me.participant){renderNicknameSetup();return;}
  myNickname=me.participant.nickname;
  await loadBoot();renderApp();
 }catch(e){renderLogin(e.code==="unauthorized"?"":errText(e));}
}
async function loadBoot(){
 const b=await api(rolePath("bootstrap"));
 boot=b;csrf=b.csrf;serverOffset=Date.parse(b.serverNow)-Date.now();boot.phase=computedPhase(b.settings);
 selected=new Set([...selected].filter(id=>boot.works.some(w=>w.id===id&&(portal==="admin"||w.visible!==false))));
 if(boot.voted||boot.phase!=="voting")selected.clear();
}
async function refresh(){
 try{
  await loadBoot();
  if(portal==="member"){renderParticipantDynamic();renderWorks();}
  else renderAdminContent();
 }catch(e){if(e.code==="unauthorized"){boot=null;renderLogin(ERR.unauthorized);}else toast(errText(e));}
}

/* ── P-01 공통 비밀번호 입장 ── */
function renderLogin(message=""){
 window.HanaStory?.destroy();
 clearInterval(clockTimer);clearInterval(pollTimer);
 const admin=portal==="admin";
 $("#app").innerHTML=`<div class="login-page ${admin?"login-admin":""}">
 <div class="login-top">${logo()}<button class="btn-text" data-action="switch-portal">${icon(admin?"arrow":"shield")} ${admin?"참여자 페이지":"관리자 로그인"}</button></div>
 <main class="login-shell" id="main">
 ${admin?"":`<div class="login-art" aria-hidden="true"><div class="login-outline"></div><div class="login-circle"></div><div class="hero-folder"><strong>AI</strong><small>YOUR NEXT IDEA</small></div><div class="art-note n1">${icon("slide")} 생각이 담긴 PPT</div><div class="art-note n2">${icon("video")} 영감이 되는 영상</div><div class="art-note n3">${icon("flow")} 업무를 바꾸는 아이디어</div><div class="login-art-caption">작은 시도가 모여, 하나의 변화가 됩니다.</div></div>`}
 <div class="login-card"><div class="login-eyebrow">${admin?"ADMIN ACCESS":"HANA AI CONTEST"}</div>
 <h1>${admin?"공모전 운영을<br>시작해 볼까요?":h(loginPublic?.welcome||"하나증권 AI 마켓에 오신 것을 환영합니다.")}</h1>
 <p class="lead">${admin?"관리자 전용 비밀번호로 접속해 주세요.<br>참여자 비밀번호와 별도로 관리됩니다.":"나의 AI 활용 사례를 공유하고,<br>동료들의 새로운 아이디어를 만나보세요."}</p>
 <form id="login-form" class="stack">
 <div class="field"><label for="login-password">${admin?"관리자 비밀번호":"접속 비밀번호"}</label><div class="password-wrap"><input id="login-password" type="password" autocomplete="current-password" placeholder="비밀번호를 입력해 주세요" maxlength="200" required><button type="button" class="btn-icon" data-action="toggle-password" aria-label="비밀번호 표시">${icon("eye")}</button></div><p class="hint">${admin?"최초 운영 담당자에게 전달받은 관리자 비밀번호를 사용하세요.":"영문 대소문자를 구분하지 않습니다."}</p></div>
 <div id="login-error" class="error" role="alert">${h(message)}</div>
 <button class="btn btn-primary btn-wide" type="submit">${admin?"관리자 접속":"마켓 입장하기"} ${icon("arrow")}</button>
 </form><p class="hint" style="margin-top:22px">${icon("lock","small-icon")} ${admin?"관리자 기능은 참여자에게 공개되지 않습니다.":"하나증권 임직원을 위한 사내 공모전 공간입니다."}</p></div></main>
 <footer class="login-bottom">HANA SECURITIES · AI MARKET</footer></div>`;
 $("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;$("#login-error").textContent="";
 try{
  await api(rolePath("login"),{method:"POST",data:{password:$("#login-password").value}});
  if(admin){await loadBoot();renderApp();return;}
  const me=await api("/api/me");csrf=me.csrf;
  if(!me.participant){renderNicknameSetup();return;}
  myNickname=me.participant.nickname;await loadBoot();renderApp();
 }catch(err){setError($("#login-error"),err);btn.disabled=false;}
 });
}

/* ── P-01a 닉네임 설정 ── */
function renderNicknameSetup(message=""){
 window.HanaStory?.destroy();clearInterval(clockTimer);clearInterval(pollTimer);
 $("#app").innerHTML=`<div class="login-page">
 <div class="login-top">${logo()}<button class="btn-text" data-action="logout-presetup">${icon("logout")} 로그아웃</button></div>
 <main class="login-shell" id="main">
 <div class="login-art" aria-hidden="true"><div class="login-outline"></div><div class="login-circle"></div><div class="hero-folder"><strong>AI</strong><small>YOUR NEXT IDEA</small></div><div class="art-note n1">${icon("users")} 실명·사번 비공개</div><div class="art-note n2">${icon("shield")} 닉네임으로만 참여</div><div class="art-note n3">${icon("award")} 복구코드로 재입장</div><div class="login-art-caption">닉네임 하나로 안전하게 참여합니다.</div></div>
 <div class="login-card"><div class="login-eyebrow">NICKNAME SETUP</div>
 <h1>닉네임을 정해 주세요</h1>
 <p class="lead">실명·사번·부서가 드러나지 않는 닉네임을 사용해 주세요.<br>한 번 정하면 직접 바꿀 수 없습니다.</p>
 <form id="nickname-form" class="stack">
 <div class="field"><label for="nick-input">닉네임 *</label><input id="nick-input" autocomplete="off" placeholder="2~12자 · 한글/영문/숫자/밑줄(_)" minlength="2" maxlength="12" required><p id="nick-hint" class="hint">한글 완성형, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.</p></div>
 <div id="nickname-error" class="error" role="alert">${h(message)}</div>
 <button class="btn btn-primary btn-wide" type="submit">닉네임 만들기 ${icon("arrow")}</button>
 </form>
 <p class="hint" style="margin-top:18px">이미 닉네임이 있나요? <button class="btn-text" style="padding:0;display:inline" data-action="go-recover">${icon("lock","small-icon")} 복구코드로 입장하기</button></p>
 </div></main>
 <footer class="login-bottom">HANA SECURITIES · AI MARKET</footer></div>`;
 const input=$("#nick-input"),hint=$("#nick-hint");
 input.addEventListener("input",()=>{
  clearTimeout(nicknameCheckTimer);
  const v=input.value.trim();
  if(v.length<2){hint.textContent="한글 완성형, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.";hint.style.color="";return;}
  nicknameCheckTimer=setTimeout(async()=>{
   try{
    const r=await api("/api/nickname-check?nickname="+encodeURIComponent(v));
    if(r.available){hint.textContent="사용할 수 있는 닉네임입니다.";hint.style.color="var(--brand-dark)";}
    else{hint.textContent=ERR[r.reason]||"사용할 수 없는 닉네임입니다.";hint.style.color="var(--red)";}
   }catch{}
  },350);
 });
 $("#nickname-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;$("#nickname-error").textContent="";
  try{
   const r=await api("/api/participants",{method:"POST",data:{nickname:input.value.trim()}});
   renderRecoveryReveal(r.nickname,r.recoveryCode);
  }catch(err){setError($("#nickname-error"),err);btn.disabled=false;}
 });
}

/* ── P-01b 복구코드 입장 ── */
function renderRecovery(message=""){
 window.HanaStory?.destroy();clearInterval(clockTimer);clearInterval(pollTimer);
 $("#app").innerHTML=`<div class="login-page">
 <div class="login-top">${logo()}<button class="btn-text" data-action="logout-presetup">${icon("logout")} 로그아웃</button></div>
 <main class="login-shell" id="main">
 <div class="login-art" aria-hidden="true"><div class="login-outline"></div><div class="login-circle"></div><div class="hero-folder"><strong>AI</strong><small>YOUR NEXT IDEA</small></div><div class="art-note n1">${icon("lock")} 복구코드 입장</div><div class="art-note n2">${icon("users")} 닉네임 확인</div><div class="art-note n3">${icon("shield")} 안전한 재입장</div><div class="login-art-caption">등록 시 받은 복구코드로 다시 입장하세요.</div></div>
 <div class="login-card"><div class="login-eyebrow">RECOVER ACCOUNT</div>
 <h1>복구코드로 입장하기</h1>
 <p class="lead">닉네임과 등록 시 받은 복구코드를 입력해 주세요.</p>
 <form id="recover-form" class="stack">
 <div class="field"><label for="rec-nickname">닉네임 *</label><input id="rec-nickname" autocomplete="off" maxlength="40" required></div>
 <div class="field"><label for="rec-code">복구코드 *</label><input id="rec-code" autocomplete="off" placeholder="XXXX-XXXX-XXXX" maxlength="40" required></div>
 <div id="recover-error" class="error" role="alert">${h(message)}</div>
 <button class="btn btn-primary btn-wide" type="submit">입장하기 ${icon("arrow")}</button>
 </form>
 <p class="hint" style="margin-top:18px">복구코드가 없나요? <button class="btn-text" style="padding:0;display:inline" data-action="go-nickname">${icon("arrow","small-icon")} 닉네임 새로 만들기</button></p>
 </div></main>
 <footer class="login-bottom">HANA SECURITIES · AI MARKET</footer></div>`;
 $("#recover-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;$("#recover-error").textContent="";
  try{
   const r=await api("/api/participants/recover",{method:"POST",data:{nickname:$("#rec-nickname").value.trim(),recoveryCode:$("#rec-code").value.trim()}});
   myNickname=r.nickname;await loadBoot();renderApp();
  }catch(err){setError($("#recover-error"),err);btn.disabled=false;}
 });
}

/* ── P-01c 복구코드 안내 (1회 표시) ── */
function renderRecoveryReveal(nickname,recoveryCode){
 myNickname=nickname;
 $("#app").innerHTML=`<div class="login-page">
 <div class="login-top">${logo()}<span class="pill pill-green">${icon("check","small-icon")} 등록 완료</span></div>
 <main class="login-shell" id="main" style="grid-template-columns:1fr;max-width:560px">
 <div class="login-card">
 <div class="login-eyebrow">SAVE YOUR RECOVERY CODE</div>
 <h1>복구코드를 꼭 저장해 주세요</h1>
 <p class="lead"><strong>${h(nickname)}</strong>님, 반갑습니다.<br>이 복구코드는 지금 한 번만 표시됩니다. 로그아웃 후 재입장하려면 이 코드가 필요합니다.</p>
 <div class="field"><label>복구코드</label><div class="password-wrap"><input id="recovery-code-value" value="${h(recoveryCode)}" readonly style="font-weight:800;letter-spacing:2px;text-align:center"><button type="button" class="btn-icon" data-action="copy-recovery" aria-label="복구코드 복사">${icon("copy")}</button></div></div>
 <div class="privacy">분실 시 본인 확인 수단이 없습니다. 메모장, 비밀번호 관리자 등 안전한 곳에 저장해 주세요.</div>
 <label class="check" style="margin-top:16px"><input type="checkbox" id="recovery-saved-check"><span>복구코드를 저장했습니다.</span></label>
 <button class="btn btn-primary btn-wide" style="margin-top:18px" id="recovery-continue" disabled>갤러리로 이동 ${icon("arrow")}</button>
 </div></main>
 <footer class="login-bottom">HANA SECURITIES · AI MARKET</footer></div>`;
 $("#recovery-saved-check").addEventListener("change",e=>{$("#recovery-continue").disabled=!e.target.checked;});
 $("#recovery-continue").addEventListener("click",async()=>{await loadBoot();renderApp();});
}

function renderApp(){
 window.HanaStory?.destroy();
 clearInterval(clockTimer);clearInterval(pollTimer);
 if(portal==="admin")renderAdmin();else renderParticipant();
 if(portal==="member"){
   clockTimer=setInterval(updateClock,1000);
   pollTimer=setInterval(()=>{if(!document.hidden)refresh();},60000);
   const m=location.hash.match(/^#work-([a-z0-9]+)$/);if(m)setTimeout(()=>openDetail(m[1]),50);
 }
}
function renderParticipant(){
 $("#app").innerHTML=`<div class="top-sticky"><header class="main-header"><div class="wrap"><div class="flex">${logo()}<nav class="header-links" aria-label="주 메뉴"><span class="active">AI 작품 마켓</span><span>발견하고, 나누고, 함께 성장하기</span></nav></div><div class="header-actions"><nav class="participant-nav" aria-label="참여자 메뉴"><button class="story-header-link" data-action="story-intro">공모전 소개</button><button class="story-header-link to-market" data-action="story-gallery">작품 갤러리</button><button class="story-header-link" data-action="contest-schedule">일정 안내</button><button class="story-header-link" data-action="contest-guide">참여 안내</button></nav><span class="pill" title="현재 닉네임">${icon("users","small-icon")} ${h(myNickname||"")}</span><button class="btn-text logout-button" data-action="logout" aria-label="로그아웃">${icon("logout")}<span>로그아웃</span></button><button class="header-submit" data-action="upload">작품 신청하기</button></div></div></header>
 <section class="timer-band" id="timer-band" aria-label="공모전 마감 안내"><div class="wrap timer-content"><div class="timer-heading"><span class="timer-bell">${icon("clock")}</span><div><div class="timer-eyebrow">${icon("clock","small-icon")} HANA AI CONTEST</div><h2 id="timer-title"></h2><p class="timer-caption" id="timer-caption"></p></div></div><div id="timer-values" class="timer-count" role="timer" aria-live="off"></div></div></section></div>
 ${window.HanaStory?window.HanaStory.markup(boot.settings,icon):""}
 <main class="wrap market-main" id="main"><div class="intro-row"><div><span class="gallery-eyebrow">GALLERY</span><h1>이미 시작된, 다양한 AI 아이디어들</h1><p id="intro-description"></p></div><button class="btn btn-primary gallery-upload" id="upload-button" data-action="upload">${icon("plus")} 제작물 업로드</button></div>
 <div id="participant-notices"></div>
 <div class="search-filter"><div class="search-input">${icon("search")}<input id="search" type="search" aria-label="작품 검색" placeholder="작품명, 닉네임, AI 도구를 검색해 보세요" value="${h(query)}"></div><select id="sort" class="sort-select" aria-label="작품 정렬"><option value="new">최신순</option><option value="popular">인기순</option><option value="likes">좋아요순</option></select></div>
 <div class="chips" role="group" aria-label="작품 유형 필터">${["전체","PPT","이미지","영상","업무자동화","기타"].map(c=>`<button class="chip" data-action="filter" data-value="${h(c)}" aria-pressed="${filter===c}">${icon(c==="전체"?"grid":categoryIcon(c))}${c}</button>`).join("")}</div>
 <div class="results-heading"><div><strong>공모전 출품작 <span id="result-count" class="count"></span></strong></div><span>좋아요는 응원 · 투표는 별도 참여</span></div>
 <section class="work-grid" id="work-grid" aria-label="출품작 목록"></section></main>
 <footer class="footer"><div class="wrap"><span>하나증권 AI 마켓 · 아이디어를 나누면 변화가 시작됩니다.</span><span>운영: 인재개발실 · 기준 시간: 한국(KST)</span></div></footer><div id="vote-tray-container"></div>`;
 $("#search").addEventListener("input",e=>{query=e.target.value;renderWorks();});
 $("#sort").value=sort;$("#sort").addEventListener("change",e=>{sort=e.target.value;renderWorks();});
 renderParticipantDynamic();renderWorks();
 window.HanaStory?.mount(boot.settings,boot.phase);
}
function renderParticipantDynamic(){
 if(!boot||!$("#intro-description"))return;
 $("#intro-description").textContent=boot.settings.description;
 const open=boot.phase==="submitting"&&boot.settings.uploadsEnabled;
 const uploadBtn=$("#upload-button");uploadBtn.disabled=!open;
 uploadBtn.innerHTML=icon(open?"plus":"lock")+" "+(open?"제작물 업로드":boot.phase==="submitting"?"접수 일시 중지":"제작물 접수 마감");
 const cfg=boot.settings;
 let notice=cfg.notice?`<div class="notice">${icon("info")}<span>${h(cfg.notice)}</span></div>`:"";
 if(boot.phase==="voting"){
  notice=`<div class="vote-callout"><div class="flex"><div class="vote-icon">${icon(boot.voted?"check":"ballot")}</div><div><h3>${boot.voted?"소중한 투표가 접수되었습니다":"우수 작품 투표가 열렸어요"}</h3><p>${boot.voted?"같은 계정으로 다시 참여할 수 없습니다. 작품은 계속 둘러볼 수 있어요.":`마음에 드는 작품 <strong>정확히 ${cfg.voteCount}개</strong>를 선택해 주세요. 좋아요는 투표에 포함되지 않습니다.`}</p></div></div><span class="pill pill-vote">${boot.voted?"투표 완료":`1인 ${cfg.voteCount}개 선정`}</span></div>`+notice;
 }else if(boot.phase==="waiting"){
  notice=`<div class="notice">${icon("calendar")}<span>제작물 제출이 마감되었습니다. <strong>${fmtDate(cfg.voteStart)}</strong>부터 우수 작품 투표가 열립니다.</span></div>`+notice;
 }else if(boot.phase==="submitting"){
  notice+=`<p class="small muted" style="margin-top:-12px;margin-bottom:18px">투표 예정: ${fmtDate(cfg.voteStart)} ~ ${fmtDate(cfg.voteEnd)} · 1인 ${cfg.voteCount}개 선정</p>`;
 }
 $("#participant-notices").innerHTML=notice;
 updateClock();renderVoteTray();
 window.HanaStory?.sync(boot.settings,boot.phase);
}
function updateClock(){
 if(!boot||portal!=="member")return;
 const cfg=boot.settings,p=computedPhase(cfg);
 if(p!==boot.phase){boot.phase=p;selected.clear();renderParticipantDynamic();renderWorks();return;}
 const title=$("#timer-title"),caption=$("#timer-caption"),values=$("#timer-values");
 if(!values)return;
 $("#timer-band").classList.toggle("vote-timer",p==="voting");
 let target;
 if(p==="submitting"){title.textContent="제출마감까지 남은 시간";caption.textContent=fmtDate(cfg.submissionDeadline)+" 마감 · 한국시간";target=cfg.submissionDeadline;}
 else if(p==="voting"){title.textContent="투표마감까지 남은 시간";caption.textContent=fmtDate(cfg.voteEnd)+" 마감 · 한국시간";target=cfg.voteEnd;}
 else if(p==="waiting"){title.textContent="제출이 마감되었습니다";caption.textContent="투표 시작: "+fmtDate(cfg.voteStart);target=null;}
 else{title.textContent="투표가 마감되었습니다";caption.textContent=fmtDate(cfg.voteEnd)+" 종료 · 참여해 주셔서 감사합니다.";target=null;}
 if(!target){values.innerHTML=`<span class="timer-state">${p==="waiting"?"곧 투표로 만나요":"참여해 주셔서 감사합니다"}</span>`;return;}
 const seconds=Math.max(0,Math.floor((Date.parse(target)-Date.now()-serverOffset)/1000));
 const a=[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60];
 if(!$(".digit",values))values.innerHTML=a.map((x,i)=>`${i>1?'<span class="time-colon">:</span>':""}<div class="digit"><strong data-digit="${i}"></strong><small>${["일","시간","분","초"][i]}</small></div>`).join("");
 a.forEach((n,i)=>$(`[data-digit="${i}"]`,values).textContent=String(n).padStart(2,"0"));
}
function cover(w){
 const image=w.files?.find(f=>f.mime.startsWith("image/"));
 if(image)return `<div class="cover"><img src="/api/files/${h(image.id)}" alt="${h(w.title)} 미리보기" loading="lazy"><div class="cover-meta"><span class="file-tag">${h(w.category)}</span></div></div>`;
 const art=w.category==="영상"?`<div class="video-art"><div class="video-screen"><span>AI</span><div class="video-play">${icon("play")}</div></div><span class="video-orbit"></span></div>`:w.category==="이미지"?`<div class="image-art"><span class="image-art-card"><i></i><b></b><em></em></span><span class="image-art-bubble"></span></div>`:w.category==="업무자동화"?`<div class="flow-art"><span class="flow-node">${icon("page")}</span><span class="flow-dot"></span><span class="flow-node">${icon("spark")}</span><span class="flow-dot"></span><span class="flow-node">${icon("check")}</span></div>`:
 `<div class="mini-doc"><span class="doc-label">${w.category==="PPT"?"IDEA PRESENTATION":"AI WORKSPACE"}</span><div class="doc-line"></div><div class="doc-line short"></div><div class="doc-bottom"><span class="doc-block"></span><span class="doc-block"></span><span class="doc-block"></span></div></div>`;
 return `<div class="cover" data-category="${h(w.category)}"><div class="cover-meta"><span class="file-tag">${h(w.category)}</span></div><div aria-hidden="true">${art}</div><span class="cover-stamp" aria-hidden="true">HANA AI MARKET</span></div>`;
}
function worksFiltered(){
 const q=query.trim().toLowerCase();
 let list=boot.works.filter(w=>(filter==="전체"||w.category===filter)&&[w.title,w.nickname,w.tools,w.description].join(" ").toLowerCase().includes(q));
 list.sort((a,b)=>sort==="likes"?b.likes-a.likes:sort==="popular"?(b.views+b.likes*2)-(a.views+a.likes*2):Date.parse(b.created)-Date.parse(a.created));
 return list;
}
function renderWorks(){
 const grid=$("#work-grid");if(!grid||!boot)return;
 const list=worksFiltered();$("#result-count").textContent=list.length;
 const voting=boot.phase==="voting"&&!boot.voted;
 grid.innerHTML=list.length?list.map((w,i)=>`<article class="work-card ${selected.has(w.id)?"chosen":""}" style="--delay:${Math.min(i*30,160)}ms">
 <button class="work-open" data-action="detail" data-id="${h(w.id)}" aria-label="${h(w.title)} 상세보기">${cover(w)}<div class="work-info"><h3>${h(w.title)}</h3><p class="meta">${h(w.nickname)}${w.mine?" · 내 작품":""}</p><div class="tag-row">${(w.tools||"AI 활용").split(/[,·]/).slice(0,3).map(t=>`<span class="tool-tag">${h(t.trim())}</span>`).join("")}</div></div></button>
 <div class="card-footer"><span class="flex" style="gap:5px">${icon("eye","small-icon")}${w.views} <span style="margin-left:8px">첨부 ${w.files?.length||0}</span></span><button class="like-btn ${w.liked?"liked":""}" data-action="like" data-id="${h(w.id)}" aria-label="${h(w.title)} 좋아요" aria-pressed="${!!w.liked}">${icon("heart","small-icon")} <span>${w.likes}</span></button></div>
 ${voting&&!w.mine?`<button class="select-vote" data-action="select-vote" data-id="${h(w.id)}" aria-pressed="${selected.has(w.id)}" ${!selected.has(w.id)&&selected.size>=boot.settings.voteCount?"disabled":""}>${icon(selected.has(w.id)?"check":"circle","small-icon")}${selected.has(w.id)?"선정 완료":"우수 작품으로 선정"}</button>`:voting&&w.mine?`<p class="hint" style="margin:0 16px 16px">본인 작품에는 투표할 수 없습니다.</p>`:""}</article>`).join(""):
 `<div class="empty">${icon("folder")}<h3>${query||filter!=="전체"?"조건에 맞는 작품이 없어요":"첫 번째 AI 아이디어를 기다리고 있어요"}</h3><p>${query||filter!=="전체"?"검색어나 작품 유형을 바꿔 보세요.":"직접 만든 PPT, 이미지, 영상으로 마켓을 채워 주세요."}</p>${boot.phase==="submitting"?'<button class="btn btn-primary" data-action="upload">제작물 업로드</button>':""}</div>`;
 renderVoteTray();
}
function renderVoteTray(){
 const holder=$("#vote-tray-container");if(!holder)return;
 if(boot.phase!=="voting"||boot.voted){holder.innerHTML="";return;}
 holder.innerHTML=`<aside class="vote-tray" aria-label="선택한 투표 작품"><div class="wrap"><div class="tray-main"><div class="tray-label">선정한 작품 <strong>${selected.size} <span class="small muted">/ ${boot.settings.voteCount}</span></strong><span class="tiny muted">정확히 ${boot.settings.voteCount}개 선택</span></div><div class="selected-names">${selected.size?[...selected].map(id=>`<span class="selected-name"><span>${h(boot.works.find(w=>w.id===id)?.title)}</span><button data-action="select-vote" data-id="${h(id)}" aria-label="선정 취소">${icon("close")}</button></span>`).join(""):'<span class="tiny muted">작품의 ‘우수 작품으로 선정’ 버튼을 눌러 주세요.</span>'}</div></div><button class="btn btn-primary" data-action="open-vote" ${selected.size===boot.settings.voteCount?"":"disabled"}>투표 제출하기 ${icon("arrow","small-icon")}</button></div></aside>`;
}
function modal(title,body){
 const d=$("#modal");
 if(d.open)d.close();
 d.innerHTML=`<div class="modal-head"><h2 id="modal-title">${h(title)}</h2><button class="btn-icon" data-action="close-modal" aria-label="닫기">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
 d.showModal();document.body.style.overflow="hidden";
}
function closeModal(){if(uploadBusy){toast("업로드를 완료하는 중입니다. 잠시 기다려 주세요.");return;}const d=$("#modal");if(d.open)d.close();document.body.style.overflow="";}
$("#modal").addEventListener("cancel",e=>{if(uploadBusy)e.preventDefault();});
$("#modal").addEventListener("close",()=>{document.body.style.overflow="";});
$("#modal").addEventListener("click",e=>{if(e.target===$("#modal")){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
async function openDetail(id){
 const w=boot.works.find(w=>w.id===id);if(!w){toast(ERR.not_found);return;}
 currentDetail=w;
 let preview=cover(w);
 const f=w.files?.find(x=>x.mime.startsWith("image/"))||w.files?.find(x=>x.mime.startsWith("video/"));
 if(f){const url="/api/files/"+f.id;preview=f.mime.startsWith("image/")?`<img src="${h(url)}" alt="${h(w.title)}">`:`<video controls playsinline preload="metadata" aria-label="${h(w.title)}"><source src="${h(url)}" type="${h(f.mime)}">동영상을 내려받아 확인해 주세요.</video>`;}
 modal(w.title,`<div class="detail-cover">${preview}</div><div class="flex between"><p class="small muted">${h(w.nickname)}${w.mine?" · 내 작품":""}</p><span class="pill">${h(w.category)}</span></div><div class="tag-row">${(w.tools||"AI 활용").split(/[,·]/).map(x=>`<span class="tool-tag">${h(x.trim())}</span>`).join("")}</div><p class="detail-description">${h(w.description)}</p><h3 style="font-size:14px">첨부 파일 <span class="muted">${w.files?.length||0}</span></h3>
 ${(w.files||[]).map(f=>`<div class="file-row">${icon(categoryIcon(w.category))}<div class="file-info"><strong>${h(f.name)}</strong><small>${bytes(f.size)}</small></div><button class="btn btn-small" data-action="download" data-id="${h(f.id)}">${icon("download","small-icon")} 다운로드</button></div>`).join("")}
 <p class="hint" style="margin-top:13px">PPT·PDF는 내려받아 확인해 주세요.</p>
 <div class="modal-footer"><button class="btn" data-action="share" data-id="${h(id)}">${icon("share","small-icon")} 작품 링크 복사</button><button class="btn btn-primary" data-action="close-modal">확인</button></div>`);
 if(portal==="member")api(`/api/works/${id}/view`,{method:"POST"}).then(()=>refresh()).catch(()=>{});
}
async function downloadFile(id){
 const f=boot.works.flatMap(w=>w.files||[]).find(f=>f.id===id);if(!f)return;
 const a=document.createElement("a");a.href=`/api/files/${id}?download=1`;a.download=f.name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
}

function contestSchedule(){
 const c=boot.settings;
 modal("공모전 일정",`<p class="modal-intro">모든 일정은 한국시간(KST) 기준이며, 관리자가 설정한 운영 일정입니다.</p><div class="schedule-modal">
 ${[
 ["calendar","제작물 제출마감",fmtDate(c.submissionDeadline)],
 ["ballot","우수 작품 투표 시작",fmtDate(c.voteStart)],
 ["clock","우수 작품 투표 마감",fmtDate(c.voteEnd)],
 ["check","1인당 선정 작품 수",`정확히 ${c.voteCount}개`]
 ].map(([ic,t,v])=>`<div class="schedule-row">${icon(ic)}<div><strong>${t}</strong><b>${v}</b></div></div>`).join("")}</div><p class="hint" style="margin-top:18px">투표 기간에만 우수 작품 선정 버튼이 열립니다. 좋아요는 투표에 포함되지 않습니다.</p><div class="modal-footer"><button class="btn btn-primary" data-action="close-modal">확인</button></div>`);
}
function contestGuide(){
 modal("AI 서비스 참여 안내",`<div class="guide-step"><b>01</b><div><h3>나의 AI 활용 결과물을 준비해요</h3><p>PPT, 이미지, 영상, 업무 개선 사례 등 동료에게 보여줄 수 있는 제작물을 준비해 주세요.</p></div></div>
 <div class="guide-step"><b>02</b><div><h3>어떤 문제를 해결했는지 알려주세요</h3><p>작품명, 유형, 활용 도구와 설명을 입력하고 파일을 첨부하면 됩니다. 제작자는 현재 닉네임으로 표시됩니다.</p></div></div>
 <div class="guide-step"><b>03</b><div><h3>동료의 아이디어를 발견하고 응원해요</h3><p>좋아요는 언제든 응원하는 마음으로 눌러주세요. 우수 작품 투표는 정해진 기간에 별도로 참여합니다.</p></div></div>
 <div class="privacy">${h(boot.settings.uploadGuide)}<br>첨부는 최대 5개, 파일당 50MB, 총 100MB까지 가능합니다. 업무자동화 작품은 설명 자료 또는 시연 영상으로 제출해 주세요.</div>
 <div class="modal-footer"><button class="btn" data-action="contest-schedule">일정 보기</button><button class="btn btn-primary" data-action="upload" ${computedPhase(boot.settings)!=="submitting"||!boot.settings.uploadsEnabled?"disabled":""}>나만의 AI 서비스 신청하기</button></div>`);
}

function validateUpload(files){
 const ext=/\.(ppt|pptx|pdf|png|jpe?g|gif|webp|mp4|webm|mov)$/i;
 if(!files.length||files.length>5)fail("file_required");
 if(files.some(f=>!ext.test(f.name)||f.size===0))fail("invalid_file");
 if(files.some(f=>f.size>50*1024*1024))fail("file_too_large");
 if(files.reduce((s,f)=>s+f.size,0)>100*1024*1024)fail("total_too_large");
}
function renderPendingFiles(){
 $("#pending-files").innerHTML=pendingFiles.map((f,i)=>`<div class="file-row">${icon("page")}<div class="file-info"><strong>${h(f.name)}</strong><small>${bytes(f.size)}</small></div><button type="button" class="btn-icon" data-action="remove-file" data-index="${i}" aria-label="첨부 삭제">${icon("close")}</button></div>`).join("");
}
async function cleanTemp(){
 for(const f of tempUploaded){try{await api(`/api/staged/${f.id}`,{method:"DELETE"});}catch{}}
 tempUploaded=[];
}
function openUpload(){
 if(computedPhase(boot.settings)!=="submitting"||!boot.settings.uploadsEnabled){toast(ERR.submissions_closed);return;}
 pendingFiles=[];tempUploaded=[];
 modal("나만의 AI 서비스 신청하기",`<p class="modal-intro">업무에 도움이 된 AI 활용 사례를 나눠 주세요.<br>제작자는 현재 닉네임 <strong>${h(myNickname||"")}</strong>으로 표시됩니다.</p>
 <form id="upload-form" class="stack">
 <div class="field"><label for="u-title">작품명 *</label><input id="u-title" name="title" placeholder="예: 회의록에서 실행과제 바로 뽑기" minlength="2" maxlength="90" required></div>
 <div class="field"><label for="u-category">작품 유형 *</label><select id="u-category" name="category">${["PPT","이미지","영상","업무자동화","기타"].map(x=>`<option>${x}</option>`).join("")}</select></div>
 <div class="field"><label for="u-tools">활용한 AI 도구</label><input id="u-tools" name="tools" maxlength="150" placeholder="예: ChatGPT, Claude"></div>
 <div class="field"><label for="u-description">작품 설명 *</label><textarea id="u-description" name="description" minlength="10" maxlength="5000" placeholder="해결하려던 문제, AI 활용 방법, 동료가 활용할 수 있는 점을 적어 주세요." required></textarea></div>
 <div><div class="field-label" style="margin-bottom:8px">파일 첨부 *</div><div class="upload-zone" id="upload-zone">${icon("upload")}<p>파일을 끌어 놓거나 아래에서 선택하세요</p><span class="hint">PPT · PDF · 이미지 · 영상 / 최대 5개, 각 50MB, 총 100MB</span><input id="u-files" type="file" multiple accept=".ppt,.pptx,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov" aria-label="제작물 파일 선택"></div><div id="pending-files"></div></div>
 <div class="privacy">${h(boot.settings.uploadGuide)}</div>
 <label class="check"><input type="checkbox" id="u-consent" required><span>닉네임과 제출 정보가 운영을 위해 저장되며, 작품에 개인정보·고객정보·내부 기밀이 포함되지 않았음을 확인합니다.</span></label>
 <div id="upload-error" class="error" role="alert"></div><div id="upload-progress" class="upload-progress" aria-live="polite"></div>
 <div class="modal-footer"><button type="button" class="btn" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary">제작물 제출하기 ${icon("arrow","small-icon")}</button></div></form>`);
 const setFiles=files=>{try{validateUpload(files);pendingFiles=files;$("#upload-error").textContent="";renderPendingFiles();}catch(e){setError($("#upload-error"),e);}};
 $("#u-files").addEventListener("change",e=>setFiles([...e.target.files]));
 const zone=$("#upload-zone");
 zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragover");});
 zone.addEventListener("dragleave",()=>zone.classList.remove("dragover"));
 zone.addEventListener("drop",e=>{e.preventDefault();zone.classList.remove("dragover");setFiles([...e.dataTransfer.files]);});
 $("#upload-form").addEventListener("submit",submitUpload);
}
async function submitUpload(e){
 e.preventDefault();const form=e.currentTarget,button=$('button[type=submit]',form),error=$("#upload-error");error.textContent="";
 try{
 validateUpload(pendingFiles);
 const d=Object.fromEntries(new FormData(form));d.consent=$("#u-consent").checked;
 if(d.title.trim().length<2||d.description.trim().length<10)fail("invalid_input");
 uploadBusy=true;button.disabled=true;button.textContent="제작물을 저장하고 있습니다";
 await cleanTemp();
 for(let i=0;i<pendingFiles.length;i++){
  const file=pendingFiles[i];
  const progress=f=>{const el=$("#upload-progress");if(el)el.innerHTML=`${i+1} / ${pendingFiles.length} 파일 업로드 중 · ${Math.round(f*100)}%<progress value="${f}" max="1"></progress>`;};
  progress(0);const f=await uploadOne(file,progress);tempUploaded.push(f);
 }
 d.fileIds=tempUploaded.map(f=>f.id);
 const result=await api("/api/works",{method:"POST",data:d});tempUploaded=[];uploadBusy=false;closeModal();await refresh();window.HanaStory?.gallery();
 toast(result.pending?"제작물이 접수되었습니다. 관리자 승인 후 작품 목록에 표시됩니다.":"제작물이 등록되었습니다.");
 }catch(err){uploadBusy=false;await cleanTemp();setError(error,err);if($("#upload-progress"))$("#upload-progress").textContent="";button.disabled=false;button.textContent="제작물 제출하기";}
}
function openVote(){
 if(boot.voted||computedPhase(boot.settings)!=="voting"){toast(boot.voted?ERR.already_voted:ERR.voting_closed);return;}
 if(selected.size!==boot.settings.voteCount){toast(ERR.selection_count);return;}
 const ids=[...selected];
 modal("우수 작품 투표",`<p class="modal-intro">선정한 <strong>${ids.length}개 작품</strong>을 확인해 주세요.<br>제출 후에는 투표 수정·취소·재투표가 불가능합니다.</p>
 <div class="vote-summary">${ids.map((id,i)=>`<p><b>${i+1}</b>${h(boot.works.find(w=>w.id===id)?.title)}</p>`).join("")}</div>
 <form id="vote-form" class="stack">
 <div class="privacy">계정당 1회만 투표할 수 있습니다. 로그아웃 후 다른 기기에서 같은 계정으로 재투표해도 서버가 차단합니다.</div>
 <label class="check"><input id="v-consent" type="checkbox" required><span>선택한 작품으로 1회 투표를 제출하는 것에 동의합니다.</span></label>
 <div id="vote-error" class="error" role="alert"></div><div class="modal-footer"><button type="button" class="btn" data-action="close-modal">선정 다시 보기</button><button type="submit" class="btn btn-primary">최종 투표 제출 ${icon("check","small-icon")}</button></div></form>`);
 $("#vote-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;$("#vote-error").textContent="";
  try{
   await api("/api/votes",{method:"POST",data:{workIds:ids,consent:$("#v-consent").checked}});selected.clear();await loadBoot();renderParticipantDynamic();renderWorks();
   modal("투표 완료",`<div class="completed"><div class="completed-mark">${icon("check")}</div><h2>소중한 한 표, 감사합니다.</h2><p>선정한 ${ids.length}개 작품에 투표가 완료되었습니다.<br>같은 계정으로는 다시 투표할 수 없습니다.</p><button class="btn btn-primary" data-action="close-modal">작품 계속 둘러보기</button></div>`);
  }catch(err){setError($("#vote-error"),err);btn.disabled=false;}
 });
}

/* ── 관리자 화면 ── */
const ADMIN_TABS=[
["overview","grid","운영 현황"],["settings","calendar","접수·투표 설정"],["works","folder","출품작 관리"],["participants","users","참여자 데이터"],["page","page","페이지 관리"]
];
function adminNav(mobile=false){return `<nav class="${mobile?"admin-mobile-nav":"sidebar-nav"}" aria-label="관리 메뉴">${ADMIN_TABS.map(([id,ic,label])=>`<button data-action="admin-tab" data-tab="${id}" class="${activeTab===id?"active":""}" ${activeTab===id?'aria-current="page"':""}>${mobile?"":icon(ic)}${label}</button>`).join("")}</nav>`;}
function renderAdmin(){
 $("#app").innerHTML=`<div class="admin-shell"><aside class="admin-sidebar">${logo(true)}<div class="sidebar-section">CONTEST MANAGEMENT</div>${adminNav()}<div class="sidebar-bottom"><button class="btn-text" data-action="switch-portal">${icon("arrow","small-icon")} 참여자 페이지</button><p>접수·투표·참여자 정보를<br>안전하게 관리하세요.</p></div></aside><div class="admin-content"><header class="admin-top"><strong>AI 공모전 관리자</strong><div class="row-actions"><span class="pill pill-green">${icon("shield","small-icon")} 관리자 전용</span><button class="btn-text" data-action="logout">${icon("logout","small-icon")} 로그아웃</button></div></header>${adminNav(true)}<main class="admin-main" id="main"></main></div></div>`;
 renderAdminContent();
}
function adminHeading(title,desc,extra=""){return `<div class="admin-heading"><div><h1>${title}</h1><p>${desc}</p></div>${extra}</div>`;}
function renderAdminContent(){
 if(!boot||portal!=="admin")return;
 $$('.sidebar-nav button,.admin-mobile-nav button').forEach(b=>b.classList.toggle("active",b.dataset.tab===activeTab));
 if(activeTab==="overview")renderOverview();
 if(activeTab==="settings")renderSettings();
 if(activeTab==="works")renderAdminWorks();
 if(activeTab==="participants")renderParticipants();
 if(activeTab==="page")renderPageSettings();
}
function renderOverview(){
 const cfg=boot.settings,stats=[[boot.works.length,"접수된 작품","folder","건"],[boot.participants.length,"참여자 계정","users","명"],[boot.ballots.length,"투표 완료","ballot","명"],[boot.works.reduce((n,w)=>n+w.likes,0),"작품 좋아요","heart","개"]];
 const ranked=[...boot.works].sort((a,b)=>b.votes-a.votes).slice(0,5),max=Math.max(1,...ranked.map(w=>w.votes));
 $("#main").innerHTML=adminHeading("공모전 운영 현황","접수부터 우수 작품 투표까지, 한곳에서 관리하세요.",`<span class="pill ${boot.phase==="voting"?"pill-vote":"pill-green"}">${icon("clock","small-icon")} ${phaseName(boot.phase)}</span>`)+
 `<div class="stat-grid">${stats.map(([n,label,ic,u])=>`<div class="stat-card"><div class="stat-card-label">${label}${icon(ic)}</div><strong>${n}</strong><small>${u}</small></div>`).join("")}</div>
 <div class="admin-panels"><section class="panel"><div class="panel-head"><h2>접수·투표 일정</h2><button class="btn-text small" data-action="admin-tab" data-tab="settings">설정 변경 ${icon("arrow","small-icon")}</button></div>
 ${[["calendar","제작물 제출마감",fmtDate(cfg.submissionDeadline)],["ballot","투표 기간",fmtDate(cfg.voteStart)+" ~ "+fmtDate(cfg.voteEnd)],["check","1인당 선정 작품 수",`정확히 ${cfg.voteCount}개`]].map(([ic,l,v])=>`<div class="schedule-row">${icon(ic)}<div><strong>${l}</strong><b>${v}</b></div></div>`).join("")}</section>
 <section class="panel"><div class="panel-head"><h2>작품별 투표 현황</h2><button class="btn-text small" data-action="export" data-kind="results">${icon("download","small-icon")} 결과 내보내기</button></div>
 ${boot.ballots.length?ranked.map(w=>`<div class="rank-row"><div class="rank-label"><span>${h(w.title)}</span><strong>${w.votes}표</strong></div><div class="rank-bar"><i style="width:${w.votes/max*100}%"></i></div></div>`).join(""):`<div class="rank-empty">${icon("ballot")}<p style="margin-top:12px">아직 접수된 투표가 없습니다.</p><p class="tiny">좋아요 수와 투표 수는 별도로 집계합니다.</p></div>`}</section></div>
 <section class="panel"><div class="panel-head"><h2>최근 운영 기록</h2><button class="btn-text small" data-action="refresh">${icon("refresh","small-icon")} 새로고침</button></div>
 <div class="table-wrap"><table><thead><tr><th>활동</th><th>내용</th><th>일시 · 한국시간</th></tr></thead><tbody>${boot.audit.slice(0,7).map(a=>`<tr><td>${h(a.action)}</td><td>${h(a.detail)}</td><td class="audit-time">${fmtDate(a.created)}</td></tr>`).join("")||'<tr><td colspan="3" class="text-empty">아직 운영 기록이 없습니다.</td></tr>'}</tbody></table></div></section>
 <div class="admin-callout">${icon("shield","small-icon")} 참여자는 닉네임으로만 식별됩니다. 닉네임↔실명 매핑은 어디에도 저장되지 않습니다.</div>`;
}
function renderSettings(){
 const c=boot.settings,locked=boot.ballots.length>0;
 $("#main").innerHTML=adminHeading("접수·투표 설정","설정한 한국시간(KST)을 기준으로 참여자 화면이 자동 전환됩니다.")+
 `<form id="settings-form" class="admin-section">
 <section class="form-section"><h2>제작물 접수</h2><p>제출마감 시간이 지나면 참여자 업로드가 자동으로 중지됩니다.</p><div class="field"><label for="s-deadline">제작물 제출마감 *</label><input id="s-deadline" type="datetime-local" value="${dateInput(c.submissionDeadline)}" ${locked?"disabled":""} required></div>
 <div class="setting-checks"><label class="check"><input id="s-enabled" type="checkbox" ${c.uploadsEnabled?"checked":""}><span>제작물 업로드 허용<small>마감 이전에도 접수를 일시 중지할 수 있습니다.</small></span></label><label class="check"><input id="s-approval" type="checkbox" ${c.requireApproval?"checked":""}><span>관리자 승인 후 작품 공개<small>새 제출물은 숨김 상태로 접수됩니다. 기존 공개 작품에는 영향을 주지 않습니다.</small></span></label></div></section>
 <section class="form-section"><h2>우수 작품 투표</h2><p>투표 기간에만 작품 선정 버튼과 최종 투표 제출 창이 열립니다.</p><div class="form-grid"><div class="field"><label for="s-start">투표 시작 *</label><input id="s-start" type="datetime-local" value="${dateInput(c.voteStart)}" ${locked?"disabled":""} required></div><div class="field"><label for="s-end">투표 마감 *</label><input id="s-end" type="datetime-local" value="${dateInput(c.voteEnd)}" required></div></div>
 <div class="field" style="margin-top:20px;max-width:320px"><label for="s-count">1인당 선정 작품 수 *</label><input id="s-count" type="number" min="1" max="20" value="${c.voteCount}" ${locked?"disabled":""} required><p class="hint">정확히 이 개수를 선택해야 투표할 수 있습니다. 최대 20개입니다.</p></div>
 <div class="admin-callout">${locked?"이미 투표가 접수되어 제출마감·투표시작·선정 개수는 잠겼습니다. 투표마감은 연장만 가능합니다.":"제출마감은 투표시작보다 늦을 수 없습니다. 투표가 1건이라도 접수되면 투표 기준은 변경할 수 없습니다."}<br>같은 계정의 재투표는 다른 기기에서도 서버에서 차단합니다.</div></section>
 <div id="settings-error" class="error" role="alert" style="margin-bottom:15px"></div><div class="save-row"><p>참여자 화면에는 자동 갱신으로 반영됩니다. 서버 버전은 최대 약 60초 간격으로 갱신합니다.</p><button type="submit" class="btn btn-primary">${icon("check","small-icon")} 운영 설정 저장</button></div></form>`;
 $("#settings-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  const data={version:c.version,submissionDeadline:locked?c.submissionDeadline:kstValue($("#s-deadline").value),voteStart:locked?c.voteStart:kstValue($("#s-start").value),voteEnd:kstValue($("#s-end").value),voteCount:Number($("#s-count").value),uploadsEnabled:$("#s-enabled").checked,requireApproval:$("#s-approval").checked};
  try{await api("/api/admin/settings",{method:"PATCH",data});await refresh();toast("접수·투표 설정이 저장되었습니다.");}
  catch(err){setError($("#settings-error"),err);btn.disabled=false;}
 });
}
function renderAdminWorks(){
 $("#main").innerHTML=adminHeading("출품작 관리","공개 작품만 참여자 목록과 우수 작품 투표에 표시됩니다.",`<button class="btn" data-action="export" data-kind="results">${icon("download","small-icon")} 작품·득표 CSV</button>`)+
 `<div class="table-tools"><div class="search-input">${icon("search")}<input type="search" id="admin-work-search" aria-label="출품작 검색" placeholder="작품명, 닉네임 검색"></div><p class="small muted">전체 ${boot.works.length}건 · 공개 ${boot.works.filter(w=>w.visible).length}건</p></div><div class="table-wrap"><table><thead><tr><th>작품</th><th>상태</th><th>좋아요</th><th>투표</th><th>관리</th></tr></thead><tbody id="admin-work-rows"></tbody></table></div>
 <div class="admin-callout">투표 기간이거나 투표가 접수된 후에는 작품 숨김·공개·삭제가 잠깁니다. 삭제는 목록에서 제외하는 처리이며, 원본 데이터는 보관됩니다.</div>`;
 const render=q=>{$("#admin-work-rows").innerHTML=boot.works.filter(w=>[w.title,w.nickname].join(" ").toLowerCase().includes(q.toLowerCase())).map(w=>`<tr><td><div class="work-cell"><span class="tiny-cover">${icon(categoryIcon(w.category))}</span><button data-action="detail" data-id="${h(w.id)}">${h(w.title)}<small>${h(w.nickname)} · ${h(w.category)}</small></button></div></td><td><span class="pill ${w.visible?"pill-green":""}">${w.visible?"공개":"승인 대기 / 숨김"}</span></td><td>${w.likes}</td><td><strong>${w.votes}</strong></td><td><div class="table-actions"><button class="btn btn-small" data-action="moderate" data-command="${w.visible?"hide":"show"}" data-id="${h(w.id)}" ${boot.ballots.length||boot.phase==="voting"?"disabled":""}>${w.visible?"숨김":"공개"}</button><button class="btn btn-small btn-danger" data-action="moderate" data-command="delete" data-id="${h(w.id)}" ${boot.ballots.length||boot.phase==="voting"?"disabled":""}>삭제</button></div></td></tr>`).join("")||'<tr><td colspan="5" class="text-empty">표시할 작품이 없습니다.</td></tr>';};
 render("");$("#admin-work-search").addEventListener("input",e=>render(e.target.value));
}
function renderParticipants(){
 $("#main").innerHTML=adminHeading("참여자 데이터","닉네임 계정의 제출·투표 참여 이력을 확인합니다.",`<button class="btn" data-action="export" data-kind="participants">${icon("download","small-icon")} 참여자 CSV</button>`)+
 `<div class="table-tools"><div class="search-input">${icon("search")}<input type="search" id="people-search" aria-label="참여자 검색" placeholder="닉네임으로 검색"></div><p class="small muted">참여자 ${boot.participants.length}명 · 투표 완료 ${boot.ballots.length}명</p></div>
 <div class="table-wrap"><table><thead><tr><th>닉네임</th><th>가입시각 · KST</th><th>제출 작품</th><th>투표 참여</th><th>투표 일시 · KST</th><th>상태</th><th>관리</th></tr></thead><tbody id="people-rows"></tbody></table></div>
 <div class="admin-callout">${icon("lock","small-icon")} 닉네임↔실명 매핑은 어디에도 저장되지 않습니다. 닉네임 변경·복구코드 재발급·차단은 즉시 적용되며 기존 표·작품에는 영향이 없습니다.</div>`;
 const render=q=>{$("#people-rows").innerHTML=boot.participants.filter(p=>p.nickname.toLowerCase().includes(q.toLowerCase())).map(p=>`<tr><td><strong>${h(p.nickname)}</strong></td><td class="audit-time">${fmtDate(p.created)}</td><td>${p.uploads}건</td><td><span class="pill ${p.voted?"pill-green":""}">${p.voted?"투표 완료":"미참여"}</span></td><td class="audit-time">${p.votedAt?fmtDate(p.votedAt):"—"}</td><td><span class="pill ${p.status==="blocked"?"pill-red":"pill-green"}">${p.status==="blocked"?"차단":"활성"}</span></td><td><div class="table-actions"><button class="btn btn-small" data-action="participant-rename" data-id="${h(p.id)}" data-nickname="${h(p.nickname)}">닉네임 변경</button><button class="btn btn-small" data-action="participant-reset" data-id="${h(p.id)}" data-nickname="${h(p.nickname)}">복구코드 재발급</button><button class="btn btn-small ${p.status==="blocked"?"":"btn-danger"}" data-action="participant-toggle-block" data-id="${h(p.id)}" data-blocked="${p.status==="blocked"}">${p.status==="blocked"?"차단 해제":"차단"}</button></div></td></tr>`).join("")||'<tr><td colspan="7" class="text-empty">표시할 참여자가 없습니다.</td></tr>';};
 render("");$("#people-search").addEventListener("input",e=>render(e.target.value));
}
function renderPageSettings(){
 const c=boot.settings;
 $("#main").innerHTML=adminHeading("페이지 관리","참여자에게 보이는 문구와 접속 비밀번호를 관리합니다.")+
 `<div class="admin-section"><form id="page-form"><section class="form-section"><h2>페이지 문구</h2><p>저장 후 참여자 화면에 반영됩니다. HTML 태그 없이 일반 문구로 표시됩니다.</p><div class="stack">
 ${[["siteName","사이트 이름",c.siteName,180],["welcome","입장 환영 문구",c.welcome,180],["description","작품 목록 소개",c.description,180],["notice","참여자 공지",c.notice,500],["uploadGuide","업로드 주의사항",c.uploadGuide,500]].map(([key,label,val,max])=>`<div class="field"><label for="p-${key}">${label}</label>${max>180?`<textarea id="p-${key}" name="${key}" maxlength="${max}">${h(val)}</textarea>`:`<input id="p-${key}" name="${key}" value="${h(val)}" maxlength="${max}" ${["siteName","welcome"].includes(key)?"required":""}>`}</div>`).join("")}</div>
 ${window.HanaStory?window.HanaStory.adminFields(c):""}
 <div id="page-error" class="error" role="alert" style="margin-top:18px"></div><div class="modal-footer"><button class="btn btn-primary" type="submit">페이지 문구 저장</button></div></section></form>
 <form id="password-form"><section class="form-section"><h2>접속 비밀번호 변경</h2><p>관리자 비밀번호는 대소문자를 구분합니다. 참여자 비밀번호는 구분하지 않습니다.</p><div class="stack"><div class="field"><label for="pw-role">변경 대상</label><select id="pw-role" name="role"><option value="member">참여자 공통 비밀번호</option><option value="admin">관리자 전용 비밀번호</option></select></div><div class="form-grid"><div class="field"><label for="pw-current">현재 관리자 비밀번호</label><input type="password" id="pw-current" name="currentAdminPassword" autocomplete="current-password" required></div><div class="field"><label for="pw-new">새 비밀번호 (10자 이상)</label><input type="password" id="pw-new" name="newPassword" autocomplete="new-password" minlength="10" maxlength="128" required></div></div></div><p class="hint" style="margin-top:12px">참여자 비밀번호를 변경하면 기존 참여자 접속이 종료됩니다. 관리자 비밀번호 변경 시 다른 관리자 접속이 종료됩니다.</p><div id="password-error" class="error" role="alert" style="margin-top:18px"></div><div class="modal-footer"><button class="btn" type="submit">${icon("lock","small-icon")} 비밀번호 변경</button></div></section></form></div>`;
 $("#page-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  try{const data=Object.fromEntries(new FormData(e.currentTarget));data.storyEnabled=$("#p-storyEnabled")?.checked!==false;data.version=c.version;await api("/api/admin/settings",{method:"PATCH",data});await refresh();toast("페이지 문구가 저장되었습니다.");}catch(err){setError($("#page-error"),err);btn.disabled=false;}
 });
 $("#password-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  try{await api("/api/admin/password",{method:"POST",data:Object.fromEntries(new FormData(e.currentTarget))});e.target.reset();toast("비밀번호가 변경되었습니다.");$("#password-error").textContent="";}catch(err){setError($("#password-error"),err);}finally{btn.disabled=false;}
 });
}
function participantRenamePrompt(id,current){
 modal("닉네임 변경",`<p class="modal-intro">현재 닉네임: <strong>${h(current)}</strong></p>
 <form id="rename-form" class="stack"><div class="field"><label for="rn-nickname">새 닉네임</label><input id="rn-nickname" minlength="2" maxlength="12" value="${h(current)}" required></div>
 <div id="rename-error" class="error" role="alert"></div><div class="modal-footer"><button type="button" class="btn" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary">변경</button></div></form>`);
 $("#rename-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;
  try{await api(`/api/admin/participants/${id}`,{method:"PATCH",data:{action:"rename",nickname:$("#rn-nickname").value.trim()}});closeModal();await refresh();toast("닉네임이 변경되었습니다.");}
  catch(err){setError($("#rename-error"),err);btn.disabled=false;}
 });
}
async function participantReset(id,nickname){
 try{
  const r=await api(`/api/admin/participants/${id}`,{method:"PATCH",data:{action:"reset_recovery"}});
  modal("복구코드 재발급",`<p class="modal-intro"><strong>${h(nickname)}</strong>님의 새 복구코드입니다. 이 코드는 지금 한 번만 표시됩니다.</p>
  <div class="field"><input value="${h(r.recoveryCode)}" readonly style="font-weight:800;letter-spacing:2px;text-align:center"></div>
  <div class="modal-footer"><button class="btn btn-primary" data-action="close-modal">확인</button></div>`);
 }catch(err){toast(errText(err));}
}

async function exportData(kind){
 const a=document.createElement("a");a.href="/api/admin/export/"+kind;a.download="";a.click();
}
document.addEventListener("click",async e=>{
 const el=e.target.closest("[data-action]");if(!el||el.disabled)return;
 const a=el.dataset.action,id=el.dataset.id;
 try{
  if(a==="switch-portal"){location.href=portal==="admin"?"/":"/admin";return;}
  if(a==="toggle-password"){const input=$("#login-password");const show=input.type==="password";input.type=show?"text":"password";el.setAttribute("aria-label",show?"비밀번호 숨기기":"비밀번호 표시");return;}
  if(a==="logout"){
   if(portal==="member"&&!confirm("로그아웃하면 복구코드가 있어야 다시 입장할 수 있습니다. 계속할까요?"))return;
   await api(rolePath("logout"),{method:"POST"});boot=null;csrf="";myNickname=null;selected.clear();renderLogin();return;
  }
  if(a==="logout-presetup"){await api("/api/logout",{method:"POST"});csrf="";renderLogin();return;}
  if(a==="go-recover"){renderRecovery();return;}
  if(a==="go-nickname"){renderNicknameSetup();return;}
  if(a==="copy-recovery"){try{await navigator.clipboard.writeText($("#recovery-code-value").value);toast("복구코드를 복사했습니다.");}catch{toast("복사에 실패했습니다. 직접 선택해 복사해 주세요.");}return;}
  if(a==="filter"){filter=el.dataset.value;$$(".chip").forEach(b=>b.setAttribute("aria-pressed",b.dataset.value===filter));renderWorks();return;}
  if(a==="story-intro"){window.HanaStory?.intro();return;}
  if(a==="story-gallery"){window.HanaStory?.gallery();return;}
  if(a==="story-motion"){window.HanaStory?.motion();return;}
  if(a==="story-chapter"){window.HanaStory?.chapter(el.dataset.chapter);return;}
  if(a==="story-apply"){openUpload();return;}
  if(a==="story-category"){openUpload();if($("#u-category"))$("#u-category").value=el.dataset.category;return;}
  if(a==="contest-schedule"){contestSchedule();return;}
  if(a==="contest-guide"){contestGuide();return;}
  if(a==="upload"){openUpload();return;}
  if(a==="close-modal"){if($("#upload-form")&&pendingFiles.length&&!confirm("작성 중인 업로드 화면을 닫을까요? 아직 제출되지 않았습니다."))return;closeModal();return;}
  if(a==="detail"){await openDetail(id);return;}
  if(a==="like"){el.disabled=true;try{await api(`/api/works/${id}/like`,{method:"POST"});await refresh();}finally{el.disabled=false;}return;}
  if(a==="select-vote"){if(selected.has(id))selected.delete(id);else if(selected.size<boot.settings.voteCount)selected.add(id);else{toast(ERR.selection_count);return;}renderWorks();return;}
  if(a==="open-vote"){openVote();return;}
  if(a==="remove-file"){if(uploadBusy)return;pendingFiles.splice(Number(el.dataset.index),1);renderPendingFiles();return;}
  if(a==="download"){await downloadFile(id);return;}
  if(a==="share"){
   const url=location.origin+"/#work-"+id;
   try{await navigator.clipboard.writeText(url);toast("작품 링크를 복사했습니다.");}catch{modal("작품 링크",`<p class="modal-intro">아래 주소를 복사해 주세요. 접속 시 참여자 비밀번호가 필요합니다.</p><div class="field"><input value="${h(url)}" readonly aria-label="작품 공유 링크"></div>`);}
   return;
  }
  if(a==="admin-tab"){activeTab=el.dataset.tab;await loadBoot();renderAdminContent();window.scrollTo({top:0,behavior:"auto"});return;}
  if(a==="refresh"){await refresh();toast("최신 데이터로 갱신했습니다.");return;}
  if(a==="export"){await exportData(el.dataset.kind);return;}
  if(a==="moderate"){
   const action=el.dataset.command;
   if(action==="delete"&&!confirm("이 작품을 목록에서 삭제할까요? 원본 데이터는 보관되며 화면에서는 사라집니다."))return;
   el.disabled=true;await api(`/api/admin/works/${id}`,{method:"PATCH",data:{action}});await refresh();toast("작품 상태가 변경되었습니다.");return;
  }
  if(a==="participant-rename"){participantRenamePrompt(id,el.dataset.nickname);return;}
  if(a==="participant-reset"){if(confirm(`${el.dataset.nickname}님의 복구코드를 재발급할까요? 기존 복구코드는 즉시 무효가 됩니다.`))await participantReset(id,el.dataset.nickname);return;}
  if(a==="participant-toggle-block"){
   const blocked=el.dataset.blocked==="true";
   if(!confirm(blocked?"차단을 해제할까요?":"이 계정을 차단할까요? 업로드·좋아요·투표·로그인이 모두 불가능해집니다."))return;
   await api(`/api/admin/participants/${id}`,{method:"PATCH",data:{action:blocked?"unblock":"block"}});await refresh();toast(blocked?"차단을 해제했습니다.":"계정을 차단했습니다.");return;
  }
 }catch(err){toast(errText(err));el.disabled=false;}
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&boot&&portal==="member")refresh();});
initialize();
})();
