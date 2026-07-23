import{serve}from"https://deno.land/std@0.168.0/http/server.ts";
const R=Deno.env.get("RESEND_API_KEY"),F="noreply@vellu.cc";
const SU=Deno.env.get("SUPABASE_URL"),SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AO=["https://vellu.cc","https://www.vellu.cc","https://vellu.io","https://www.vellu.io","http://localhost:5173","http://localhost:5174","http://localhost:5175","http://localhost:5176"];
function cors(o){const a=o&&AO.includes(o)?o:"https://vellu.cc";return{"Access-Control-Allow-Origin":a,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-internal-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function esc(s){if(s===null||s===undefined)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");}
function plainText(s){if(s===null||s===undefined)return"";return String(s).replace(/[\r\n]+/g," ").slice(0,200);}
function safeImgSrc(url){if(!url||typeof url!=="string")return null;try{const u=new URL(url);if(u.protocol!=="https:"&&u.protocol!=="http:")return null;return u.toString();}catch{return null;}}
async function verifyUserToken(tok){if(!tok||!SU||!SK)return false;try{const r=await fetch(`${SU}/auth/v1/user`,{headers:{"Authorization":`Bearer ${tok}`,"apikey":SK}});if(!r.ok)return false;const u=await r.json();return !!u?.id;}catch{return false;}}
// Naive HTML→text for a multipart/alternative plain-text part. HTML-only
// emails score higher on spam filters (SpamAssassin MIME_HTML_ONLY), so
// always ship a text version too — it helps inbox placement.
function htmlToText(html){return String(html||"").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>(?=)/gi,"\n").replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#39;/gi,"'").replace(/&quot;/gi,'"').replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
// `from` overrides the default sender (used to add the salon's display name),
// `replyTo` routes replies to the salon so the mail looks legitimate.
async function sendEmail(to,subject,html,from,replyTo){if(!R)throw new Error("RESEND_API_KEY not configured");const payload={from:from||F,to,subject,html,text:htmlToText(html)};if(replyTo)payload.reply_to=replyTo;const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${R}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok){console.error("Resend API error:",data);throw new Error(data?.message||`Email send failed (${res.status})`);}return data;}
const txt=(l,nl,en)=>l==="en"?en:nl;
serve(async(req)=>{
const origin=req.headers.get("origin");const headers=cors(origin);
if(req.method==="OPTIONS")return new Response("ok",{headers});
let authed=false;
const sec=req.headers.get("x-internal-secret");
if(sec&&sec===SK){authed=true;}else{
const a=req.headers.get("authorization")||"";
const tok=a.startsWith("Bearer ")?a.slice(7):null;
if(tok)authed=await verifyUserToken(tok);
}
if(!authed)return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{...headers,"Content-Type":"application/json"}});
const fmtD=(ds,l="nl")=>{try{const d=new Date(ds+"T12:00:00");if(l==="en"){const dy=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];const mo=["January","February","March","April","May","June","July","August","September","October","November","December"];return`${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;}const dy=["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];const mo=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];return`${dy[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;}catch{return esc(ds);}};
const acOf=(b)=>/^#[0-9a-fA-F]{6}$/.test(String(b.salon_accent||""))?b.salon_accent:"#c9a96e";
const lH=(b)=>{const ac=acOf(b);const logo=safeImgSrc(b.salon_logo);const n=esc(b.salon_name);if(logo)return`<div style="text-align:center;margin-bottom:32px;"><img src="${esc(logo)}" alt="${n}" style="max-height:60px;max-width:200px;margin-bottom:12px;" /><div style="width:40px;height:1px;background:${ac};margin:0 auto;"></div></div>`;return`<div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:${ac};margin:12px auto;"></div></div>`;};
const fP=(p)=>`€${parseFloat(p||0).toFixed(2)}`;
const W=`<div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">`;
const bS=`style="background:#f9f7f4;border-radius:12px;padding:24px;margin-bottom:28px;"`;
const tS=`style="width:100%;border-collapse:collapse;"`;
const cL=`style="padding:8px 0;color:#888;font-size:13px;"`;
const cR=`style="padding:8px 0;font-weight:500;text-align:right;"`;
const gL=`style="border-top:1px solid #e8e0d5;"`;
const gA=`style="padding:12px 0 4px;font-weight:600;color:#c9a96e;"`;
const gR=`style="padding:12px 0 4px;font-weight:600;color:#c9a96e;text-align:right;"`;
try{
const{type,booking:b}=await req.json();const lang=b.lang||"nl";const nD=fmtD(b.date,lang);
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
const cs=sCU?`<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;"><p style="color:#666;font-size:13px;margin:0 0 12px;">${txt(lang,"Kun je niet komen? Annuleer tot 24 uur van tevoren:","Can't make it? Cancel up to 24 hours in advance:")}</p><a href="${esc(sCU)}" style="display:inline-block;background:#fee2e2;color:#dc2626;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Afspraak annuleren","Cancel appointment")}</a></div>`:"";
await send(plainText(b.client_email),plainText(txt(lang,`Bevestiging afspraak bij ${b.salon_name}`,`Appointment confirmed at ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Je afspraak is bevestigd","Your appointment is confirmed")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Bedankt voor je boeking bij <strong>${eS}</strong>`,`Thank you for booking at <strong>${eS}</strong>`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment"),eSv)}${row(txt(lang,"Datum","Date"),eD)}${row(txt(lang,"Tijd","Time"),eT)}${row(txt(lang,"Betaling","Payment"),b.payment==="online"?txt(lang,"Betaalverzoek na afloop","Payment request afterwards"):txt(lang,"Betalen bij afspraak","Pay at appointment"))}${totRow(txt(lang,"Totaal","Total"),fP(b.price))}</table></div>${cs}<p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Tot dan, ${eC}!`,`See you then, ${eC}!`)}</p></div>`);}
if(type==="booking_notification"){
const rcp=[];if(b.owner_email)rcp.push(b.owner_email);if(b.staff_emails?.length>0)rcp.push(...b.staff_emails);
for(const em of rcp){await send(plainText(em),plainText(`Nieuwe boeking: ${b.client_name}`),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">Nieuwe boeking!</h2><p style="color:#666;margin-bottom:28px;">Er is een nieuwe afspraak gemaakt bij <strong>${eS}</strong></p><div ${bS.replace('margin-bottom:28px;','')}><table ${tS}>${row("Klant",eC)}${b.client_phone?row("Telefoon",ePh):""}${row("Behandeling",eSv)}${row("Datum",esc(fmtD(b.date)))}${row("Tijd",eT)}${totRow("Totaal",fP(b.price))}</table></div></div>`);}}
// Owner/staff notification that a CLIENT cancelled their own appointment
// (via the cancel link in their booking email). Fired server-side by the
// cancel-appointment edge function so it lands even if the client closes
// the tab. Red accent + optional cancellation reason. Distinct from the
// green "Nieuwe boeking!" booking_notification above.
if(type==="owner_cancellation"){
const rcp=[];if(b.owner_email)rcp.push(b.owner_email);if(b.staff_emails?.length>0)rcp.push(...b.staff_emails);
const eR=b.reason?esc(String(b.reason).slice(0,300)):"";
const reasonRow=eR?`<tr><td ${cL}>${txt(lang,"Reden","Reason")}</td><td ${cR}>${eR}</td></tr>`:"";
const subj=txt(lang,`Afspraak geannuleerd: ${b.client_name}`,`Appointment cancelled: ${b.client_name}`);
for(const em of rcp){await send(plainText(em),plainText(subj),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;color:#dc2626;">${txt(lang,"Afspraak geannuleerd","Appointment cancelled")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`<strong>${eC}</strong> heeft de afspraak bij <strong>${eS}</strong> geannuleerd. Deze tijd is nu weer vrij in je agenda.`,`<strong>${eC}</strong> cancelled their appointment at <strong>${eS}</strong>. This slot is now free again in your agenda.`)}</p><div ${bS.replace('margin-bottom:28px;','')}><table ${tS}>${row(txt(lang,"Klant","Client"),eC)}${b.client_phone?row(txt(lang,"Telefoon","Phone"),ePh):""}${row(txt(lang,"Behandeling","Treatment"),eSv)}${row(txt(lang,"Datum","Date"),esc(fmtD(b.date,lang)))}${row(txt(lang,"Tijd","Time"),eT)}${reasonRow}</table></div></div>`);}}
if(type==="booking_cancelled"){
await send(plainText(b.client_email),plainText(txt(lang,"Afspraak geannuleerd","Appointment cancelled")),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Afspraak geannuleerd","Appointment cancelled")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,"Je afspraak is succesvol geannuleerd.","Your appointment has been successfully cancelled.")}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment"),eSv)}${row(txt(lang,"Was gepland op","Was scheduled for"),`${esc(b.date)} ${txt(lang,"om","at")} ${eT}`)}</table></div><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,"Wil je opnieuw boeken? Ga naar vellu.cc","Want to rebook? Visit vellu.cc")}</p></div>`);}
// Sent when the salon owner edits an appointment (date/time/price). Shows
// the new values; if old_* values are provided, fields that actually changed
// are highlighted with a strike-through old value next to the new one so
// the client sees at a glance what the salon changed for them.
if(type==="appointment_updated"){
const oldDate=b.old_date?esc(fmtD(b.old_date,lang)):"";
const oldTime=esc(b.old_time||"");
const oldPrice=b.old_price!=null?fP(b.old_price):"";
const newPrice=fP(b.price);
const changedRow=(label,oldVal,newVal)=>{
if(!oldVal||oldVal===newVal)return row(label,newVal);
return `<tr><td ${cL}>${label}</td><td ${cR}><span style="color:#999;text-decoration:line-through;font-size:12px;margin-right:6px;">${oldVal}</span><strong style="color:${AC};">${newVal}</strong></td></tr>`;
};
const cs=sCU?`<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;"><p style="color:#666;font-size:13px;margin:0 0 12px;">${txt(lang,"Past de nieuwe tijd je niet? Annuleren kan via:","Doesn't work for you? Cancel via:")}</p><a href="${esc(sCU)}" style="display:inline-block;background:#fee2e2;color:#dc2626;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Afspraak annuleren","Cancel appointment")}</a></div>`:"";
await send(plainText(b.client_email),plainText(txt(lang,`Wijziging afspraak bij ${b.salon_name}`,`Appointment updated at ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Je afspraak is gewijzigd","Your appointment has been updated")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`<strong>${eS}</strong> heeft de details van je afspraak aangepast. Hieronder zie je de nieuwe gegevens:`,`<strong>${eS}</strong> updated the details of your appointment. The new details are below:`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment"),eSv)}${changedRow(txt(lang,"Datum","Date"),oldDate,eD)}${changedRow(txt(lang,"Tijd","Time"),oldTime,eT)}${changedRow(txt(lang,"Totaal","Total"),oldPrice,newPrice)}</table></div>${cs}<p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Zien we je dan, ${eC}!`,`See you then, ${eC}!`)}</p></div>`);}
if(type==="invoice"){
const bd=[];if(b.salon_address)bd.push(eAd);if(b.salon_kvk)bd.push(`KVK: ${eKv}`);if(b.salon_btw)bd.push(`BTW: ${eBt}`);if(b.salon_iban)bd.push(`IBAN: ${eIb}`);
const bSec=bd.length>0?`<div style="background:#f0ede8;border-radius:10px;padding:16px;margin-bottom:24px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Bedrijfsgegevens","Business details")}</div><div style="font-size:13px;font-weight:500;margin-bottom:4px;">${eS}</div>${bd.map((d)=>`<div style="font-size:12px;color:#666;">${d}</div>`).join("")}</div>`:"";
// BTW breakdown. Consumer prices in NL are inclusive of BTW, so b.price is the
// gross total. Only show a split when the salon is BTW-registered (has a
// BTW-id). Rate is per-salon (21% nail/beauty, 9% typical hairdresser).
const gross=parseFloat(b.price||0);
const rate=Math.max(0,parseFloat(b.salon_btw_rate!=null?b.salon_btw_rate:21))/100;
let vatRows="";
if(b.salon_btw&&rate>0){const net=gross/(1+rate);const vat=gross-net;const rl=parseFloat((rate*100).toFixed(2)).toString().replace(".",lang==="nl"?",":".");vatRows=`${row(txt(lang,"Subtotaal (excl. btw)","Subtotal (excl. VAT)"),fP(net))}${row(`${txt(lang,"Btw","VAT")} ${rl}%`,fP(vat))}`;}
const totLabel=b.salon_btw?txt(lang,"Totaal (incl. btw)","Total (incl. VAT)"):txt(lang,"Totaal","Total");
const noVatNote=b.salon_btw?"":`<p style="color:#aaa;font-size:11px;text-align:center;margin:0 0 8px;">${txt(lang,"Geen btw in rekening gebracht.","No VAT charged.")}</p>`;
// Factuurdatum = the day the invoice is issued (now, in NL time). The
// appointment date is kept separately below as the service date.
const invDate=fmtD(new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Amsterdam"}),lang);
// Payment-request block: renders when the salon configured a pay link and/or
// an IBAN. The QR is a SEPA (EPC) code served by our payment-qr function —
// banking apps scan it and pre-fill the transfer with IBAN + amount + ref.
const payBlock=(()=>{
// Only for clients who chose "payment request afterwards" at booking —
// clients paying in the salon get a plain invoice without a pay block.
if(!b.payment_request)return"";
const link=safeImgSrc(b.payment_link);
const ibanP=String(b.salon_iban||"").replace(/\s+/g,"");
if(!link&&!ibanP)return"";
// bunq.me / PayPal.Me accept the amount as a path segment, so the salon's
// static profile link can still request the EXACT amount of this invoice.
// Only appended when the link is a bare profile (no amount segment yet).
let linkAmt=link;
if(link&&gross>0){try{const u=new URL(link);const host=u.hostname.toLowerCase().replace(/^www\./,"");const segs=u.pathname.split("/").filter(Boolean);if((host==="bunq.me"||host==="paypal.me")&&segs.length===1){linkAmt=link.replace(/\/+$/,"")+"/"+gross.toFixed(2);}}catch{/* keep base link */}}
const holder=esc(b.iban_holder||b.salon_name||"");
const payRef=String(b.invoice_number||`${b.salon_name||"Vellu"} ${b.date||""}`).slice(0,100);
let h=`<div style="background:${AC}10;border:1px solid ${AC}44;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">`;
h+=`<div style="font-size:14px;font-weight:600;margin-bottom:12px;">${txt(lang,"Betalen","Payment")} · ${fP(gross)}</div>`;
if(link)h+=`<a href="${esc(linkAmt)}" style="display:inline-block;background:${AC};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">${txt(lang,"Betaal online","Pay online")}</a>`;
if(ibanP&&gross>0){
const qrUrl=`${SU}/functions/v1/payment-qr?iban=${encodeURIComponent(ibanP)}&name=${encodeURIComponent(String(b.iban_holder||b.salon_name||"").slice(0,70))}&amount=${gross.toFixed(2)}&ref=${encodeURIComponent(payRef)}`;
h+=`<div style="margin:${link?"14px":"0"} 0 8px;font-size:12px;color:#666;">${txt(lang,link?"Of scan met je bank-app:":"Scan met je bank-app:",link?"Or scan with your banking app:":"Scan with your banking app:")}</div>`;
h+=`<img src="${esc(qrUrl)}" width="150" height="150" alt="SEPA QR" style="display:block;margin:0 auto 10px;border-radius:8px;" />`;
h+=`<div style="font-size:12px;color:#666;line-height:1.6;">${esc(ibanP)}${holder?` ${txt(lang,"t.n.v.","in the name of")} ${holder}`:""}<br/>${txt(lang,"o.v.v.","reference:")} ${esc(payRef)}</div>`;
}
h+=`</div>`;
return h;})();
await send(plainText(b.client_email),plainText(`${txt(lang,"Factuur","Invoice")} ${b.invoice_number||""} - ${b.salon_name}`),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin:0 0 4px;">${txt(lang,"Factuur","Invoice")}</h2><p style="color:#888;font-size:13px;margin:0 0 24px;">${eS}</p>${b.invoice_number?`<div style="background:${AC}1a;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:${AC};display:inline-block;margin-bottom:16px;">${eIN}</div>`:""}${bSec}<div ${bS}><table ${tS}>${row(txt(lang,"Klant","Client"),eC)}${row(txt(lang,"Behandeling","Treatment"),eSv)}${row(txt(lang,"Factuurdatum","Invoice date"),invDate)}${row(txt(lang,"Datum afspraak","Appointment date"),eD)}${vatRows}${totRow(totLabel,fP(gross))}</table></div>${noVatNote}${payBlock}<p style="color:#888;font-size:12px;text-align:center;">${txt(lang,"Bedankt voor je bezoek!","Thank you for your visit!")}</p></div>`);}
if(type==="appointment_reminder"){
await send(plainText(b.client_email),plainText(txt(lang,`Herinnering: Morgen afspraak bij ${b.salon_name}`,`Reminder: Appointment tomorrow at ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Niet vergeten!","Don't forget!")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Je hebt morgen een afspraak bij <strong>${eS}</strong>`,`You have an appointment tomorrow at <strong>${eS}</strong>`)}</p><div ${bS}><table ${tS}>${row(txt(lang,"Behandeling","Treatment"),eSv)}${row(txt(lang,"Datum","Date"),eD)}${row(txt(lang,"Tijd","Time"),eT)}${totRow(txt(lang,"Totaal","Total"),fP(b.price))}</table></div><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`We zien je morgen, ${eC}!`,`See you tomorrow, ${eC}!`)}</p>${b.salon_slug?`<p style="text-align:center;margin-top:20px;"><a href="https://vellu.cc/${eSl}" style="color:${AC};text-decoration:none;font-size:12px;">vellu.cc/${eSl}</a></p>`:""}</div>`);}
if(type==="waitlist_spot_open"){
const salonUrl=b.salon_slug?`https://vellu.cc/${eSl}`:"https://vellu.cc";
await send(plainText(b.client_email),plainText(txt(lang,`Er is een plek vrij bij ${b.salon_name}`,`A spot opened up at ${b.salon_name}`)),`${W}${lH(b)}<h2 style="font-weight:400;font-size:22px;margin-bottom:8px;">${txt(lang,"Goed nieuws!","Great news!")}</h2><p style="color:#666;margin-bottom:28px;">${txt(lang,`Er is een plek vrijgekomen bij <strong>${eS}</strong> op <strong>${eD}</strong>. Wees er snel bij en boek je afspraak — wachtlijst-plekken zijn snel weg.`,`A spot has opened up at <strong>${eS}</strong> on <strong>${eD}</strong>. Book quickly to secure it — waitlist spots go fast.`)}</p><p style="text-align:center;margin:20px 0;"><a href="${esc(salonUrl)}" style="display:inline-block;background:${AC};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:500;">${txt(lang,"Boek nu","Book now")}</a></p><p style="color:#888;font-size:13px;text-align:center;">${txt(lang,`Tot snel, ${eC}!`,`See you soon, ${eC}!`)}</p></div>`);}
// Vellu's own subscription invoice — issued from Mirah Ventures (KVK 42045867) to the salon owner.
// Distinct from the salon→client `invoice` handler above. 21% BTW hardcoded for now;
// becomes dynamic once KOR is confirmed or a BTW-id arrives.
if(type==="subscription_invoice"){
const billerName="Mirah Ventures";const billerKvk="42045867";const billerCity="Amersfoort";const billerEmail="info@vellu.cc";
const planName=b.plan==="professional"?"Vellu Professional":"Vellu Starter";
const intervalLabel=b.billing_interval==="yearly"?txt(lang,"jaarlijks","yearly"):txt(lang,"maandelijks","monthly");
const total=parseFloat(b.amount||0);const exclVat=b.amount_excl_vat?parseFloat(b.amount_excl_vat):+(total/1.21).toFixed(2);const vatAmount=b.vat_amount?parseFloat(b.vat_amount):+(total-exclVat).toFixed(2);
const invoiceNum=esc(b.invoice_number||"");const ownerEmail=plainText(b.owner_email);const businessName=esc(b.business_name||ownerEmail);
const periodStart=b.period_start?fmtD(String(b.period_start).slice(0,10),lang):"";const periodEnd=b.period_end?fmtD(String(b.period_end).slice(0,10),lang):"";
const credits=parseInt(b.credits_used||0,10);
const subj=`${txt(lang,"Factuur","Invoice")} ${invoiceNum} - Vellu`;
await send(ownerEmail,plainText(subj),`${W}<div style="text-align:center;margin-bottom:32px;"><h1 style="font-size:32px;font-weight:300;letter-spacing:0.1em;margin:0;">vellu</h1><div style="width:40px;height:1px;background:#c9a96e;margin:12px auto;"></div></div><h2 style="font-weight:400;font-size:22px;margin:0 0 4px;">${txt(lang,"Factuur","Invoice")}</h2><p style="color:#888;font-size:13px;margin:0 0 24px;">${invoiceNum}</p><div ${bS}><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Van","From")}</div><div style="font-size:13px;font-weight:500;">${billerName}</div><div style="font-size:12px;color:#666;">KVK: ${billerKvk}</div><div style="font-size:12px;color:#666;">${billerCity}, ${txt(lang,"Nederland","Netherlands")}</div><div style="font-size:12px;color:#666;">${billerEmail}</div></div><div ${bS}><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:8px;">${txt(lang,"Aan","To")}</div><div style="font-size:13px;font-weight:500;">${businessName}</div><div style="font-size:12px;color:#666;">${ownerEmail}</div></div><div ${bS}><table ${tS}>${row(txt(lang,"Beschrijving","Description"),`${esc(planName)} - ${intervalLabel}`)}${periodStart&&periodEnd?row(txt(lang,"Periode","Period"),`${periodStart} - ${periodEnd}`):""}${row(txt(lang,"Subtotaal","Subtotal"),fP(exclVat))}${row(`${txt(lang,"BTW","VAT")} 21%`,fP(vatAmount))}${totRow(txt(lang,"Totaal","Total"),fP(total))}</table></div>${credits>0?`<div style="background:#f0ede8;border-radius:10px;padding:12px 16px;font-size:12px;color:#666;margin-bottom:24px;">${txt(lang,`${credits} dag(en) referral-tegoed toegepast op je toegangsperiode.`,`${credits} day(s) of referral credit applied to your access period.`)}</div>`:""}<p style="color:#888;font-size:11px;text-align:center;margin-top:24px;">${txt(lang,"Bedankt dat je Vellu gebruikt!","Thank you for using Vellu!")}</p><p style="color:#aaa;font-size:10px;text-align:center;margin-top:6px;">${billerName} - KVK ${billerKvk} - ${billerCity}</p></div>`);}
return new Response(JSON.stringify({success:true}),{headers:{...headers,"Content-Type":"application/json"}});
}catch(error){console.error("send-emails error:",error);return new Response(JSON.stringify({error:"email_send_failed"}),{status:500,headers:{...headers,"Content-Type":"application/json"}});}});
