/* Lightweight interaction polish. No tracking, external libraries or layout jumps. */
(()=>{
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const reduced=()=>preference.matches;
 const animate=(el,frames,options={})=>{if(!el||reduced()||!el.animate)return;return el.animate(frames,{duration:240,easing:'cubic-bezier(.2,.8,.2,1)',...options});};
 function ripple(el,event){if(reduced()||el.disabled)return;const box=el.getBoundingClientRect(),size=Math.min(220,Math.max(box.width,box.height)*1.45);const wave=document.createElement('span');wave.className='press-wave';wave.setAttribute('aria-hidden','true');wave.style.width=wave.style.height=size+'px';wave.style.left=(event?.clientX!=null?event.clientX-box.left:box.width/2)-size/2+'px';wave.style.top=(event?.clientY!=null?event.clientY-box.top:box.height/2)-size/2+'px';el.append(wave);wave.addEventListener('animationend',()=>wave.remove(),{once:true});setTimeout(()=>wave.remove(),800);}
 const eligible=target=>target.closest?.('.btn,.row,.social,.check,.brand');
 document.addEventListener('pointerdown',event=>{if(event.button!==0)return;const el=eligible(event.target);if(el)ripple(el,event);});
 document.addEventListener('keydown',event=>{if(event.repeat||!['Enter',' '].includes(event.key))return;const el=eligible(event.target);if(el)ripple(el);});
 window.engMotion={
  open:el=>animate(el,[{opacity:.45,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:250}),
  count:el=>animate(el,[{transform:'scale(1)'},{transform:'scale(1.07)',offset:.45},{transform:'scale(1)'}],{duration:260}),
  copied:el=>animate(el,[{transform:'scale(1)'},{transform:'scale(.97)',offset:.3},{transform:'scale(1)'}],{duration:220})
 };
 const regions=document.querySelectorAll('header,.topgrid,.mail,.stats,.received-total,footer');
 if(!reduced()&&'IntersectionObserver'in window){document.documentElement.classList.add('motion-enabled');const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}},{threshold:.04});regions.forEach((el,index)=>{el.classList.add('reveal');el.style.setProperty('--reveal-delay',Math.min(index,3)*45+'ms');observer.observe(el);});preference.addEventListener('change',()=>{if(reduced()){document.documentElement.classList.remove('motion-enabled');regions.forEach(el=>el.classList.add('is-revealed'));observer.disconnect();}});}
 document.addEventListener('toggle',event=>{if(event.target.matches?.('.email-links')&&event.target.open)animate(event.target,[{opacity:.6},{opacity:1}],{duration:180});},true);
})();
