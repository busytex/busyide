// gists https://developer.github.com/v3/gists/#update-a-gist
// 403 {
//   "message": "API rate limit exceeded for 84.110.59.167. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
//     "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
//     }
//
export class Github
{
    constructor(sha1, FS, cache_dir, merge, print)
    {
        this.retry_delay_seconds = 2;
        this.auth_token = '';
        this.print = print || (line => null);
        this.FS = FS;
        this.cache_dir = cache_dir;
        this.github_contents = '.git/githubapicontents.json';
        this.merge = merge;
        this.sha1 = sha1;
    }

    parse_url(https_path)
    {
        const route = https_path.split('/').filter(s => s != '');
        const reponame = route.pop();
        const username = route.pop();
        const gist = https_path.includes('gist.github.com');

        return {reponame : reponame, username : username, gist: gist, path : https_path};
    }

    api_request(realm, https_path, relative_url = '', method = 'get', body = null)
    {
        const api = https_path.replace('github.com', 'api.github.com/' + realm);
        const headers = Object.assign({Authorization : 'Basic ' + btoa(this.auth_token), 'If-None-Match' : ''}, body != null ? {'Content-Type' : 'application/json'} : {});
        return fetch(api + relative_url, Object.assign({method : method || 'get', headers : headers}, body != null ? {body : JSON.stringify(body)} : {}));
    }
    
    read_https_path()
    {
        return this.FS.readFile('.git/config', {encoding : 'utf8'}).split('\n')[1].split(' ')[2];
    }

    read_githubcontents(dict)
    {
        const array = this.FS.analyzePath(this.github_contents).exists ? JSON.parse(this.FS.readFile(this.github_contents, {encoding : 'utf8'})) : [];
        if(dict == true)
            return Object.fromEntries(array.map(x => [x.path, x.sha]));
        return array;
    }

    save_githubcontents(repo_path, repo)
    {
        this.FS.writeFile(repo_path + '/' + this.github_contents, JSON.stringify(repo));
    }

    object_path(file)
    {
        return '.git/objects/' + file.sha.slice(0, 2) + '/' + file.sha.slice(2);
    }

    save_object(obj_path, contents)
    {
        const obj_dir = obj_path.slice(0, obj_path.lastIndexOf('/'));
        if(!this.FS.analyzePath(obj_dir).exists)
            this.FS.mkdir(obj_dir);
        this.FS.writeFile(obj_path, contents);
    }

    async pull(repo_path = '.')
    {
        let res = [];

        const https_path = this.read_https_path();
        this.print(`Pulling from '${https_path}'...`);
        
        const prev = this.read_githubcontents();
        console.log('prev', prev);
        
        const resp = await this.api_request('repos', https_path, '/contents');
        const repo = await resp.json();
        let Q = [...repo];

        while(Q.length > 0)
        {
            const file = Q.pop();
            if(file.type == 'file')
            {
                this.print('processing: ' + file.path);
                const prev_files = prev.filter(f => f.path == file.path);
                if(!this.FS.analyzePath(file.path).exists)
                {
                    const contents = await this.load_file(file.path, file);
                    this.FS.writeFile(file_path, contents);
                    res.push({path: file_path, status : 'deleted'});
                }
                
                else if(prev_files.length > 0 && prev_files[0].sha == file.sha) 
                    res.push({path: file.path, status : 'not modified'});
                
                else if(prev_files.length > 0 && prev_files[0].sha != file.sha) 
                {
                    const ours_path = file.path;
                    
                    const contents = await this.load_file(file.path, file);
                    const theirs_path = this.object_path(file);
                    this.save_object(theirs_path, contents);

                    const old_file = prev_files[0];
                    const old_path = this.object_path(old_file);
                    const conflicted = this.merge(ours_path, theirs_path, old_path);
                    res.push({path: ours_path, status : conflicted ? 'conflict' : 'merged'});
                }
            }
            else if(file.type == 'dir')
            {
                const dir_path = repo_path + '/' + file.path;
                if(!this.FS.analyzePath(dir_path).exists)
                    this.FS.mkdir(dir_path);
                const resp = await this.api_request('repos', https_path, '/contents/' + file.path);
                const dir = await resp.json();
                repo.push(...dir);
                Q.push(...dir);
            }
        }
        this.save_githubcontents(repo_path, repo);
        return res;
    }
    
    async load_file(file_path, file, opts)
    {
        opts = opts || {encoding: 'binary'};
        let contents = null;
        const cached_file_path = this.cache_dir + '/' + file.sha;
        if(this.FS.analyzePath(cached_file_path).exists)
        {
            this.print(`Loading [${file_path}] from cached [${cached_file_path}]`);
            contents = this.FS.readFile(cached_file_path, opts);
        }
        else
        {
            this.print(`Downloading [${file_path}] from [${file.git_url}] and caching in [${cached_file_path}]`);
            const resp = await fetch(file.git_url).then(r => r.json());
            console.assert(resp.encoding == 'base64');
            contents = Uint8Array.from(atob(resp.content), v => v.charCodeAt());
            //const resp = await fetch(file.download_url).then(r => r.arrayBuffer());
            //contents = new Uint8Array(await resp);
            this.FS.writeFile(cached_file_path, contents, {encoding: 'binary'});
            if(opts.encoding == 'utf8')
                contents = this.FS.readFile(cached_file_path, opts);
        }
        return contents;
    }

    blob_sha(contents)
    {
        const header = `blob ${contents.length}\0`
        const byte_array = new Uint8Array(header.length + contents.length);
        byte_array.set(Array.from(header).map(c => c.charCodeAt()));
        byte_array.set(contents, header.length);
        return this.sha1(byte_array);
    }

    status(ls_R)
    {
        let res = [];

        const prev = this.read_githubcontents(true);
        for(const file of ls_R)
        {
            if(!file.contents || file.path.startsWith('.git/'))
            {
                delete prev[file.path];
                continue;
            }

            const sha = prev[file.path];
            
            if(!sha)
                res.push({path : file.path, status : 'new'});
            else
            {
                if(sha != this.blob_sha(file.contents))
                    res.push({path : file.path, status : 'modified'});
                else
                    res.push({path : file.path, status : 'not modified'});

                delete prev[file.path];
            }
        }
        
        for(const file_path in prev)
            res.push({path : file_path, status : 'deleted'});

        return res;
    }

    async push_gist(file_path)
    {
        const content = this.FS.readFile(file_path, {encoding: 'utf8'});
        const resp = await this.api_request('gists', this.read_https_path(), '', 'PATCH', {files : {[file_path] : {filename: file_path, content : content}}});
        return resp.status == 200 ? true : false;
    }

    async clone_gist(auth_token, gistname, repo_path)
    {
        this.auth_token = auth_token;
        const https_path = 'https://github.com/' + gistname;
        const resp = await this.api_request('gists', https_path);
        const repo = await resp.json();

        this.FS.mkdir(repo_path);
        this.FS.mkdir(repo_path + '/.git');
        this.FS.mkdir(repo_path + '/.git/objects');
        this.FS.writeFile(repo_path + '/.git/config', '[remote "origin"]\nurl = ' + https_path);

        for(const file_name in repo.files)
        {
            this.print(`Creating [${file_name}]`);
            const file = repo.files[file_name];
            const file_path = repo_path + '/' + file_name;
            const contents = file.truncated ? (await fetch(file.raw_url).then(x => x.text())) : file.content;
            this.FS.writeFile(file_path, contents);
        }
        this.save_githubcontents(repo_path, repo);
    }

    async clone_repo(auth_token, https_path, repo_path)
    {
        this.auth_token = auth_token;
        const resp = await this.api_request('repos', https_path, '/contents');
        const repo = await resp.json();

        this.FS.mkdir(repo_path);
        this.FS.mkdir(repo_path + '/.git');
        this.FS.mkdir(repo_path + '/.git/objects');
        this.FS.writeFile(repo_path + '/.git/config', '[remote "origin"]\nurl = ' + https_path);

        let Q = [...repo];
        while(Q.length > 0)
        {
            const file = Q.pop();
            if(file.type == 'file')
            {
                const file_path = repo_path + '/' + file.path;
                const contents = await this.load_file(file_path, file);
                this.FS.writeFile(file_path, contents);
                this.save_object(repo_path + '/' + this.object_path(file), contents);
            }
            else if(file.type == 'dir')
            {
                this.FS.mkdir(repo_path + '/' + file.path);
                const resp = await this.api_request('repos', https_path, '/contents/' + file.path);
                const dir = await resp.json();
                repo.push(...dir);
                Q.push(...dir);
            }
        }
        this.save_githubcontents(repo_path, repo);
        this.print('Done!');
    }

    async push(file_path, message, retry)
    {
        const base64_encode_utf8 = str => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {return String.fromCharCode(parseInt(p1, 16)) }));
        const delay = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));
        const network_error = resp => new Error(`${resp.status}: ${resp.statusText}`);
        
        const content = this.FS.readFile(file_path, {encoding : 'utf8'});
        let sha = this.read_githubcontents().filter(f => f.path == file_path);
        sha = sha.length > 0 ? sha[0].sha : null;
        const resp = await this.api_request('repos', this.read_https_path(), '/contents/' + file_path, 'PUT', Object.assign({message : `${file_path}: ${message}`, content : base64_encode_utf8(content)}, sha ? {sha : sha} : {}));
        if(resp.ok)
            sha = (await resp.json()).content.sha;
        else if(resp.status == 409 && retry != false)
        {
            console.log('retry not implemented');
            //await delay(this.retry_delay_seconds);
            //await this.put(message, sha ? ((await this.init_doc()) || this.sha) : null, false);
        }
        else
        {
            throw network_error(resp);
        }
    }

    async upload_asset()
    {
        // https://developer.github.com/v3/repos/releases/#get-a-release-by-tag-name
        // https://developer.github.com/v3/repos/releases/#get-a-release
        // https://developer.github.com/v3/repos/releases/#list-releases
        // https://developer.github.com/v3/repos/releases/#create-a-release
        // https://developer.github.com/v3/repos/releases/#upload-a-release-asset
        // https://developer.github.com/v3/repos/releases/#delete-a-release-asset
    }
}
