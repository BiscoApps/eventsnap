const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rateLimit = new Map();
const RATE_LIMIT_MAX = 5;
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
    const { eventCode, password } = JSON.parse(event.body);

    if (!eventCode || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const { data, error } = await supabase
      .from('events')
      .select('host_password')
      .eq('id', eventCode)
      .single();

    if (error || !data) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const valid = await bcrypt.compare(password, data.host_password);
    if (!valid) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const expiry = Date.now() + 60 * 60 * 1000;
    const hmac = crypto.createHmac('sha256', process.env.HOST_TOKEN_SECRET)
      .update(eventCode + ':' + expiry)
      .digest('hex');

    return {
      statusCode: 200,
      body: JSON.stringify({ token: hmac, expiry }),
    };
  } catch (err) {
    console.error('generate-host-token error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
