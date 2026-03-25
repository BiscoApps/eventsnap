const AWS = require('aws-sdk');
const { createClient } = require('@supabase/supabase-js');

const rekognition = new AWS.Rekognition({
  region: process.env.REKOGNITION_REGION || 'eu-west-1',
  accessKeyId: process.env.REKOGNITION_ACCESS_KEY_ID,
  secretAccessKey: process.env.REKOGNITION_SECRET_ACCESS_KEY,
});

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
    const { eventId, selfieBase64, guestName } = JSON.parse(event.body);
    if (!eventId || !selfieBase64 || !guestName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    if (selfieBase64.length > 2 * 1024 * 1024) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Image too large' }) };
    }
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, face_tagging_enabled')
      .eq('id', eventId)
      .single();
    if (eventError || !eventRow) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };
    }
    if (!eventRow.face_tagging_enabled) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Face tagging not enabled for this event' }) };
    }

    const { sanitiseFields } = require('./_sanitise');
    const sanitised = sanitiseFields({ guestName }, ['guestName']);

    const selfieBuffer = Buffer.from(selfieBase64, 'base64');

    const selfieFileName = `selfies/${eventId}/${Date.now()}.jpg`;
    await supabase.storage
      .from('event-photos')
      .upload(selfieFileName, selfieBuffer, { contentType: 'image/jpeg' });

    const selfieUrl = supabase.storage.from('event-photos').getPublicUrl(selfieFileName).data.publicUrl;

    await supabase.from('face_tagging_consents').insert({
      event_id: eventId,
      guest_name: sanitised.guestName,
      selfie_url: selfieUrl,
    });

    const collectionId = `eventsnap-${eventId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    let matchingPhotoIds = [];
    try {
      const result = await rekognition.searchFacesByImage({
        CollectionId: collectionId,
        Image: { Bytes: selfieBuffer },
        MaxFaces: 100,
        FaceMatchThreshold: 60,
      }).promise();

      const faceMatches = result.FaceMatches || [];
      const externalIds = faceMatches.map((m) => m.Face.ExternalImageId).filter(Boolean);
      matchingPhotoIds = [...new Set(externalIds)];
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        matchingPhotoIds = [];
      } else {
        console.error('searchFacesByImage error:', err.message);
        matchingPhotoIds = [];
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ matchingPhotoIds }),
    };
  } catch (err) {
    console.error('match-faces error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
