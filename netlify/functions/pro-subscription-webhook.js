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
      event.body, sig, process.env.STRIPE_PRO_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('pro-subscription-webhook signature error:', err.message);
    return withCors({ statusCode: 400, body: 'Webhook error' });
  }

  const { type, data } = stripeEvent;

  if (type === 'checkout.session.completed') {
    const { photographerId } = data.object.metadata;
    await supabase
      .from('photographer_accounts')
      .update({
        stripe_customer_id: data.object.customer,
        stripe_subscription_id: data.object.subscription,
        subscription_status: 'active'
      })
      .eq('id', photographerId);
  }

  if (type === 'customer.subscription.deleted' || type === 'customer.subscription.paused') {
    const subscriptionId = data.object.id;
    await supabase
      .from('photographer_accounts')
      .update({ subscription_status: 'inactive' })
      .eq('stripe_subscription_id', subscriptionId);
  }

  if (type === 'customer.subscription.resumed' || type === 'invoice.payment_succeeded') {
    const subscriptionId = data.object.subscription || data.object.id;
    await supabase
      .from('photographer_accounts')
      .update({ subscription_status: 'active' })
      .eq('stripe_subscription_id', subscriptionId);
  }

  return withCors({ statusCode: 200, body: 'ok' });
};
