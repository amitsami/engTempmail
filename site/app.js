'use strict';
const $=id=>document.getElementById(id);
const API_BASE=String(window.ENGTEMPMAIL_CONFIG?.apiBase||'').trim().replace(/\/+$/,'');
function apiUrl(route){if(!API_BASE||!/^https:\/\//.test(API_BASE))throw Error('Email service setup is required. Add your Cloudflare Worker HTTPS URL to site/config.js.');return API_BASE+route;}
let email='',messages=[],busy=false,activeAction='fetchInbox',statsRun=0,selectedKey='',selectedSignature='',renderRun=0,cooldownUntil=0,autoTimer;
const imagePermissions=new Set(),imageCache=new Map();
try{email=sessionStorage.getItem('engtempmail.address')||'';$('autoRefresh').checked=sessionStorage.getItem('engtempmail.autoRefresh')==='yes';}catch{}
let noticeTimer,noticeHideTimer,copyTimer;
function notice(text,success=false){
 clearTimeout(noticeTimer);clearTimeout(noticeHideTimer);const box=$('notice');
 if(!text){box.classList.remove('is-visible');noticeHideTimer=setTimeout(()=>{box.hidden=true;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);return;}
 $('noticeText').textContent=text;box.classList.toggle('success',success);box.hidden=false;requestAnimationFrame(()=>box.classList.add('is-visible'));if(success)noticeTimer=setTimeout(()=>notice(''),3600);
}
$('dismissNotice').addEventListener('click',()=>notice(''));
function sync(){
 $('email').textContent=email||'Create your first address';$('copy').disabled=!email||busy;$('fetchInbox').disabled=!email||busy;$('newAddress').disabled=busy;$('recoverButton').disabled=busy;
 for(const [id,label,working] of [['fetchInbox','Fetch inbox','Checking…'],['newAddress','+ New address','Creating…'],['recoverButton','Recover address','Opening…']]){const el=$(id),pending=busy&&activeAction===id;el.classList.toggle('pending',pending);el.setAttribute('aria-busy',String(pending));el.querySelector('.button-text').textContent=pending?working:label;}
 document.querySelector('.mail').classList.toggle('is-loading',busy&&activeAction==='fetchInbox');$('statusText').textContent=busy?'Working…':email?'Address ready':'Ready when you are';
}
function remember(value){email=value;try{sessionStorage.setItem('engtempmail.address',value);}catch{}sync();}
async function api(route,options={}){
 if(Date.now()<cooldownUntil)throw Error(`The provider asked us to wait. Retry in ${Math.ceil((cooldownUntil-Date.now())/1000)} seconds.`);
 const response=await fetch(apiUrl(route),{cache:'no-store',signal:AbortSignal.timeout(25000),...options});let data;
 try{data=await response.json();}catch{throw Error('Unexpected server response. Please try again.');}
 if(!response.ok){const retry=Number(response.headers.get('Retry-After'))||0;if(retry)cooldownUntil=Date.now()+Math.min(3600,retry)*1000;throw Error((data.error||'Request failed.')+(retry?` Try again in ${retry} seconds.`:''));}return data;
}
function params(){const q=new URLSearchParams({dot:$('dotSyntax').checked?'1':'0',plus:$('plusSyntax').checked?'1':'0'});if(!$('dotSyntax').checked&&!$('plusSyntax').checked)throw Error('Select at least one syntax: Dot or Plus.');if($('provider').value)q.set('providers',$('provider').value);return q.toString();}
function scheduleAuto(){clearTimeout(autoTimer);if(!$('autoRefresh').checked||!email||document.hidden)return;autoTimer=setTimeout(()=>run(()=>checkAddress(email),true),Math.max(30000,cooldownUntil-Date.now()+1000));}
async function run(fn,silent=false,action='fetchInbox'){if(busy)return;busy=true;activeAction=action;if(!silent)notice('');sync();try{await fn();}catch(e){notice(e.message||'Connection failed. Please try again.');}finally{busy=false;sync();scheduleAuto();}}
function empty(node,title,subtitle){node.replaceChildren();const div=document.createElement('div');div.className='empty';const strong=document.createElement('strong');strong.textContent=title;const p=document.createElement('p');p.textContent=subtitle;div.append(strong,p);node.append(div);}
function sender(msg){return typeof msg.from==='string'?msg.from:'Unknown sender';}
function messageKey(msg,index){return String(msg.id||`${msg.date||''}:${msg.subject||''}:${index}`);}
function clearImages(){for(const value of imageCache.values())if(value.url?.startsWith('blob:'))URL.revokeObjectURL(value.url);imageCache.clear();imagePermissions.clear();selectedKey='';selectedSignature='';renderRun++;}
function markSelection(index){document.querySelectorAll('.row').forEach(row=>{const active=Number(row.dataset.index)===index;row.classList.toggle('active',active);row.setAttribute('aria-pressed',String(active));});}
function renderList(){
 const counter=$('messageCount'),newCount=`${messages.length} message${messages.length===1?'':'s'}`;if(counter.textContent!==newCount)window.engMotion?.count(counter);counter.textContent=newCount;
 if(!messages.length){selectedKey='';selectedSignature='';renderRun++;empty($('messageList'),'No messages yet','Use Fetch inbox to check for new mail.');empty($('messagePreview'),'A quieter kind of inbox.','Select a message to read it here.');return;}
 const fragment=document.createDocumentFragment();
 messages.forEach((m,index)=>{
  const button=document.createElement('button');button.type='button';button.className='row';button.dataset.index=index;
  const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=sender(m).slice(0,1).toUpperCase();
  const content=document.createElement('span');content.className='rowcontent';const top=document.createElement('span');top.className='rowtop';
  const from=document.createElement('span');from.className='sender';from.textContent=m.subject||'(No subject)';
  const time=document.createElement('span');time.className='time';const d=new Date(m.date);time.textContent=Number.isNaN(d.getTime())?'':d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const subject=document.createElement('span');subject.className='subject';subject.textContent=sender(m);top.append(from,time);content.append(top,subject);button.append(avatar,content);button.addEventListener('click',()=>showMessage(index));fragment.append(button);
 });
 const scroll=$('messageList').scrollTop;$('messageList').replaceChildren(fragment);$('messageList').scrollTop=scroll;
 const match=messages.findIndex((m,i)=>messageKey(m,i)===selectedKey);showMessage(match>=0?match:0);
}
function safeUrl(raw,protocols=['https:','http:','mailto:']){try{const u=new URL(String(raw));return protocols.includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function safeEmailDocument(raw){
 if(!window.DOMPurify)throw Error('Email renderer could not load. Reload the page.');
 // A template is inert: sender images cannot fire tracking requests while we sanitize.
 const template=document.createElement('template');template.innerHTML=raw;
 for(const img of template.content.querySelectorAll('img')){img.setAttribute('data-email-src',img.getAttribute('src')||'');img.removeAttribute('src');img.removeAttribute('srcset');}
 const config={RETURN_DOM_FRAGMENT:true,ADD_TAGS:['style'],FORBID_TAGS:['script','iframe','object','embed','svg','math','form','input','button','textarea','select','option','meta','link','base','video','audio','source'],FORBID_ATTR:['srcdoc','srcset','ping','nonce','autofocus']};
 const fragment=DOMPurify.sanitize(template.content,config);const doc=document.implementation.createHTMLDocument('Email');doc.body.replaceChildren(fragment);
 // Full-document template parsing drops the body wrapper; safely retain its presentation attributes.
 const bodyMatch=raw.match(/<body\b([^>]*)>/i);if(bodyMatch){const holder=document.createElement('template');holder.innerHTML='<div '+bodyMatch[1]+'></div>';const clean=DOMPurify.sanitize(holder.content,config).firstElementChild;if(clean)for(const attr of ['style','bgcolor','dir'])if(clean.hasAttribute(attr))doc.body.setAttribute(attr,clean.getAttribute(attr));}
 for(const anchor of doc.querySelectorAll('a')){const href=safeUrl(anchor.getAttribute('href'));if(href){anchor.setAttribute('href',href);anchor.setAttribute('target','_blank');anchor.setAttribute('rel','noopener noreferrer');}else{anchor.removeAttribute('href');anchor.removeAttribute('target');}}
 return doc;
}
function attachmentUrl(msg,attachment){return apiUrl('/api/attachment?'+new URLSearchParams({email,messageId:String(msg.id),attachmentId:String(attachment.id),name:attachment.name||'attachment'}));}
async function inlineImage(msg,id){
 const key=`${email}:${msg.id}:${id}`;if(imageCache.has(key))return imageCache.get(key).promise;
 const attachment=(msg.attachments||[]).find(a=>String(a.id)===String(id));
 if(!attachment||!/^image\/(png|jpeg|gif|webp|avif)$/i.test(attachment.contentType||''))return null;
 const entry={url:null};entry.promise=(async()=>{const r=await fetch(attachmentUrl(msg,attachment),{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!r.ok)return null;const bytes=await r.arrayBuffer();if(bytes.byteLength>5*1024*1024||imageCache.get(key)!==entry)return null;entry.url=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>resolve(null);reader.readAsDataURL(new Blob([bytes],{type:attachment.contentType}));});return imageCache.get(key)===entry?entry.url:null;})().catch(()=>null);imageCache.set(key,entry);return entry.promise;
}
function frameMarkup(doc,token,remoteImages){
 const imagePolicy=remoteImages?"img-src https: http: data:;":"img-src data:;";
 const csp=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline' ${location.origin}; ${imagePolicy} font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';`;
 const heads=Array.from(doc.querySelectorAll('style')).map(el=>el.outerHTML).join('');
 const body=doc.querySelector('body')||doc;
 // The only executable script is our nonce-authorized sizing bridge. The sender's scripts/handlers are removed.
 const bridge=`(()=>{const send=()=>parent.postMessage({type:'engtempmail:resize',token:'${token}',height:Math.ceil(document.body.getBoundingClientRect().height+24)},'*');new ResizeObserver(send).observe(document.body);addEventListener('load',send);send();})();`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><link rel="stylesheet" href="${new URL('./email.css?v=20261013-mailfix',location.href).href}">${heads}</head>${body.outerHTML}<script nonce="${token}">${bridge}</script></html>`;
}
async function mountEmail(msg,index,container,ticket,loadRemote){
 const doc=safeEmailDocument(String(msg.body||''));const inlineJobs=[];let remoteCount=0;
 for(const img of doc.querySelectorAll('img')){
  const src=img.getAttribute('data-email-src')||'';img.removeAttribute('data-email-src');img.removeAttribute('loading');img.referrerPolicy='no-referrer';
  if(/^cid:/i.test(src)){const cid=src.slice(4).replace(/^<|>$/g,'');const id=msg.inlineCids?.[cid]||msg.inlineCids?.[src];img.removeAttribute('src');img.alt=img.alt||'Inline image';if(id&&inlineJobs.length<6)inlineJobs.push({img,id});}
  else if(/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(src)){img.src=src;}
  else {const url=safeUrl(src,['https:','http:']);if(url){remoteCount++;if(loadRemote)img.src=url;else{img.removeAttribute('src');img.alt=img.alt||'Image hidden — use Load images';}}else img.removeAttribute('src');}
 }
 const links=Array.from(doc.querySelectorAll('a[href]')).map(a=>({url:a.href,label:(a.textContent||a.getAttribute('title')||'Open link').trim()})).filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i);
 const toolbar=document.createElement('div');toolbar.className='email-toolbar';
 const caption=document.createElement('span');caption.textContent='Email links open in a new tab. Check the destination before signing in.';toolbar.append(caption);
 if(remoteCount&&!loadRemote){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Load images';b.title='Remote images can tell the sender that you opened this email.';b.addEventListener('click',()=>{imagePermissions.add(`${email}:${messageKey(msg,index)}`);selectedSignature='';showMessage(index);});toolbar.append(b);}
 container.append(toolbar);
 const frame=document.createElement('iframe');frame.className='mailframe';frame.title='Email message';frame.setAttribute('sandbox','allow-scripts allow-popups allow-popups-to-escape-sandbox');frame.referrerPolicy='no-referrer';frame.style.visibility='hidden';
 const token=Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('');
 const resize=event=>{if(ticket!==renderRun||!frame.isConnected){window.removeEventListener('message',resize);return;}if(event.source!==frame.contentWindow||event.data?.token!==token)return;if(event.data.type==='engtempmail:resize'){const height=Number(event.data.height);if(Number.isFinite(height)){frame.style.height=Math.max(220,Math.min(2400,height))+'px';requestAnimationFrame(()=>requestAnimationFrame(()=>{if(frame.isConnected)frame.style.visibility='visible';}));}}};
 window.addEventListener('message',resize);frame.addEventListener('load',()=>setTimeout(()=>{if(frame.isConnected&&ticket===renderRun)frame.style.visibility='visible';},500));frame.srcdoc=frameMarkup(doc,token,loadRemote);container.append(frame);
 if(links.length){const details=document.createElement('details');details.className='email-links';const summary=document.createElement('summary');summary.textContent=`Links in this email (${links.length})`;details.append(summary);for(const item of links){const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.label||'Open link';a.title=item.url;details.append(a);}container.append(details);}
 if(inlineJobs.length){await Promise.all(inlineJobs.map(async({img,id})=>{const url=await inlineImage(msg,id);if(url)img.src=url;}));if(ticket===renderRun&&frame.isConnected)frame.srcdoc=frameMarkup(doc,token,loadRemote);}
}
function showMessage(index){
 const msg=messages[index];if(!msg)return;markSelection(index);
 const key=messageKey(msg,index),loadRemote=imagePermissions.has(`${email}:${key}`),signature=JSON.stringify(msg)+'|'+loadRemote;
 if(selectedKey===key&&selectedSignature===signature)return;
 selectedKey=key;selectedSignature=signature;const ticket=++renderRun;
 const article=$('messagePreview');article.replaceChildren();const h=document.createElement('h3');h.textContent=msg.subject||'(No subject)';const from=document.createElement('div');from.className='from';const date=new Date(msg.date);from.textContent=`From: ${sender(msg)}${Number.isNaN(date.getTime())?'':' · '+date.toLocaleString()}`;
 const body=document.createElement('div');body.className='message';article.append(h,from,body);window.engMotion?.open(article);
 if(msg.bodyContentType==='html'){body.classList.add('html-message');mountEmail(msg,index,body,ticket,loadRemote).catch(e=>{if(ticket===renderRun)body.textContent=e.message;});}
 else {
  const text=String(msg.body||'No message content.');const matches=text.matchAll(/https?:\/\/[^\s<>]+/g);let last=0;
  for(const match of matches){body.append(document.createTextNode(text.slice(last,match.index)));const raw=match[0].replace(/[),.;!?]+$/,'');const href=safeUrl(raw,['https:','http:']);if(href){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=raw;body.append(a,document.createTextNode(match[0].slice(raw.length)));}else body.append(document.createTextNode(match[0]));last=match.index+match[0].length;}body.append(document.createTextNode(text.slice(last)));
 }

 if(Array.isArray(msg.attachments)&&msg.attachments.length){const list=document.createElement('div');list.className='attachments';for(const a of msg.attachments){if(!a.id||!msg.id)continue;const link=document.createElement('a');link.className='btn';link.textContent=`Download ${a.name||'attachment'}`;link.href=attachmentUrl(msg,a);link.setAttribute('download','');list.append(link);}article.append(list);}
}
async function checkAddress(address){
 const data=await api('/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:address})});if(!Array.isArray(data.data))throw Error('The provider returned an invalid inbox.');
 const changed=address!==email||JSON.stringify(data.data)!==JSON.stringify(messages);if(address!==email)clearImages();remember(address);messages=data.data;if(changed)renderList();$('updated').textContent='Checked '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
$('newAddress').addEventListener('click',()=>run(async()=>{const data=await api('/api/account?'+params());if(typeof data.email!=='string'||!data.email.includes('@'))throw Error('The provider did not return an address.');clearImages();remember(data.email);messages=[];renderList();$('updated').textContent='Not checked yet';notice('Your address is ready. Copy it, then fetch your inbox or enable auto refresh.',true);},false,'newAddress'));
$('fetchInbox').addEventListener('click',()=>run(()=>checkAddress(email)));
$('recoverForm').addEventListener('submit',event=>{event.preventDefault();const address=$('recoverEmail').value.trim();run(async()=>{await checkAddress(address);notice('Address recovered and inbox loaded.',true);$('recoverEmail').value='';},false,'recoverButton');});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(email);const button=$('copy');clearTimeout(copyTimer);button.querySelector('span').textContent='Copied';button.classList.add('is-copied');window.engMotion?.copied(button);copyTimer=setTimeout(()=>{button.querySelector('span').textContent='Copy';button.classList.remove('is-copied');},1800);notice('Email address copied.',true);}catch{notice('Could not copy automatically. Select and copy the address above.');}});
$('autoRefresh').addEventListener('change',()=>{try{sessionStorage.setItem('engtempmail.autoRefresh',$('autoRefresh').checked?'yes':'no');}catch{}scheduleAuto();});
document.addEventListener('visibilitychange',scheduleAuto);
function displayCount(id,formatted,raw){$(id).textContent=typeof formatted==='string'?formatted:raw!=null?String(raw):'Unavailable';}
async function loadStats(){const sequence=++statsRun;let q;try{q=params();}catch(e){$('statsStatus').textContent=e.message;return;}$('statsStatus').textContent='addresses · updating live totals';try{const s=await api('/api/stats?'+q);if(sequence!==statsRun)return;displayCount('totalAvailable',s.totalFormatted,s.totalAddresses);const b=s.breakdown||{},f=s.breakdownFormatted||{};displayCount('gmailCount',f.gmail,b.gmail);displayCount('outlookCount',f.outlook,b.outlook);displayCount('hotmailCount',f.hotmail,b.hotmail);displayCount('eduCount',f.highEduPl??f['high.edu.pl'],b.highEduPl??b['high.edu.pl']);$('totalReceived').textContent=s.totalReceived!=null?String(s.totalReceived):'Unavailable';$('statsStatus').textContent='addresses · live provider totals';}catch{if(sequence!==statsRun)return;$('statsStatus').textContent='Totals unavailable · reload to retry';}}
let statsTimer;function optionsChanged(){const nonGmail=['outlook','hotmail'].includes($('provider').value);$('dotSyntax').disabled=nonGmail;if(nonGmail){$('dotSyntax').checked=false;$('plusSyntax').checked=true;}clearTimeout(statsTimer);statsTimer=setTimeout(loadStats,450);}
for(const id of ['provider','dotSyntax','plusSyntax'])$(id).addEventListener('change',optionsChanged);
$('year').textContent=new Date().getFullYear();sync();scheduleAuto();if(API_BASE){loadStats();if(email)run(()=>checkAddress(email),true);}else{$('statsStatus').textContent='Live totals available after API setup';notice('Website ready. To enable email generation and inboxes, deploy the included Cloudflare Worker and add its HTTPS URL to site/config.js.');}
