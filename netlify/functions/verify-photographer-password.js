const { respondPreflight, withCors } = require('./_cors');
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
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'email and password are required' }) });
    }

    const { data, error } = await supabase
      .from('photographer_accounts')
      .select('id, email, display_name, subscription_status, stripe_customer_id, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) {
      return withCors({ statusCode: 200, body: JSON.stringify({ valid: false }) });
    }

    const storedHash = data.password_hash;

    // Try bcrypt comparison first
    const bcryptMatch = await bcrypt.compare(password, storedHash);

    if (bcryptMatch) {
      return withCors({
        statusCode: 200,
        body: JSON.stringify({
          valid: true,
          account: {
            id: data.id,
            email: data.email,
            displayName: data.display_name,
            subscriptionStatus: data.subscription_status,
            stripeCustomerId: data.stripe_customer_id,
          },
        }),
      });
    }

    // Legacy fallback: SHA-256 hex string comparison
    if (await legacySha256Match(password, storedHash)) {
      // Auto-migrate to bcrypt
      const newHash = await bcrypt.hash(password, 10);
      await supabase
        .from('photographer_accounts')
        .update({ password_hash: newHash })
        .eq('id', data.id);

      return withCors({
        statusCode: 200,
        body: JSON.stringify({
          valid: true,
          account: {
            id: data.id,
            email: data.email,
            displayName: data.display_name,
            subscriptionStatus: data.subscription_status,
            stripeCustomerId: data.stripe_customer_id,
          },
        }),
      });
    }

    return withCors({ statusCode: 200, body: JSON.stringify({ valid: false }) });
  } catch (err) {
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};

// Check if the stored hash is a SHA-256 hex of the password
async function legacySha256Match(password, storedHash) {
  const crypto = require('crypto');
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sha256), Buffer.from(storedHash));
  } catch {
    return false;
  }
}
