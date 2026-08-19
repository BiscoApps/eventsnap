const { respondPreflight, withCors } = require('./_cors');
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
    return withCors({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondPreflight();
  if (event.httpMethod !== 'POST') {
    return withCors({ statusCode: 405, body: 'Method not allowed' });
  }

  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;

  try {
    const { email, eventId, accessToken } = JSON.parse(event.body);

    if (!email || !eventId || !accessToken) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'email, eventId, and accessToken are required' }) });
    }

    // Verify the JWT and confirm the email matches (mirrors create-event.js)
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }
    if (user.email.toLowerCase() !== email.toLowerCase()) {
      return withCors({ statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) });
    }

    const sanitisedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase
      .from('ambassadors')
      .select('id')
      .eq('email', sanitisedEmail)
      .single();

    if (error || !data) {
      return withCors({ statusCode: 200, body: JSON.stringify({ ambassador: false }) });
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventId)
      .single();

    if (eventError || !eventData || eventData.host_email !== sanitisedEmail) {
      return withCors({ statusCode: 403, body: JSON.stringify({ error: 'Unauthorised' }) });
    }

    await supabase
      .from('events')
      .update({ plan: 'premium_max' })
      .eq('id', eventId);

    return withCors({ statusCode: 200, body: JSON.stringify({ ambassador: true, plan: 'premium_max' }) });
  } catch (err) {
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
