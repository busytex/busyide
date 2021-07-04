addEventListener('fetch', event => event.respondWith(fetchAndApply(event.request)));

/* ****************************************************************************** */

async function fetchAndApply(request) {
	let request_headers = request.headers;
	let new_request_headers = new Headers(request_headers);
	let request_content_type = new_request_headers.get('content-type');

	new_request_headers.set('Host', upstream_domain);
	new_request_headers.set('Origin', upstream_domain);
	new_request_headers.set('Referer', url.protocol + '//' + url_hostname);

	const params = { method: 'GET', redirect: 'manual', headers: new_request_headers };

	const original_response = await fetch(url.href, params);

	const original_text = original_response_clone.body;

	const response = new Response(original_text, { status: original_response.status, headers: original_response.headers});

	return response;
}
