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

async function ensureCollection(collectionId) {
  try {
    await rekognition.createCollection({ CollectionId: collectionId }).promise();
  } catch (err) {
    if (err.code !== 'ResourceAlreadyExistsException') throw err;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;

  try {
    const { photoId, photoUrl, eventId } = JSON.parse(event.body);
    if (!photoId || !photoUrl || !eventId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Verify photo exists and belongs to the claimed event
    const { data: photoRow, error: photoError } = await supabase
      .from('photos')
      .select('id, event_id')
      .eq('id', photoId)
      .eq('event_id', eventId)
      .single();

    if (photoError || !photoRow) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Photo not found' }) };
    }

    const allowedHost = new URL(process.env.SUPABASE_URL).hostname;
    let parsedUrl;
    try {
      parsedUrl = new URL(photoUrl);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid photo URL' }) };
    }
    if (!parsedUrl.hostname.endsWith(allowedHost) && !parsedUrl.hostname.includes('supabase.co')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid photo URL' }) };
    }

    const collectionId = `eventsnap-${eventId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    await ensureCollection(collectionId);

    const response = await fetch(photoUrl);
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    let facesIndexed = 0;
    try {
      const result = await rekognition.indexFaces({
        CollectionId: collectionId,
        Image: { Bytes: imageBuffer },
        ExternalImageId: photoId,
        DetectionAttributes: [],
        MaxFaces: 10,
      }).promise();
      facesIndexed = result.FaceRecords?.length || 0;
    } catch (err) {
      console.error('indexFaces error:', err.message);
    }

    await supabase.from('photos')
      .update({
        face_vectors: {
          facesFound: facesIndexed,
          processed: true,
          processedAt: new Date().toISOString(),
          collectionId,
        }
      })
      .eq('id', photoId);

    return { statusCode: 200, body: JSON.stringify({ ok: true, facesIndexed }) };
  } catch (err) {
    console.error('process-photo-faces error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
