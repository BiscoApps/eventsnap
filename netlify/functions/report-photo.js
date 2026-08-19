const { respondPreflight, withCors } = require('./_cors');
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
    const { photoId, eventCode } = JSON.parse(event.body);

    if (!photoId || typeof photoId !== 'string' || !eventCode || !/^[A-Z0-9]{8}$/.test(eventCode)) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // Fetch the photo and verify it belongs to the event
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('id, event_id')
      .eq('id', photoId)
      .eq('event_id', eventCode)
      .single();

    if (fetchError || !photo) {
      return withCors({ statusCode: 404, body: JSON.stringify({ error: 'Photo not found' }) });
    }

    // Hide the photo by marking it as reported
    const { error: updateError } = await supabase
      .from('photos')
      .update({ moderation_status: 'reported' })
      .eq('id', photoId);

    if (updateError) {
      console.error('report-photo update error:', updateError);
      return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to report photo' }) });
    }

    return withCors({ statusCode: 200, body: JSON.stringify({ reported: true }) });
  } catch (err) {
    console.error('report-photo error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
