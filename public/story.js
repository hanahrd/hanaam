/* Scroll-driven introduction. No external libraries or media requests. */
(() => {
"use strict";
const DEFAULTS = Object.freeze({
  storyEnabled: true,
  storyTitle1: "내가 만든 AI 서비스가\n하나증권의 기준이 된다면?",
  storyCaption1: "한 사람의 아이디어가, 모두의 일하는 방식을 바꿉니다.",
  storyTitle2: "지금은, 여러분의 상상력을\n마음껏 발휘할 시간입니다.",
  storyCaption2: "보고서 한 장부터 일하는 방식까지. 가능성의 크기는 여러분이 정합니다.",
  storyTitle3: "지금 바로,\n여러분의 AI 서비스를\n공개해주세요!",
  storyCaption3: "여러분의 새로운 시도를 하나증권 AI 마켓에서 만나고 싶습니다."
});
const esc = value => String(value ?? "").replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cfg = settings => ({...DEFAULTS, ...settings});
const lines = (text,scene=0) => String(text).split("\n").map((t,i) => {
 let safe=esc(t);
 const emph=scene===1?["하나증권의 기준"]:scene===2?["마음껏 발휘할 시간입니다."]:scene===3?["AI 서비스"]:[];
 emph.forEach(part=>safe=safe.replace(esc(part),`<em>${esc(part)}</em>`));
 return `<span class="story-line">${safe}</span>`;
}).join("");
const clamp = x => Math.min(1, Math.max(0,x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a));return t*t*(3-2*t); };
let instance = null;

function markup(settings, icon) {
 const s=cfg(settings);
 return `<section class="story-journey" id="story-journey" aria-label="AI 마켓 공모전 소개">
  <div class="story-stage">
   <div class="story-ground" aria-hidden="true"></div>
   <div class="story-gridlines" aria-hidden="true"></div>
   <div class="story-stage-top">
    <span class="story-top-label">YOUR IDEA, OUR NEXT STANDARD</span>
    <button class="story-motion" data-action="story-motion" aria-pressed="false" title="스크롤 효과를 끄고 모든 내용을 펼쳐 봅니다">${icon("eye","small-icon")} <span>모션 줄이기</span></button>
   </div>
   <section class="story-panel story-first" data-scene="0" aria-label="첫 번째 이야기: 가능성">
    <div class="story-copy">
     <p class="story-kicker"><span></span> 하나증권 AI 활용 공모전</p>
     <h1 class="story-heading" data-story-title="1">${lines(s.storyTitle1,1)}</h1>
     <p class="story-caption" data-story-caption="1">${esc(s.storyCaption1)}</p>
     <div class="hero-actions">
      <button class="hero-submit" data-action="story-apply">나만의 AI 서비스 신청하기 ${icon("arrow")}</button>
      <button class="hero-guide" data-action="contest-guide">참여 안내 ${icon("arrow","small-icon")}</button>
     </div>
     <div class="hero-benefits">
      <div>${icon("users")}<span><b>임직원 누구나</b><small>작은 시도도 환영해요</small></span></div>
      <div>${icon("spark")}<span><b>자유로운 아이디어</b><small>AI 활용 결과물을 나눠요</small></span></div>
      <div>${icon("heart")}<span><b>동료와 함께</b><small>발견하고, 응원하고, 연결해요</small></span></div>
     </div>
    </div>
    <div class="idea-visual" aria-hidden="true">
     <div class="visual-wash"></div>
     <div class="glass-orbit orbit-one"></div><div class="glass-orbit orbit-two"></div>
     <div class="browser-object">
      <div class="browser-bar"><span></span><span></span><span></span><i>MY NEXT IDEA</i></div>
      <div class="browser-body"><div class="browser-skeleton sk1"></div><div class="browser-skeleton sk2"></div><div class="browser-columns"><i></i><i></i><i></i></div><div class="browser-skeleton sk3"></div></div>
     </div>
     <div class="ai-token"><span>AI</span><small>나의 새로운 가능성</small><i>${icon("spark")}</i></div>
     <div class="chart-token"><span>더 나은 업무를 위한<br><b>당신의 아이디어</b></span><div class="chart-bars"><i></i><i></i><i></i><i></i></div></div>
     <div class="impact-chips"><span>${icon("check","small-icon")} 업무 효율화</span><span>${icon("check","small-icon")} 손님 경험 혁신</span><span>${icon("check","small-icon")} 새로운 가능성</span></div>
     <span class="red-sphere sphere-one"></span><span class="red-sphere sphere-two"></span>
     <span class="floating-spark">${icon("spark")}</span>
     <p class="visual-caption">당신의 AI로,<br><b>더 나은 금융의 내일을.</b></p>
    </div>
   </section>
   <section class="story-panel story-second" data-scene="1" aria-label="두 번째 이야기: 상상력">
    <div class="story-copy">
     <p class="story-kicker">IDEA TO IMPACT</p>
     <h2 class="story-heading" data-story-title="2">${lines(s.storyTitle2,2)}</h2>
     <p class="story-caption" data-story-caption="2">${esc(s.storyCaption2)}</p>
    </div>
    <p class="imagination-note">형식은 달라도,<br>중요한 건 <b>당신의 아이디어.</b><span></span></p>
    <div class="possibility-visual">
     <div class="possibility-path" aria-hidden="true"></div>
     ${[
      ["PPT","slide","아이디어 기획안, 서비스 제안서.\n생각을 한 장씩 펼쳐주세요.","ppt"],
      ["이미지","image","한 장의 이미지로 표현하는\n새로운 가능성을 보여주세요.","image"],
      ["영상","video","서비스 시연부터 소개 영상까지.\n생생한 장면으로 들려주세요.","video"],
      ["업무자동화","flow","반복을 줄이고, 일의 가치를 높이는\n나만의 업무 방식을 나눠주세요.","auto"]
     ].map(([title,ic,desc,key])=>`<button class="possibility-tile tile-${key}" data-action="story-category" data-category="${title}" aria-label="${title} 작품 신청하기"><span class="format-icon">${icon(ic)}</span><strong>${title}</strong><p>${desc.split("\n").map(esc).join("<br>")}</p><span class="format-arrow">${icon("arrow","small-icon")}</span></button>`).join("")}
    </div>
   </section>
   <section class="story-panel story-third" data-scene="2" aria-label="세 번째 이야기: 참여하기">
    <div class="invitation-rings" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="invitation-surface">
     <div class="invitation-swirl" aria-hidden="true"></div>
     <div class="story-copy">
      <p class="story-kicker">MAKE IT REAL</p>
      <h2 class="story-heading" data-story-title="3">${lines(s.storyTitle3,3)}</h2>
      <p class="story-caption" data-story-caption="3">${esc(s.storyCaption3)}</p>
      <div class="story-apply-area">
       <button class="story-apply" data-action="story-apply"><span>나만의 AI 서비스 신청하기</span><span class="apply-arrow">${icon("arrow")}</span></button>
       <p class="story-apply-note">PPT · 이미지 · 영상 · 업무자동화 등 제작물을 첨부해 주세요.</p>
       <button class="story-gallery-link" data-action="story-gallery">동료의 작품 먼저 둘러보기 ${icon("arrow","small-icon")}</button>
      </div>
     </div>
     <div class="invitation-visual" aria-hidden="true">
      <div class="message-sheet"><div>${icon("check")} 더 스마트한 업무 환경</div><div>${icon("check")} 더 특별한 손님 경험</div><div>${icon("check")} AI로 만드는 새로운 금융</div></div>
      <div class="invitation-stamp"><span>당신의 AI가</span><br>만드는 변화가 시작됩니다.<i></i></div>
      <span class="red-sphere sphere-three"></span><span class="mint-pebble"></span>
     </div>
    </div>
   </section>
   <div class="story-stage-bottom">
    <div class="story-scroll-cue"><span class="scroll-cue-line"></span><span id="story-cue">스크롤하며 다음 가능성을 만나보세요</span></div>
    <nav class="story-chapters" aria-label="소개 장면 이동">
     <button data-action="story-chapter" data-chapter="0" aria-label="첫 번째 장면: 가능성" aria-current="step"><span>01</span><i><b></b></i><small>가능성</small></button>
     <button data-action="story-chapter" data-chapter="1" aria-label="두 번째 장면: 상상력"><span>02</span><i><b></b></i><small>상상력</small></button>
     <button data-action="story-chapter" data-chapter="2" aria-label="세 번째 장면: 참여"><span>03</span><i><b></b></i><small>참여</small></button>
    </nav>
   </div>
  </div>
 </section>`;
}
function adminFields(settings){
 const s=cfg(settings);
 return `<div class="story-admin-block"><h2>스크롤형 공모전 소개</h2><p>접수 기간에는 로그인 후 소개가 먼저 열립니다. 투표 기간에는 작품 목록을 바로 보여줍니다.</p>
 <label class="check"><input id="p-storyEnabled" type="checkbox" name="storyEnabled" ${s.storyEnabled?"checked":""}><span>스크롤형 소개 사용<small>끄면 기존처럼 작품 목록으로 바로 접속합니다.</small></span></label>
 <div class="story-admin-fields">${[1,2,3].map(n=>`<div class="story-admin-scene"><span class="story-admin-number">0${n}</span><div class="stack">
 <div class="field"><label for="p-storyTitle${n}">${["가능성을 묻는 첫 문구","상상력을 여는 두 번째 문구","참여를 요청하는 마지막 문구"][n-1]}</label><textarea id="p-storyTitle${n}" name="storyTitle${n}" maxlength="140" rows="3" required>${esc(s["storyTitle"+n])}</textarea><small class="hint">줄바꿈이 화면에 반영됩니다. 2~3줄의 짧은 문구를 권장합니다.</small></div>
 <div class="field"><label for="p-storyCaption${n}">보조 설명</label><input id="p-storyCaption${n}" name="storyCaption${n}" maxlength="180" value="${esc(s["storyCaption"+n])}"></div>
 </div></div>`).join("")}</div><p class="hint">마지막 ‘나만의 AI 서비스 신청하기’ 버튼은 기존 파일 업로드 신청 폼으로 연결됩니다. 제출마감 이후에는 신청할 수 없습니다.</p></div>`;
}

function mount(settings, phase) {
 destroy();
 const root=document.getElementById("story-journey"); if(!root)return;
 const header=document.querySelector(".top-sticky"),main=document.getElementById("main");
 const stage=root.querySelector(".story-stage"),panels=[...root.querySelectorAll(".story-panel")];
 const ground=root.querySelector(".story-ground"),gridlines=root.querySelector(".story-gridlines");
 const media=window.matchMedia("(prefers-reduced-motion: reduce)");
 const titles=[...root.querySelectorAll("[data-story-title]")],captions=[...root.querySelectorAll("[data-story-caption]")];
 let config=cfg(settings),currentPhase=phase,destroyed=false,raf=0,top=0,vh=0,range=1,index=-1;
 let key="",reduced=media.matches||window.innerHeight<580,collapsed=config.storyEnabled===false||phase!=="submitting"||/^#work-/.test(location.hash);
 let panelHeight=0;
 try{reduced ||= localStorage.getItem("hana_story_reduce_motion")==="1";}catch{}
 const abort=new AbortController();
 const scrollBehavior=()=>reduced?"instant":"smooth";
 const scrollNow=y=>window.scrollTo({top:Math.max(0,y),behavior:"instant"});
 function resize(){
  if(destroyed)return;
  if(window.innerHeight<580&&!reduced){reduced=true;applyMode();return;}
  const nextTop=header?.getBoundingClientRect().height||140;
  const nextVh=Math.max(260,window.innerHeight-nextTop);
  // Avoid recalculating the scroll distance when mobile browser chrome changes height.
  if(Math.abs(top-nextTop)>1 || Math.abs(vh-nextVh)>35 || !vh){
   top=nextTop;vh=nextVh;
   root.style.setProperty("--story-top",`${top}px`);
   root.style.setProperty("--story-vh",`${vh}px`);
   document.documentElement.style.setProperty("--market-sticky-height",`${top}px`);
   panelHeight=vh;
  }
  range=Math.max(1,root.offsetHeight-panelHeight);
  schedule();
 }
 function setActive(next){
  if(next===index)return;index=next;
  stage.dataset.active=String(next);
  panels.forEach((el,i)=>{el.inert=!reduced&&i!==next;el.setAttribute("aria-hidden",String(!reduced&&i!==next));});
  root.querySelectorAll(".story-chapters button").forEach((el,i)=>{
    if(i===next)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");
  });
  const cue=document.getElementById("story-cue");
  if(cue)cue.textContent=["스크롤하며 다음 가능성을 만나보세요","조금 더 내려, 여러분의 차례를 만나보세요","아래에서 동료의 작품도 만나보세요"][next];
 }
 function draw(){
  raf=0;if(destroyed||root.hidden||reduced)return;
  const rect=root.getBoundingClientRect();
  const p=clamp((top-rect.top)/range);
  const a0=1-smooth(.255,.330,p);
  const a1=smooth(.255,.330,p)*(1-smooth(.620,.695,p));
  const a2=smooth(.620,.695,p);
  const op=[a0,a1,a2];
  panels.forEach((el,i)=>{
   el.style.opacity=op[i].toFixed(3);
   el.style.pointerEvents=op[i]>.85?"auto":"none";
  });
  panels[0].querySelector(".story-copy").style.transform=`translateY(${-28*smooth(.07,.29,p)}px) scale(${1+.055*smooth(.07,.29,p)})`;
  panels[0].querySelector(".idea-visual").style.transform=`translateY(${18-42*smooth(0,.29,p)}px) scale(${.94+.12*smooth(0,.28,p)})`;
  panels[1].querySelector(".story-copy").style.transform=`translateY(${(1-smooth(.30,.40,p))*45-smooth(.56,.66,p)*35}px)`;
  panels[1].querySelector(".possibility-visual").style.transform=`scale(${.85+.2*smooth(.31,.60,p)}) rotate(${(1-smooth(.34,.62,p))*-5}deg)`;
  panels[2].querySelector(".story-copy").style.transform=`translateY(${(1-smooth(.67,.77,p))*40}px)`;
  const mint=smooth(.17,.37,p);
  stage.style.backgroundColor=`rgb(${252-21*mint},${254-8*mint},${253-10*mint})`;
  const t=smooth(.60,.70,p);
  ground.style.opacity=t.toFixed(3);
  gridlines.style.opacity=(.38*(1-t)).toFixed(3);
  stage.classList.toggle("story-dark",t>.68);
  const next=p<.2925?0:p<.6575?1:2;setActive(next);
  root.querySelectorAll(".story-chapters b").forEach((el,i)=>{
   const starts=[0,.2925,.6575],ends=[.2925,.6575,1];
   el.style.transform=`scaleX(${clamp((p-starts[i])/(ends[i]-starts[i])).toFixed(3)})`;
  });
  stage.style.setProperty("--invitation-scale",(.83+.25*smooth(.66,1,p)).toFixed(3));
 }
 function schedule(){if(!raf&&!destroyed)raf=requestAnimationFrame(draw);}
 function applyMode(){
  root.classList.toggle("story-static",reduced);
  root.classList.toggle("is-enhanced",!reduced);
  panels.forEach(el=>{el.removeAttribute("style");el.inert=false;el.setAttribute("aria-hidden","false");el.querySelector(".story-copy")?.removeAttribute("style");});
  for(const el of root.querySelectorAll(".idea-visual,.possibility-visual"))el.removeAttribute("style");
  const b=root.querySelector(".story-motion");b.setAttribute("aria-pressed",String(reduced));b.querySelector("span").textContent=reduced?"스크롤 효과 켜기":"모션 줄이기";
  index=-1;resize();
 }
 function showGallery(focus=true){
  collapsed=true;root.hidden=true;
  document.body.classList.remove("story-playing");
  scrollNow(0);
  if(focus){main.setAttribute("tabindex","-1");main.focus({preventScroll:true});}
 }
 function showIntro(){
  if(config.storyEnabled===false)return;
  collapsed=false;root.hidden=false;document.body.classList.add("story-playing");
  scrollNow(0);resize();
  requestAnimationFrame(()=>{const el=root.querySelector(".story-heading");el.setAttribute("tabindex","-1");el.focus({preventScroll:true});});
 }
 function jump(n){
  if(collapsed)showIntro();
  if(reduced){panels[n]?.scrollIntoView({behavior:"instant",block:"start"});return;}
  const start=window.scrollY+root.getBoundingClientRect().top-top;
  window.scrollTo({top:Math.max(0,start+range*[0,.45,.86][n]),behavior:scrollBehavior()});
 }
 function toggleMotion(){
  const atGallery=collapsed;reduced=!reduced;
  try{localStorage.setItem("hana_story_reduce_motion",reduced?"1":"0");}catch{}
  applyMode();if(!atGallery)scrollNow(0);
 }
 function sync(settings,phase){
  const previous=currentPhase;config=cfg(settings);currentPhase=phase;
  const newKey=JSON.stringify([1,2,3].map(n=>[config["storyTitle"+n],config["storyCaption"+n]]));
  if(newKey!==key){
   titles.forEach((el,i)=>el.innerHTML=lines(config["storyTitle"+(i+1)],i+1));
   captions.forEach((el,i)=>el.textContent=config["storyCaption"+(i+1)]);
   key=newKey;
  }
  const apply=root.querySelector(".story-apply"),note=root.querySelector(".story-apply-note");
  const available=phase==="submitting"&&config.uploadsEnabled;
  apply.disabled=!available;
  root.querySelectorAll(".hero-submit,.possibility-tile").forEach(el=>{el.disabled=!available;});
  const headerApply=document.querySelector(".header-submit");
  if(headerApply){headerApply.disabled=!available;headerApply.textContent=available?"작품 신청하기":phase==="voting"?"투표 진행 중":"접수 마감";}
  apply.querySelector("span").textContent=available?"나만의 AI 서비스 신청하기":phase==="submitting"?"신청이 잠시 중지되었습니다":"AI 서비스 신청이 마감되었습니다";
  note.textContent=available?"PPT · 이미지 · 영상 · 업무자동화 등 제작물을 첨부해 주세요.":phase==="voting"?"지금은 투표 기간입니다. 동료의 작품을 둘러보고 우수 작품을 선정해 주세요.":phase==="submitting"?"관리자가 접수를 재개하면 신청할 수 있습니다.":"작품 목록에서 공모전 진행 상황을 확인해 주세요.";
  const introButton=document.querySelector('[data-action="story-intro"]');
  if(introButton)introButton.hidden=config.storyEnabled===false;
  if(config.storyEnabled===false||(previous==="submitting"&&phase!=="submitting"))showGallery(false);
 }
 root.hidden=collapsed;
 document.body.classList.add("story-edition");
 document.body.classList.toggle("story-playing",!collapsed);
 applyMode();sync(settings,phase);
 window.addEventListener("scroll",schedule,{passive:true,signal:abort.signal});
 window.addEventListener("resize",resize,{passive:true,signal:abort.signal});
 const observer=window.ResizeObserver?new ResizeObserver(resize):null;
 if(observer&&header)observer.observe(header);
 const onPreference=()=>{reduced=media.matches;applyMode();};
 media.addEventListener("change",onPreference);
 instance={showGallery,showIntro,jump,toggleMotion,sync,destroy(){
  destroyed=true;abort.abort();observer?.disconnect();media.removeEventListener("change",onPreference);
  cancelAnimationFrame(raf);document.body.classList.remove("story-edition","story-playing");
 }};
}
function destroy(){instance?.destroy();instance=null;}
window.HanaStory={
 DEFAULTS,markup,adminFields,mount,destroy,
 sync:(s,p)=>instance?.sync(s,p),gallery:()=>instance?.showGallery(),
 intro:()=>instance?.showIntro(),chapter:n=>instance?.jump(Math.min(2,Math.max(0,Number(n)||0))),
 motion:()=>instance?.toggleMotion()
};
})();

