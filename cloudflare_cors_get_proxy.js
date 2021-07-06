// inspired by https://github.com/Darkseal/CORSflare/blob/master/CORSflare.js and https://github.com/Zibri/cloudflare-cors-anywhere/blob/master/index.js

addEventListener('fetch', event => event.respondWith((async () =>
{
    const url = new URL(event.request.url);

    if (url.search.startsWith('?'))
    {
        const url_href = unescape(unescape(url.search.substr(1)));

        const response = await fetch(url_href, { method: 'GET', redirect: 'manual' });

        return new Response(response.body, { status: response.status, headers: response.headers });
    }
    else
    {
        return new Response('', { status: 403 });
    }
})()));


