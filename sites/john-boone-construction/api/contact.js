import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
const OWNER_EMAIL = 'contact@weldenworks.com';
const RATE_LIMIT_MAP = new Map();
function sanitize(str){if(typeof str!=='string')return '';return str.replace(/[<>]/g,'').slice(0,2000);}
export default async function handler(req,res){
  const origin=req.headers.origin||'';
  const allowed=['https://johnbooneconstruction.com','https://www.johnbooneconstruction.com'];
  res.setHeader('Access-Control-Allow-Origin',allowed.includes(origin)?origin:'null');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const ip=req.headers['x-forwarded-for']?.split(',')[0]||req.socket.remoteAddress||'unknown';
  const now=Date.now(),window=10*60*1000,limit=5;
  if(!RATE_LIMIT_MAP.has(ip))RATE_LIMIT_MAP.set(ip,[]);
  const ts=RATE_LIMIT_MAP.get(ip).filter(t=>now-t<window);
  if(ts.length>=limit){res.setHeader('Retry-After','600');return res.status(429).json({error:'Too many requests'});}
  ts.push(now);RATE_LIMIT_MAP.set(ip,ts);
  const{name,phone,email,service,message,website}=req.body||{};
  if(website)return res.status(200).json({ok:true});
  if(!name||!email||!phone)return res.status(400).json({error:'Missing required fields'});
  const sName=sanitize(name),sPhone=sanitize(phone),sEmail=sanitize(email),sService=sanitize(service),sMessage=sanitize(message);
  try{
    await resend.emails.send({from:'John Boone Site <onboarding@resend.dev>',to:OWNER_EMAIL,subject:`New Estimate Request — ${sName}`,html:`<h2>New Lead</h2><p><b>Name:</b> ${sName}</p><p><b>Phone:</b> ${sPhone}</p><p><b>Email:</b> ${sEmail}</p><p><b>Service:</b> ${sService}</p><p><b>Message:</b> ${sMessage}</p>`});
    await resend.emails.send({from:'John Boone Construction <onboarding@resend.dev>',to:sEmail,subject:'We received your estimate request',html:`<p>Hi ${sName},</p><p>Thanks for reaching out! We received your request for <b>${sService}</b> and will follow up within one business day. Call or text us any time at <b>(941) 237-7762</b>.</p><p>— John Boone Construction</p>`});
    return res.status(200).json({ok:true});
  }catch(err){console.error(err);return res.status(500).json({error:'Email delivery failed'});}
}
