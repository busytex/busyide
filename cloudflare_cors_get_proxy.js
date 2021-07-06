// inspired by https://github.com/Darkseal/CORSflare/blob/master/CORSflare.js and https://github.com/Zibri/cloudflare-cors-anywhere/blob/master/index.js

addEventListener('fetch', async event => 
{
    
    const url = new URL(event.request.url);

    if (url.search.startsWith('?'))
    {
        const url_href = unescape(unescape(url.search.substr(1)));

        const response = await fetch(url_href, { method: 'GET', redirect: 'manual' });

        event.respondWith(new Response(response.body, { status: response.status, headers: response.headers }));
    }
    else
    {
        event.respondWith(new Response('', { status: 403 }));
    }

});
