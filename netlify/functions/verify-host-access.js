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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;
  try {
    const { eventCode, accessToken } = JSON.parse(event.body);
    if (!eventCode || !accessToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    // Verify the JWT and extract the real user email — cannot be spoofed
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Read host_email directly from events table via service role
    const { data: eventData } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventCode)
      .single();

    if (!eventData) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
    }

    // Legacy events with no host_email — allow any signed-in user (transition state)
    if (!eventData.host_email) {
      return { statusCode: 200, body: JSON.stringify({ isOwner: true, legacy: true }) };
    }

    const isOwner = eventData.host_email.toLowerCase() === user.email.toLowerCase();
    return { statusCode: 200, body: JSON.stringify({ isOwner }) };
  } catch (err) {
    console.error('verify-host-access error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
