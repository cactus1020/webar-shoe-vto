// Connected components + PCA provide a visual estimate, not a foot classifier.
export function scanFootRegions(data, w, h, seeds = [], tolerance = 42) {
  const rgb = i => [data[4*i],data[4*i+1],data[4*i+2]];
  const dist = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
  const border=[];
  for(let x=2;x<w-2;x+=3) border.push(rgb(2*w+x));
  for(let y=2;y<h-2;y+=3) border.push(rgb(y*w+2),rgb(y*w+w-3));
  const bg=[0,1,2].map(c=>border.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(border.length/2)]);
  const results=[];
  for(const seed of (seeds.length?seeds:[null])) {
    const mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++) mask[i]=seed
      ? +(dist(rgb(i),seed.color)<tolerance && Math.hypot(i%w/w-seed.u,Math.floor(i/w)/h-seed.v)<0.32)
      : +(dist(rgb(i),bg)>tolerance*1.5);
    const candidates=[];
    for(let i=0;i<mask.length;i++) {
      if(!mask[i]) continue;
      const q=[i]; mask[i]=0;
      for(let k=0;k<q.length;k++) {
        const p=q[k],x=p%w;
        for(const n of [x?p-1:-1,x<w-1?p+1:-1,p-w,p+w]) if(n>=0&&n<mask.length&&mask[n]) {mask[n]=0;q.push(n);}
      }
      if(q.length<Math.max(35,w*h*0.004)||q.length>w*h*0.32) continue;
      const cx=q.reduce((s,p)=>s+p%w,0)/q.length, cy=q.reduce((s,p)=>s+Math.floor(p/w),0)/q.length;
      if(seed&&Math.hypot(cx/w-seed.u,cy/h-seed.v)>0.22) continue;
      let xx=0,yy=0,xy=0;
      for(const p of q) {const x=p%w-cx,y=Math.floor(p/w)-cy;xx+=x*x;yy+=y*y;xy+=x*y;}
      const theta=0.5*Math.atan2(2*xy,xx-yy);
      let dx=Math.cos(theta),dy=Math.sin(theta);
      if(seed?.direction?dx*seed.direction.x+dy*seed.direction.y<0:dy>0) {dx=-dx;dy=-dy;}
      const along=[],across=[];
      for(const p of q) {const x=p%w-cx,y=Math.floor(p/w)-cy;along.push(x*dx+y*dy);across.push(-x*dy+y*dx);}
      along.sort((a,b)=>a-b);across.sort((a,b)=>a-b);
      const quant=(a,t)=>a[Math.floor((a.length-1)*t)];
      const lo=quant(along,0.02),hi=quant(along,0.98),len=hi-lo,span=quant(across,0.98)-quant(across,0.02);
      const ratio=len/Math.max(1,span);
      if(len<18||span<5||ratio<1.5||ratio>5.5||q.length/Math.max(1,len*span)<0.4) continue;
      const point=t=>({u:(cx+dx*t)/w,v:(cy+dy*t)/h});
      const heel=point(lo),toe=point(hi);
      if([heel,toe].some(p=>p.u<0||p.u>1||p.v<0||p.v>1)) continue;
      candidates.push({heel,toe,center:{u:cx/w,v:cy/h},direction:{x:dx,y:dy},area:q.length,seedId:seed?.id});
    }
    candidates.sort((a,b)=>seed?Math.hypot(a.center.u-seed.u,a.center.v-seed.v)-Math.hypot(b.center.u-seed.u,b.center.v-seed.v):b.area-a.area);
    for(const r of candidates.slice(0,seed?1:2)) if(results.every(p=>Math.hypot(p.center.u-r.center.u,p.center.v-r.center.v)>0.1)) results.push(r);
  }
  return results.slice(0,2).sort((a,b)=>a.center.u-b.center.u);
}
