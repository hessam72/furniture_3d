import * as THREE from 'three/webgpu';
import { WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { pass, mrt, output, normalView, vec4, vec3, mix, float } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

const $=s=>document.querySelector(s);
const stage=$('#viewport'), status=$('#status');
const fa=n=>Math.round(n).toLocaleString('fa-IR');
let denoiser;
let renderer, scene, camera, controls, model, pathTracer, pipeline, gpu=false, mode='fast', ready=false;
let lastMove=0, dragging=false, busy=false, lightAngle=35, currentPreset='studio', frameCount=0, lastSampleCheck=0, samplePending=false;
let fittedDistance=6, centerY=.6, modelHeight=1.3, latestSamples=0, needsRebuild=false, transition=null, raf=0, assetURLs=[];
const fabricMeshes=[], ownedMaterials=[];
let key, fill, rim, sun, floor, hdr, localURL, snapshotRequested=false;
// Photo mode = real path tracing (three-gpu-pathtracer, WebGPU) + OIDN denoising.
//  - Interactive: when the camera stops, the path-traced image forms visibly on screen, is denoised
//    at sample stages, and later (cleaner) stages cross-fade in. Finished views are cached.
//  - Final render: heavy, high-resolution, many samples, deeper bounces; shown in a before/after viewer.
const MOBILE=matchMedia('(max-width:720px)').matches;
const STAGES=MOBILE?[8,32,96]:[16,64,256];
const PT_MAX_PIXELS=MOBILE?1.2e6:3.2e6, PT_BUDGET=MOBILE?2e5:5e5, PT_BOUNCES=6, CACHE_LIMIT=MOBILE?3:6, FADE_MS=650;
const FINAL=MOBILE?{edge:1600,samples:192,bounces:8,budget:3e5,passes:3}:{edge:2560,samples:512,bounces:10,budget:1e6,passes:8};
const DEBUG=new URLSearchParams(location.search).has('debug');
const renderCache=new Map();
let ptState='idle', ptStage=0, ptKey='', revealEnd=0, stageReachedAt=0, denoiserBroken=false, captureWhenDone=false;
let ptPasses=1, gpuMs=16, overlayOK=null, overlayShown=false, lastAvg=0, lastProgressAt=0, sampleRate=0, job=null, gpuNote='', adapterInfo=null;
const overlay=document.createElement('canvas');overlay.id='pt-overlay';overlay.setAttribute('aria-hidden','true');
const octx=overlay.getContext('2d');
const presets={
 studio:{key:'#fff4e6',fill:'#e8efff',rim:'#fffaf2',power:5,env:.55,ground:'#e4ded5'},
 day:{key:'#f4f7ff',fill:'#e3efff',rim:'#ffffff',power:6,env:.8,ground:'#dddcd7'},
 warm:{key:'#ffd4a0',fill:'#f4e2cb',rim:'#ffe7c0',power:4.8,env:.5,ground:'#d3c5b3'}
};
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function fail(error){console.error(error);$('#loader').hidden=true;$('#error').hidden=false;$('#error-message').textContent='دریافت یا نمایش فایل کامل نشد. اتصال و پشتیبانی گرافیکی مرورگر را بررسی کنید.';status.textContent='بارگذاری ناموفق'}
function active(group,key,value){document.querySelectorAll(group).forEach(b=>{const yes=b.dataset[key]===value;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes))})}
function updatePathLights(){if(!pathTracer)return;const intensity=sun.intensity;sun.intensity=0;pathTracer.updateLights();sun.intensity=intensity;}
function lightPositions(){
 const a=THREE.MathUtils.degToRad(lightAngle);
 key.position.set(Math.sin(a)*4,4,Math.cos(a)*4);key.lookAt(0,.5,0);
 sun.position.copy(key.position);sun.target.position.set(0,.2,0);sun.target.updateMatrixWorld();
 fill.position.set(-4,2.5,2);fill.lookAt(0,.5,0);
 rim.position.set(2,3,-3.5);rim.lookAt(0,.7,0);
 scene.environmentRotation.y=a*.5;
 if(pathTracer){updatePathLights();pathTracer.updateEnvironment()}
 lastMove=performance.now();
}
function preset(name){
 currentPreset=name;const p=presets[name];
 key.color.set(p.key);fill.color.set(p.fill);rim.color.set(p.rim);sun.color.set(p.key);
 key.intensity=p.power;fill.intensity=p.power*.24;rim.intensity=p.power*.65;sun.intensity=name==='day'?1.5:.95;
 scene.environmentIntensity=p.env;floor.material.color.set(p.ground);
 if(pathTracer){updatePathLights();pathTracer.updateMaterials();pathTracer.updateEnvironment()}
 active('[data-preset]','preset',name);lastMove=performance.now();
}
function setupScene(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#f3f0eb');
 camera=new THREE.PerspectiveCamera(34,1,.03,1500);
 controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;
 controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.1;controls.autoRotateSpeed=.45;
 controls.addEventListener('start',()=>{dragging=true;transition=null});
 controls.addEventListener('end',()=>{dragging=false;lastMove=performance.now()});
 controls.addEventListener('change',()=>{lastMove=performance.now();pathTracer?.updateCamera()});
 floor=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(9,15),new THREE.Vector2(9,4),new THREE.Vector2(8.9,2.8),new THREE.Vector2(8.5,1.5),new THREE.Vector2(7.7,.5),new THREE.Vector2(6.5,0),new THREE.Vector2(0,0)],96),new THREE.MeshStandardMaterial({color:'#e4ded5',roughness:.84,metalness:0}));
 floor.position.y=-.005;floor.receiveShadow=true;scene.add(floor);
 key=new THREE.RectAreaLight('#fff4e6',5,4,3);
 fill=new THREE.RectAreaLight('#e8efff',1.2,4,4);
 rim=new THREE.RectAreaLight('#fffaf2',3.25,3,2.4);
 sun=new THREE.DirectionalLight('#fff4e6',.95);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-4;sun.shadow.camera.right=4;sun.shadow.camera.top=4;sun.shadow.camera.bottom=-4;
 sun.shadow.camera.near=.1;sun.shadow.camera.far=15;sun.shadow.normalBias=.015;sun.shadow.bias=-.00008;sun.shadow.radius=4;
 scene.add(key,fill,rim,sun,sun.target);lightPositions();
 if(gpu){
  pipeline=new THREE.RenderPipeline(renderer);
  const scenePass=pass(scene,camera);
  scenePass.setMRT(mrt({output,normal:normalView}));
  const color=scenePass.getTextureNode('output');
  const contact=ao(scenePass.getTextureNode('depth'),scenePass.getTextureNode('normal'),camera);
  contact.radius.value=.25;contact.thickness.value=.45;contact.distanceExponent.value=1.3;contact.scale.value=.9;
  pipeline.outputNode=color.mul(vec4(vec3(mix(float(1),contact.getTextureNode().r,float(.65))),1));
 }
}
function setView(view,animate=true){
 if(!ready)return;
 const target=new THREE.Vector3(0,centerY,0),d=fittedDistance;
 let pos;
 if(view==='front')pos=new THREE.Vector3(0,centerY+d*.11,d);
 else if(view==='side')pos=new THREE.Vector3(d,centerY+d*.15,.1);
 else if(view==='detail'){target.set(.55,modelHeight*.59,.15);pos=new THREE.Vector3(1.8,modelHeight*.88,2.2)}
 else pos=new THREE.Vector3(d*.6,centerY+d*.38,d*.8);
 if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)transition={start:performance.now(),from:camera.position.clone(),to:pos,fromTarget:controls.target.clone(),target};
 else{camera.position.copy(pos);controls.target.copy(target);controls.update()}
 active('[data-view]','view',view);lastMove=performance.now();
}
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;
 camera.setViewOffset(w,h,w>720?w*.055:0,w>720?h*.08:h*.01,w,h);camera.updateProjectionMatrix();
 fittedDistance=3.5/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*camera.aspect)*(w>720?1.65:1.12);
 fittedDistance=Math.max(fittedDistance,4.3);
 controls.minDistance=1.1;controls.maxDistance=fittedDistance*1.8;
 applyRenderScale();pathTracer?.updateCamera();lastMove=performance.now();
}
// Trace at full backing-buffer resolution unless that exceeds the pixel budget.
function applyRenderScale(){if(!pathTracer||job)return;const s=renderer.getDrawingBufferSize(new THREE.Vector2());pathTracer.renderScale=Math.min(1,Math.sqrt(PT_MAX_PIXELS/Math.max(1,s.x*s.y)))}
async function loadModel(url){
 $('#loader').hidden=false;$('#error').hidden=true;$('#load-title').textContent='در حال آماده‌سازی مدل و بافت‌ها';
 const manager=new THREE.LoadingManager();
 manager.onProgress=(url,loaded,total)=>{$('#load-bar').style.width=(20+loaded/Math.max(total,1)*75)+'%'};
 const draco=new DRACOLoader(manager).setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');draco.setWorkerLimit(2);
 const ktx=new KTX2Loader(manager).setTranscoderPath('./vendor/three/examples/jsm/libs/basis/').setWorkerLimit(2);ktx.detectSupport(renderer);
 const loader=new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx);
 try{
  const gltf=await loader.loadAsync(url,e=>{if(e.total)$('#load-bar').style.width=(10+e.loaded/e.total*55)+'%'});
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose()});ownedMaterials.splice(0).forEach(m=>m.dispose());fabricMeshes.length=0}
  model=gltf.scene;model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());
  const scale=3.4/Math.max(size.x,size.z);model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(model),c=b.getCenter(new THREE.Vector3());
  model.position.x-=c.x;model.position.z-=c.z;model.position.y-=b.min.y;model.updateMatrixWorld(true);
  const normalized=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  modelHeight=normalized.y;centerY=modelHeight*.46;
  const materials=new Map();let triangles=0,meshes=0;
  model.traverse(obj=>{
   if(!obj.isMesh)return;meshes++;triangles+=(obj.geometry.index?.count||obj.geometry.attributes.position.count)/3;
   obj.castShadow=true;obj.receiveShadow=true;
   const enhance=m=>{
    if(materials.has(m))return materials.get(m);
    const mat=new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(mat,m);
    mat.name=m.name;const fabric=m.name==='Material__25';
    if(fabric){mat.sheen=.22;mat.sheenColor.set('#d6c6b2');mat.sheenRoughness=.85;mat.roughness=.84;mat.aoMapIntensity=.7}
    else{mat.roughness=Math.max(m.roughness,.55)}
    for(const val of Object.values(mat))if(val?.isTexture)val.anisotropy=Math.min(8,renderer.getMaxAnisotropy?.()??renderer.capabilities?.getMaxAnisotropy?.()??8);
    ownedMaterials.push(mat);materials.set(m,mat);return mat;
   };
   obj.material=Array.isArray(obj.material)?obj.material.map(enhance):enhance(obj.material);
   if((Array.isArray(obj.material)?obj.material:[obj.material]).some(m=>m.name==='Material__25'))fabricMeshes.push(obj);
  });
  scene.add(model);ready=true;needsRebuild=true;resize();setView('perspective',false);
  document.body.dataset.triangles=Math.round(triangles);document.body.dataset.meshes=meshes;document.body.dataset.renderer=gpu?'webgpu':'webgl2';
  $('#structure').checked=false;$('#structure').disabled=!fabricMeshes.length;
  await renderFast();$('#loader').hidden=true;status.textContent=gpu?'آمادهٔ نمایش · WebGPU':'آمادهٔ نمایش · WebGL 2';
 } finally {draco.dispose();ktx.dispose()}
}
function renderFast(){if(pipeline)pipeline.render();else renderer.render(scene,camera)}
async function quality(next){
 if(busy||!ready||job)return;
 if(next==='fast'){mode='fast';resetProgressive();captureWhenDone=false;active('[data-quality]','quality',next);$('#quality-help').textContent='برای چرخش و بررسی محصول.';return}
 if(!gpu){toast(gpuNote||'رندر دقیق به WebGPU نیاز دارد.');return}
 busy=true;$('#load-title').textContent='آماده‌سازی رندر دقیق';$('#load-detail').textContent='محاسبهٔ نور و بازتاب‌ها؛ ممکن است چند لحظه طول بکشد';$('#loader').hidden=false;
 await new Promise(r=>setTimeout(r,60));
 try{
  controls.autoRotate=false;$('#rotate').checked=false;
  if(!pathTracer){
   const {WebGPUPathTracer,OIDNDenoiser}=await import('three-gpu-pathtracer/webgpu');
   pathTracer=new WebGPUPathTracer(renderer);
   const {initUNetFromURL}=await import('oidn-web');
   denoiser=new OIDNDenoiser({initUNetFromURL,auxWeightsUrl:'./assets/denoise.tza',maxTileSize:256});pathTracer.setDenoiser(denoiser);
   pathTracer.maxBounces=PT_BOUNCES;pathTracer.maxSamples=STAGES[0];pathTracer.frameBudget=PT_BUDGET;
   // Fixed budget: every frameBudget change rebuilds the tracer's compute kernels.
   pathTracer.renderDelay=150;pathTracer.lowResScale=.15;pathTracer.minSamples=1;pathTracer.fadeDuration=400;
   applyRenderScale();
  }
  if(needsRebuild){const intensity=sun.intensity;sun.intensity=0;pathTracer.setScene(scene,camera);sun.intensity=intensity;needsRebuild=false;renderCache.clear()}
  resetProgressive();pathTracer.updateCamera();mode='photo';latestSamples=0;lastMove=performance.now();
  active('[data-quality]','quality',next);$('#quality-help').textContent='دوربین را رها کنید تا رندر واقعی (Path Tracing) روی صفحه شکل بگیرد و نویز آن پاک شود.';
 }catch(e){console.error(e);pathTracer?.dispose();pathTracer=null;mode='fast';active('[data-quality]','quality','fast');toast('رندر دقیق روی این دستگاه اجرا نشد؛ حالت روان فعال است.')}
 finally{busy=false;$('#loader').hidden=true}
}
async function capture(){
 if(mode==='photo'&&ptState==='cached'){downloadCapture(renderCache.get(ptKey));return}
 if(mode==='photo'&&ptState!=='done'){captureWhenDone=true;toast('تصویر پس از تکمیل رندر دقیق ذخیره می‌شود…');return}
 snapshotRequested=true;toast('در حال آماده‌سازی تصویر…');
}
function downloadCapture(source=renderer.domElement){
 snapshotRequested=false;
 source.toBlob(blob=>{
  if(!blob){toast('ذخیرهٔ تصویر روی این مرورگر ممکن نشد.');return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='OmidCity-Nilper.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 },'image/png');
}
// ---- Interactive progressive photo render ---------------------------------------------------
function viewKey(){
 const p=camera.position,t=controls.target,q=v=>Math.round(v*200),c=renderer.domElement;
 return [q(p.x),q(p.y),q(p.z),q(t.x),q(t.y),q(t.z),currentPreset,lightAngle,$('#structure').checked?1:0,$('#exposure').value,c.width,c.height].join('|');
}
// Copies the WebGPU canvas as presented by the render call just made (must be the same task).
function snapshotInto(target){
 const c=renderer.domElement;
 if(target.width!==c.width||target.height!==c.height){target.width=c.width;target.height=c.height}
 const x=target===overlay?octx:target.getContext('2d');x.clearRect(0,0,target.width,target.height);x.drawImage(c,0,0);
 return target;
}
function showOverlay(source){
 if(overlayOK===false)return;
 if(source===renderer.domElement)snapshotInto(overlay);
 else{if(overlay.width!==source.width||overlay.height!==source.height){overlay.width=source.width;overlay.height=source.height}octx.clearRect(0,0,overlay.width,overlay.height);octx.drawImage(source,0,0)}
 // Some browsers cannot read back a WebGPU canvas: then the render is simply shown as it forms.
 if(overlayOK===null){const d=octx.getImageData(overlay.width>>1,overlay.height>>1,1,1).data;overlayOK=d[3]>0;if(!overlayOK){console.warn('Canvas snapshot unavailable; overlay disabled');return}}
 overlay.style.transition='none';overlay.style.opacity='1';overlayShown=true;
}
function hideOverlay(fade){
 if(fade){void overlay.offsetWidth;overlay.style.transition=`opacity ${FADE_MS}ms ease`}else overlay.style.transition='none';
 overlay.style.opacity='0';overlayShown=false;
}
function setProgress(v){const bar=$('#pt-progress');bar.hidden=v===null;if(v!==null)bar.firstElementChild.style.width=(Math.min(1,v)*100).toFixed(1)+'%'}
function resetProgressive(){ptState='idle';hideOverlay(false);setProgress(null);if(mode==='photo'&&!job)status.textContent='رها کنید تا رندر واقعی شروع شود'}
function stageLabel(){return 'مرحله '+fa(ptStage+1)+' از '+fa(STAGES.length)}
function beginStage(i){ptStage=i;pathTracer.maxSamples=STAGES[i];ptState='accum';lastSampleCheck=0;stageReachedAt=0;lastProgressAt=performance.now();lastAvg=0}
function storeCache(){
 const entry=renderCache.get(ptKey)||document.createElement('canvas');renderCache.delete(ptKey);
 renderCache.set(ptKey,snapshotInto(entry));
 while(renderCache.size>CACHE_LIMIT)renderCache.delete(renderCache.keys().next().value);
 return entry;
}
function readSamples(time,target){
 if(time-lastSampleCheck<1000||samplePending)return;
 lastSampleCheck=time;samplePending=true;
 pathTracer.getSampleCountsAsync().then(c=>{
  latestSamples=c.avg;sampleRate=c.samplesPerSecond||0;document.body.dataset.samples=Math.round(c.avg);
  if(c.avg>lastAvg+.01){lastAvg=c.avg;lastProgressAt=performance.now()}
  if(c.min>=target){if(!stageReachedAt)stageReachedAt=performance.now()}else stageReachedAt=0;
  onSamples(c);
 }).catch(console.error).finally(()=>samplePending=false);
}
let onSamples=()=>{};
function denoiseSettled(now){
 // Denoiser unavailable (e.g. weights failed to load): accept the converged raw image instead.
 const stalled=!denoiser?.complete&&stageReachedAt&&!denoiser?.running&&now-stageReachedAt>(denoiserBroken?0:8000);
 if(stalled){denoiserBroken=true;console.warn('Denoiser did not run; showing raw path-traced image')}
 return denoiser?.complete||stalled;
}
function finishStage(){
 if(ptStage<STAGES.length-1){showOverlay(renderer.domElement);beginStage(ptStage+1);status.textContent='رندر واقعی · '+stageLabel();return}
 ptState='done';setProgress(1);status.textContent='رندر واقعی · کامل ('+fa(STAGES[STAGES.length-1])+' نمونه)';
 const shot=storeCache();if(captureWhenDone){captureWhenDone=false;downloadCapture(shot)}
}
function photoFrame(time){
 switch(ptState){
  case 'idle':{
   ptKey=viewKey();const hit=renderCache.get(ptKey);
   if(hit&&overlayOK){
    renderCache.delete(ptKey);renderCache.set(ptKey,hit);showOverlay(hit);ptState='cached';setProgress(1);status.textContent='رندر واقعی · کامل (ذخیره‌شده)';
    if(captureWhenDone){captureWhenDone=false;downloadCapture(hit)}
    return;
   }
   // Hold the live frame until the full-resolution trace has a first sample, then fade to it.
   renderFast();showOverlay(renderer.domElement);beginStage(0);setProgress(0);status.textContent='رندر واقعی در حال شکل‌گیری…';
   onSamples=c=>{
    if(ptState!=='accum'||job)return;
    setProgress(c.avg/STAGES[STAGES.length-1]);
    status.textContent=denoiser?.running?'پاک‌سازی نویز · '+stageLabel():'رندر واقعی · '+stageLabel()+' · '+fa(Math.min(100,c.avg/STAGES[ptStage]*100))+'٪';
   };
   return;
  }
  case 'cached':return;
  case 'accum':
   tracePasses();readSamples(time,STAGES[ptStage]);
   if(ptStage===0&&overlayShown&&!pathTracer.lowResMode&&pathTracer.fadeState>=1)hideOverlay(true);
   if(denoiseSettled(performance.now())){
    // This frame's blit already used the denoised image.
    if(overlayShown){ptState='reveal';revealEnd=time+FADE_MS;hideOverlay(true)}else finishStage();
   }else if(performance.now()-lastProgressAt>20000&&!denoiser?.running){
    lastProgressAt=performance.now();hideOverlay(false);
    status.textContent='رندر پیشرفتی ندارد؛ کارت گرافیک پاسخ نمی‌دهد';console.warn('Path tracer made no progress for 20s',debugInfo());
   }
   return;
  case 'reveal':
   pathTracer.renderSample();
   if(time>=revealEnd)finishStage();
   return;
  case 'done':
   // Exposure is applied when presenting, so it updates live here; keep the cache in step.
   pathTracer.renderSample();
   {const k=viewKey();if(k!==ptKey){const e=renderCache.get(ptKey);renderCache.delete(ptKey);ptKey=k;if(e)renderCache.set(k,e);storeCache()}}
   return;
 }
}
// ---- Final render ---------------------------------------------------------------------------
const canvasBlob=()=>new Promise(r=>renderer.domElement.toBlob(r,'image/png'));
const clock=s=>{s=Math.max(0,Math.round(s));return fa(Math.floor(s/60))+':'+String(s%60).padStart(2,'0').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])};
async function startFinalRender(){
 if(!ready||busy||job)return;
 if(!gpu){toast(gpuNote||'رندر نهایی به WebGPU نیاز دارد.');return}
 if(mode!=='photo'){await quality('photo');if(mode!=='photo')return}
 if(isPanelOpen()&&MOBILE)setPanel(false);
 transition=null;controls.autoRotate=false;$('#rotate').checked=false;controls.enabled=false;
 const prevPR=renderer.getPixelRatio(),pr=Math.max(prevPR,FINAL.edge/Math.max(stage.clientWidth,stage.clientHeight));
 job={start:performance.now(),prevPR,phase:'trace',before:null,after:null};
 resetProgressive();captureWhenDone=false;document.body.dataset.rendering='';$('#render-job').hidden=false;lockUI(true);
 renderer.setPixelRatio(pr);
 pathTracer.renderScale=1;pathTracer.frameBudget=FINAL.budget;pathTracer.maxBounces=FINAL.bounces;pathTracer.maxSamples=FINAL.samples;
 pathTracer.updateCamera();
 renderFast();job.before=canvasBlob();
 lastSampleCheck=0;stageReachedAt=0;lastAvg=0;lastProgressAt=performance.now();
 onSamples=c=>{
  if(!job)return;
  const p=Math.min(1,c.avg/FINAL.samples),eta=sampleRate>0?(FINAL.samples-c.avg)/sampleRate:0;
  $('#job-bar').style.width=(p*100).toFixed(1)+'%';
  $('#job-text').textContent=c.min>=FINAL.samples?'حذف نویز نهایی…':'رندر نهایی · '+fa(p*100)+'٪'+(eta>1?' · حدود '+clock(eta)+' مانده':'');
 };
 $('#job-text').textContent='رندر نهایی · آماده‌سازی';$('#job-bar').style.width='0%';
 status.textContent='رندر نهایی '+renderer.domElement.width+'×'+renderer.domElement.height+' · '+fa(FINAL.samples)+' نمونه';
}
function finalFrame(time){
 tracePasses();readSamples(time,FINAL.samples);
 if(job.phase==='trace'&&denoiseSettled(performance.now())){
  job.phase='saving';job.after=canvasBlob();
  const info={w:renderer.domElement.width,h:renderer.domElement.height,secs:(performance.now()-job.start)/1000};
  Promise.all([job.before,job.after]).then(([before,after])=>{endFinal();if(after)showResult(before,after,info);else toast('ذخیرهٔ رندر نهایی ممکن نشد.')}).catch(e=>{console.error(e);endFinal();toast('ذخیرهٔ رندر نهایی ممکن نشد.')});
 }else if(job.phase==='trace'&&performance.now()-lastProgressAt>30000&&!denoiser?.running){
  console.warn('Final render made no progress for 30s',debugInfo());endFinal('رندر نهایی پیشرفتی نداشت؛ کارت گرافیک پاسخ نمی‌دهد.');
 }
}
function endFinal(message){
 if(!job)return;
 const prevPR=job.prevPR;job=null;
 delete document.body.dataset.rendering;$('#render-job').hidden=true;controls.enabled=true;lockUI(false);
 pathTracer.maxBounces=PT_BOUNCES;pathTracer.frameBudget=PT_BUDGET;pathTracer.maxSamples=STAGES[0];
 renderer.setPixelRatio(prevPR);resize();resetProgressive();
 if(message)toast(message);
}
const lockUI=on=>document.querySelectorAll('.panel,.camera-nav,.side-tools').forEach(el=>el.inert=on);
let resultURLs=[];
function showResult(before,after,info){
 resultURLs.forEach(URL.revokeObjectURL);resultURLs=[before,after].map(b=>b?URL.createObjectURL(b):'');
 const box=$('#render-result');
 $('#rr-before').src=resultURLs[0];$('#rr-after').src=resultURLs[1];$('#rr-before').hidden=!before;
 $('#rr-compare').style.setProperty('--ar',info.w+'/'+info.h);$('#rr-compare').style.setProperty('--pos','50%');$('#rr-slider').value=50;
 $('#rr-info').textContent=info.w+'×'+info.h+' · '+fa(FINAL.samples)+' نمونه · '+fa(FINAL.bounces)+' بازتاب · '+clock(info.secs);
 $('#rr-download').onclick=()=>{const a=document.createElement('a');a.href=resultURLs[1];a.download=`OmidCity-Nilper-render-${info.w}x${info.h}.png`;a.click()};
 box.hidden=false;$('#rr-close').focus();
}
function closeResult(){$('#render-result').hidden=true;$('#final-render').focus({preventScroll:true})}
// ---- Diagnostics (?debug) ---------------------------------------------------------------------
function debugInfo(){
 const c=renderer?.domElement;
 return {renderer:gpu?'webgpu':'webgl2',adapter:adapterInfo,secure:isSecureContext,mode,ptState,stage:ptStage,samples:+latestSamples.toFixed(1),samplesPerSec:+sampleRate.toFixed(2),
  maxSamples:pathTracer?.maxSamples,budget:pathTracer?.frameBudget,passes:ptPasses,gpuMs:+gpuMs.toFixed(1),renderScale:pathTracer?.renderScale,canvas:c?c.width+'x'+c.height:'',overlayOK,
  denoiser:denoiser?(denoiser.running?'running':denoiser.complete?'complete':'idle'):'none',denoiserBroken,job:job?.phase||null};
}
// Several tracer passes per frame while idle (the frame budget itself stays fixed, since changing
// it rebuilds kernels); keeps each frame's GPU work around 25-30 ms.
function tracePasses(){for(let i=0;i<ptPasses;i++)pathTracer.renderSample()}
function tunePasses(ms){
 const max=job?FINAL.passes:(MOBILE?2:4);
 gpuMs=gpuMs*.8+ms*.2;
 if(gpuMs<14&&ptPasses<max)ptPasses++;else if((gpuMs>34&&ptPasses>1)||ptPasses>max)ptPasses--;
}
async function animate(time){
 if(!ready||busy||document.hidden){raf=requestAnimationFrame(animate);return;}
 if(transition){
  const t=Math.min((time-transition.start)/850,1),s=1-Math.pow(1-t,3);
  camera.position.lerpVectors(transition.from,transition.to,s);controls.target.lerpVectors(transition.fromTarget,transition.target,s);
  if(t===1)transition=null;
 }
 controls.update();
 try{
  const moving=dragging||controls.autoRotate||time-lastMove<350||transition;
  if(job){if(job.phase==='trace')finalFrame(time)}
  else if(mode==='photo'&&pathTracer&&!moving){
   photoFrame(time);
  }else{
   if(ptState!=='idle')resetProgressive();
   renderFast();
   if(frameCount%30===0)status.textContent=mode==='photo'?'رها کنید تا رندر واقعی شروع شود':(gpu?'نمایش زنده · WebGPU':'نمایش زنده · WebGL 2');
  }
  if(snapshotRequested)downloadCapture();
  if(DEBUG&&frameCount%30===0)$('#debug-hud').textContent=JSON.stringify(debugInfo(),null,1);
 }catch(e){
  console.error(e);
  if(job)endFinal('رندر نهایی متوقف شد.');
  if(mode==='photo'){mode='fast';resetProgressive();active('[data-quality]','quality','fast');toast('رندر دقیق متوقف شد؛ نمایش روان ادامه دارد.')}
  else if(pipeline){pipeline.dispose();pipeline=null;toast('نمایش سازگار با دستگاه فعال شد.')}
  else{cancelAnimationFrame(raf);fail(e);return}
 }
 frameCount++;
 // One frame of GPU work in flight at a time, so path tracing never builds a backlog.
 if(gpu&&mode==='photo'&&pathTracer){
  const t0=performance.now();
  try{await renderer.backend.device.queue.onSubmittedWorkDone();if(job?.phase==='trace'||ptState==='accum')tunePasses(performance.now()-t0);else ptPasses=1}
  catch(e){if(job)endFinal();mode='fast';resetProgressive();active('[data-quality]','quality','fast');toast('اتصال به کارت گرافیک قطع شد؛ نمایش روان فعال شد.')}
 }
 raf=requestAnimationFrame(animate);
}
async function init(){
 try{
  if(navigator.gpu){try{
   const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});adapterInfo=adapter?.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description}:null;
   if(adapter){renderer=new THREE.WebGPURenderer({antialias:true,powerPreference:'high-performance'});await renderer.init();gpu=renderer.backend.isWebGPUBackend===true}
   else gpuNote='کارت گرافیک این دستگاه برای WebGPU در دسترس نیست؛ رندر واقعی ممکن نیست.';
  }catch(e){console.warn('WebGPU unavailable',e);renderer?.dispose();renderer=null;gpuNote='راه‌اندازی WebGPU ناموفق بود؛ رندر واقعی ممکن نیست.'}}
  else gpuNote=!isSecureContext?'برای رندر واقعی، صفحه را با https باز کنید.':'این مرورگر WebGPU ندارد؛ برای رندر واقعی از Chrome یا Edge به‌روز استفاده کنید.';
  if(!renderer){renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});gpu=false}
  renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(max-width:720px)').matches?1.5:1.75));
  renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.3;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  stage.append(renderer.domElement,overlay);
  if(gpu)THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());else RectAreaLightUniformsLib.init();
  setupScene();resize();
  try{hdr=await new HDRLoader().loadAsync('./assets/studio.hdr');hdr.mapping=THREE.EquirectangularReflectionMapping;scene.environment=hdr;scene.environmentIntensity=.55}
  catch(e){console.warn('HDR unavailable',e);const data=new Float32Array(32*16*4);for(let i=0;i<data.length;i+=4){data[i]=.6;data[i+1]=.6;data[i+2]=.6;data[i+3]=1}hdr=new THREE.DataTexture(data,32,16,THREE.RGBAFormat,THREE.FloatType);hdr.mapping=THREE.EquirectangularReflectionMapping;hdr.needsUpdate=true;scene.environment=hdr;scene.environmentIntensity=.55}
  await loadModel('./assets/Nilper_Final-optimized.glb');
  raf=requestAnimationFrame(animate);
  if(!gpu){gpuNote||='رندر واقعی به WebGPU نیاز دارد.';$('#quality-help').textContent=gpuNote;$('#final-render').disabled=true;$('#final-render').title=gpuNote;document.querySelector('[data-quality="photo"]').classList.add('unavailable')}
  if(DEBUG){const hud=document.createElement('pre');hud.id='debug-hud';document.body.append(hud)}
 }catch(e){fail(e)}
}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{if(ready)preset(b.dataset.preset)});
document.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>quality(b.dataset.quality));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#exposure').oninput=e=>{if(!renderer)return;renderer.toneMappingExposure=+e.target.value*1.3;$('#exposure-out').textContent=fa(+e.target.value*100)+'٪';
 // Live feedback on the raster view while dragging; the traced samples are kept (exposure is display-only).
 if(mode==='photo'&&ptState!=='done')lastMove=performance.now()};
$('#angle').oninput=e=>{lightAngle=+e.target.value;$('#angle-out').textContent=fa(lightAngle)+'°';if(ready)lightPositions()};
$('#rotate').onchange=e=>{if(controls){if(e.target.checked&&mode==='photo')quality('fast');controls.autoRotate=e.target.checked}};
$('#structure').onchange=async e=>{if(!model)return;fabricMeshes.forEach(m=>m.visible=!e.target.checked);needsRebuild=true;if(mode==='photo')await quality('photo')};
$('#reset').onclick=()=>{if(!ready)return;$('#exposure').value=1;$('#exposure-out').textContent='۱۰۰٪';renderer.toneMappingExposure=1.3;$('#angle').value=35;$('#angle-out').textContent='۳۵°';lightAngle=35;lightPositions();preset('studio');$('#rotate').checked=false;controls.autoRotate=false;if($('#structure').checked){$('#structure').checked=false;fabricMeshes.forEach(m=>m.visible=true);needsRebuild=true;if(mode==='photo')quality('photo')}setView('perspective')};
// Mobile: the open panel covers #settings, so it carries its own close button.
const isPanelOpen=()=>$('#panel').classList.contains('open');
const setPanel=open=>{$('#panel').classList.toggle('open',open);$('#settings').setAttribute('aria-expanded',String(open));(open?$('#panel-close'):$('#settings')).focus({preventScroll:true})};
$('#settings').onclick=()=>setPanel(!isPanelOpen());
$('#panel-close').onclick=()=>setPanel(false);
addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#render-result').hidden)closeResult();else if(isPanelOpen())setPanel(false)});
$('#final-render').onclick=startFinalRender;
$('#job-cancel').onclick=()=>endFinal('رندر نهایی لغو شد.');
$('#rr-close').onclick=closeResult;
$('#render-result').onclick=e=>{if(e.target.id==='render-result')closeResult()};
$('#rr-slider').oninput=e=>$('#rr-compare').style.setProperty('--pos',e.target.value+'%');
$('#fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await $('#studio').requestFullscreen();else await document.exitFullscreen()}catch{toast('تمام‌صفحه روی این مرورگر پشتیبانی نمی‌شود.')}};
$('#capture').onclick=capture;
$('#local-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(f);try{mode='fast';resetProgressive();renderCache.clear();active('[data-quality]','quality','fast');await loadModel(localURL);if(!raf)raf=requestAnimationFrame(animate)}catch(err){fail(err)}};
addEventListener('resize',()=>{if(!renderer||!camera)return;if(job)endFinal('اندازهٔ پنجره تغییر کرد؛ رندر نهایی لغو شد.');resize();if(ready)setView('perspective',false)});
document.addEventListener('visibilitychange',()=>{if(job)return;lastMove=performance.now()});
addEventListener('beforeunload',()=>{resultURLs.forEach(URL.revokeObjectURL);cancelAnimationFrame(raf);controls?.dispose();pathTracer?.dispose();denoiser?.dispose();pipeline?.dispose();renderer?.dispose();hdr?.dispose();if(localURL)URL.revokeObjectURL(localURL)});
init();
