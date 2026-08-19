const { respondPreflight, withCors } = require('./_cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondPreflight();
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('stripe-webhook signature error:', err.message);
    return withCors({ statusCode: 400, body: 'Webhook error' });
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const { eventCode, tier } = stripeEvent.data.object.metadata;
      if (eventCode) {
        const updateData = tier === 'premium_max'
          ? { plan: 'premium_max', max_photos: 5000 }
          : { plan: 'premium', max_photos: 2000 };
        const { error } = await supabase
          .from('events')
          .update(updateData)
          .eq('id', eventCode);

        if (error) {
          console.error('stripe-webhook Supabase update error:', error.code);
          return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
        }
      }
    }
  } catch (err) {
    console.error('stripe-webhook processing error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }

  return withCors({ statusCode: 200, body: 'ok' });
};
