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
    const { eventId } = JSON.parse(event.body);

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

    if (!eventId) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // Fetch approved photos with no quality score yet — max 50 per call to avoid timeout
    const { data: photos } = await supabase
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .eq('moderation_status', 'approved')
      .is('quality_score', null)
      .limit(50);

    let scored = 0;
    let skipped = 0;

    for (const photo of photos) {
      try {
        if (photo.media_type === 'video') {
          // Videos: default score of 0.7 — included in reels by default
          await supabase.from('photos').update({ quality_score: 0.7 }).eq('id', photo.id);
          scored++;
          continue;
        }

        // Call Google Vision API for photos
        const response = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                image: { source: { imageUri: photo.image_url } },
                features: [
                  { type: 'IMAGE_PROPERTIES' },
                  { type: 'SAFE_SEARCH_DETECTION' }
                ]
              }]
            })
          }
        );
        const result = await response.json();

        // Derive a 0.0–1.0 score from the response
        // Higher colour score = more interesting/varied image
        const colorScore = result.responses[0]?.imagePropertiesAnnotation?.dominantColors?.colors?.length / 10 || 0.5;
        const safeSearch = result.responses[0]?.safeSearchAnnotation;
        const isSafe = safeSearch?.adult === 'VERY_UNLIKELY' && safeSearch?.violence === 'VERY_UNLIKELY';
        const finalScore = isSafe ? Math.min(colorScore, 1.0) : 0.1;

        await supabase.from('photos').update({ quality_score: finalScore }).eq('id', photo.id);
        scored++;
      } catch (err) {
        console.error(`Failed to score photo ${photo.id}:`, err);
        skipped++;
      }
    }

    return withCors({
      statusCode: 200,
      body: JSON.stringify({ scored, skipped })
    });
  } catch (err) {
    console.error('score-photos error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
