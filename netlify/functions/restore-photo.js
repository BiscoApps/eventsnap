const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rateLimit = new Map();
const RATE_LIMIT_MAX = 30;
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
    const { photoId, eventCode, accessToken } = JSON.parse(event.body);

    if (!photoId || !eventCode || !accessToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Verify the caller is the host of this event
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventCode)
      .single();

    if (!eventData) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
    }

    if (eventData.host_email && eventData.host_email.toLowerCase() !== user.email.toLowerCase()) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    // Fetch the photo and verify it belongs to the event
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('id, image_url, event_id')
      .eq('id', photoId)
      .eq('event_id', eventCode)
      .single();

    if (fetchError || !photo) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Photo not found' }) };
    }

    // Restore the photo by marking it as approved
    const { error: updateError } = await supabase
      .from('photos')
      .update({ moderation_status: 'approved' })
      .eq('id', photoId);

    if (updateError) {
      console.error('restore-photo update error:', updateError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to restore photo' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ restored: true }) };
  } catch (err) {
    console.error('restore-photo error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
