const { createProxyRoute } = require('../lib/proxy-route');
module.exports = createProxyRoute(['health'], { public: true });
