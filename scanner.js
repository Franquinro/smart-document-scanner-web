import { orderPoints, quadMetrics, scoreQuad, evaluateDetection, computeOutputSize, chooseDetectionCandidate } from './geometry.js';

const safeDelete = value => { try { value?.delete?.(); } catch (_) {} };
const cvReady = () => globalThis.cv && typeof cv.Mat === 'function';

function sampleEdgeSupport(edge, points) {
  let hit = 0, total = 0;
  for (let side=0; side<4; side++) {
    const a=points[side], b=points[(side+1)%4];
    const samples=Math.max(12,Math.round(Math.hypot(b.x-a.x,b.y-a.y)/8));
    for(let i=0;i<=samples;i++) {
      const t=i/samples, x=Math.max(0,Math.min(edge.cols-1,Math.round(a.x+(b.x-a.x)*t)));
      const y=Math.max(0,Math.min(edge.rows-1,Math.round(a.y+(b.y-a.y)*t)));
      if(edge.ucharPtr(y,x)[0]>0) hit++;
      total++;
    }
  }
  return total ? hit/total : 0;
}

function contoursToCandidates(mask, edge, method, width, height, candidates) {
  const contours=new cv.MatVector(), hierarchy=new cv.Mat();
  try {
    cv.findContours(mask,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const ranked=[];
    for(let i=0;i<contours.size();i++) {
      const contour=contours.get(i);
      try { ranked.push({i,area:Math.abs(cv.contourArea(contour))}); } finally { safeDelete(contour); }
    }
    ranked.sort((a,b)=>b.area-a.area).slice(0,14).forEach(({i,area})=>{
      if(area < width*height*.045) return;
      const contour=contours.get(i);
      try {
        const perimeter=cv.arcLength(contour,true);
        for(const epsilon of [.012,.018,.025,.035,.05]) {
          const approx=new cv.Mat();
          try {
            cv.approxPolyDP(contour,approx,perimeter*epsilon,true);
            if(approx.rows!==4 || !cv.isContourConvex(approx)) continue;
            const points=[];
            for(let j=0;j<4;j++) points.push({x:approx.intPtr(j,0)[0],y:approx.intPtr(j,0)[1]});
            const ordered=orderPoints(points);
            const edgeSupport=sampleEdgeSupport(edge,ordered);
            const metrics=quadMetrics(ordered,width,height,edgeSupport);
            const score=scoreQuad(metrics);
            if(score>0.28) candidates.push({corners:ordered,score,method,metrics});
          } finally { safeDelete(approx); }
        }
      } finally { safeDelete(contour); }
    });
  } finally { safeDelete(contours); safeDelete(hierarchy); }
}

export function detectDocument(sourceCanvas) {
  if(!cvReady()) throw new Error('OpenCV.js 尚未載入完成');
  const owned=[];
  try {
    const original=cv.imread(sourceCanvas); owned.push(original);
    const maxSide=1280, scale=Math.min(1,maxSide/Math.max(original.cols,original.rows));
    const work=new cv.Mat(); owned.push(work);
    cv.resize(original,work,new cv.Size(Math.round(original.cols*scale),Math.round(original.rows*scale)),0,0,cv.INTER_AREA);
    const rgb=new cv.Mat(), gray=new cv.Mat(), lab=new cv.Mat(); owned.push(rgb,gray,lab);
    cv.cvtColor(work,rgb,cv.COLOR_RGBA2RGB); cv.cvtColor(work,gray,cv.COLOR_RGBA2GRAY); cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);

    const blur=new cv.Mat(), edge1=new cv.Mat(), edge2=new cv.Mat(), combinedEdge=new cv.Mat(); owned.push(blur,edge1,edge2,combinedEdge);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    cv.Canny(blur,edge1,28,95); cv.Canny(blur,edge2,55,165); cv.bitwise_or(edge1,edge2,combinedEdge);
    const dilateKernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3)); owned.push(dilateKernel);
    cv.dilate(combinedEdge,combinedEdge,dilateKernel);

    const labMask=new cv.Mat(), cleanedLab=new cv.Mat(), bgDiffMask=cv.Mat.zeros(lab.rows,lab.cols,cv.CV_8UC1);
    const lowerLab=new cv.Mat(lab.rows,lab.cols,lab.type(),[115,105,105,0]);
    const upperLab=new cv.Mat(lab.rows,lab.cols,lab.type(),[255,151,151,255]);
    owned.push(labMask,cleanedLab,bgDiffMask,lowerLab,upperLab);
    cv.inRange(lab,lowerLab,upperLab,labMask);
    // Complement the neutral/light-paper mask with LAB distance from the sampled image border.
    const borderSamples=[[],[],[]], step=Math.max(1,Math.round(Math.min(lab.cols,lab.rows)/100));
    for(let x=0;x<lab.cols;x+=step) for(const y of [0,lab.rows-1]) {const px=lab.ucharPtr(y,x);for(let c=0;c<3;c++)borderSamples[c].push(px[c]);}
    for(let y=step;y<lab.rows-1;y+=step) for(const x of [0,lab.cols-1]) {const px=lab.ucharPtr(y,x);for(let c=0;c<3;c++)borderSamples[c].push(px[c]);}
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]||0;
    const bg=borderSamples.map(median);
    for(let y=0;y<lab.rows;y++) for(let x=0;x<lab.cols;x++) {
      const px=lab.ucharPtr(y,x), d=Math.hypot((px[0]-bg[0])*.55,px[1]-bg[1],px[2]-bg[2]);
      if(px[0]>92 && d>15) bgDiffMask.ucharPtr(y,x)[0]=255;
    }
    cv.bitwise_or(labMask,bgDiffMask,labMask);
    const closeKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(13,13)); owned.push(closeKernel);
    cv.morphologyEx(labMask,cleanedLab,cv.MORPH_CLOSE,closeKernel);

    const candidates=[];
    contoursToCandidates(cleanedLab,combinedEdge,'lab-paper-mask',work.cols,work.rows,candidates);
    contoursToCandidates(edge1,combinedEdge,'canny-weak-28-95',work.cols,work.rows,candidates);
    contoursToCandidates(edge2,combinedEdge,'canny-weak-55-165',work.cols,work.rows,candidates);
    if(!candidates.length) {
      const fallback=[{x:work.cols*.04,y:work.rows*.04},{x:work.cols*.96,y:work.rows*.04},{x:work.cols*.96,y:work.rows*.96},{x:work.cols*.04,y:work.rows*.96}];
      return {...evaluateDetection(fallback.map(p=>({x:p.x/scale,y:p.y/scale})),original.cols,original.rows,{confidence:.15,method:'fallback-inset'}),candidates:[]};
    }
    candidates.sort((a,b)=>b.score-a.score);
    // De-duplicate nearly identical epsilon variants before comparing alternatives.
    const unique=candidates.filter((c,i,a)=>a.slice(0,i).every(o=>c.corners.reduce((s,p,j)=>s+Math.hypot(p.x-o.corners[j].x,p.y-o.corners[j].y),0)/4>12));
    const best=chooseDetectionCandidate(unique);
    const runnerUp=unique.filter(c=>c!==best).sort((a,b)=>b.score-a.score)[0];
    const gap=Math.max(0,best.score-(runnerUp?.score||0));
    const confidence=Math.min(.98,best.score*.86+gap*.35+(best.method.startsWith('lab')?.05:0));
    const full=best.corners.map(p=>({x:p.x/scale,y:p.y/scale}));
    return {...evaluateDetection(full,original.cols,original.rows,{confidence,method:best.method}),candidates:unique.slice(0,8)};
  } finally { owned.reverse().forEach(safeDelete); }
}

export function warpToCanvas(sourceCanvas,corners,maxDimension=5000) {
  if(!cvReady()) throw new Error('OpenCV.js 尚未載入完成');
  const mats=[];
  try {
    const src=cv.imread(sourceCanvas); mats.push(src);
    const ordered=orderPoints(corners), size=computeOutputSize(ordered,{min:32,max:maxDimension});
    const srcPts=cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y]));
    const dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,size.width-1,0,size.width-1,size.height-1,0,size.height-1]); mats.push(srcPts,dstPts);
    const transform=cv.getPerspectiveTransform(srcPts,dstPts), dst=new cv.Mat(); mats.push(transform,dst);
    cv.warpPerspective(src,dst,transform,new cv.Size(size.width,size.height),cv.INTER_CUBIC,cv.BORDER_REPLICATE);
    const canvas=document.createElement('canvas'); canvas.width=size.width; canvas.height=size.height; cv.imshow(canvas,dst); return canvas;
  } finally { mats.reverse().forEach(safeDelete); }
}

export function enhanceCanvas(input,settings) {
  const out=document.createElement('canvas'); out.width=input.width; out.height=input.height;
  const ctx=out.getContext('2d',{willReadFrequently:true}); ctx.filter=`brightness(${100+settings.brightness}%) contrast(${100+settings.contrast}%) saturate(${Math.max(0,100+settings.saturation)}%)`; ctx.drawImage(input,0,0);
  let image=ctx.getImageData(0,0,out.width,out.height), d=image.data;
  const grayMix=(settings.mode==='gray'||settings.mode==='document')?100:Number(settings.grayscale);
  const warmth=Number(settings.warmth)*.8;
  for(let i=0;i<d.length;i+=4){ const lum=.299*d[i]+.587*d[i+1]+.114*d[i+2]; d[i]+=(lum-d[i])*grayMix/100+warmth; d[i+1]+=(lum-d[i+1])*grayMix/100; d[i+2]+=(lum-d[i+2])*grayMix/100-warmth; if(settings.whiten&&lum>185){const lift=(lum-185)/70*28;d[i]+=lift;d[i+1]+=lift;d[i+2]+=lift;} }
  ctx.putImageData(image,0,0);
  if(cvReady() && (settings.denoise>0||settings.sharpen>0||settings.mode==='document')) {
    const mats=[]; try { const src=cv.imread(out), dst=new cv.Mat(); mats.push(src,dst);
      if(settings.denoise>0) { const rgb=new cv.Mat(), filtered=new cv.Mat(); mats.push(rgb,filtered); cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB); cv.bilateralFilter(rgb,filtered,Math.max(3,Math.round(settings.denoise/10)*2+1),settings.denoise,settings.denoise); cv.cvtColor(filtered,dst,cv.COLOR_RGB2RGBA); } else src.copyTo(dst);
      if(settings.mode==='document'){const g=new cv.Mat(),bg=new cv.Mat(),norm=new cv.Mat(),bin=new cv.Mat();mats.push(g,bg,norm,bin);cv.cvtColor(dst,g,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(g,bg,new cv.Size(0,0),18);cv.divide(g,bg,norm,255);cv.adaptiveThreshold(norm,bin,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,31,13);cv.cvtColor(bin,dst,cv.COLOR_GRAY2RGBA);}
      if(settings.sharpen>0){const blurred=new cv.Mat();mats.push(blurred);cv.GaussianBlur(dst,blurred,new cv.Size(0,0),1.2);cv.addWeighted(dst,1+settings.sharpen/100,blurred,-settings.sharpen/100,0,dst);} cv.imshow(out,dst);
    } finally {mats.reverse().forEach(safeDelete);}
  }
  return out;
}
