const { respondPreflight, withCors } = require('./_cors');
const bcrypt = require('bcryptjs');

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
    const { password } = JSON.parse(event.body);

    if (!password || typeof password !== 'string' || password.trim() === '') {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'password is required' }) });
    }

    if (password.length > 72) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Password too long' }) });
    }

    const hash = await bcrypt.hash(password, 10);
    return withCors({ statusCode: 200, body: JSON.stringify({ hash }) });
  } catch (err) {
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
