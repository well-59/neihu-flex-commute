// Local map units match the road/vehicle projection: .005 unit per metre.
// Fit the island's footprint to the part of the canvas left free by UI drawers.
export function fitIslandFrame(bbox,{width=1440,height=780,left=0,right=0,top=0,bottom=0,fov=32}={}){
 const latitude=(bbox[1]+bbox[3])/2;
 const spanX=(bbox[2]-bbox[0])*111320*Math.cos(latitude*Math.PI/180)*.005;
 const spanZ=(bbox[3]-bbox[1])*111320*.005;
 const radius=Math.max(20.6,Math.hypot(spanX/2,spanZ/2)/Math.cos(Math.PI/6)+.8);
 const w=Math.max(1,width),h=Math.max(1,height),usableWidth=Math.max(w*.28,w-left-right),usableHeight=Math.max(h*.45,h-top-bottom);
 const tangent=Math.tan(fov*Math.PI/360),aspect=w/h;
 const distance=Math.max(40,radius*1.10/(tangent*usableWidth/h),radius*.78/(tangent*usableHeight/h));
 const shiftX=(right-left)/w*distance*tangent*aspect;
 return {spanX,spanZ,radius,distance,shiftX};
}
