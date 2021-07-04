addEventListener('fetch', event => event.respondWith(fetch_and_transform(event.request)));

/****************************************************************************************/

async function fetch_and_transform(request)
{
	const new_request_headers = new Headers(request.headers);

	const params = { method: 'GET', redirect: 'manual', headers: new_request_headers };

    const url = new URL(request.url);

	const original_response = await fetch(url.href, params);

	const new_response = new Response(original_response.body, { status: original_response.status, headers: original_response.headers });

	return new_response;
}
