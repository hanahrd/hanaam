/* Connect the owner's original typeface. No font bytes are embedded or distributed. */
(() => {
"use strict";
let active=null;
const fontName="Hana Rounded",key="rounded";
const storage=()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open("hana-market-design-font-v4",1);
 r.onupgradeneeded=()=>r.result.createObjectStore("fonts");
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
async function cached(buffer){
 const db=await storage();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("fonts",buffer?"readwrite":"readonly"),st=tx.objectStore("fonts");
  const r=buffer?st.put(buffer,key):st.get(key);let result;
  r.onsuccess=()=>result=r.result;
  tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};
 });
}
function updateButtons(){
 for(const b of document.querySelectorAll("[data-font-picker]")){
  const label=active?"머니그라피 적용됨":"머니그라피 서체 연결";
  if(b.textContent!==label)b.textContent=label;
  b.dataset.loaded=active?"true":"false";
  b.title=active?"다른 원본 파일을 선택하려면 클릭하세요.":"가지고 계신 Moneygraphy-1.1.zip 원본을 선택해 주세요.";
 }
}
function notify(message){
 document.querySelector(".font-helper")?.remove();
 const d=document.createElement("div");d.className="font-helper";d.setAttribute("role","status");
 const close=document.createElement("button");close.type="button";close.textContent="닫기";close.addEventListener("click",()=>d.remove());
 const title=document.createElement("strong");title.textContent="머니그라피 서체";
 const text=document.createElement("span");text.textContent=message;
 d.append(close,title,text);document.body.append(d);setTimeout(()=>d.remove(),9500);
}
async function load(buffer,save=false){
 const face=new FontFace(fontName,buffer,{weight:"400",style:"normal",display:"swap"});
 await face.load();document.fonts.add(face);if(active)document.fonts.delete(active);active=face;
 updateButtons();window.dispatchEvent(new Event("resize"));
 if(save)try{await cached(buffer);}catch{}
}
async function fromZip(buf){
 const v=new DataView(buf);let eocd=-1;
 for(let p=buf.byteLength-22;p>=Math.max(0,buf.byteLength-65557);p--)if(v.getUint32(p,true)===0x06054b50){eocd=p;break;}
 if(eocd<0)throw new Error("ZIP 파일을 읽지 못했습니다. 압축을 푼 뒤 Moneygraphy-Rounded.woff2를 선택해 주세요.");
 let pos=v.getUint32(eocd+16,true),entries=v.getUint16(eocd+10,true),chosen;
 for(let i=0;i<Math.min(entries,2000)&&pos+46<=buf.byteLength;i++){
  if(v.getUint32(pos,true)!==0x02014b50)break;
  const nl=v.getUint16(pos+28,true),xl=v.getUint16(pos+30,true),cl=v.getUint16(pos+32,true);
  const name=new TextDecoder().decode(new Uint8Array(buf,pos+46,nl));
  if(!name.startsWith("__MACOSX/") && /(?:^|\/)Moneygraphy-Rounded\.woff2$/i.test(name))
   chosen={flags:v.getUint16(pos+8,true),method:v.getUint16(pos+10,true),compressed:v.getUint32(pos+20,true),size:v.getUint32(pos+24,true),offset:v.getUint32(pos+42,true)};
  pos+=46+nl+xl+cl;
 }
 if(!chosen)throw new Error("Moneygraphy-Rounded.woff2가 포함된 원본 ZIP을 선택해 주세요.");
 if(chosen.size>5*1024*1024||chosen.flags&1)throw new Error("암호화된 ZIP 또는 너무 큰 글꼴은 지원하지 않습니다.");
 const p=chosen.offset;if(p+30>buf.byteLength||v.getUint32(p,true)!==0x04034b50)throw new Error("ZIP 파일이 손상되었습니다.");
 const start=p+30+v.getUint16(p+26,true)+v.getUint16(p+28,true);
 if(start+chosen.compressed>buf.byteLength)throw new Error("ZIP 파일이 손상되었습니다.");
 const raw=buf.slice(start,start+chosen.compressed);
 if(chosen.method===0)return raw;
 if(chosen.method!==8||typeof DecompressionStream==="undefined")throw new Error("이 브라우저에서는 ZIP 연결이 어렵습니다. 압축을 풀고 WOFF2 파일을 선택해 주세요.");
 let stream;
 try{stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));}catch{throw new Error("압축을 풀고 Moneygraphy-Rounded.woff2 파일을 선택해 주세요.");}
 const reader=stream.getReader(),parts=[];let total=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;
   total+=value.byteLength;if(total>5*1024*1024){await reader.cancel();throw new Error("글꼴 파일이 허용 크기를 초과했습니다.");}
   parts.push(value);
  }
 }finally{reader.releaseLock();}
 if(total!==chosen.size)throw new Error("ZIP 내부 파일을 확인해 주세요.");
 const result=new Uint8Array(total);let cursor=0;for(const part of parts){result.set(part,cursor);cursor+=part.byteLength;}
 return result.buffer;
}
async function attach(file){
 if(!file)return;
 try{
  if(file.size>20*1024*1024)throw new Error("20MB 이하의 원본 글꼴 ZIP 또는 WOFF2 파일을 선택해 주세요.");
  const raw=await file.arrayBuffer();
  if(!/\.(zip|woff2?|ttf|otf)$/i.test(file.name))throw new Error("ZIP 또는 원본 글꼴 파일을 선택해 주세요.");
  const buffer=/\.zip$/i.test(file.name)?await fromZip(raw):raw;
  await load(buffer,true);notify("원본 서체를 적용했습니다. 선택한 파일은 외부로 전송되지 않고 이 브라우저에서만 사용됩니다.");
 }catch(e){notify(e.message||"글꼴 연결에 실패했습니다. 원본 WOFF2 파일을 선택해 주세요.");}
}
async function init(){
 const input=document.createElement("input");input.type="file";input.id="font-chooser";
 input.accept=".zip,.woff2,.woff,.ttf,.otf";input.setAttribute("aria-label","머니그라피 원본 글꼴 연결");
 document.body.append(input);
 input.addEventListener("change",()=>{const f=input.files[0];input.value="";attach(f);});
 document.addEventListener("click",e=>{if(e.target.closest("[data-font-picker]"))input.click();});
 new MutationObserver(updateButtons).observe(document.getElementById("app"),{childList:true,subtree:true});
 try{
  // GET /api/design-font는 SSOT v1.2에서 삭제되었다. 정적 경로를 직접 확인하고 없으면 시스템 서체를 쓴다.
  if(location.protocol!=="file:"){
   const f=await fetch("/fonts/Moneygraphy-Rounded.woff2",{method:"GET"});
   if(f.ok){await load(await f.arrayBuffer());return;}
  }
 }catch{}
 try{const b=await cached();if(b){await load(b);return;}}catch{}
 try{
  const face=new FontFace(fontName,'local("Moneygraphy Rounded"), local("머니그라피 Rounded")',{weight:"400",display:"swap"});
  await face.load();document.fonts.add(face);active=face;updateButtons();window.dispatchEvent(new Event("resize"));
 }catch{}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

