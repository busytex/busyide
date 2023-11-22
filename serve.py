import http.server
import socketserver

Handler.extensions_map = {
    '.manifest': 'text/cache-manifest',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml',
    '.css': 'text/css',
    '.js': 'application/x-javascript',
    '.wasm': 'application/wasm',
    '.tex': 'application/x-tex',
    '': 'application/octet-stream', # default
}

PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler
Server = http.server.ThreadingHTTPServer #socketserver.TCPServer
httpd = Server(("", PORT), Handler)
print("serving at port", PORT)
httpd.serve_forever()
