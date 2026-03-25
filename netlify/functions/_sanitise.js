module.exports.sanitiseText = function(value) {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

module.exports.sanitiseFields = function(obj, keys) {
  const result = { ...obj };
  keys.forEach(k => { if (result[k]) result[k] = module.exports.sanitiseText(result[k]); });
  return result;
};
