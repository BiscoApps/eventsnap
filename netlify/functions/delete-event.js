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
const RATE_LIMIT_MAX = 3;
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

// Paginated list+remove for one storage prefix.
// Removed files don't reappear, so we keep listing from offset 0 until empty.
// Safety counter caps the loop so a persistent remove-error can't spin forever.
async function wipeStoragePrefix(prefix) {
  let totalRemoved = 0;
  const pageSize = 100;
  for (let i = 0; i < 200; i++) {
    const { data: files, error: listError } = await supabase.storage
      .from('event-photos')
      .list(prefix, { limit: pageSize });
    if (listError) {
      console.error(`delete-event: list error for ${prefix}:`, listError);
      return totalRemoved;
    }
    if (!files || files.length === 0) return totalRemoved;
    const filePaths = files.map(f => `${prefix}/${f.name}`);
    const { error: removeError } = await supabase.storage
      .from('event-photos')
      .remove(filePaths);
    if (removeError) {
      console.error(`delete-event: remove error for ${prefix}:`, removeError);
      return totalRemoved;
    }
    totalRemoved += filePaths.length;
    if (files.length < pageSize) return totalRemoved;
  }
  console.error(`delete-event: pagination safety limit hit for ${prefix}`);
  return totalRemoved;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respondPreflight();
  // 1. Method gate
  if (event.httpMethod !== 'POST') {
    return withCors({ statusCode: 405, body: 'Method not allowed' });
  }

  // 2. Rate limit — tighter than other functions (3/min/IP). This is destructive.
  const rateLimited = checkRateLimit(event);
  if (rateLimited) return rateLimited;

  try {
    // 3. Parse body — all three fields required.
    const { eventCode, confirmEventCode, accessToken } = JSON.parse(event.body);
    if (!eventCode || !confirmEventCode || !accessToken) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) });
    }

    // 4. Second-confirm guard — protects against stale tabs & fat-finger.
    if (confirmEventCode !== eventCode) {
      return withCors({ statusCode: 400, body: JSON.stringify({ error: 'Confirmation mismatch' }) });
    }

    // 5. JWT verification.
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return withCors({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) });
    }

    // 6. Look up event — need host_email for ownership and cover_photo_url for storage wipe.
    const { data: eventData } = await supabase
      .from('events')
      .select('host_email, cover_photo_url')
      .eq('id', eventCode)
      .single();

    if (!eventData) {
      return withCors({ statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) });
    }

    // 7. Ownership — mirrors delete-face-data.js exactly:
    //    null/empty host_email is a legacy transition state and passes through;
    //    otherwise emails must match case-insensitively.
    if (!eventData.host_email || eventData.host_email.toLowerCase() !== user.email.toLowerCase()) {
      return withCors({ statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) });
    }

    // 8. Rekognition FIRST — biometric data goes before any storage or DB writes.
    //    Abort the whole op on any AWS error other than ResourceNotFoundException
    //    so the caller can retry without orphaning DB/storage state.
    const collectionId = `eventsnap-${eventCode}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    let rekognitionStatus = 'deleted';
    try {
      await rekognition.deleteCollection({ CollectionId: collectionId }).promise();
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        rekognitionStatus = 'absent';
      } else {
        console.error('delete-event: Rekognition deleteCollection error:', err);
        return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete event (Rekognition)' }) });
      }
    }

    // 9. Storage wipe — log+continue on individual prefix failures.
    let filesDeleted = 0;
    filesDeleted += await wipeStoragePrefix(`${eventCode}/photos`);
    filesDeleted += await wipeStoragePrefix(`${eventCode}/videos`);
    filesDeleted += await wipeStoragePrefix(`selfies/${eventCode}`);

    // Cover photo — shared 'covers/' prefix, not per-event.
    // Parse the storage path from the public URL using the marker that
    // reject-photo.js:75-78 already uses, then remove if found.
    if (eventData.cover_photo_url) {
      const marker = '/object/public/event-photos/';
      const idx = eventData.cover_photo_url.indexOf(marker);
      if (idx !== -1) {
        const coverPath = eventData.cover_photo_url.substring(idx + marker.length);
        try {
          const { error: coverRemoveError } = await supabase.storage
            .from('event-photos')
            .remove([coverPath]);
          if (coverRemoveError) {
            console.error('delete-event: cover remove error:', coverRemoveError);
          } else {
            filesDeleted += 1;
          }
        } catch (err) {
          console.error('delete-event: cover remove exception:', err);
        }
      }
    }

    // 10. Explicit DB deletes — do all three even if FK CASCADE may cover photos.
    //     Redundant on cascade tables, harmless, and gives us per-table counts.
    const { data: deletedConsents, error: consentError } = await supabase
      .from('face_tagging_consents')
      .delete()
      .eq('event_id', eventCode)
      .select('id');
    if (consentError) console.error('delete-event: consent delete error:', consentError);
    const consentsDeleted = deletedConsents?.length || 0;

    const { data: deletedReels, error: reelsError } = await supabase
      .from('reels')
      .delete()
      .eq('event_id', eventCode)
      .select('id');
    if (reelsError) console.error('delete-event: reels delete error:', reelsError);
    const reelsDeleted = deletedReels?.length || 0;

    const { data: deletedPhotos, error: photosError } = await supabase
      .from('photos')
      .delete()
      .eq('event_id', eventCode)
      .select('id');
    if (photosError) console.error('delete-event: photos delete error:', photosError);
    const photosDeleted = deletedPhotos?.length || 0;

    // 11. Finally: delete the events row. If this fails, the row remains but
    //     all child data is already gone — caller can retry cleanly.
    const { error: eventDeleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventCode);

    if (eventDeleteError) {
      console.error('delete-event: events row delete error:', eventDeleteError);
      return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete event row' }) });
    }

    // 12. Success — return per-table counts and Rekognition status.
    return withCors({
      statusCode: 200,
      body: JSON.stringify({
        deleted: true,
        photos: photosDeleted,
        reels: reelsDeleted,
        consents: consentsDeleted,
        files: filesDeleted,
        rekognition: rekognitionStatus,
      }),
    });
  } catch (err) {
    console.error('delete-event error:', err);
    return withCors({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};
