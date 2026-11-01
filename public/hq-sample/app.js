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
// Progressive photo render: the live frame stays on screen (as a 2D overlay) while the path
// tracer accumulates underneath; each sample stage is denoised and cross-faded in, so the
// user never sees raw noise. Finished views are cached and restored instantly.
const MOBILE=matchMedia('(max-width:720px)').matches;
const STAGES=MOBILE?[8,32,96]:[16,64,256];
const PT_MAX_PIXELS=MOBILE?1.2e6:3.2e6, BUDGET_MIN=1e5, BUDGET_MAX=MOBILE?6e5:2e6, CACHE_LIMIT=MOBILE?3:6, FADE_MS=650;
const renderCache=new Map();
let ptState='idle', stageReachedAt=0, denoiserBroken=false, ptStage=0, ptKey='', revealEnd=0, captureWhenDone=false, overlayOK=null, gpuEma=16, budgetTick=0;
const overlay=document.createElement('canvas');overlay.id='pt-overlay';overlay.setAttribute('aria-hidden','true');
const octx=overlay.getContext('2d',{willReadFrequently:false});
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
function applyRenderScale(){if(!pathTracer)return;const s=renderer.getDrawingBufferSize(new THREE.Vector2());pathTracer.renderScale=Math.min(1,Math.sqrt(PT_MAX_PIXELS/Math.max(1,s.x*s.y)))}
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
 if(busy||!ready)return;
 if(next==='fast'){mode='fast';resetProgressive();captureWhenDone=false;active('[data-quality]','quality',next);$('#quality-help').textContent='برای چرخش و بررسی محصول.';return}
 if(!gpu){toast('رندر دقیق به WebGPU نیاز دارد؛ نمایش روان روی این مرورگر فعال است.');return}
 busy=true;$('#load-title').textContent='آماده‌سازی رندر دقیق';$('#load-detail').textContent='محاسبهٔ نور و بازتاب‌ها؛ ممکن است چند لحظه طول بکشد';$('#loader').hidden=false;
 await new Promise(r=>setTimeout(r,60));
 try{
  controls.autoRotate=false;$('#rotate').checked=false;
  if(!pathTracer){
   const {WebGPUPathTracer,OIDNDenoiser}=await import('three-gpu-pathtracer/webgpu');
   pathTracer=new WebGPUPathTracer(renderer);
   const {initUNetFromURL}=await import('oidn-web');
   denoiser=new OIDNDenoiser({initUNetFromURL,auxWeightsUrl:'./assets/denoise.tza',maxTileSize:256});pathTracer.setDenoiser(denoiser);
   pathTracer.maxBounces=6;pathTracer.maxSamples=STAGES[0];pathTracer.frameBudget=250000;
   // Presentation is handled here (overlay + staged denoise), so skip the tracer's own
   // low-res preview and fade: every sample goes into the full-resolution image.
   pathTracer.renderDelay=0;pathTracer.dynamicLowRes=false;pathTracer.minSamples=0;pathTracer.fadeDuration=0;
   applyRenderScale();
  }
  if(needsRebuild){const intensity=sun.intensity;sun.intensity=0;pathTracer.setScene(scene,camera);sun.intensity=intensity;needsRebuild=false;renderCache.clear()}
  resetProgressive();pathTracer.updateCamera();mode='photo';latestSamples=0;lastMove=performance.now();
  active('[data-quality]','quality',next);$('#quality-help').textContent='پس از توقف حرکت، تصویر فوتورئال به‌تدریج جایگزین می‌شود. نماهای رندرشده ذخیره می‌مانند.';
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
// ---- Progressive photo render -------------------------------------------------------------
function viewKey(){
 const p=camera.position,t=controls.target,q=v=>Math.round(v*200),c=renderer.domElement;
 return [q(p.x),q(p.y),q(p.z),q(t.x),q(t.y),q(t.z),currentPreset,lightAngle,$('#structure').checked?1:0,$('#exposure').value,c.width,c.height].join('|');
}
// Copies the WebGPU canvas as presented by the render call just made (same task).
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
 // Some browsers cannot read back a WebGPU canvas; then fall back to the visible progressive render.
 if(overlayOK===null){const d=octx.getImageData(overlay.width>>1,overlay.height>>1,1,1).data;overlayOK=d[3]>0;if(!overlayOK){console.warn('Canvas snapshot unavailable; progressive overlay disabled');return}}
 overlay.style.transition='none';overlay.style.opacity='1';
}
function hideOverlay(fade){overlay.style.transition=fade?`opacity ${FADE_MS}ms ease`:'none';overlay.style.opacity='0'}
function setProgress(v){const bar=$('#pt-progress');bar.hidden=v===null;if(v!==null)bar.firstElementChild.style.width=(Math.min(1,v)*100).toFixed(1)+'%'}
function resetProgressive(){ptState='idle';hideOverlay(false);setProgress(null);if(mode==='photo')status.textContent='پس از توقف، رندر دقیق ادامه می‌یابد'}
function stageLabel(){return 'مرحله '+fa(ptStage+1)+' از '+fa(STAGES.length)}
function beginStage(i){ptStage=i;pathTracer.maxSamples=STAGES[i];ptState='accum';lastSampleCheck=0;stageReachedAt=0}
function storeCache(){
 let entry=renderCache.get(ptKey)||document.createElement('canvas');renderCache.delete(ptKey);
 renderCache.set(ptKey,snapshotInto(entry));
 while(renderCache.size>CACHE_LIMIT)renderCache.delete(renderCache.keys().next().value);
 return entry;
}
function pollSamples(time){
 if(time-lastSampleCheck<1000||samplePending)return;
 lastSampleCheck=time;samplePending=true;
 pathTracer.getSampleCountsAsync().then(c=>{
  if(ptState!=='accum')return;
  latestSamples=c.avg;document.body.dataset.samples=Math.round(c.avg);
  if(c.min>=STAGES[ptStage]){if(!stageReachedAt)stageReachedAt=time}else stageReachedAt=0;
  setProgress(c.avg/STAGES[STAGES.length-1]);
  status.textContent=denoiser?.running?'پاک‌سازی نویز · '+stageLabel():'رندر دقیق · '+stageLabel()+' · '+fa(Math.min(100,c.avg/STAGES[ptStage]*100))+'٪';
 }).catch(console.error).finally(()=>samplePending=false);
}
function photoFrame(time){
 switch(ptState){
  case 'idle':{
   ptKey=viewKey();const hit=renderCache.get(ptKey);
   if(hit&&overlayOK!==false){
    renderCache.delete(ptKey);renderCache.set(ptKey,hit);showOverlay(hit);ptState='cached';setProgress(1);status.textContent='رندر دقیق · کامل (ذخیره‌شده)';
    if(captureWhenDone){captureWhenDone=false;downloadCapture(hit)}
    return;
   }
   // Freeze the sharp live frame on screen, then find how far the tracer already got for this
   // view (exposure tweaks do not reset it) and resume from the matching stage.
   renderFast();showOverlay(renderer.domElement);ptState='probe';setProgress(0);status.textContent='آماده‌سازی رندر دقیق';
   pathTracer.getSampleCountsAsync().then(c=>{if(ptState!=='probe')return;let i=0;while(i<STAGES.length-1&&c.min>=STAGES[i+1])i++;beginStage(i)})
    .catch(()=>{if(ptState==='probe')beginStage(0)});
   return;
  }
  case 'probe':case 'cached':return;
  case 'accum':
   pathTracer.renderSample();pollSamples(time);
   // The blit above already used the finished denoised image: reveal it.
   // Denoiser unavailable (e.g. weights failed to load): reveal the converged raw image instead.
   const stalled=!denoiser?.complete&&stageReachedAt&&!denoiser?.running&&time-stageReachedAt>(denoiserBroken?0:8000);
   if(stalled)denoiserBroken=true;
   if(denoiser?.complete||stalled){ptState='reveal';revealEnd=time+FADE_MS;hideOverlay(true);const last=ptStage===STAGES.length-1;if(last)setProgress(1);status.textContent=last?'رندر دقیق · کامل':'رندر دقیق · '+stageLabel()}
   return;
  case 'reveal':
   pathTracer.renderSample();
   if(time<revealEnd)return;
   if(ptStage<STAGES.length-1){showOverlay(renderer.domElement);beginStage(ptStage+1)}
   else{
    ptState='done';setProgress(1);const shot=storeCache();
    if(captureWhenDone){captureWhenDone=false;downloadCapture(shot)}
   }
   return;
  case 'done':
   // Exposure is applied when presenting, so it updates live here; keep the cache in step.
   pathTracer.renderSample();
   {const k=viewKey();if(k!==ptKey){const e=renderCache.get(ptKey);renderCache.delete(ptKey);ptKey=k;if(e)renderCache.set(k,e);storeCache()}}
   return;
 }
}
// Keep each frame's GPU work near ~25 ms so the page stays responsive while converging fast.
function adaptBudget(ms){
 gpuEma=gpuEma*.85+ms*.15;if(++budgetTick%12)return;
 const b=pathTracer.frameBudget;
 if(gpuEma<12&&b<BUDGET_MAX)pathTracer.frameBudget=Math.min(BUDGET_MAX,Math.round(b*1.3));
 else if(gpuEma>34&&b>BUDGET_MIN)pathTracer.frameBudget=Math.max(BUDGET_MIN,Math.round(b*.75));
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
  if(mode==='photo'&&pathTracer&&!moving){
   photoFrame(time);
  }else{
   if(ptState!=='idle')resetProgressive();
   renderFast();
   if(frameCount%30===0)status.textContent=mode==='photo'?'پس از توقف، رندر دقیق ادامه می‌یابد':(gpu?'نمایش زنده · WebGPU':'نمایش زنده · WebGL 2');
  }
  if(snapshotRequested)downloadCapture();
 }catch(e){
  console.error(e);
  if(mode==='photo'){mode='fast';resetProgressive();active('[data-quality]','quality','fast');toast('رندر دقیق متوقف شد؛ نمایش روان ادامه دارد.')}
  else if(pipeline){pipeline.dispose();pipeline=null;toast('نمایش سازگار با دستگاه فعال شد.')}
  else{cancelAnimationFrame(raf);fail(e);return}
 }
 frameCount++;
 if(gpu&&mode==='photo'&&pathTracer){
  const t0=performance.now();
  try{await renderer.backend.device.queue.onSubmittedWorkDone();if(ptState==='accum')adaptBudget(performance.now()-t0)}
  catch(e){mode='fast';resetProgressive();active('[data-quality]','quality','fast');toast('نمایش روان فعال شد.')}
 }
 raf=requestAnimationFrame(animate);
}
async function init(){
 try{
  if(navigator.gpu){try{
   const adapter=await navigator.gpu.requestAdapter();if(adapter){renderer=new THREE.WebGPURenderer({antialias:true,powerPreference:'high-performance'});await renderer.init();gpu=renderer.backend.isWebGPUBackend===true}
  }catch(e){console.warn('WebGPU unavailable',e);renderer?.dispose();renderer=null}}
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
  if(!gpu){$('#quality-help').textContent='نمایش سازگار فعال است؛ رندر دقیق نیاز به WebGPU دارد.'}
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
addEventListener('keydown',e=>{if(e.key==='Escape'&&isPanelOpen())setPanel(false)});
$('#fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await $('#studio').requestFullscreen();else await document.exitFullscreen()}catch{toast('تمام‌صفحه روی این مرورگر پشتیبانی نمی‌شود.')}};
$('#capture').onclick=capture;
$('#local-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(f);try{mode='fast';resetProgressive();renderCache.clear();active('[data-quality]','quality','fast');await loadModel(localURL);if(!raf)raf=requestAnimationFrame(animate)}catch(err){fail(err)}};
addEventListener('resize',()=>{if(renderer&&camera){resize();if(ready)setView('perspective',false)}});
document.addEventListener('visibilitychange',()=>{lastMove=performance.now();if(ptState!=='done'&&ptState!=='cached'){pathTracer?.reset();resetProgressive()}});
addEventListener('beforeunload',()=>{cancelAnimationFrame(raf);controls?.dispose();pathTracer?.dispose();denoiser?.dispose();pipeline?.dispose();renderer?.dispose();hdr?.dispose();if(localURL)URL.revokeObjectURL(localURL)});
init();
