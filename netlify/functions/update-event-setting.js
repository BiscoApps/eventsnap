const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { sanitiseText } = require('./_sanitise');

const ALLOWED_FIELDS = ['moderation_enabled', 'face_tagging_enabled', 'slideshow_transition', 'brand_color', 'slideshow_photo_ids', 'status', 'cover_photo_url', 'theme'];
const ALLOWED_THEMES = ['classic', 'film'];

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
    const { eventCode, field, value, accessToken } = JSON.parse(event.body);

    if (!eventCode || !field || !accessToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    if (!ALLOWED_FIELDS.includes(field)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Field '${field}' is not allowed` }) };
    }

    const STRING_FIELDS = ['brand_color', 'slideshow_transition', 'cover_photo_url'];
    const sanitisedValue = STRING_FIELDS.includes(field) && typeof value === 'string'
      ? sanitiseText(value)
      : field === 'theme'
        ? (ALLOWED_THEMES.includes(value) ? value : 'classic')
        : value;

    // Verify caller is the host
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

    const { error } = await supabase
      .from('events')
      .update({ [field]: sanitisedValue })
      .eq('id', eventCode);

    if (error) {
      console.error('update-event-setting error:', error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update event' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('update-event-setting error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
