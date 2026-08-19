// Shared CORS handling for all Netlify functions.
//
// The iOS/Android Capacitor build loads the bundled web app from
// capacitor://localhost, so every call to /.netlify/functions/* is
// cross-origin and the WebView sends an OPTIONS preflight first.
// Without these headers the preflight fails and the real request is
// never sent. The web build at eventsnapapp.live is same-origin and
// unaffected either way.
//
// Allow-Origin is '*' because auth is a JWT carried in the request
// (body or Authorization header), never a cookie. No call uses
// credentials: 'include', so Allow-Credentials is deliberately omitted —
// it is invalid to combine with a wildcard origin.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

module.exports.corsHeaders = corsHeaders;

// Reply to a CORS preflight. Called before any auth or rate-limit check —
// a preflight carries no credentials and must not consume request budget.
module.exports.respondPreflight = function () {
  return { statusCode: 200, headers: { ...corsHeaders }, body: '' };
};

// Merge the CORS headers into a response. Any headers the response already
// sets win, so this never clobbers an existing Content-Type or Location.
module.exports.withCors = function (response) {
  return {
    ...response,
    headers: { ...corsHeaders, ...(response && response.headers) },
  };
};
