import{serve}from"https://deno.land/std@0.168.0/http/server.ts";
const R=Deno.env.get("RESEND_API_KEY"),F="noreply@vellu.cc";
const SU=Deno.env.get("SUPABASE_URL"),SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AO=["https://vellu.cc","https://www.vellu.cc","https://vellu.io","https://www.vellu.io","http://localhost:5173","http://localhost:5174","http://localhost:5175","http://localhost:5176"];
function cors(o){const a=o&&AO.includes(o)?o:"https://vellu.cc";return{"Access-Control-Allow-Origin":a,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-internal-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function esc(s){if(s===null||s===undefined)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");}
function plainText(s){if(s===null||s===undefined)return"";return String(s).replace(/[\r\n]+/g," ").slice(0,200);}
function safeImgSrc(url){if(!url||typeof url!=="string")return null;try{const u=new URL(url);if(u.protocol!=="https:"&&u.protocol!=="http:")return null;return u.toString();}catch{return null;}}
async function verifyUserToken(tok){if(!tok||!SU||!SK)return null;try{const r=await fetch(`${SU}/auth/v1/user`,{headers:{"Authorization":`Bearer ${tok}`,"apikey":SK}});if(!r.ok)return null;const u=await r.json();return u?.id||null;}catch{return null;}}
// Mag deze ingelogde gebruiker facturen versturen? Alleen relevant voor
// MEDEWERKERS: de eigenaar staat niet in staff_members en mag altijd.
// De eigenaar zet dit uit voor personeel in loondienst (Instellingen > Team).
async function staffMayInvoice(uid){if(!uid||!SU||!SK)return true;try{const h={"apikey":SK,"Authorization":`Bearer ${SK}`};const r=await fetch(`${SU}/rest/v1/staff_members?user_id=eq.${uid}&select=owner_id&limit=1`,{headers:h});const rows=r.ok?await r.json():[];if(!rows?.length)return true;const own=rows[0].owner_id;if(own===uid)return true;const r2=await fetch(`${SU}/rest/v1/profiles?id=eq.${own}&select=staff_can_invoice`,{headers:h});const p=r2.ok?await r2.json():[];return p?.[0]?.staff_can_invoice!==false;}catch{return true;}}
// Naive HTML→text for a multipart/alternative plain-text part. HTML-only
// emails score higher on spam filters (SpamAssassin MIME_HTML_ONLY), so
// always ship a text version too — it helps inbox placement.
function htmlToText(html){return String(html||"").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>(?=)/gi,"\n").replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#39;/gi,"'").replace(/&quot;/gi,'"').replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
// `from` overrides the default sender (used to add the salon's display name),
// `replyTo` routes replies to the salon so the mail looks legitimate.
async function sendEmail(to,subject,html,from,replyTo){if(!R)throw new Error("RESEND_API_KEY not configured");const payload={from:from||F,to,subject,html,text:htmlToText(html)};if(replyTo)payload.reply_to=replyTo;const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${R}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok){console.error("Resend API error:",data);throw new Error(data?.message||`Email send failed (${res.status})`);}return data;}
const txt=(l,nl,en,es)=>l==="es"?(es||en):(l==="en"?en:nl);
serve(async(req)=>{
const origin=req.headers.get("origin");const headers=cors(origin);
if(req.method==="OPTIONS")return new Response("ok",{headers});
let authed=false;let callerId=null;
const sec=req.headers.get("x-internal-secret");
if(sec&&sec===SK){authed=true;}else{
const a=req.headers.get("authorization")||"";
const tok=a.startsWith("Bearer ")?a.slice(7):null;
if(tok){callerId=await verifyUserToken(tok);authed=!!callerId;}
}
if(!authed)return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{...headers,"Content-Type":"application/json"}});
const fmtD=(ds,l="nl")=>{try{const d=new Date(ds+"T12:00:00");if(l==="es"){const dy=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];const mo=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];return`${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;}if(l==="en"){const dy=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];const mo=["January","February","March","April","May","June","July","August","September","October","November","December"];return`${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;}const dy=["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];const mo=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];return`${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;}catch{return esc(ds);}};
const acOf=(b)=>/^#[0-9a-fA-F]{6}$/.test(String(b.salon_accent||""))?b.salon_accent:"#c9a96e";
// LOGO: begrens ALLEEN de breedte en laat de hoogte meelopen (height:auto).
// Met max-width ÉN max-height samen rekt een deel van de mailprogramma's — op
// iPhone onder meer — het beeld naar precies die twee maten in plaats van de
// verhouding te bewaren. Een salon op Bonaire (24-08-2026) zag haar logo van
// 512x397 daardoor uitgeplet als een band van 200x60. Eén dimensie vastzetten
// kan per definitie niet vervormen. display:block + margin:auto centreert, want
// text-align op de ouder doet niets met een blok-element.
// WITTE KAART ERONDER. Vrijwel elk salonlogo is getekend voor een witte
// achtergrond — vaak een JPEG, die per definitie geen transparantie heeft. In
// een mailprogramma op donkere modus werd dat een rauwe witte rechthoek midden
// in een zwarte mail. Transparant maken lost het NIET op: het lijnwerk in zulke
// logo's is meestal zwart en valt dan juist weg tegen het donker. Dus geven we
// het logo bewust een eigen wit kaartje met afgeronde hoeken en wat lucht — dan
// oogt het als een beeldmerk in plaats van een uitgeknipt vlak, en staat het in
// beide modi op de achtergrond waar het voor ontworpen is.
// Table i.p.v. div: Outlook rekent met de Word-engine en doet niets met
// inline-block. border-collapse:separate is nodig om border-radius op een cel
// te laten werken; waar afgeronde hoeken niet gaan (Outlook desktop) blijft het
// gewoon een net wit vlak met padding.
const lH=(b)=>{const ac=acOf(b);const logo=safeImgSrc(b.salon_logo);const n=esc(b.salon_name);if(logo)return`<div style="text-align:center;margin-bottom:32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;border-collapse:separate;"><tr><td style="background:#ffffff;border-radius:14px;padding:14px 18px;text-align:center;"><img src="${esc(logo)}" alt="${n}" style="width:auto;height:auto;max-width:180px;display:block;border:0;" /></td></tr></table><div style="width:40px;height:1px;background:${ac};margin:0 auto;"></div></div>`;return`<div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:${ac};margin:12px auto;"></div></div>`;};
let CURSYM="€";const fP=(p)=>`${CURSYM}${parseFloat(p||0).toFixed(2)}`;
const W=`<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">`;
const bS=`style="background:#f9f7f4;border-radius:12px;padding:24px;margin-bottom:28px;"`;
const tS=`style="width:100%;border-collapse:collapse;"`;
const cL=`style="padding:8px 0;color:#888;font-size:13px;"`;
const cR=`style="padding:8px 0;font-weight:500;text-align:right;"`;
const gL=`style="border-top:1px solid #e8e0d5;"`;
const gA=`style="padding:12px 0 4px;font-weight:600;color:#c9a96e;"`;
const gR=`style="padding:12px 0 4px;font-weight:600;color:#c9a96e;text-align:right;"`;
try{
const{type,booking:b}=await req.json();const lang=b.lang||"nl";const nD=fmtD(b.date,lang);CURSYM=(typeof b.currency==="string"&&b.currency.trim())?b.currency.trim():"€";
// Owner-facing emails (booking_notification, owner_cancellation,
// waitlist_joined) render in the SALON's language, not the client's booking
// language — callers pass owner_lang (derived from the salon's country).
// Fallback nl = the historical behaviour, so old callers are unaffected.
const oLang=["nl","en","es"].includes(b.owner_lang)?b.owner_lang:"nl";
// Friendly sender: show the salon's name (falls back to Vellu for our own
// subscription invoices) and route replies to the salon. A recognisable
// From name + Reply-To improves trust and inbox placement vs bare noreply@.
const fromName=(String(b.salon_name||"Vellu").replace(/[<>\r\n"]/g,"").trim()||"Vellu").slice(0,64);
const fromLine=`${fromName} <${F}>`;
const replyTo=(String(b.salon_email||b.owner_email||"").trim())||null;
const send=(to,subject,html)=>sendEmail(to,subject,html,fromLine,replyTo);
const eC=esc(b.client_name),eS=esc(b.salon_name),eSv=esc(b.service_name),eT=esc(b.time),eD=esc(nD),ePh=esc(b.client_phone),eIN=esc(b.invoice_number),eAd=esc(b.salon_address),eKv=esc(b.salon_kvk),eBt=esc(b.salon_btw),eIb=esc(b.salon_iban),eSl=esc(b.salon_slug);
// Salon accent colour — every salon email is branded with it (falls back to
// Vellu gold when not provided, e.g. Vellu's own subscription invoice).
const AC=acOf(b);
const sCU=safeImgSrc(b.cancel_url);
const row=(l,r)=>`<tr><td ${cL}>${l}</td><td ${cR}>${r}</td></tr>`;
const totRow=(l,r)=>`<tr ${gL}><td style="padding:12px 0 4px;font-weight:600;color:${AC};">${l}</td><td style="padding:12px 0 4px;font-weight:600;color:${AC};text-align:right;">${r}</td></tr>`;
if(type==="booking_confirmation"){
const cs=sCU?`<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;"><p style="color:#666;font-size:13px;margin:0 0 12px;">${txt(lang,"Kun je niet komen? Annuleer tot 24 uur van tevoren:","Can't make it? Cancel up to 24 hours in advance:","¿No puedes venir? Cancela hasta 24 horas antes:")}</p><a href="${esc(sCU)}" style="display:inline-block;background:#fee2e2;color:#dc2626;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Afspraak annuleren","Cancel appointment","Cancelar cita")}</a></div>`:"";
await send(plainText(b.client_email),plainText(txt(lang,`Bevestiging afspraak bij ${b.salon_name}`,`Appointment confirmed at ${b.salon_name}`,`Cita confirmada en ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Je afspraak is bevestigd","Your appointment is confirmed","Tu cita está confirmada")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Bedankt voor je boeking bij <strong>${eS}</strong>`,`Thank you for booking at <strong>${eS}</strong>`,`Gracias por tu reserva en <strong>${eS}</strong>`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(lang,"Datum","Date","Fecha"),eD)}${row(txt(lang,"Tijd","Time","Hora"),eT)}${row(txt(lang,"Betaling","Payment","Pago"),b.payment==="online"?txt(lang,"Betaalverzoek na afloop","Payment request afterwards","Solicitud de pago después"):txt(lang,"Betalen bij afspraak","Pay at appointment","Pago en la cita"))}${totRow(txt(lang,"Totaal","Total","Total"),fP(b.price))}</table></div>${cs}<p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Tot dan, ${eC}!`,`See you then, ${eC}!`,`¡Hasta entonces, ${eC}!`)}</p></div>`);}
// Staff copies respect the owner's visibility toggles (Instellingen → Team):
// phone/e-mail weg als klantgegevens uit staat, prijsregel weg als omzet uit
// staat. De EIGENAAR krijgt altijd de volledige mail. Vlaggen afwezig
// (oudere callers) = alles tonen, zoals voorheen.
const _hideContact=(em:string)=>em!==b.owner_email&&b.staff_view_client_contact===false;
const _hidePrice=(em:string)=>em!==b.owner_email&&b.staff_view_revenue===false;
if(type==="booking_notification"){
const rcp=[];if(b.owner_email)rcp.push(b.owner_email);if(b.staff_emails?.length>0)rcp.push(...b.staff_emails);
for(const em of rcp){await send(plainText(em),plainText(txt(oLang,`Nieuwe boeking: ${b.client_name}`,`New booking: ${b.client_name}`,`Nueva reserva: ${b.client_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(oLang,"Nieuwe boeking!","New booking!","¡Nueva reserva!")}</h2><p style="color:#666;margin-bottom:28px;">${txt(oLang,`Er is een nieuwe afspraak gemaakt bij <strong>${eS}</strong>`,`A new appointment was booked at <strong>${eS}</strong>`,`Se ha reservado una nueva cita en <strong>${eS}</strong>`)}</p><div ${bS.replace('margin-bottom:28px;','')}><table ${tS}>${row(txt(oLang,"Klant","Client","Cliente"),eC)}${(b.client_phone&&!_hideContact(em))?row(txt(oLang,"Telefoon","Phone","Teléfono"),ePh):""}${row(txt(oLang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(oLang,"Datum","Date","Fecha"),esc(fmtD(b.date,oLang)))}${row(txt(oLang,"Tijd","Time","Hora"),eT)}${_hidePrice(em)?"":totRow(txt(oLang,"Totaal","Total","Total"),fP(b.price))}</table></div></div>`);}}
// Owner/staff notification that a CLIENT cancelled their own appointment
// (via the cancel link in their booking email). Fired server-side by the
// cancel-appointment edge function so it lands even if the client closes
// the tab. Red accent + optional cancellation reason. Distinct from the
// green "Nieuwe boeking!" booking_notification above.
if(type==="owner_cancellation"){
const rcp=[];if(b.owner_email)rcp.push(b.owner_email);if(b.staff_emails?.length>0)rcp.push(...b.staff_emails);
const eR=b.reason?esc(String(b.reason).slice(0,300)):"";
const reasonRow=eR?`<tr><td ${cL}>${txt(oLang,"Reden","Reason","Motivo")}</td><td ${cR}>${eR}</td></tr>`:"";
const subj=txt(oLang,`Afspraak geannuleerd: ${b.client_name}`,`Appointment cancelled: ${b.client_name}`,`Cita cancelada: ${b.client_name}`);
for(const em of rcp){await send(plainText(em),plainText(subj),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;color:#dc2626;">${txt(oLang,"Afspraak geannuleerd","Appointment cancelled","Cita cancelada")}</h2><p style="color:#666;margin-bottom:28px;">${txt(oLang,`<strong>${eC}</strong> heeft de afspraak bij <strong>${eS}</strong> geannuleerd. Deze tijd is nu weer vrij in je agenda.`,`<strong>${eC}</strong> cancelled their appointment at <strong>${eS}</strong>. This slot is now free again in your agenda.`,`<strong>${eC}</strong> canceló su cita en <strong>${eS}</strong>. Este horario vuelve a estar libre en tu agenda.`)}</p><div ${bS.replace('margin-bottom:28px;','')}><table ${tS}>${row(txt(oLang,"Klant","Client","Cliente"),eC)}${(b.client_phone&&!_hideContact(em))?row(txt(oLang,"Telefoon","Phone","Teléfono"),ePh):""}${row(txt(oLang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(oLang,"Datum","Date","Fecha"),esc(fmtD(b.date,oLang)))}${row(txt(oLang,"Tijd","Time","Hora"),eT)}${reasonRow}</table></div></div>`);}}
if(type==="booking_cancelled"){
await send(plainText(b.client_email),plainText(txt(lang,"Afspraak geannuleerd","Appointment cancelled","Cita cancelada")),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Afspraak geannuleerd","Appointment cancelled","Cita cancelada")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,"Je afspraak is succesvol geannuleerd.","Your appointment has been successfully cancelled.","Tu cita se ha cancelado correctamente.")}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(lang,"Was gepland op","Was scheduled for","Estaba programada para"),`${esc(b.date)} ${txt(lang,"om","at","a las")} ${eT}`)}</table></div><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,"Wil je opnieuw boeken? Ga naar vellu.cc","Want to rebook? Visit vellu.cc","¿Quieres reservar de nuevo? Visita vellu.cc")}</p></div>`);}
if(type==="appointment_updated"){
const oldDate=b.old_date?esc(fmtD(b.old_date,lang)):"";
const oldTime=esc(b.old_time||"");
const oldPrice=b.old_price!=null?fP(b.old_price):"";
const newPrice=fP(b.price);
const changedRow=(label,oldVal,newVal)=>{
if(!oldVal||oldVal===newVal)return row(label,newVal);
return `<tr><td ${cL}>${label}</td><td ${cR}><span style="color:#999;text-decoration:line-through;font-size:12px;margin-right:6px;">${oldVal}</span><strong style="color:${AC};">${newVal}</strong></td></tr>`;
};
const cs=sCU?`<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;"><p style="color:#666;font-size:13px;margin:0 0 12px;">${txt(lang,"Past de nieuwe tijd je niet? Annuleren kan via:","Doesn't work for you? Cancel via:","¿No te viene bien el nuevo horario? Puedes cancelar aquí:")}</p><a href="${esc(sCU)}" style="display:inline-block;background:#fee2e2;color:#dc2626;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Afspraak annuleren","Cancel appointment","Cancelar cita")}</a></div>`:"";
await send(plainText(b.client_email),plainText(txt(lang,`Wijziging afspraak bij ${b.salon_name}`,`Appointment updated at ${b.salon_name}`,`Cita modificada en ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Je afspraak is gewijzigd","Your appointment has been updated","Tu cita ha sido modificada")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`<strong>${eS}</strong> heeft de details van je afspraak aangepast. Hieronder zie je de nieuwe gegevens:`,`<strong>${eS}</strong> updated the details of your appointment. The new details are below:`,`<strong>${eS}</strong> actualizó los detalles de tu cita. A continuación puedes ver los nuevos datos:`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment","Servicio"),eSv)}${changedRow(txt(lang,"Datum","Date","Fecha"),oldDate,eD)}${changedRow(txt(lang,"Tijd","Time","Hora"),oldTime,eT)}${changedRow(txt(lang,"Totaal","Total","Total"),oldPrice,newPrice)}</table></div>${cs}<p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Zien we je dan, ${eC}!`,`See you then, ${eC}!`,`¡Nos vemos entonces, ${eC}!`)}</p></div>`);}
if(type==="invoice"){
if(callerId&&!(await staffMayInvoice(callerId)))return new Response(JSON.stringify({error:"invoicing_not_allowed"}),{status:403,headers:{...headers,"Content-Type":"application/json"}});
const bd=[];if(b.salon_address)bd.push(eAd);if(b.salon_kvk)bd.push(`KVK: ${eKv}`);if(b.salon_btw)bd.push(`${b.tax_id_label?esc(String(b.tax_id_label)):"BTW"}: ${eBt}`);if(b.salon_iban)bd.push(`IBAN: ${eIb}`);
const bSec=bd.length>0?`<div style="background:#f0ede8;border-radius:10px;padding:16px;margin-bottom:24px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Bedrijfsgegevens","Business details","Datos de la empresa")}</div><div style="font-size:13px;font-weight:500;margin-bottom:4px;">${eS}</div>${bd.map((d)=>`<div style="font-size:12px;color:#666;">${d}</div>`).join("")}</div>`:"";
const gross=parseFloat(b.price||0);
const rate=Math.max(0,parseFloat(b.salon_btw_rate!=null?b.salon_btw_rate:21))/100;
let vatRows="";
const TAXL=b.tax_label?esc(String(b.tax_label)):txt(lang,"Btw","VAT","IVA");
// Belasting komt sinds de per-jurisdictie-omzetting kant-en-klaar mee als
// tax_lines: een regel per tarief, al uitgerekend door src/taxEngine.js. Dat
// moet, want een factuur kan twee grondslagen hebben — op Bonaire is de
// behandeling belast (ABB) en het doorverkochte product niet, want daarover is
// bij invoer al ABB betaald. Eén percentage over het totaal klopt dan nooit.
//
// show_tax_line is false op Aruba: daar mag het BEDRAG aan BBO/BAVP/BAZV sinds
// 1-1-2019 niet apart op de factuur staan. De prijs is en blijft inclusief.
//
// Oudere aanroepers sturen alleen salon_btw_rate; die val blijft bestaan zodat
// een niet-bijgewerkte client geen kale factuur produceert.
const taxLines=Array.isArray(b.tax_lines)?b.tax_lines.filter((l:any)=>l&&(parseFloat(l.tax)||0)!==0):null;
const showTaxLine=b.show_tax_line!==undefined?!!b.show_tax_line:!!b.salon_btw;
const pctStr=(v:any)=>parseFloat((parseFloat(v)||0).toFixed(2)).toString().replace(".",lang==="nl"?",":".");
if(showTaxLine&&taxLines&&taxLines.length){
  const taxTotal=taxLines.reduce((n:number,l:any)=>n+(parseFloat(l.tax)||0),0);
  const netTotal=gross-taxTotal;
  // De grondslag erbij zodra die kleiner is dan het factuurtotaal. Op Bonaire
  // staat er anders "ABB 6%  5,66" naast een subtotaal van 144,34 en dat is
  // 3,9% — de klant of een controleur kan het niet narekenen omdat het
  // onbelaste product nergens zichtbaar is. Bij één tarief dat het hele
  // bedrag dekt (NL/BE) blijft de factuur er precies uitzien zoals voorheen.
  const baseSum=taxLines.reduce((n:number,l:any)=>n+(parseFloat(l.gross)||0),0);
  const showBase=taxLines.length>1||baseSum<gross-0.005;
  vatRows=`${row(`${txt(lang,"Subtotaal","Subtotal","Subtotal")} (${txt(lang,"excl.","excl.","sin")} ${TAXL})`,fP(netTotal))}`
    +taxLines.map((l:any)=>row(`${TAXL} ${pctStr(l.rate)}%`+(showBase?` (${txt(lang,"over","on","sobre")} ${fP(parseFloat(l.gross)||0)})`:""),fP(parseFloat(l.tax)||0))).join("");
}else if(showTaxLine&&!taxLines&&b.salon_btw&&rate>0){
  const net=gross/(1+rate);const vat=gross-net;
  vatRows=`${row(`${txt(lang,"Subtotaal","Subtotal","Subtotal")} (${txt(lang,"excl.","excl.","sin")} ${TAXL})`,fP(net))}${row(`${TAXL} ${pctStr(rate*100)}%`,fP(vat))}`;
}
const totLabel=vatRows?`${txt(lang,"Totaal","Total","Total")} (${txt(lang,"incl.","incl.","con")} ${TAXL})`:txt(lang,"Totaal","Total","Total");
// Alleen melden dat er geen belasting is berekend als dat ook echt zo is. Op
// Aruba zit de belasting wél in de prijs, hij mag er alleen niet bij staan —
// "geen belasting in rekening gebracht" zou daar pertinent onwaar zijn.
const taxCharged=(taxLines&&taxLines.length>0)||(!!b.salon_btw&&rate>0);
const noVatNote=taxCharged?"":`<p style="color:#aaa;font-size:11px;text-align:center;margin:0 0 8px;">${txt(lang,"Geen belasting in rekening gebracht.","No tax charged.","No se aplican impuestos.")}</p>`;
const invDate=fmtD(new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Amsterdam"}),lang);
const payBlock=(()=>{
if(!b.payment_request)return"";
const link=safeImgSrc(b.payment_link);
const ibanP=String(b.salon_iban||"").replace(/\s+/g,"");
if(!link&&!ibanP)return"";
// The SEPA EPC QR + bunq.me amount-append are euro-only. For non-euro salons
// (Bonaire/Aruba/Curacao) we skip the QR and show plain bank details instead,
// with the amount in the salon's own currency (CURSYM) — never a euro QR.
const isEur=CURSYM==="€";
let linkAmt=link;
if(link&&gross>0&&isEur){try{const u=new URL(link);const host=u.hostname.toLowerCase().replace(/^www\./,"");const segs=u.pathname.split("/").filter(Boolean);if((host==="bunq.me"||host==="paypal.me")&&segs.length===1){linkAmt=link.replace(/\/+$/,"")+"/"+gross.toFixed(2);}}catch{/* keep base link */}}
const holder=esc(b.iban_holder||b.salon_name||"");
const payRef=String(b.invoice_number||`${b.salon_name||"Vellu"} ${b.date||""}`).slice(0,100);
let h=`<div style="background:${AC}10;border:1px solid ${AC}44;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">`;
h+=`<div style="font-size:14px;font-weight:600;margin-bottom:12px;">${txt(lang,"Betalen","Payment","Pago")} · ${fP(gross)}</div>`;
if(link)h+=`<a href="${esc(linkAmt)}" style="display:inline-block;background:${AC};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">${txt(lang,"Betaal online","Pay online","Pagar en línea")}</a>`;
if(ibanP&&gross>0&&isEur){
const qrUrl=`${SU}/functions/v1/payment-qr?iban=${encodeURIComponent(ibanP)}&name=${encodeURIComponent(String(b.iban_holder||b.salon_name||"").slice(0,70))}&amount=${gross.toFixed(2)}&ref=${encodeURIComponent(payRef)}&currency=EUR`;
h+=`<div style="margin:${link?"14px":"0"} 0 8px;font-size:12px;color:#666;">${txt(lang,link?"Of scan met je bank-app:":"Scan met je bank-app:",link?"Or scan with your banking app:":"Scan with your banking app:",link?"O escanea con tu app bancaria:":"Escanea con tu app bancaria:")}</div>`;
h+=`<img src="${esc(qrUrl)}" width="150" height="150" alt="SEPA QR" style="display:block;margin:0 auto 10px;border-radius:8px;" />`;
h+=`<div style="font-size:12px;color:#666;line-height:1.6;">${esc(ibanP)}${holder?` ${txt(lang,"t.n.v.","in the name of","a nombre de")} ${holder}`:""}<br/>${txt(lang,"o.v.v.","reference:","referencia:")} ${esc(payRef)}</div>`;
}else if(ibanP&&gross>0){
h+=`<div style="margin:${link?"14px":"0"} 0 8px;font-size:12px;color:#666;">${txt(lang,link?"Of maak het bedrag over naar:":"Maak het bedrag over naar:",link?"Or transfer the amount to:":"Transfer the amount to:",link?"O transfiere el importe a:":"Transfiere el importe a:")}</div>`;
h+=`<div style="font-size:12px;color:#666;line-height:1.6;">${holder?`${holder}<br/>`:""}${esc(ibanP)}<br/>${txt(lang,"Bedrag","Amount","Importe")}: ${fP(gross)}<br/>${txt(lang,"o.v.v.","reference:","referencia:")} ${esc(payRef)}</div>`;
}
h+=`</div>`;
return h;})();
await send(plainText(b.client_email),plainText(`${txt(lang,"Factuur","Invoice","Factura")} ${b.invoice_number||""} - ${b.salon_name}`),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin:0 0 4px;">${txt(lang,"Factuur","Invoice","Factura")}</h2><p style="color:#888;font-size:13px;margin:0 0 24px;">${eS}</p>${b.invoice_number?`<div style="background:${AC}1a;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:${AC};display:inline-block;margin-bottom:16px;">${eIN}</div>`:""}${bSec}<div ${bS}><table ${tS}>${row(txt(lang,"Klant","Client","Cliente"),eC)}${row(txt(lang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(lang,"Factuurdatum","Invoice date","Fecha de factura"),invDate)}${row(txt(lang,"Datum afspraak","Appointment date","Fecha de la cita"),eD)}${vatRows}${totRow(totLabel,fP(gross))}</table></div>${noVatNote}${payBlock}<p style="color:#888;font-size:12px;text-align:center;">${txt(lang,"Bedankt voor je bezoek!","Thank you for your visit!","¡Gracias por tu visita!")}</p></div>`);}
if(type==="appointment_reminder"){
// Deze mail zei altijd "morgen", maar de salon kiest zelf hoeveel uur van
// tevoren de herinnering vertrekt (profiles.reminder_hours): bij 1, 2, 4 of 12
// uur gaat het over een afspraak van VANDAAG en bij 48 uur over overmorgen.
// Daarom rekenen we het verschil in hele dagen uit tussen de afspraakdatum en
// vandaag. b.today is de datum in SALONTIJD (meegegeven door send-reminders) —
// onze eigen klok is UTC en zou een salon op Bonaire of in Nederland rond
// middernacht een dag mis laten zitten. Ontbreekt b.today, dan is UTC de
// terugval; onbekend of onleesbaar verschil valt netjes op de datum zelf terug.
const rTd=/^\d{4}-\d{2}-\d{2}$/.test(String(b.today||""))?b.today:new Date().toISOString().split("T")[0];
const rDf=(()=>{const t0=Date.parse(rTd+"T00:00:00Z"),d0=Date.parse(String(b.date||"")+"T00:00:00Z");return(isNaN(t0)||isNaN(d0))?null:Math.round((d0-t0)/86400000);})();
// Twee varianten van dezelfde aanduiding: het onderwerp is platte tekst (nD),
// de body HTML (eD). Het Spaans zet de tijdsaanduiding vooraan in de zin
// ("Mañana tienes una cita"), dus daar is ook een hoofdletterversie nodig.
// fmtD levert de weekdag met hoofdletter ("Maandag 17 augustus 2026"). Dat is
// goed waar de datum een regel opent (de Datum-tabelrij) en in het Engels ook
// midden in de zin ("on Monday"), maar in het Nederlands en Spaans hoort hij
// midzin klein: "Je hebt op maandag … een afspraak". Alleen hier verlagen, niet
// in fmtD zelf — eD in de tabelrij hieronder moet zijn hoofdletter houden.
const lcW=(s)=>s.charAt(0).toLowerCase()+s.slice(1);
const rWs=rDf===0?txt(lang,"vandaag","today","hoy"):rDf===1?txt(lang,"morgen","tomorrow","mañana"):txt(lang,`op ${lcW(nD)}`,`on ${nD}`,`el ${lcW(nD)}`);
const rW=rDf===0?txt(lang,"vandaag","today","hoy"):rDf===1?txt(lang,"morgen","tomorrow","mañana"):txt(lang,`op ${lcW(eD)}`,`on ${eD}`,`el ${lcW(eD)}`);
const rWc=rW.charAt(0).toUpperCase()+rW.slice(1);
await send(plainText(b.client_email),plainText(txt(lang,`Herinnering: Afspraak ${rWs} bij ${b.salon_name}`,`Reminder: Appointment ${rWs} at ${b.salon_name}`,`Recordatorio: Cita ${rWs} en ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Niet vergeten!","Don't forget!","¡No lo olvides!")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Je hebt ${rW} een afspraak bij <strong>${eS}</strong>`,`You have an appointment ${rW} at <strong>${eS}</strong>`,`${rWc} tienes una cita en <strong>${eS}</strong>`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment","Servicio"),eSv)}${row(txt(lang,"Datum","Date","Fecha"),eD)}${row(txt(lang,"Tijd","Time","Hora"),eT)}${totRow(txt(lang,"Totaal","Total","Total"),fP(b.price))}</table></div><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`We zien je ${rW}, ${eC}!`,`See you ${rW}, ${eC}!`,`¡Nos vemos ${rW}, ${eC}!`)}</p>${b.salon_slug?`<p style="text-align:center;margin-top:20px;"><a href="https://vellu.cc/${eSl}" style="color:${AC};text-decoration:none;font-size:12px;">vellu.cc/${eSl}</a></p>`:""}</div>`);}
if(type==="waitlist_spot_open"){
const salonUrl=b.salon_slug?`https://vellu.cc/${eSl}`:"https://vellu.cc";
await send(plainText(b.client_email),plainText(txt(lang,`Er is een plek vrij bij ${b.salon_name}`,`A spot opened up at ${b.salon_name}`,`Se ha liberado un lugar en ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Goed nieuws!","Great news!","¡Buenas noticias!")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Er is een plek vrijgekomen bij <strong>${eS}</strong> op <strong>${eD}</strong>. Wees er snel bij en boek je afspraak — wachtlijst-plekken zijn snel weg.`,`A spot has opened up at <strong>${eS}</strong> on <strong>${eD}</strong>. Book quickly to secure it — waitlist spots go fast.`,`Se ha liberado un lugar en <strong>${eS}</strong> el <strong>${eD}</strong>. Reserva rápido para asegurarlo — los lugares de la lista de espera se agotan rápido.`)}</p><p style="text-align:center;margin:20px 0;"><a href="${esc(salonUrl)}" style="display:inline-block;background:${AC};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Boek nu","Book now","Reservar ahora")}</a></p><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Tot snel, ${eC}!`,`See you soon, ${eC}!`,`¡Hasta pronto, ${eC}!`)}</p></div>`);}
// Client-facing "you're on the waitlist" confirmation. b.dates is the list of
// requested days (one waitlist row per day on the client side).
if(type==="waitlist_confirmation"){
const ds=(Array.isArray(b.dates)?b.dates:(b.date?[b.date]:[]));
const rowsH=ds.map(d=>`<tr><td style="padding:6px 0;font-weight:500;">${esc(fmtD(d,lang))}</td></tr>`).join("");
await send(plainText(b.client_email),plainText(txt(lang,`Je staat op de wachtlijst bij ${b.salon_name}`,`You're on the waitlist at ${b.salon_name}`,`Estás en la lista de espera de ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Je staat op de wachtlijst","You're on the waitlist","Estás en la lista de espera")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Bedankt ${eC}! We hebben je aanmelding voor <strong>${eS}</strong> ontvangen. Zodra er een plek vrijkomt op ${ds.length===1?"deze dag":"een van deze dagen"}, nemen we contact met je op.`,`Thanks ${eC}! We've received your waitlist request for <strong>${eS}</strong>. As soon as a spot opens up on ${ds.length===1?"this day":"one of these days"}, we'll reach out.`,`¡Gracias ${eC}! Hemos recibido tu solicitud para la lista de espera de <strong>${eS}</strong>. En cuanto se libere un lugar ${ds.length===1?"ese día":"uno de esos días"}, nos pondremos en contacto contigo.`)}</p><div ${bS}><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,ds.length===1?"Gewenste dag":"Gewenste dagen",ds.length===1?"Preferred day":"Preferred days",ds.length===1?"Día preferido":"Días preferidos")}</div><table ${tS}>${rowsH}</table></div><p style="color:#888;font-size:12px;text-align:center;">${txt(lang,"Je hoeft verder niets te doen — we laten het je weten.","Nothing else to do — we'll let you know.","No tienes que hacer nada más — te avisaremos.")}</p></div>`);}
// Salon-facing "someone joined your waitlist" notification. Goes to the owner
// and the anchored stylist (if any).
if(type==="waitlist_joined"){
const rcp=[];if(b.owner_email)rcp.push(b.owner_email);if(b.staff_emails?.length>0)rcp.push(...b.staff_emails);
const ds=(Array.isArray(b.dates)?b.dates:(b.date?[b.date]:[]));
const daysStr=ds.map(d=>esc(fmtD(d,oLang))).join("<br/>");
const eNo=b.notes?esc(String(b.notes).slice(0,300)):"";
const eEm=esc(b.client_email);
const subj=txt(oLang,`Nieuwe wachtlijst-aanmelding: ${b.client_name}`,`New waitlist request: ${b.client_name}`,`Nueva solicitud de lista de espera: ${b.client_name}`);
for(const em of rcp){await send(plainText(em),plainText(subj),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(oLang,"Nieuwe wachtlijst-aanmelding","New waitlist request","Nueva solicitud de lista de espera")}</h2><p style="color:#666;margin-bottom:28px;">${txt(oLang,`<strong>${eC}</strong> wil op de wachtlijst bij <strong>${eS}</strong>.`,`<strong>${eC}</strong> wants to join the waitlist at <strong>${eS}</strong>.`,`<strong>${eC}</strong> quiere unirse a la lista de espera de <strong>${eS}</strong>.`)}</p><div ${bS.replace('margin-bottom:28px;','')}><table ${tS}>${row(txt(oLang,"Klant","Client","Cliente"),eC)}${_hideContact(em)?"":row(txt(oLang,"E-mail","Email","Correo"),eEm)}${(b.client_phone&&!_hideContact(em))?row(txt(oLang,"Telefoon","Phone","Teléfono"),ePh):""}${b.service_name?row(txt(oLang,"Behandeling","Treatment","Servicio"),eSv):""}${b.staff_name?row(txt(oLang,"Medewerker","Staff","Personal"),esc(b.staff_name)):""}${row(txt(oLang,ds.length===1?"Gewenste dag":"Gewenste dagen",ds.length===1?"Preferred day":"Preferred days",ds.length===1?"Día preferido":"Días preferidos"),daysStr)}${eNo?`<tr><td ${cL}>${txt(oLang,"Notitie","Note","Nota")}</td><td ${cR}>${eNo}</td></tr>`:""}</table></div></div>`);}}
// Betaling voor het Vellu-abonnement niet gelukt. Ging hier eerder NIETS uit:
// mollie-webhook logde alleen een regel naar de console, dus de salon zag een
// laadscherm en hoorde daarna nooit meer iets. Dat kostte een klant op Bonaire
// een avond speculeren of er nu wel of niet EUR 350 was afgeschreven.
//
// Toon: geruststellen eerst (er is niets afgeschreven), dan pas wat te doen.
// De reden komt van Mollie; die codes zijn Engels en technisch, dus ze worden
// hier naar gewone taal vertaald met een nette terugval voor onbekende codes.
// Jaarabonnement loopt bijna af. Verstuurd door send-renewal-reminder, een week
// voor plan_expires_at. Een jaarbetaling verlengt NIET vanzelf (geen
// machtiging), dus zonder deze mail valt de salon er stilzwijgend uit.
if(type==="renewal_reminder"){
const planName=b.plan==="professional"?"Vellu Professional":"Vellu Starter";
const verlooptOp=b.plan_expires_at?fmtD(String(b.plan_expires_at).slice(0,10),oLang):"";
await send(plainText(b.owner_email),
plainText(txt(oLang,`Je Vellu-abonnement loopt bijna af`,`Your Vellu subscription is about to expire`,`Tu suscripción de Vellu está por vencer`)),
`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(oLang,"Je abonnement loopt bijna af","Your subscription is about to expire","Tu suscripción está por vencer")}</h2>
<p style="color:#666;margin-bottom:8px;">${txt(oLang,`Je jaarabonnement <strong>${esc(planName)}</strong> loopt af op <strong>${esc(verlooptOp)}</strong>.`,`Your yearly <strong>${esc(planName)}</strong> subscription expires on <strong>${esc(verlooptOp)}</strong>.`,`Tu suscripción anual <strong>${esc(planName)}</strong> vence el <strong>${esc(verlooptOp)}</strong>.`)}</p>
<p style="color:#666;margin-bottom:28px;">${txt(oLang,"Een jaarabonnement wordt niet automatisch verlengd — dat is bewust, zo heb je er zelf grip op. Verleng het met één klik, dan blijft alles gewoon doorlopen.","A yearly subscription does not renew automatically — that is by design, so you stay in control. Renew it in one click and everything keeps running.","Una suscripción anual no se renueva automáticamente — es a propósito, así mantienes el control. Renuévala con un clic y todo sigue funcionando.")}</p>
<p style="text-align:center;margin-bottom:28px;"><a href="https://vellu.cc/owner?tab=settings" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">${txt(oLang,"Nu verlengen","Renew now","Renovar ahora")}</a></p>
<p style="color:#888;font-size:13px;">${txt(oLang,"Liever maandelijks betalen, of vragen? Antwoord gewoon op deze mail.","Prefer to pay monthly, or have a question? Just reply to this email.","¿Prefieres pagar mensualmente o tienes una pregunta? Responde a este correo.")}</p></div>`);}
if(type==="payment_failed"){
const planName=b.plan==="professional"?"Vellu Professional":"Vellu Starter";
const intervalLabel=b.billing_interval==="yearly"?txt(oLang,"jaarlijks","yearly","anual"):txt(oLang,"maandelijks","monthly","mensual");
const bedrag=b.amount?`€ ${parseFloat(b.amount).toFixed(2).replace(".",",")}`:"";
const rc=String(b.reason_code||"");
// Per code: wat er aan de hand is, en wat de salon eraan kan doen.
const redenen={
  card_declined:[txt(oLang,"Je bank heeft de betaling geweigerd.","Your bank declined the payment.","Tu banco rechazó el pago."),
                 txt(oLang,"Dat gebeurt vaak bij een limiet voor online of buitenlandse betalingen. Bel je bank, of probeer het maandabonnement — dat is een veel kleiner bedrag.","This often happens with a limit on online or foreign payments. Call your bank, or try the monthly plan — that is a much smaller amount.","Suele ocurrir por un límite en pagos en línea o extranjeros. Llama a tu banco o prueba el plan mensual, que es un importe mucho menor.")],
  insufficient_funds:[txt(oLang,"Er stond niet genoeg saldo op de rekening.","There were insufficient funds.","No había saldo suficiente."),
                 txt(oLang,"Probeer het opnieuw zodra het saldo toereikend is, of kies het maandabonnement.","Try again once there are sufficient funds, or choose the monthly plan.","Inténtalo de nuevo cuando haya saldo, o elige el plan mensual.")],
  expired_card:[txt(oLang,"De kaart is verlopen.","The card has expired.","La tarjeta ha caducado."),
                 txt(oLang,"Probeer het opnieuw met een geldige kaart.","Try again with a valid card.","Inténtalo de nuevo con una tarjeta válida.")],
  invalid_cvv:[txt(oLang,"De beveiligingscode klopte niet.","The security code was incorrect.","El código de seguridad no era correcto."),
                 txt(oLang,"Probeer het opnieuw en let op de drie cijfers achterop de kaart.","Try again and check the three digits on the back of the card.","Inténtalo de nuevo y revisa los tres dígitos del reverso.")],
  expired:[txt(oLang,"De betaling is niet op tijd afgerond.","The payment was not completed in time.","El pago no se completó a tiempo."),
                 txt(oLang,"Je kunt het gewoon opnieuw proberen.","You can simply try again.","Puedes intentarlo de nuevo.")],
};
const paar=redenen[rc]||[txt(oLang,"De betaling is niet gelukt.","The payment did not go through.","El pago no se completó."),
                 txt(oLang,"Je kunt het opnieuw proberen. Lukt het weer niet, laat het ons weten — dan kijken we mee.","You can try again. If it fails again, let us know and we will look into it.","Puedes intentarlo de nuevo. Si vuelve a fallar, avísanos y lo revisamos.")];
const [watErIs,watTeDoen]=paar;
const eB=esc(b.business_name||"");
await send(plainText(b.owner_email),
plainText(txt(oLang,"Je betaling is niet gelukt — er is niets afgeschreven","Your payment did not go through — nothing was charged","Tu pago no se completó — no se cobró nada")),
`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(oLang,"De betaling is niet gelukt","The payment did not go through","El pago no se completó")}</h2>
<p style="color:#666;margin-bottom:8px;"><strong>${txt(oLang,"Er is niets van je rekening afgeschreven.","Nothing was charged to your account.","No se cobró nada de tu cuenta.")}</strong></p>
<p style="color:#666;margin-bottom:28px;">${esc(watErIs)} ${esc(watTeDoen)}</p>
<div style="background:#faf8f5;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="padding:6px 0;color:#888;">${txt(oLang,"Abonnement","Plan","Plan")}</td><td style="padding:6px 0;text-align:right;">${esc(planName)} (${esc(intervalLabel)})</td></tr>
${bedrag?`<tr><td style="padding:6px 0;color:#888;">${txt(oLang,"Bedrag","Amount","Importe")}</td><td style="padding:6px 0;text-align:right;">${esc(bedrag)}</td></tr>`:""}
${eB?`<tr><td style="padding:6px 0;color:#888;">${txt(oLang,"Salon","Salon","Salón")}</td><td style="padding:6px 0;text-align:right;">${eB}</td></tr>`:""}
</table></div>
${b.trial_ends_at?`<p style="color:#666;margin-bottom:28px;">${txt(oLang,`Je proefperiode loopt nog tot <strong>${esc(fmtD(b.trial_ends_at,oLang))}</strong>, dus je kunt Vellu gewoon blijven gebruiken terwijl je dit regelt.`,`Your trial still runs until <strong>${esc(fmtD(b.trial_ends_at,oLang))}</strong>, so you can keep using Vellu while you sort this out.`,`Tu periodo de prueba dura hasta el <strong>${esc(fmtD(b.trial_ends_at,oLang))}</strong>, así que puedes seguir usando Vellu mientras lo resuelves.`)}</p>`:""}
<p style="text-align:center;margin-bottom:28px;"><a href="https://vellu.cc/owner?tab=settings" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;">${txt(oLang,"Opnieuw proberen","Try again","Intentar de nuevo")}</a></p>
<p style="color:#888;font-size:13px;">${txt(oLang,"Kom je er niet uit? Antwoord gewoon op deze mail, dan kijken we mee.","Stuck? Just reply to this email and we will help.","¿No lo consigues? Responde a este correo y te ayudamos.")}</p></div>`);}
if(type==="subscription_invoice"){
const billerName="Mirah Ventures";const billerKvk="42045867";const billerCity="Amersfoort";const billerEmail="info@vellu.cc";
const planName=b.plan==="professional"?"Vellu Professional":"Vellu Starter";
const intervalLabel=b.billing_interval==="yearly"?txt(lang,"jaarlijks","yearly","anual"):txt(lang,"maandelijks","monthly","mensual");
const total=parseFloat(b.amount||0);
// Vellu's EIGEN abonnementsfactuur. Een klant buiten het EU-BTW-gebied
// (Bonaire, Saba, Sint Eustatius, Aruba, Curacao, Sint Maarten) krijgt GEEN
// Nederlandse BTW: de plaats van dienst ligt bij de afnemer (art. 6 lid 1 Wet
// OB voor een ondernemer, art. 6h voor een elektronische dienst aan een
// particulier). De BES-eilanden zijn staatsrechtelijk Nederland maar
// EU-rechtelijk LGO, dus de BTW-richtlijn geldt er niet.
//
// vat_rate === null betekent "buiten het toepassingsgebied". Dan komt er geen
// tarief EN geen bedrag op de factuur \u2014 ook geen 0,00, want op grond van
// art. 37 Wet OB wordt elke op een factuur vermelde omzetbelasting
// verschuldigd. Het is ook geen "btw verlegd": verleggen veronderstelt een
// afnemer die de heffing binnen hetzelfde stelsel overneemt, en dat bestaat
// buiten de EU niet.
// Expliciet null = buiten bereik. Ontbreekt het veld helemaal (undefined),
// dan is het een oudere aanroeper en volgen we de oude 21%-berekening.
const btwBuitenBereik = b.vat_rate === null;
const exclVat=btwBuitenBereik?total:(b.amount_excl_vat?parseFloat(b.amount_excl_vat):+(total/1.21).toFixed(2));
const vatAmount=btwBuitenBereik?null:(b.vat_amount?parseFloat(b.vat_amount):+(total-exclVat).toFixed(2));
const geenBtwRegel=btwBuitenBereik?`<p style="color:#888;font-size:11px;line-height:1.6;margin:16px 0 0;">${txt(lang,
  "Niet belast met Nederlandse btw: de plaats van dienst ligt in het land van de afnemer. Bonaire, Saba, Sint Eustatius, Aruba, Cura\u00e7ao en Sint Maarten vallen buiten het btw-gebied van de Europese Unie. Eventuele lokale belasting komt voor rekening van de afnemer.",
  "Not subject to Dutch VAT: the place of supply is the customer's country. Bonaire, Saba, Sint Eustatius, Aruba, Cura\u00e7ao and Sint Maarten fall outside the VAT territory of the European Union. Any local tax is payable by the customer.",
  "No sujeto al IVA neerland\u00e9s: el lugar de prestaci\u00f3n es el pa\u00eds del cliente. Bonaire, Saba, San Eustaquio, Aruba, Curazao y San Mart\u00edn quedan fuera del territorio del IVA de la Uni\u00f3n Europea. Cualquier impuesto local corre por cuenta del cliente.")}</p>`:"";
const invoiceNum=esc(b.invoice_number||"");const ownerEmail=plainText(b.owner_email);const businessName=esc(b.business_name||ownerEmail);
const periodStart=b.period_start?fmtD(String(b.period_start).slice(0,10),lang):"";const periodEnd=b.period_end?fmtD(String(b.period_end).slice(0,10),lang):"";
const credits=parseInt(b.credits_used||0,10);
const subj=`${txt(lang,"Factuur","Invoice","Factura")} ${invoiceNum} - Vellu`;
await send(ownerEmail,plainText(subj),`${W}<div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div></div><h2 style="font-weight:400;font-size:22px;margin:0 0 4px;">${txt(lang,"Factuur","Invoice","Factura")}</h2><p style="color:#888;font-size:13px;margin:0 0 24px;">${invoiceNum}</p><div ${bS}><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Van","From","De")}</div><div style="font-size:13px;font-weight:500;">${billerName}</div><div style="font-size:12px;color:#666;">KVK: ${billerKvk}</div><div style="font-size:12px;color:#666;">${billerCity}, ${txt(lang,"Nederland","Netherlands","Países Bajos")}</div><div style="font-size:12px;color:#666;">${billerEmail}</div></div><div ${bS}><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Aan","To","Para")}</div><div style="font-size:13px;font-weight:500;">${businessName}</div><div style="font-size:12px;color:#666;">${ownerEmail}</div></div><div ${bS}><table ${tS}>${row(txt(lang,"Beschrijving","Description","Descripción"),`${esc(planName)} - ${intervalLabel}`)}${periodStart&&periodEnd?row(txt(lang,"Periode","Period","Período"),`${periodStart} - ${periodEnd}`):""}${btwBuitenBereik?"":`${row(txt(lang,"Subtotaal","Subtotal","Subtotal"),fP(exclVat))}${row(`${txt(lang,"BTW","VAT","IVA")} 21%`,fP(vatAmount))}`}${totRow(txt(lang,"Totaal","Total","Total"),fP(total))}</table></div>${credits>0?`<div style="background:#f0ede8;border-radius:10px;padding:12px 16px;font-size:12px;color:#666;margin-bottom:24px;">${txt(lang,`${credits} dag(en) referral-tegoed toegepast op je toegangsperiode.`,`${credits} day(s) of referral credit applied to your access period.`,`${credits} día(s) de crédito por referidos aplicado(s) a tu período de acceso.`)}</div>`:""}${geenBtwRegel}<p style="color:#888;font-size:11px;text-align:center;margin-top:24px;">${txt(lang,"Bedankt dat je Vellu gebruikt!","Thank you for using Vellu!","¡Gracias por usar Vellu!")}</p><p style="color:#aaa;font-size:10px;text-align:center;margin-top:6px;">${billerName} - KVK ${billerKvk} - ${billerCity}</p></div>`);}
return new Response(JSON.stringify({success:true}),{headers:{...headers,"Content-Type":"application/json"}});
}catch(error){console.error("send-emails error:",error);return new Response(JSON.stringify({error:"email_send_failed"}),{status:500,headers:{...headers,"Content-Type":"application/json"}});}});