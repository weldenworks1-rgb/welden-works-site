import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_EMAIL = 'contact@weldenworks.com';

// ── ALLOWED ORIGINS ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://weldenworks.com',
  'https://www.weldenworks.com',
];

// ── IN-MEMORY RATE LIMITER ───────────────────────────────────────────────────
// Max 5 submissions per IP per 10-minute window
const rateLimitMap = new Map();
const RATE_LIMIT    = 5;
const WINDOW_MS     = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > WINDOW_MS) {
    // Reset window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

// ── HTML SANITISER ───────────────────────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;')
    .slice(0, 2000); // hard cap per field
}

// ── EMAIL VALIDATOR ──────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default async function handler(req, res) {
  // ── CORS — lock to weldenworks.com only ────────────────────────────────────
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── RATE LIMIT ─────────────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
  }

  // ── HONEYPOT CHECK ─────────────────────────────────────────────────────────
  // If the hidden field "website" is filled, it's a bot
  if (req.body.website && req.body.website.trim() !== '') {
    // Silently accept to not tip off the bot, but don't process
    return res.status(200).json({ success: true });
  }

  // ── TIMING CHECK ──────────────────────────────────────────────────────────
  // Real humans take at least 3 seconds to fill out a form
  const fillTime = parseInt(req.body._t || '0', 10);
  const elapsed  = Date.now() - fillTime;
  if (fillTime && elapsed < 3000) {
    return res.status(200).json({ success: true }); // silent reject
  }

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const name     = sanitize(req.body.name     || '');
  const email    = sanitize(req.body.email    || '');
  const phone    = sanitize(req.body.phone    || '');
  const business = sanitize(req.body.business || '');
  const service  = sanitize(req.body.service  || '');
  const message  = sanitize(req.body.message  || '');

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  if (!isValidEmail(req.body.email || '')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    await resend.emails.send({
      from: 'Welden Works <onboarding@resend.dev>',
      to: NOTIFY_EMAIL,
      subject: `New Lead: ${business || name}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1714;">
          <div style="background:#1a1714;padding:32px 40px;">
            <h1 style="color:#b8975a;font-size:1.6rem;margin:0;letter-spacing:1px;">WELDEN WORKS</h1>
            <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">New Lead Notification</p>
          </div>
          <div style="background:#faf9f7;padding:40px;border:1px solid #ede8df;border-top:none;">
            <h2 style="font-size:1.4rem;margin:0 0 28px;color:#1a1714;">You have a new inquiry</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;width:120px;">Name</td><td style="padding:12px 0;border-bottom:1px solid #ede8df;font-weight:500;">${name}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;">Email</td><td style="padding:12px 0;border-bottom:1px solid #ede8df;"><a href="mailto:${email}" style="color:#b8975a;">${email}</a></td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;">Phone</td><td style="padding:12px 0;border-bottom:1px solid #ede8df;">${phone || '—'}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;">Business</td><td style="padding:12px 0;border-bottom:1px solid #ede8df;">${business || '—'}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;">Service</td><td style="padding:12px 0;border-bottom:1px solid #ede8df;color:#b8975a;font-weight:500;">${service || '—'}</td></tr>
              <tr><td style="padding:12px 0;color:#6b6459;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;vertical-align:top;padding-top:16px;">Message</td><td style="padding:12px 0;padding-top:16px;line-height:1.7;">${message || '—'}</td></tr>
            </table>
            <div style="margin-top:32px;padding:16px 20px;background:#f5f3ef;border-left:3px solid #b8975a;">
              <p style="margin:0;font-size:0.8rem;color:#6b6459;">Submitted: ${new Date().toISOString()} · IP: ${ip}</p>
            </div>
            <a href="mailto:${email}?subject=Re: Your Welden Works Inquiry" style="display:inline-block;margin-top:28px;background:#1a1714;color:#faf9f7;padding:14px 28px;text-decoration:none;font-size:0.75rem;letter-spacing:2px;text-transform:uppercase;">Reply to ${name}</a>
          </div>
        </div>
      `
    });

    await resend.emails.send({
      from: 'Chase at Welden Works <onboarding@resend.dev>',
      to: req.body.email, // use original (unsanitized) for actual delivery
      subject: `We received your request, ${name.split(' ')[0]}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1714;">
          <div style="background:#1a1714;padding:32px 40px;">
            <h1 style="color:#b8975a;font-size:1.6rem;margin:0;letter-spacing:1px;">WELDEN WORKS</h1>
            <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">Digital Agency</p>
          </div>
          <div style="background:#faf9f7;padding:40px;border:1px solid #ede8df;border-top:none;">
            <h2 style="font-size:1.5rem;margin:0 0 20px;color:#1a1714;">Thanks, ${name.split(' ')[0]}. We're on it.</h2>
            <p style="line-height:1.9;color:#3d3830;margin:0 0 20px;">We received your inquiry about <strong style="color:#1a1714;">${service || 'our services'}</strong> and we're already looking into your business.</p>
            <p style="line-height:1.9;color:#3d3830;margin:0 0 32px;">Expect a fully custom website preview in your inbox within <strong style="color:#1a1714;">24–48 hours</strong> — no commitment, no cost. Just a look at what we can build for ${business || 'your business'}.</p>
            <div style="border-top:1px solid #ede8df;border-bottom:1px solid #ede8df;padding:24px 0;margin:0 0 32px;">
              <p style="margin:0 0 12px;font-size:0.75rem;letter-spacing:2px;text-transform:uppercase;color:#6b6459;">What happens next</p>
              <p style="margin:0;line-height:2;color:#3d3830;font-size:0.9rem;">① We research your business and competitors<br/>② We build a fully custom site preview<br/>③ We send you the live link to review<br/>④ You decide — zero pressure</p>
            </div>
            <p style="line-height:1.9;color:#3d3830;margin:0 0 32px;">In the meantime, feel free to reply directly to this email with any questions.</p>
            <p style="color:#6b6459;font-size:0.88rem;margin:0;">Best,<br/><strong style="color:#1a1714;">Chase Welden</strong><br/>Welden Works</p>
          </div>
          <div style="padding:20px 40px;text-align:center;">
            <p style="font-size:0.72rem;color:#6b6459;margin:0;">© 2026 Welden Works · weldenworks.com</p>
          </div>
        </div>
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
}
