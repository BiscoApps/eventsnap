const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rateLimit = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(event) {
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
  }
  return null;
}

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;

  let payload;
  try {
    let { title, subtitle, date, host, event_slug, cover_photo_url, photographer_id, hostEmail, accessToken } = JSON.parse(event.body);

    if (!title || !date || !hostEmail || !accessToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Verify the JWT and confirm email matches
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      console.error('create-event Supabase error:', authError);
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
    }
    if (user.email.toLowerCase() !== hostEmail.toLowerCase()) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const { sanitiseFields } = require('./_sanitise');
    const sanitised = sanitiseFields({ title, subtitle, host }, ['title', 'subtitle', 'host']);
    title = sanitised.title;
    subtitle = sanitised.subtitle;
    host = sanitised.host;

    const code = generateCode();

    payload = {
      id: code,
      title,
      subtitle: subtitle || null,
      date,
      host: host || null,
      event_slug: event_slug || null,
      cover_photo_url: cover_photo_url || null,
      status: 'active',
      max_photos: 100,
      max_guests: 50,
      expires_at: null,
      plan: 'free',
      photographer_id: photographer_id || null,
      host_email: hostEmail,
    };

    const { data, error } = await supabase.from('events').insert(payload).select('id').single();

    if (error) {
      console.error('create-event error:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }

    // Check ambassador
    if (data?.id && hostEmail) {
      fetch(`${process.env.URL}/.netlify/functions/check-ambassador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: hostEmail, eventId: data.id, accessToken }),
      }).catch(() => {});
    }

    return { statusCode: 200, body: JSON.stringify({ data }) };
  } catch (err) {
    console.error('create-event Supabase error (fallback):', err, 'payload=', JSON.stringify({ ...payload, host_email: '[redacted]' }));
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
