const { respondPreflight, withCors } = require('./_cors');
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
    const { eventCode, eventName, tier } = JSON.parse(event.body);

    const { sanitiseFields } = require('./_sanitise');
    const sanitised = sanitiseFields({ eventName }, ['eventName']);

    const ALLOWED_TIERS = ['premium', 'premium_max'];
    const safeTier = ALLOWED_TIERS.includes(tier) ? tier : 'premium';

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventCode)
      .single();

    if (eventError || !eventRow) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Event not found' }) });
    }

    const priceId = tier === 'premium_max'
      ? process.env.STRIPE_PREMIUM_MAX_PRICE_ID
      : process.env.STRIPE_PREMIUM_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://eventsnapapp.live/#/host/${eventCode}?upgraded=true`,
      cancel_url: `https://eventsnapapp.live/#/host/${eventCode}?cancelled=true`,
      metadata: { eventCode, tier: safeTier },
      allow_promotion_codes: true,
    });

    return withCors({
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return withCors({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  }
};
