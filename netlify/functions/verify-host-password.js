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
    let { eventCode, password } = JSON.parse(event.body);

    if (!eventCode) {
      return { statusCode: 400, body: JSON.stringify({ error: 'eventCode is required' }) };
    }

    eventCode = eventCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const { data, error } = await supabase
      .from('events')
      .select('host_password')
      .eq('id', eventCode)
      .single();

    if (error || !data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
    }

    if (data.host_password === null) {
      return { statusCode: 200, body: JSON.stringify({ valid: true, noPassword: true }) };
    }

    if (!password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'password is required' }) };
    }

    const storedHash = data.host_password;
    const bcryptMatch = await bcrypt.compare(password, storedHash);

    if (bcryptMatch) {
      return { statusCode: 200, body: JSON.stringify({ valid: true }) };
    }

    const crypto = require('crypto');
    try {
      const inputBuffer = Buffer.from(password);
      const storedBuffer = Buffer.from(storedHash);
      if (inputBuffer.length === storedBuffer.length && crypto.timingSafeEqual(inputBuffer, storedBuffer)) {
        const newHash = await bcrypt.hash(password, 10);
        await supabase.from('events').update({ host_password: newHash }).eq('id', eventCode);
        return { statusCode: 200, body: JSON.stringify({ valid: true }) };
      }
    } catch { }

    return { statusCode: 200, body: JSON.stringify({ valid: false }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
