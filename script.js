const MAX_BYTES = 19 * 1024 * 1024;
const MAX_DIMENSION = 2200;
const MIN_QUALITY = 0.48;

const $ = id => document.getElementById(id);
let places = [];
let selectedFiles = [];
let compressedPhotos = [];

function slugify(text){
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

$("tripName").addEventListener("input", () => {
  if (!$("tripSlug").dataset.edited) $("tripSlug").value = slugify($("tripName").value);
  updateStructure();
});
$("tripSlug").addEventListener("input", () => {
  $("tripSlug").dataset.edited = "true";
  $("tripSlug").value = slugify($("tripSlug").value);
  updateStructure();
});
$("addPlace").addEventListener("click", addPlace);

function addPlace(name="", description=""){
  const id = Date.now() + Math.random();
  places.push({id,name,description});
  renderPlaces();
}
function removePlace(id){
  places = places.filter(p => p.id !== id);
  renderPlaces();
}
function renderPlaces(){
  places = Array.isArray(places) ? places.map(p => ({
    id: p?.id ?? (Date.now() + Math.random()),
    name: String(p?.name ?? ""),
    description: String(p?.description ?? "")
  })) : [];
  const box = $("places");
  box.innerHTML = "";
  places.forEach((p,i)=>{
    const row=document.createElement("div");
    row.className="place";
    row.innerHTML=`
      <input placeholder="Lugar ${i+1}" value="${escapeAttr(p.name)}">
      <input placeholder="Descripción breve" value="${escapeAttr(p.description)}">
      <button class="remove" type="button">Eliminar</button>`;
    const inputs=row.querySelectorAll("input");
    inputs[0].addEventListener("input",e=>p.name=e.target.value);
    inputs[1].addEventListener("input",e=>p.description=e.target.value);
    row.querySelector("button").addEventListener("click",()=>removePlace(p.id));
    box.appendChild(row);
  });
}
function escapeAttr(v){
  return String(v||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

const dropzone=document.querySelector(".dropzone");
$("photoInput").addEventListener("change",e=>handleFiles([...e.target.files]));
["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.style.borderColor="var(--accent)"}));
["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.style.borderColor=""}));
dropzone.addEventListener("drop",e=>handleFiles([...e.dataTransfer.files]));

function handleFiles(files){
  const images=files.filter(f=>f.type.startsWith("image/"));
  selectedFiles = [...selectedFiles, ...images];
  updatePhotoInfo();
}

function updatePhotoInfo(){
  $("photoCount").textContent=`${selectedFiles.length} foto${selectedFiles.length===1?"":"s"}`;
  const raw=selectedFiles.reduce((a,f)=>a+f.size,0);
  $("photoSize").textContent=`${formatMB(raw)} MB originales`;
  $("photoMessage").textContent=selectedFiles.length
    ? "Al generar, las fotos se convertirán y comprimirán automáticamente."
    : "Todavía no has añadido fotos.";
  renderPreview();
}

function renderPreview(){
  $("preview").innerHTML="";
  selectedFiles.slice(0,80).forEach(f=>{
    const url=URL.createObjectURL(f);
    const div=document.createElement("div");
    div.className="thumb";
    div.innerHTML=`<img src="${url}" alt=""><span>${escapeHtml(f.name)}</span>`;
    $("preview").appendChild(div);
  });
  if(selectedFiles.length>80){
    const d=document.createElement("div");d.textContent=`+ ${selectedFiles.length-80} fotos`;
    d.style.padding="15px";$("preview").appendChild(d);
  }
}

function formatMB(bytes){return (bytes/1024/1024).toFixed(2)}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("No se pudo leer "+file.name))};
    img.src=url;
  });
}

function canvasBlob(canvas,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
}

async function compressFile(file, quality){
  const img=await loadImage(file);
  let scale=Math.min(1,MAX_DIMENSION/Math.max(img.naturalWidth,img.naturalHeight));
  let canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,quality);
  return {blob,width:canvas.width,height:canvas.height};
}

async function compressAll(){
  compressedPhotos=[];
  if(!selectedFiles.length) return;
  $("generateMessage").textContent="Comprimiendo fotos… 0%";
  let quality=0.78;

  for(let pass=0;pass<6;pass++){
    compressedPhotos=[];
    for(let i=0;i<selectedFiles.length;i++){
      const result=await compressFile(selectedFiles[i],quality);
      compressedPhotos.push({
        name:`foto-${String(i+1).padStart(3,"0")}.webp`,
        blob:result.blob
      });
      $("generateMessage").textContent=`Comprimiendo fotos… ${Math.round(((i+1)/selectedFiles.length)*100)}%`;
      await new Promise(r=>setTimeout(r,0));
    }
    const total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
    if(total<=MAX_BYTES || quality<=MIN_QUALITY) break;
    quality-=0.07;
  }

  let total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
  if(total>MAX_BYTES){
    // Segunda estrategia: reducir dimensiones progresivamente.
    let originalMax=MAX_DIMENSION;
    while(total>MAX_BYTES && originalMax>1200){
      originalMax-=200;
      for(let i=0;i<selectedFiles.length;i++){
        const img=await loadImage(selectedFiles[i]);
        const scale=Math.min(1,originalMax/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        canvas.getContext("2d",{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
        const blob=await canvasBlob(canvas,MIN_QUALITY);
        compressedPhotos[i].blob=blob;
      }
      total=compressedPhotos.reduce((a,p)=>a+p.blob.size,0);
    }
  }

  updateMeter(total);
  $("generateMessage").textContent=total<=MAX_BYTES
    ? `Fotos listas: ${formatMB(total)} MB.`
    : `No caben todas por debajo de 19 MB. Resultado: ${formatMB(total)} MB.`;
  return total;
}

function updateMeter(total){
  const pct=Math.min(100,(total/MAX_BYTES)*100);
  $("meterBar").style.width=pct+"%";
  $("photoSize").textContent=`${formatMB(total)} MB comprimidas`;
}

function updateStructure(){
  const slug=slugify($("tripSlug").value)||"mi-viaje";
  $("structurePreview").textContent=
`${slug}/
├── index.html
├── style.css
├── script.js
└── fotos/
    ├── foto-001.webp
    ├── foto-002.webp
    └── ...`;
}

async function generateZip(){
  const name=$("tripName").value.trim();
  const slug=slugify($("tripSlug").value);
  if(!name) return showError("Escribe el nombre del viaje.");
  if(!slug) return showError("Escribe un slug válido.");
  if(!selectedFiles.length) return showError("Añade al menos una foto.");

  $("generate").disabled=true;
  $("generateMessage").textContent="Preparando…";

  try{
    const total=await compressAll();
    if(total>MAX_BYTES) throw new Error("Las fotos siguen superando el límite de 19 MB. Selecciona menos fotos o vuelve a intentarlo.");
    const files={};
    files["index.html"]=buildTripHtml();
    files["style.css"]=TRIP_STYLE;
    files["script.js"]=TRIP_SCRIPT;
    for(const photo of compressedPhotos) files[`fotos/${photo.name}`]=photo.blob;

    const zip=await createZip(files);
    const blob=new Blob([zip],{type:"application/zip"});
    downloadBlob(blob,`${slug}.zip`);
    $("generateMessage").textContent=`¡Listo! ${slug}.zip descargado (${formatMB(blob.size)} MB).`;
  }catch(err){
    showError(err.message||"Ha ocurrido un error.");
  }finally{$("generate").disabled=false}
}
$("generate").addEventListener("click",generateZip);

function showError(msg){
  $("generateMessage").textContent=msg;
  $("generateMessage").style.color="var(--danger)";
  setTimeout(()=>$("generateMessage").style.color="",4000);
}

function buildTripHtml(){
  const name=escapeHtml(String($("tripName").value || "").trim());
  const date=String($("tripDate").value || "");
  const desc=escapeHtml(String($("tripDescription").value || "").trim());
  const dateText=date?new Date(date+"T12:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}):"";
  const placeHtml = places
  .filter(p => String(p?.name ?? "").trim() !== "")
  .map(p => {
    const placeName = String(p?.name ?? "").trim();
    const placeDescription = String(p?.description ?? "").trim();
    return `<article class="place-card"><span>✦</span><h3>${escapeHtml(placeName)}</h3><p>${escapeHtml(placeDescription)}</p></article>`;
  }).join("");
  const gallery=compressedPhotos.map((p,i)=>`<figure><img src="fotos/${p.name}" alt="Foto ${i+1}" loading="lazy"></figure>`).join("");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><link rel="stylesheet" href="style.css"></head>
<body><main class="trip">
<header class="trip-hero"><div class="stamp">TRIP</div><p class="trip-date">${dateText}</p><h1>${name}</h1><p>${desc}</p></header>
<section><h2>Pasaporte de lugares</h2><div class="places">${placeHtml||"<p>Aún no hay lugares añadidos.</p>"}</div></section>
<section><h2>Recuerdos</h2><div class="gallery">${gallery}</div></section>
<footer>Mi cuaderno de viaje · ${new Date().getFullYear()}</footer>
</main></body></html>`;
}

const TRIP_STYLE=`*{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#202621;font-family:system-ui,sans-serif}.trip{max-width:1100px;margin:auto;padding:30px 18px 60px}.trip-hero{background:#1e5544;color:white;border-radius:28px;padding:60px 35px;margin-bottom:30px;position:relative;overflow:hidden}.stamp{position:absolute;right:25px;top:25px;border:2px solid #fff8;border-radius:50%;padding:20px;transform:rotate(12deg);font-weight:900}.trip-date{text-transform:uppercase;letter-spacing:.15em;opacity:.75;font-size:12px}.trip-hero h1{font:clamp(45px,8vw,90px) Georgia,serif;margin:15px 0;line-height:.95}.trip-hero p:last-child{max-width:650px;line-height:1.7;font-size:17px}h2{font:34px Georgia,serif;margin:40px 0 18px}.places{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:15px}.place-card{background:#fffdf9;border:1px solid #ddd8ce;border-radius:18px;padding:22px}.place-card span{color:#1e5544}.place-card h3{margin:15px 0 7px}.place-card p{color:#69736d;line-height:1.5}.gallery{columns:3 230px;column-gap:12px}.gallery figure{margin:0 0 12px;break-inside:avoid}.gallery img{display:block;width:100%;border-radius:15px}footer{text-align:center;color:#788079;margin-top:45px;font-size:12px}@media(max-width:600px){.trip-hero{padding:45px 22px}.stamp{display:none}}`;

const TRIP_SCRIPT=`document.querySelectorAll(".gallery img").forEach(img=>img.addEventListener("click",()=>{window.open(img.src,"_blank")}));`;

function downloadBlob(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// ZIP writer sin librerías externas: Store + CRC32.
function crc32(buf){
  let table=crc32.table;
  if(!table){table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}crc32.table=table}
  let c=0xffffffff;for(let i=0;i<buf.length;i++)c=table[(c^buf[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(arrays){let len=arrays.reduce((a,x)=>a+x.length,0),out=new Uint8Array(len),p=0;for(const x of arrays){out.set(x,p);p+=x.length}return out}
async function createZip(files){
  const enc=new TextEncoder(), local=[], central=[];let offset=0;
  for(const [name,data] of Object.entries(files)){
    const bytes=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):enc.encode(data);
    const nb=enc.encode(name), crc=crc32(bytes);
    const lh=concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),nb,bytes]);
    local.push(lh);
    const ch=concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
    central.push(ch);offset+=lh.length;
  }
  const cd=concat(central), lf=concat(local);
  const end=concat([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(central.length),u16(central.length),u32(cd.length),u32(lf.length),u16(0)]);
  return concat([lf,cd,end]);
}

updateStructure();
addPlace();
