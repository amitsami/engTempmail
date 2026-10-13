// GitHub Pages frontend -> this Worker -> the fixed temp.tf public API.
const UPSTREAM='https://temp.tf/api';
let requestTimes=[],backoffUntil=0;
const validEmail=e=>typeof e==='string'&&e.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e);
class ErrorResponse extends Error{constructor(status,message,retry){super(message);this.status=status;this.retry=retry;}}
function options(url){const q=new URLSearchParams(),dot=url.searchParams.get('dot')==='1',plus=url.searchParams.get('plus')==='1';if(!dot&&!plus)throw new ErrorResponse(400,'Select Dot or Plus.');q.set('dot',dot?'1':'0');q.set('plus',plus?'1':'0');const p=url.searchParams.get('providers');if(p){if(!['gmail','outlook','hotmail'].includes(p))throw new ErrorResponse(400,'Unsupported provider.');if(dot&&!plus&&p!=='gmail')throw new ErrorResponse(400,'Dot-only addresses require Gmail.');q.set('providers',p);}else if(dot&&!plus)q.set('providers','gmail');return q.toString();}
export function resetLimiter(){requestTimes=[];backoffUntil=0;}
export default {async fetch(request,env={},ctx){
 const allowed=env.ALLOWED_ORIGIN||'https://amitsami.github.io';const origin=request.headers.get('Origin');
 const headers=new Headers({'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Expose-Headers':'Retry-After, Content-Disposition','Access-Control-Max-Age':'86400','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 const json=(status,data)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(data),{status,headers});};
 try{
  if(origin&&origin!==allowed)throw new ErrorResponse(403,'This origin is not allowed.');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const u=new URL(request.url);if(u.pathname==='/api/health'&&request.method==='GET')return json(200,{ok:true});
  let endpoint,init={},stats=false,filename;
  if(['/api/account','/api/stats'].includes(u.pathname)&&request.method==='GET'){endpoint=u.pathname.replace('/api','')+'?'+options(u);stats=u.pathname==='/api/stats';}
  else if(u.pathname==='/api/check'&&request.method==='POST'){
   if(Number(request.headers.get('content-length'))>4096)throw new ErrorResponse(413,'Request is too large.');
   const reader=request.body?.getReader();let size=0;const chunks=[];if(reader){for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw new ErrorResponse(413,'Request is too large.');}chunks.push(part.value);}}
   const buf=new Uint8Array(size);let offset=0;for(const a of chunks){buf.set(a,offset);offset+=a.length;}let body;try{body=JSON.parse(new TextDecoder().decode(buf));}catch{throw new ErrorResponse(400,'Invalid JSON.');}
   if(!validEmail(body.email))throw new ErrorResponse(400,'Enter a valid temporary address.');endpoint='/check';init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:body.email})};
  }else if(u.pathname==='/api/attachment'&&request.method==='GET'){
   const email=u.searchParams.get('email'),messageId=u.searchParams.get('messageId'),attachmentId=u.searchParams.get('attachmentId');if(!validEmail(email)||!messageId||!attachmentId||messageId.length>4096||attachmentId.length>4096)throw new ErrorResponse(400,'Invalid attachment request.');endpoint='/attachment?'+new URLSearchParams({email,messageId,attachmentId});filename=(u.searchParams.get('name')||'attachment').replace(/[\r\n/\\]/g,'_').slice(0,180);
  }else throw new ErrorResponse(404,'Route not found.');
  // Cache only public aggregate stats, never emails or inboxes.
  const cache=stats&&globalThis.caches?.default;const cacheKey=new Request(UPSTREAM+endpoint);
  if(cache){const cached=await cache.match(cacheKey);if(cached)return json(200,await cached.json());}
  const t=Date.now();if(t<backoffUntil)throw new ErrorResponse(429,'The provider is busy. Please wait.',Math.ceil((backoffUntil-t)/1000));
  requestTimes=requestTimes.filter(x=>x>t-60000);if(requestTimes.length>=50)throw new ErrorResponse(429,'Please wait before retrying.',60);requestTimes.push(t);
  let response;try{response=await fetch(UPSTREAM+endpoint,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new ErrorResponse(502,'Cannot reach the email provider. Try again shortly.');}
  if(!response.ok){let error='The provider could not complete the request.';try{const b=await response.json();if(typeof b.error==='string')error=b.error.slice(0,240);}catch{}let retry;if(response.status===429){retry=Math.min(3600,Math.max(1,Number(response.headers.get('Retry-After'))||60));backoffUntil=Date.now()+retry*1000;}throw new ErrorResponse(response.status>=500?502:response.status,error,retry);}
  if(filename!==undefined){const max=20*1024*1024;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new ErrorResponse(413,'Attachment exceeds 20 MB.');}const reader=response.body?.getReader(),parts=[];let size=0;if(reader){for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();throw new ErrorResponse(413,'Attachment exceeds 20 MB.');}parts.push(part.value);}}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}headers.set('Content-Type','application/octet-stream');headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);return new Response(bytes,{headers});}
  let data;try{data=await response.json();}catch{throw new ErrorResponse(502,'Invalid provider response.');}
  if(cache&&ctx){const cached=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}});ctx.waitUntil(cache.put(cacheKey,cached));}
  return json(200,data);
 }catch(e){if(e.retry)headers.set('Retry-After',String(e.retry));return json(e.status||502,{error:e.status?e.message:'Unexpected response. Please try again.'});}
}};
