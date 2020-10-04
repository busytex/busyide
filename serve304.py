import os
import hashlib
import http.server

root = '.'

mime = {
    '.manifest': 'text/cache-manifest',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml',
    '.css': 'text/css',
    '.txt': 'text/html',
    '.js': 'application/x-javascript',
    '.wasm': 'application/wasm',
    '.data': 'application/octet-stream',
}
mime_fallback = 'application/octet-stream'

def md5(file_path):
    hash = hashlib.md5()
    with open(file_path, 'rb') as f:
        hash.update(f.read())
    return hash.hexdigest()

cache = {os.path.join(root, f) : md5(f) for f in os.listdir() if any(map(f.endswith, mime)) and os.path.isfile(f)}

class EtagHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self, body = True):
        self.protocol_version = 'HTTP/1.1'
        self.path = os.path.join(root, self.path.lstrip('/') + ('index.html' if self.path == '/' else ''))
        
        #print('\n'.join(f'{self.path} {k}: {v}' for k, v in self.headers.items()))
        if not os.path.exists(self.path) or not os.path.isfile(self.path):
            self.send_response(404)
        
        elif self.path not in cache or cache[self.path] != self.headers.get('If-None-Match'):
            content_type = ([content_type for ext, content_type in sorted(mime.items(), reverse = True) if self.path.endswith(ext)] + [mime_fallback])[0]
            with open(self.path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Length', len(content))
            self.send_header('Content-Type', content_type)
            self.send_header('ETag', cache[self.path])
            self.end_headers()
            self.wfile.write(content)
        
        else:
            self.send_response(304)
            self.send_header('ETag', cache[self.path])
            self.end_headers()

if __name__ == '__main__':
    PORT = 8080
    print("serving at port", PORT)
    httpd = http.server.HTTPServer(("", PORT), EtagHandler)
    httpd.serve_forever()
