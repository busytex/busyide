// inspired by https://github.com/Darkseal/CORSflare/blob/master/CORSflare.js and https://github.com/Zibri/cloudflare-cors-anywhere/blob/master/index.js

// TODO: pass only arxiv.org, ctan.org, github.com ?

addEventListener('fetch', event => event.respondWith((async () =>
{
      
    const url = new URL(event.request.url);
    const origin = event.request.headers.get('Origin'), user_agent = event.request.headers.get('User-Agent');

    if (url.search.startsWith('?'))
    {
        const url_href = unescape(unescape(url.search.substr(1)));

        // TODO: allow POST to https://uploads.github.com/
        // passes through User-Agent to satisfy arxiv.org constraints
        const response = await fetch(url_href, { method: 'GET', headers : {'User-Agent' : user_agent } } );

        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', origin);

        return new Response(response.body, { status: response.status, headers: headers });
    }
    else
    {
        return new Response('', { status: 403 });
    }

})()));


