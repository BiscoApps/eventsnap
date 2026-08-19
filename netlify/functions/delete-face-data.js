const { respondPreflight, withCors } = require('./_cors');
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
    const { eventCode, accessToken } = JSON.parse(event.body);

    if (!eventCode || !accessToken) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // Verify caller is the host
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('host_email')
      .eq('id', eventCode)
      .single();

    if (!eventData) {
      return withCors({ statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) });
    }

    if (eventData.host_email && eventData.host_email.toLowerCase() !== user.email.toLowerCase()) {
      return withCors({ statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) });
    }

    // Delete AWS Rekognition collection holding indexed face vectors (biometric data first; abort if AWS fails)
    const collectionId = `eventsnap-${eventCode}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    try {
      await rekognition.deleteCollection({ CollectionId: collectionId }).promise();
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        // no collection for this event — fine, continue (idempotent)
      } else {
        console.error('deleteCollection error:', err);
        return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete face data' }) });
      }
    }

    // Delete all consent rows for this event
    const { data: deletedConsents, error: consentError } = await supabase
      .from('face_tagging_consents')
      .delete()
      .eq('event_id', eventCode)
      .select('id');

    if (consentError) {
      console.error('Consent delete error:', consentError);
    }

    const consentsDeleted = deletedConsents?.length || 0;

    // List all selfie files for this event
    const { data: files, error: listError } = await supabase.storage
      .from('event-photos')
      .list(`selfies/${eventCode}`);

    let filesDeleted = 0;

    if (!listError && files && files.length > 0) {
      const filePaths = files.map(f => `selfies/${eventCode}/${f.name}`);
      const { error: removeError } = await supabase.storage
        .from('event-photos')
        .remove(filePaths);

      if (removeError) {
        console.error('File delete error:', removeError);
      } else {
        filesDeleted = filePaths.length;
      }
    }

    return withCors({
      statusCode: 200,
      body: JSON.stringify({ deleted: true, consents: consentsDeleted, files: filesDeleted }),
    });
  } catch (err) {
    console.error('delete-face-data error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
