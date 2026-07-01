const target = process.env.XETU_API_TARGET || 'http://127.0.0.1:8000';
const secure = target.startsWith('https://');

module.exports = {
  '/api': {
    target,
    secure,
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/tracking': {
    target,
    secure,
    changeOrigin: true,
    logLevel: 'debug'
  }
};
