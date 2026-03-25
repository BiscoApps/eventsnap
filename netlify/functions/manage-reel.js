const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { sanitiseText } = require('./_sanitise');

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
    const { action, eventCode, reelId, title, photoIds } = JSON.parse(event.body);
    const authHeader = event.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
    }
    const { createClient: createUserClient } = require('@supabase/supabase-js');
    const userSupabase = createUserClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
    }
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventCode)
      .single();
    if (eventError || !eventData || eventData.host_email?.toLowerCase() !== user.email?.toLowerCase()) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    if (!action || !eventCode) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing action or eventCode' }) };
    }

    if (action === 'create') {
      if (!title) return { statusCode: 400, body: JSON.stringify({ error: 'Missing title' }) };
      const { data, error } = await supabase
        .from('reels')
        .insert({ event_id: eventCode, title: sanitiseText(title), photo_ids: photoIds || [] })
        .select()
        .single();
      if (error) {
        console.error('manage-reel create error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create reel' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ reel: data }) };
    }

    if (action === 'update') {
      if (!reelId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reelId' }) };
      const updates = {};
      if (title !== undefined) updates.title = sanitiseText(title);
      if (photoIds !== undefined) updates.photo_ids = photoIds;
      const { error } = await supabase
        .from('reels')
        .update(updates)
        .eq('id', reelId)
        .eq('event_id', eventCode);
      if (error) {
        console.error('manage-reel update error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update reel' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    if (action === 'delete') {
      if (!reelId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reelId' }) };
      const { error } = await supabase
        .from('reels')
        .delete()
        .eq('id', reelId)
        .eq('event_id', eventCode);
      if (error) {
        console.error('manage-reel delete error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete reel' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    console.error('manage-reel error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
