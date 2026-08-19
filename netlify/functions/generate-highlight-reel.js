const { respondPreflight, withCors } = require('./_cors');
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
    const { eventId, count = 20 } = JSON.parse(event.body);

    const authHeader = event.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }
    const { createClient: createUserClient } = require('@supabase/supabase-js');
    const userSupabase = createUserClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
    if (authError || !user) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventId)
      .single();
    if (eventError || !eventData || eventData.host_email?.toLowerCase() !== user.email?.toLowerCase()) {
      return withCors({ statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) });
    }
    const safeCount = Math.min(Math.max(parseInt(count) || 20, 1), 100);

    if (!eventId) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // Reset previous highlights
    await supabase.from('photos').update({ is_highlight: false }).eq('event_id', eventId);

    // Select top N by quality_score
    const { data: topPhotos } = await supabase
      .from('photos')
      .select('id')
      .eq('event_id', eventId)
      .eq('moderation_status', 'approved')
      .not('quality_score', 'is', null)
      .order('quality_score', { ascending: false })
      .limit(safeCount);

    const ids = topPhotos.map(p => p.id);
    if (ids.length > 0) {
      await supabase.from('photos').update({ is_highlight: true }).in('id', ids);
    }

    return withCors({
      statusCode: 200,
      body: JSON.stringify({ selected: ids.length })
    });
  } catch (err) {
    console.error('generate-highlight-reel error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
