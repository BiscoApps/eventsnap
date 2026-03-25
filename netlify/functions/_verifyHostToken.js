const crypto = require('crypto');

module.exports.verifyHostToken = function(eventCode, token, expiry) {
  try {
    if (Date.now() >= expiry) return false;

    const expected = crypto.createHmac('sha256', process.env.HOST_TOKEN_SECRET)
      .update(eventCode + ':' + expiry)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
};
