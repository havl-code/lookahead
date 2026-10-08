"""Keeping other websites out.

The app has no login: it trusts that only the person at this computer can reach it, because the
server only listens on 127.0.0.1. But every website open in the same browser can send requests
to 127.0.0.1 too. A hidden form on another site could post a "backup" that replaces all your
data (a cross-site request forgery), and a site could even point its own domain name at
127.0.0.1 so the browser lets its page read the app's replies (DNS rebinding).

So every request is checked before it reaches the app:

- Host: must be 127.0.0.1 or localhost, on the app's own port. A DNS rebinding request arrives
  with the attacker's domain name here instead.
- Sec-Fetch-Site: browsers say where a request comes from. API requests from another site are
  refused, reads included, so a site can't read your data or keep the app alive through
  /api/presence.
- Origin (or Referer, when a browser leaves Origin out): anything that changes data must come
  from the app's own page.
- X-Requested-With: speedcube, on anything that changes data. An HTML form on another site
  can't add a header, and a script on another site that tries is stopped by the browser, since
  the app never allows other origins to send custom headers (CORS).

Responses also get a strict Content-Security-Policy and related headers, so even if something
slipped past the page's escaping, the page would only ever run the app's own script files.
"""

from urllib.parse import urlsplit

from flask import abort, jsonify, request

LOCAL_NAMES = ('127.0.0.1', 'localhost')
STATE_CHANGING = {'POST', 'PUT', 'PATCH', 'DELETE'}
REQUIRED_HEADER, REQUIRED_VALUE = 'X-Requested-With', 'speedcube'

# Scripts, fonts, and connections only from the app itself. Inline styles stay allowed on
# purpose: the charting library (Plotly) adds a stylesheet as it starts, and the page uses a few
# style attributes; CSS can't run code, so this keeps the protection that matters. Plotly's one
# use of `new Function` is a fallback for browsers without globalThis, so 'unsafe-eval' isn't
# needed either.
CONTENT_SECURITY_POLICY = '; '.join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

SECURITY_HEADERS = {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
}


def allowed_hosts(port):
    """The Host values this app answers to. app.py sets the port once the server has one; until
    then (say, when the app is started some other way for testing), any port on these two names
    is accepted, which still rules out DNS rebinding."""
    if port:
        return {f'{name}:{port}' for name in LOCAL_NAMES}
    return None


def host_is_local(host, port):
    expected = allowed_hosts(port)
    if expected is not None:
        return host in expected
    name, _, given_port = host.rpartition(':') if ':' in host else (host, '', '')
    return name in LOCAL_NAMES and (given_port == '' or given_port.isdigit())


def from_this_page(host):
    """Whether a state-changing request came from the app's own page, judged by its Origin, or
    its Referer when the browser didn't send an Origin."""
    expected = f'http://{host}'
    origin = request.headers.get('Origin')
    if origin is not None:
        return origin == expected
    referer = request.headers.get('Referer')
    if referer:
        parts = urlsplit(referer)
        return f'{parts.scheme}://{parts.netloc}' == expected
    return False


def refuse(message):
    if request.path.startswith('/api/'):
        return jsonify(error=message), 403
    abort(403)


def init_app(app):
    @app.before_request
    def keep_other_websites_out():
        if not host_is_local(request.host, app.config.get('PORT')):
            return refuse('This address is not the app. Open it at 127.0.0.1 instead.')
        if not request.path.startswith('/api/'):
            return None
        if request.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site'):
            return refuse('Requests from other websites are not allowed.')
        if request.method in STATE_CHANGING:
            if not from_this_page(request.host):
                return refuse('Changes can only be made from the app itself.')
            if request.headers.get(REQUIRED_HEADER) != REQUIRED_VALUE:
                return refuse('Changes can only be made from the app itself.')
        return None

    @app.after_request
    def add_security_headers(response):
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.path.startswith('/api/'):
            # API replies are personal data and always current, so browsers shouldn't keep them
            response.headers.setdefault('Cache-Control', 'no-store')
        return response
