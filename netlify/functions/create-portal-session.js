const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
    const { stripeCustomerId } = JSON.parse(event.body);

    if (!stripeCustomerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const { data: row, error: dbError } = await supabase
      .from('photographer_accounts')
      .select('stripe_customer_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (dbError || !row) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://eventsnapapp.live/#/pro/dashboard'
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('create-portal-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
