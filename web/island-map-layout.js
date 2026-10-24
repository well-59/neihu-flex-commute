// Local map units match the road/vehicle projection: .005 unit per metre.
function convexHull(points){
 const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=list=>{const hull=[];for(const p of list){while(hull.length>=2&&turn(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}return hull.slice(0,-1);};
 return [...half(sorted),...half(sorted.slice().reverse())];
}
// Keep the original hexagon footprint; extend only the edges needed by the map.
// Taking its hull with a padded map rectangle supports every road without the
// large empty wedges of a regular hexagon scaled around the bounding diagonal.
export function fitIslandFrame(bbox,{width=1440,height=780,left=0,right=0,top=0,bottom=0,fov=32}={}){
 const latitude=(bbox[1]+bbox[3])/2;
 const spanX=(bbox[2]-bbox[0])*111320*Math.cos(latitude*Math.PI/180)*.005;
 const spanZ=(bbox[3]-bbox[1])*111320*.005;
 const original=Array.from({length:6},(_,i)=>[20.6*Math.cos(i*Math.PI/3),20.6*Math.sin(i*Math.PI/3)]);
 const halfX=spanX/2+.65,halfZ=spanZ/2+.65;
 const outline=convexHull([...original,[-halfX,-halfZ],[halfX,-halfZ],[halfX,halfZ],[-halfX,halfZ]]);
 const radius=Math.max(...outline.map(([x,z])=>Math.hypot(x,z)));
 const w=Math.max(1,width),h=Math.max(1,height),usableWidth=Math.max(w*.28,w-left-right),usableHeight=Math.max(h*.45,h-top-bottom);
 const tangent=Math.tan(fov*Math.PI/360),aspect=w/h;
 const distance=Math.max(40,radius*1.10/(tangent*usableWidth/h),radius*.78/(tangent*usableHeight/h));
 const shiftX=(right-left)/w*distance*tangent*aspect;
 return {spanX,spanZ,outline,radius,distance,shiftX};
}
