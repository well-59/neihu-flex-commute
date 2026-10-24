// Display parameters only: these are neither measured vehicle counts nor travel speeds.
export function vehicleLayout(length,share,{context=false,cars=true,motorcycles=true,highway='secondary'}={}){
 if(!Number.isFinite(length)||length<=0||(!context&&share===null)||(!cars&&!motorcycles))return [];
 const pressure=context?0:Math.max(0,Math.min(1,share));
 const spacing=context?(['motorway','trunk','primary','secondary'].includes(highway)?1.1:1.65):1.05-.40*pressure;
 const count=length<.65?1:Math.min(120,Math.ceil(length/spacing));
 return Array.from({length:count},(_,i)=>({kind:!cars||motorcycles&&i%3===1?'moto':'car',phase:(i+.5)/count,speed:context?.34:.42/(1+pressure*2.8)}));
}
// Open trips disappear at an exit before a new trip enters. They never reverse or visibly teleport.
export function tripPosition(length,speed,phase,time,closed=false){
 const dwell=closed?0:Math.max(1.4,4-length/speed),cycle=length+speed*dwell,distance=((phase*length+time*speed)%cycle+cycle)%cycle;
 const visible=distance<=length,fade=closed?1:Math.max(0,Math.min(1,distance/.14,(length-distance)/.14));
 return {progress:Math.min(1,distance/length),scale:visible?fade:0,visible:visible&&fade>0};
}
// Progress is distance / total length. Use the curve's arc-length API rather than
// a segment-index parameter, so short pieces do not make a vehicle accelerate.
export function sampleTripCurve(curve,length,speed,phase,time,closed=false){
 const trip=tripPosition(length,speed,phase,time,closed);
 return {...trip,point:curve.getPointAt(trip.progress),tangent:curve.getTangentAt(trip.progress)};
}
