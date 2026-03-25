import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
  });

  const signature = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const eventId = session.metadata?.event_id;

    if (!eventId) {
      console.error("No event_id in session metadata");
      return new Response(JSON.stringify({ error: "No event_id" }), {
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Insert payment record
    const { error: paymentError } = await supabase.from("payments").insert({
      event_id: eventId,
      stripe_session_id: session.id,
      amount: session.amount_total,
      currency: session.currency,
      status: "completed",
    });

    if (paymentError) {
      console.error("Payment insert error:", paymentError);
    }

    // Upgrade event to premium
    const { error: updateError } = await supabase
      .from("events")
      .update({
        plan: "premium",
        max_photos: 500,
        max_guests: 200,
      })
      .eq("id", eventId);

    if (updateError) {
      console.error("Event update error:", updateError);
    }

    console.log(`Event ${eventId} upgraded to premium`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
