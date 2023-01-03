// 403 {
//   "message": "API rate limit exceeded for 84.110.59.167. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
//     "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
//     }
//
/*
 * function bufferToBase64(buf) {
 *     var binstr = Array.prototype.map.call(buf, function (ch) {
 *       return String.fromCharCode(ch);
*      }).join('');
*      return btoa(binstr);
*  }
*/

const base64_encode_utf8 = str => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {return String.fromCharCode(parseInt(p1, 16)) }));
const base64_encode_uint8array = uint8array => btoa(String.fromCharCode.apply(null, uint8array));

export class Github
{
    constructor(cache_dir, diff3, rm_rf, diff_, fetch_via_cors_proxy, FS, PATH, PATH_)
    {
        this.retry_delay_seconds = 2;
        this.auth_token = '';
        this.cache_dir = cache_dir;
        this.diff3 = diff3;
        this.rm_rf = rm_rf;
        this.diff_ = diff_;
        this.fetch_via_cors_proxy = fetch_via_cors_proxy;
        this.FS = FS;
        this.PATH = PATH;
        this.PATH_ = PATH_;
        this.api_endpoint = 'api.github.com';
        this.ref_origin = 'refs/remotes/origin';
        this.ref_heads = 'refs/heads';
        this.head = 'HEAD';
        this.ref_origin_head = this.PATH.join(this.ref_origin, this.head);
        this.dot_git = '.git';
        this.git_root = this.PATH_.home_dir.replace('home', this.dot_git);
        this.gist_branch = 'gist';
        this.hosts = ['github.com', 'gist.github.com'];
    }

    async sha1(msgUint8)
    {
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
    
    auth_headers()
    {
        return ({Authorization : 'Basic ' + btoa(this.auth_token)});
    }

    api(log_prefix, print, realm, repo_url, relative_url = '', method = 'GET', body = null, object_name = '', then = 'json')
    {
        const api = realm != 'gists' ? repo_url.replace('github.com', this.PATH.join(this.api_endpoint, realm)) : ('https://' + this.PATH.join(this.api_endpoint, 'gists', this.parse_url(repo_url).reponame));
        const headers = Object.assign({...this.auth_headers(), 'If-None-Match' : ''}, body != null ? {'Content-Type' : 'application/json'} : {});
        const url = api + relative_url;
        
        print(log_prefix);
        print(`${method} ${url} ${JSON.stringify(headers)}`);
        return fetch(url, {method : method || 'GET', headers : headers, ...(body != null ? {body : JSON.stringify(body)} : {})}).then(resp => resp[then]().then(data => 
        {
            print(log_prefix + (resp.ok ? (' OK! [ ' + (data.sha || (object_name ? data[object_name].sha : '')) + ' ]') : (` FAILED! [ [${resp.status}]: [${resp.statusText}], [${data.message}] ]`)));
            return ({...data, length : data.length, ok : resp.ok, status : resp.status, statusText : resp.statusText}); 
        }));
    }
    
    api_check(...args)
    {
        return this.api(...args).then(this.check_response.bind(this));
    }

    fetch_check(log_prefix, print, url, opts = {}, then = 'json', fetch_fn = fetch)
    {
        print(log_prefix);
        print(`GET ${url}`);
        return fetch_fn(url, opts).then(resp => resp[then]().then(data => 
        {
            print(log_prefix + (resp.ok ? ' OK!' : ' FAILED!'));
            return resp.ok ? data : null;
        }));
    }

    check_response(resp, api_http_codes = {too_many_requests : 429, not_fast_forward : 422, conflict : 409})
    {
        if(resp.status == api_http_codes.too_many_requests)
        {
            throw new Error(`[${resp.status}]: [too_many_requests] [${resp.statusText}]`);
        }
        else if(resp.status == api_http_codes.not_fast_forward || resp.status == api_http_codes.conflict)
        {
            throw new Error(`[${resp.status}]: [not_fast_forward] [${resp.statusText}]`);
        }
        else if(!resp.ok)
        {
            throw new Error(`[${resp.status}]: [${resp.statusText}]`);
        }
        return resp;
    }

    parse_url(repo_url)
    {
        const route = repo_url.split('/').filter(s => s != '');
        const gist = repo_url.includes('gist.github.com');
        const domain_ind = route.indexOf((gist ? 'gist.' : '') + 'github.com');
        
        const username = route[domain_ind + 1];
        const reponame = route[domain_ind + 2];
        const branch = route[domain_ind + 3] == 'tree' ? route[domain_ind + 4] : '';

        const canonical_path = `https://${gist ? 'gist.' : ''}github.com/${username}/${reponame}`;

        return {reponame : reponame, username : username, gist: gist, path : canonical_path, branch : branch};
    }

    format_url(username, reponame, gist, branch, commit, path)
    {
        if(!username && !reponame)
        {
            const s = this.summary();
            return this.format_url(s.username, s.reponame, s.gist, s.remote_branch);
        }
        
        if(gist && !commit)
            return `https://gist.github.com/${username}/${reponame}`;
        if(gist && commit && !path)
            return `https://gist.github.com/${username}/${reponame}/${commit}`;
        else if(gist && commit && path)
            return `https://gist.github.com/${username}/${reponame}/${commit}#file-` + path.replaceAll('.', '-');
        else if(!gist && (branch || commit) && path)
            return `https://github.com/${username}/${reponame}/blob/${commit||branch}/${path}`;
        else if(!gist && branch && commit)
            return `https://github.com/${username}/${reponame}/commit/${commit}`
        else if(!gist && branch)
            return `https://github.com/${username}/${reponame}/tree/${branch}`
        else
            return `https://github.com/${username}/${reponame}`;
    }

    ls_tree(commit_sha, repo_path, dict = false)
    {
        const array = JSON.parse(this.FS.readFile(this.object_path(commit_sha, repo_path), {encoding: 'utf8'})).tree;
        if(dict == true)
            return Object.fromEntries(array.map(x => [x.path, x]));
        return array
    }

    commit_tree(repo_path, commit, tree)
    {
        this.save_object(this.object_path(commit, repo_path), JSON.stringify(tree, null, 2));
    }

    cat_file(abspath, tree_dict = null)
    {
        const repo_path = this.get_repo_path() + '/';

        if(!abspath.startsWith(repo_path))
            return {};
        
        if(tree_dict === null)
            tree_dict = this.ls_tree(this.rev_parse(this.ref_origin_head), repo_path, true);

        const relative_path = abspath.slice(repo_path.length);
        const file = tree_dict[relative_path];

        if(!file)
            return {};

        abspath = this.object_path(file, repo_path);

        return {abspath : abspath, contents : this.FS.readFile(abspath, {encoding: 'utf8'})};
    }

    init(repo_path)
    {
        repo_path = this.PATH_.abspath(repo_path);
        this.PATH_.mkdir_p(repo_path);
        
        //const git_dir = this.PATH.join(repo_path, this.dot_git);
        const git_dir = repo_path.replace('home', this.dot_git);

        this.PATH_.mkdir_p(this.PATH.join(git_dir, this.ref_origin));
        this.PATH_.mkdir_p(this.PATH.join(git_dir, this.ref_heads));
        this.PATH_.mkdir_p(this.PATH.join(git_dir, 'objects'));
    }
    
    remote_get_url(repo_path)
    {
        return this.FS.readFile(this.PATH.join(this.git_dir(repo_path), 'config'), {encoding : 'utf8'}).split('\n')[1].split(' ')[2];
    }

    remote_set_url(repo_path, repo_url)
    {
        this.FS.writeFile(this.PATH.join(this.git_dir(repo_path), 'config'), `[remote "origin"]\nurl = ${repo_url}`);
    }
    
    git_dir(repo_path = null)
    {
        repo_path = this.PATH_.abspath(repo_path || this.FS.cwd());
        for(; repo_path != '/'; repo_path = this.PATH.normalize(this.PATH.join(repo_path, '..')))
        {
            const git_dir = repo_path.replace('home', this.dot_git);
            if(this.PATH_.exists(git_dir) && !this.git_root.startsWith(git_dir))
                return git_dir;
        }
        return null;
    }
    
    get_repo_path()
    {
        return this.git_dir().replace(this.dot_git, 'home');
    }

    object_path(sha, repo_path = '.')
    {
        sha = typeof(sha) == 'string' ? sha : (sha.sha || sha.version); 
        return this.PATH.join(this.git_dir(repo_path), 'objects', sha.slice(0, 2), sha.slice(2));
    }

    save_object(obj_path, contents)
    {
        this.PATH_.mkdir_p(this.PATH.dirname(obj_path));
        this.FS.writeFile(obj_path, contents);
    }

    blob_sha(contents)
    {
        const header = `blob ${contents.length}\0`;
        const byte_array = new Uint8Array(header.length + contents.length);
        byte_array.set(Array.from(header).map(c => c.charCodeAt()));
        byte_array.set(contents, header.length);
        return this.sha1(byte_array);
    }

    update_ref(repo_path, ref, new_value)
    {
        this.FS.writeFile(this.PATH.join(this.git_dir(repo_path), ref), new_value);
    }

    rev_parse(ref, repo_path = '.')
    {
        ref = this.FS.readFile(this.PATH.join(this.git_dir(repo_path), ref), {encoding: 'utf8'})
        if(ref.startsWith('ref: '))
            return ref.split(': ').pop();
        return ref;
    }


    fetch(print)
    {
        return this.parse_url(this.remote_get_url(this.get_repo_path())).gist ? this.fetch_gist(print) : this.fetch_repo(print);
    }

    clone(print, auth_token, repo_url, repo_path, branch = null)
    {
        return this.parse_url(repo_url).gist ? this.clone_gist(print, auth_token, repo_url, repo_path) : this.clone_repo(print, auth_token, repo_url, repo_path);
    }
    
    async push(print, status, message)
    {
        return this.parse_url(this.remote_get_url(this.get_repo_path())).gist ? this.push_gist(print, status, message) : this.push_repo(print, status, message);
    }
    
    async pull(print, status)
    {
        return this.parse_url(this.remote_get_url(this.get_repo_path())).gist ? this.pull_gist(print, status) : this.pull_repo(print, status);
    }
    
    cached_path(file)
    {
        return this.PATH.join(this.cache_dir, file.sha);
    }

    add(file, contents, repo_path)
    {
        this.FS.writeFile(this.cached_path(file), contents);
        this.save_object(this.object_path(file, repo_path), contents);
    }

    async load_file(print, file_path, file, opts)
    {
        opts = opts || {encoding: 'binary'};
        let contents = null;
        const cached_file_path = this.PATH.join(this.cache_dir, file.sha);
        if(this.PATH_.exists(cached_file_path))
        {
            print(`Blob [${file_path}] <- [${cached_file_path}]`);
            contents = this.FS.readFile(cached_file_path, opts);
        }
        else if(file.url)
        {
            const result = await this.fetch_check(`Blob [${file_path}] <- [${cached_file_path}] <- [${file.url}]`, print, file.url, {headers : this.auth_headers()});
            if(result === null)
                return null;
            console.assert(result.encoding == 'base64');
            contents = Uint8Array.from(atob(result.content), v => v.charCodeAt());
            //const resp = await fetch(file.download_url).then(r => r.arrayBuffer());
            //contents = new Uint8Array(await resp);
            this.FS.writeFile(cached_file_path, contents, {encoding: 'binary'});
            if(opts.encoding == 'utf8')
                contents = this.FS.readFile(cached_file_path, opts);
        }
        else if(file.raw_url)
        {
            if(file.truncated)
            {
                const result = await this.fetch_check(`Blob [${file_path}] <- [${file.raw_url}] ...`, print, file.raw_url, {headers : this.auth_headers()}, 'text');
                if(result === null)
                    return null;
                
                contents = result;
            }
            else
                contents = file.content;
            
            this.FS.writeFile(cached_file_path, contents);
        }
        return contents;
    }

    summary()
    {
        const repo_path = this.get_repo_path();
        const repo_url = this.remote_get_url(repo_path);

        const base_branch = this.rev_parse(this.ref_origin_head, repo_path);
        const remote_branch = this.PATH.basename(base_branch); // this.gist_branch
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        const local_branch = this.PATH.join(this.ref_heads, remote_branch);
        
        const local_commit_sha = this.rev_parse(local_branch, repo_path);
        const remote_commit_sha = this.rev_parse(base_branch, repo_path);
        
        const parsed = this.parse_url(repo_url); 
        return {remote_branch : remote_branch, repo_path : repo_path, repo_url : repo_url, origin_branch : origin_branch, remote_commit_sha : remote_commit_sha, local_commit_sha : local_commit_sha, username : parsed.username, reponame : parsed.reponame, gist : parsed.gist};
    }

    async status()
    {
        const s = this.summary();
        
        const tree_dict = this.ls_tree(s.local_commit_sha, s.repo_path, true);
        const tree_dict_copy = {...tree_dict};
        
        const ls_R = this.PATH_.find(s.repo_path, '', true, true, false, false);
        let files = [];

        for(const file of ls_R)
        {
            if(!file.contents || file.path.startsWith(this.dot_git + '/'))
            {
                delete tree_dict[file.path];
                continue;
            }

            const sha = (tree_dict[file.path] || {}).sha;
            
            if(!sha)
                files.push({path : file.path, abspath : this.PATH.join(s.repo_path, file.path), status : 'new'});
            else
            {
                files.push({path : file.path, abspath : this.PATH.join(s.repo_path, file.path), status : sha != (await this.blob_sha(file.contents)) ? 'modified' : 'not modified', sha_base : sha});
                delete tree_dict[file.path];
            }
        }
        
        files.push(...Object.values(tree_dict).map(file => ({path : file.path, abspath : this.PATH.join(s.repo_path, file.path), sha_base : file.sha, status : 'deleted'}))); 
        
        for(const f of files)
        {
            // for deleted objects for some reason sha is not there
            f.abspath_remote = this.cat_file(f.abspath, tree_dict_copy).abspath;
        }
        
        const commits = this.commits(s.repo_path);

        return {...this.parse_url(s.repo_url), files : files, commits : commits, remote_branch : s.remote_branch, remote_commit : s.remote_commit_sha, local_commit : s.local_commit_sha, repo_url : s.repo_url};
    }
    
    async get_default_branch(print, repo_url, auth_token = null)
    {
        if(auth_token !== null)
            this.auth_token = auth_token;

        return (await this.api_check('Default branch <- ...', print, 'repos', repo_url)).default_branch;
    }

    get_commits_path(repo_path)
    {
        return this.PATH.join(this.git_dir(repo_path), 'commits.json');
    }

    commits(repo_path, commits = null)
    {
        const file_path = this.get_commits_path(repo_path);
        if(commits === null)
            return this.FS.analyzePath(file_path).exists ? JSON.parse(this.FS.readFile(file_path, {encoding : 'utf8'})) : [];
        else
            this.FS.writeFile(file_path, JSON.stringify(Array.from(commits)));
    }

    async clone_repo(print, auth_token, repo_url, repo_path, remote_branch = null)
    {
        this.auth_token = auth_token;
        
        if(!remote_branch)
            remote_branch = await this.get_default_branch(print, repo_url);

        print(`Branch [${remote_branch}]`);
        
        const commit = await this.api_check(`Commits of branch [${remote_branch}] <- ...`, print, 'repos', repo_url, `/commits/${remote_branch}`);
        console.log('COMMIT', commit);

        const commits = await this.api_check(`Commits of branch [${remote_branch}] <- ...`, print, 'repos', repo_url, `/commits?per_page=100&sha=${commit.sha}`);

        const tree = await this.api_check(`Tree of commit [${commit.commit.tree.sha}] <- ...`, print, 'repos', repo_url, `/git/trees/${commit.commit.tree.sha}?recursive=1`);
        if(tree.truncated)
            throw new Error('Tree retrieved from GitHub is truncated: not supported yet');

        this.init(repo_path);
        this.remote_set_url(repo_path, repo_url);
        this.commits(repo_path, commits);
        
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        const local_branch = this.PATH.join(this.ref_heads, remote_branch);
        
        for(const file of tree.tree)
        {
            console.log('clone_repo', file.path);
            //TODO: assert type only tree or blob - submodules, symbolic links?
            if(file.type == 'tree')
            {
                this.FS.mkdir(this.PATH.join(repo_path, file.path));
            }
            else if(file.type == 'blob')
            {
                const file_path = this.PATH.join(repo_path, file.path);
                const contents = await this.load_file(print, file_path, file);
                if(contents === null)
                {
                    //TOOD: move this down to catch-all
                    this.rm_rf(repo_path);
                    return false;
                }

                this.FS.writeFile(file_path, contents);
                this.save_object(this.object_path(file, repo_path), contents);
            }
        }
        
        tree.tree = tree.tree.filter(f => f.type == 'blob');
        this.commit_tree(repo_path, commit, tree);

        this.update_ref(repo_path, this.ref_origin_head, 'ref: ' + origin_branch);
        this.update_ref(repo_path, origin_branch, commit.sha);
        this.update_ref(repo_path, local_branch, commit.sha);
        
        print(`Branch local [${remote_branch}] -> [${commit.sha}]`);
        print('OK!');
    }
    
    async fetch_repo(print)
    {
        const s = this.summary();
        
        const commit = await this.api_check(`Commits of branch [${s.remote_branch}] <- ...`, print, 'repos', s.repo_url, `/commits/${s.remote_branch}`);
        if(commit.sha == s.remote_commit_sha)
        {
            print(`Branch local [${s.remote_branch}] is up-to-date at [${s.local_commit_sha}]!`);
            print('OK!');
            return;
        }
        
        const tree = await this.api_check(`Tree of commit [${commit.commit.tree.sha}] <- ...`, print, 'repos', s.repo_url, `/git/trees/${commit.commit.tree.sha}?recursive=1`);
        if(tree.truncated)
            throw new Error('Tree retrieved from GitHub is truncated: not supported yet');
        
        for(const file of tree.tree)
        {
            if(file.type == 'tree')
            {
                this.FS.mkdir(this.PATH.join(s.repo_path, file.path));
            }
            else if(file.type == 'blob')
            {
                const file_path = this.PATH.join(s.repo_path, file.path);
                const contents = await this.load_file(print, file_path, file);
                if(contents === null)
                {
                    return false;
                }

                this.FS.writeFile(file_path, contents);
                this.save_object(this.object_path(file, s.repo_path), contents);
            }
        }
        
        tree.tree = tree.tree.filter(f => f.type == 'blob');

        this.commit_tree(s.repo_path, commit, tree);
        this.update_ref(s.repo_path, s.origin_branch, commit.sha);
        
        print(`Branch remote [${s.remote_branch}] -> [${commit.sha}] ...`);
        print('OK!');
    }
    
    async checkout(print, remote_branch)
    {
        const s = this.summary();
        const local_branch = this.PATH.join(this.ref_heads, remote_branch);
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        
        const new_branch = await this.api_check(`Branch [${remote_branch}] @ [${s.local_commit_sha}] ->...`, print, 'repos', s.repo_url, '/git/refs', 'POST', { ref : local_branch, sha : s.local_commit_sha });
        // remote: Create a pull request for '{branchname}' on GitHub by visiting:
        // remote:      https://github.com/{username}/{reponame}/pull/new/feature/{branchname}
        
        this.update_ref(s.repo_path, this.ref_origin_head, 'ref: ' + origin_branch);
        this.update_ref(s.repo_path, origin_branch, s.local_commit_sha);
        this.update_ref(s.repo_path, local_branch, s.local_commit_sha);
        
        print('OK!');
    }

    async push_repo(print, status, message, branch = null, create_new_branch = false)
    {
        // git push --set-upstream origin branch_name
        if(status.files.every(s => s.status == 'not modified'))
        {
            print('No modified files. OK!');
            return;
        }
        
        let s = null;
        if(branch !== null && create_new_branch)
        {
            await this.checkout(branch);
            s = this.summary();
        }
        else
        {
            this.fetch_repo(print);
            s = this.summary();

            if(s.local_commit_sha != s.remote_commit_sha)
            {
                print('Local commit [${s.local_commit_sha}] is not up-to-date with remote [${s.remote_commit_sha}] on branch [${s.remote_branch}]');
                print('Please pull the new changes and resolve conflicts if necessary! Then push again.');
                return false;
            }
        }

        const tree = this.ls_tree(s.local_commit_sha);
        
        const modified = status.files.filter(s => s.status == 'modified' || s.status == 'new');
        const deleted = status.files.filter(s => s == 'deleted');
        const deleted_paths = deleted.map(f => f.path);
        const modified_paths = modified.map(f => f.path);
        const single_file_upsert = deleted.length == 0 && modified.length == 1;
        const single_file_delete = deleted.length == 1 && modified.length == 0;
        const no_deletes = deleted.length == 0;
        
        const mode = { blob : '100644', executable: '100755', tree: '040000', commit: '160000', blobsymlink: '120000' };

        if(single_file_upsert || single_file_delete)
        {
            const modified_deleted = [...modified, ...deleted];
            const file_path = modified_deleted[0].path;
            const blob_sha = tree.filter(f => f.path == file_path).concat([{}])[0].sha;
            const contents = this.PATH_.exists(file_path) ? this.FS.readFile(file_path) : null;
            
            print(`Single file [${modified_deleted[0].status}], using Contents API`);
            
            const resp = await this.api_check(`[${modified_deleted[0].path}] -> [${modified_deleted[0].status}] ...`, print, 'repos', s.repo_url, this.PATH.join('/contents', file_path), ...(single_file_delete ? [ 'DELETE', {message : message, sha : blob_sha} ] : [ 'PUT', {message : message, content : base64_encode_uint8array(contents), ...(blob_sha ? {sha : blob_sha} : {})} ] ));
            
            const new_commit = resp.commit, new_blob = resp.content;
            print(`Commit: [${new_commit.sha}]`);

            //TODO: modify the local tree without getting the new one
            const new_tree = await this.api_check(`GitHub API: GET tree [${new_commit.tree.sha}] ...`, print, 'repos', s.repo_url, `/git/trees/${new_commit.tree.sha}?recursive=1`);
            print(`Tree: [${new_commit.tree.sha}]`);

            if(single_file_upsert && blob_sha)
            {
                this.add(new_blob, contents, s.repo_path);
                print(`Blob [${new_blob.path}] -> [${new_blob.sha}]`);
            }
            this.commit_tree(s.repo_path, new_commit, new_tree);
            this.update_ref(s.repo_path, s.origin_branch, new_commit.sha);
            print('OK!');
        }
        else
        {
            print(`[${modified.length}] files modified, [${deleted.length}] files deleted`);
            // http://www.levibotelho.com/development/commit-a-file-with-the-github-api/
            
            print(`Blobs ([${modified.length}]) ->...`);
            const blob_promises = modified.map(({path, status, abspath}) => 
            {
                const contents = this.FS.readFile(abspath);
                return this.api(`Blob [${path}] -> ...`, print, 'repos', s.repo_url, '/git/blobs', 'POST', {encoding: 'base64', content: base64_encode_uint8array(contents)}).then(resp => 
                {
                    if(!resp.ok)
                        return null;
                    else
                    {
                        print(`Blob [${path}] local -> [${resp.sha}]...`);
                        this.add(resp, contents, s.repo_path);
                        return resp.sha;
                    }
                });
            });
            const blob_shas = await Promise.all(blob_promises);
            
            if(blob_shas.some(blob_sha => blob_sha === null))
            {
                print('Blobs failed the upload');
                return false;
            }

            print(`Blobs ([${modified.length}]) ->... OK!`);
            const modified_blobs = blob_shas.map((blob_sha, i) => ({path : modified[i].path, type : 'blob', mode : mode['blob'], sha : blob_sha }));

            let new_tree = no_deletes ? { base_tree : tree.sha, tree : modified_blobs } : { tree : tree.filter(f => f.type == 'blob' && !deleted_paths.includes(f.path) && !modified_paths.includes(f.path)).concat(modified_blobs) };
            new_tree = await this.api_check(`Tree ->...`, print, 'repos', s.repo_url, '/git/trees', 'POST', new_tree);

            let new_commit = { message : message, parents : [s.local_commit_sha], tree : new_tree.sha };
            new_commit = await this.api_check(`Commit with tree [${new_tree.sha}] -> ...`, print, 'repos', s.repo_url, '/git/commits', 'POST', new_commit);
            print(`Commit [${new_commit.sha}] -> local...`);
            this.commit_tree(s.repo_path, new_commit, new_tree);
            
            let new_ref = { sha : new_commit.sha };
            new_ref = await this.api_check(`Branch remote [${s.remote_branch}] -> [${new_commit.sha}]...`, print, 'repos', s.repo_url, this.PATH.join('/git/refs/heads', s.remote_branch), 'PATCH', new_ref);
            this.update_ref(s.repo_path, s.origin_branch, new_commit.sha);
            
            print(`Branch local [${s.remote_branch}] -> [${new_commit.sha}]... OK!`);
            print('OK!');
        }
    }

    async pull_repo(print, status)
    {
        const s = this.summary();
        const tree_dict = this.ls_tree(s.local_commit_sha, s.repo_path, true);

        const new_commit = await this.api_check(`Commits of branch [${s.remote_branch}] <- ...`, print, 'repos', s.repo_url, `/commits/${s.remote_branch}`);

        const new_tree = await this.api_check(`Tree of commit [${new_commit.commit.tree.sha}] <- ...`, print, 'repos', repo_url, `/git/trees/${new_commit.commit.tree.sha}?recursive=1`);
        if(new_tree.truncated)
            throw new Error('Tree retrieved from GitHub is truncated: not supported yet');

        const status_res = await this.merge(s.repo_path, status, tree_dict, new_tree);
        
        new_tree.tree = new_tree.tree.filter(f => f.type == 'blob');
        this.commit_tree(s.repo_path, new_commit, new_tree);
        this.update_ref(s.repo_path, origin_branch, new_commit.sha);

        print(`Branch local [${s.remote_branch}] -> [${new_commit.sha}]`);
        print('OK!');
        return status_res;
    }
    
    async merge(repo_path, status, tree_dict, new_tree)
    {
        const status_res = {...status, files : []};
        for(const file of new_tree.tree)
        {
            if(file.type == 'blob')
            {
                const file_base = tree_dict[file.path];
                const file_ours = status.files.filter(f => f.path == file.path).concat([{}])[0];
                const abspath = this.PATH.join(repo_path, file.path);
                
                if(file_base)
                {
                    const ours_path = abspath;
                    
                    if(file_ours.status == 'not modified')
                    {
                        if(file_base.sha != file.sha)
                        {
                            print(`Blob [${file.path}]: [${file_base.sha}] -> [${file.sha}]`);
                            
                            const contents = await this.load_file(print, file.path, file);
                            this.save_object(this.object_path(file), contents);
                            this.FS.writeFile(abspath, contents);
                            
                            status_res.files.push(file_ours);
                        }
                        else
                        {
                            status_res.files.push(file_ours);
                        }
                    }
                    else if(file_ours.status == 'deleted')
                    {
                        status_res.files.push(file_ours);
                    }
                    else if(file_ours.status == 'modified')
                    {
                        if(file_ours.sha != file.sha)
                        {
                            const contents = await this.load_file(print, file.path, file);
                            const theirs_path = this.object_path(file);
                            this.save_object(theirs_path, contents);

                            const old_path = this.object_path(file_old);
                            const conflicted = this.diff3(ours_path, theirs_path, old_path);

                            status_res.files.push({path: file.path, status : conflicted ? 'conflict' : 'merged'});
                        }
                        else
                        {
                            status_res.files.push({path : file.path, status : 'not modified'});
                        }
                    }
                }
                else
                {
                    if(file_ours.status == 'new')
                    {
                        const ours_path = abspath;

                        const contents = await this.load_file(print, file.path, file);
                        const theirs_path = this.object_path(file);
                        this.save_object(theirs_path, contents);

                        const old_path = null;
                        const conflicted = this.diff3(ours_path, theirs_path, old_path);

                        status_res.files.push({path: ours_path, status : conflicted ? 'conflict' : 'merged'});
                    }
                    else
                    {
                        print(`Blob [${file.path}] <- [${file.sha}] ...`);
                        
                        const contents = await this.load_file(print, file.path, file);
                        this.save_object(this.object_path(file), contents);
                        this.FS.writeFile(abspath, contents);
                    }
                }
            }
        }

        return status_res;
    }
    
    
    async clone_gist(print, auth_token, repo_url, repo_path)
    {
        this.auth_token = auth_token;
        const gist = await this.api_check(`Gist [${repo_url}] <- ...`, print, 'gists', repo_url);
        const remote_branch = this.gist_branch;
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        const local_branch = this.PATH.join(this.ref_heads, remote_branch);

        this.init(repo_path);
        this.remote_set_url(repo_path, repo_url);

        for(const file_name in gist.files)
        {
            const file = gist.files[file_name];
            const file_path = this.PATH.join(repo_path, file_name);
            
            file.sha = this.PATH.basename(this.PATH.dirname(file.raw_url));
            
            const contents = await this.load_file(print, file_path, file);

            this.FS.writeFile(file_path, contents);
            this.save_object(this.object_path(file.sha, repo_path), contents);
        }

        const commit = gist.history[0];
        const tree = {tree : Object.values(gist.files).map(f => ({ type: 'blob', path: f.filename, sha : f.sha })) };
        
        this.commit_tree(repo_path, commit, tree);
        this.update_ref(repo_path, this.ref_origin_head, 'ref: ' + origin_branch);
        this.update_ref(repo_path, origin_branch, commit.version);
        this.update_ref(repo_path, local_branch, commit.version);
        
        print(`Branch local [${remote_branch}] -> [${commit.version}]`);
        print('OK!');
    }

    async fetch_gist(print)
    {
        const s = this.summary();
        const gist = await this.api_check(`Gist [${s.repo_url}] <- ...`, print, 'gists', s.repo_url);
        const commit = gist.history[0];

        if(commit.version == s.remote_commit_sha)
        {
            print(`Branch local [${s.remote_branch}] is up-to-date at [${s.local_commit_sha}]!`);
            print('OK!');
            return;
        }

        for(const file_name in gist.files)
        {
            const file_path = this.PATH.join(s.repo_path, file_name);
            const file = gist.files[file_name];
            file.sha = this.PATH.basename(this.PATH.dirname(file.raw_url));
            
            //TODO: check loaded OK -> Promise.all
            await this.load_file(print, file_path, file);
        }

        const tree = {tree : Object.values(gist.files).map(f => ({ type: 'blob', path: f.filename, sha : f.sha })) };
        
        this.commit_tree(s.repo_path, commit, tree);
        this.update_ref(s.repo_path, s.origin_branch, commit.version);
        
        print(`Branch remote [${s.remote_branch}] -> [${commit.version}] ...`);
        print('OK!');
    }


    async push_gist(print, status, message)
    {
        // TODO: check last commit+pull? check binary files? skip empty new files?
        // https://github.community/t/deleting-or-renaming-files-in-a-multi-file-gist-using-github-api/170967/2
        
        const s = this.summary();

        const files = status.files.filter(s => s.status != 'not modified').map(s =>
        {
            const new_blob = [s.path, {content : s.status == 'deleted' ? '' : this.FS.readFile(s.abspath, {encoding: 'utf8'})}]; 
            this.add(new_blob, f.contents, s.repo_path); 
            print(`Blob [${new_blob.path}] -> [${new_blob.sha}]`); 
            return new_blob; 
        });

        if(files.length == 0)
        {
            print('No modified files. OK!');
            return;
        }

        const gist = await this.api_check(`Gist [${s.repo_url}] -> ...`, print, 'gists', s.repo_url, '', 'PATCH', { files : Object.fromEntries(files) });
        const commit = gist.history[0];
        const tree = {tree : Object.values(gist.files).map(f => ({ type: 'blob', path: f.filename, sha : f.sha })) };
        
        this.commit_tree(s.repo_path, commit, tree);
        this.update_ref(s.repo_path, this.ref_origin_head, 'ref: ' + s.origin_branch);
        this.update_ref(s.repo_path, s.origin_branch, commit.version);
        
        print(`Branch local [${s.remote_branch}] -> [${commit.version}]`);
        
        if(message)
        {
            const parsed = this.parse_url(s.repo_url);
            const commit_url = this.format_url(parsed.username, parsed.reponame, true, null, commit.version);
            await this.api_check(`Comment for gist [${s.repo_url}] -> ...`, print, 'gists', s.repo_url, '/comments', 'POST', {body : `[Commit](${commit_url}) message: \`${message}\``});
        }
        
        print('OK!');
    }

    async pull_gist(print, status)
    {
        const s = this.summary();
        
        const tree_dict = this.ls_tree(s.local_commit_sha, repo_path, true);
        
        const gist = await this.api_check(`Gist [${s.repo_url}] <- ...`, print, 'gists', s.repo_url);
        const new_commit = gist.history[0];
        const new_tree = {tree : Object.values(gist.files).map(f => ({ type: 'blob', path: f.filename, sha : f.sha })) };

        const status_res = await this.merge(s.repo_path, status, tree_dict, new_tree);
        
        this.commit_tree(s.repo_path, new_commit, new_tree);
        this.update_ref(s.repo_path, s.origin_branch, new_commit.version);
        
        print(`Branch local [${s.remote_branch}] -> [${commit.version}]`);
        print('OK!');
        return status_res;
    }

    async release(print, tag_name, asset_path = null, asset_content_type = 'application/pdf')
    {
        const s = this.summary();
        if(!asset_path)
        {
            const release = await this.api(`Release ->...`, print, 'repos', s.repo_url, '/releases', 'POST', {tag_name : tag_name, name : tag_name, body : tag_name});
            return release.status == 201 || release.status == 422;
        }
        else
        {
            const basename = this.PATH.basename(asset_path);
            const contents = this.FS.readFile(asset_path);
            const blob = new Blob([contents.buffer], {type: asset_content_type});
            
            const release = await this.api_check(`Release [${tag_name}] <- ...`, print, 'repos', s.repo_url, '/releases/tags/' + tag_name);
            const upload_url = release.upload_url.split('{')[0] + '?name=' + basename;
            let asset = [...release.assets.filter(a => a.name == basename), null][0];

            if(asset)
            {
                await this.api_check(`Asset [${basename}] -> deleted ...`, print, 'repos', s.repo_url, '/releases/assets/' + asset.id, 'DELETE', null, '', 'text');
                asset = null;
            }

            // TODO: fix CORS proxy to support POST
            asset = await this.fetch_check(`Asset [${basename}] -CORS> ...`, print, upload_url, {method : 'POST', headers : this.auth_headers(), body : blob}, 'json', this.fetch_via_cors_proxy.bind(this));
            
            print('OK!\n');
            print('URL: ' + asset.browser_download_url);
        }
    }

    diff(status_)
    {
        const repo_path = this.get_repo_path();
        
        const fix_header = (d, ours_path, theirs_path, path, status) =>
        {
            const splitted = d.split('\n');
            if(splitted.length >= 2)
            {
                const fixed_theirs = splitted[0].replace(`--- ${theirs_path}`, `--- a/${path}`).replace('/etc/empty', '/dev/null'), fixed_ours = splitted[1].replace(`+++ ${ours_path}`, `+++ b/${path}`).replace('/etc/empty', '/dev/null');
                const file_status = status == 'deleted' ? ['deleted file'] : status == 'new' ? ['new file'] : [];
                d = [`diff --git a/${path} b/${path}`, ...file_status, fixed_theirs, fixed_ours, ...splitted.slice(2)].join('\n');
            }
            return d;
        };
        
        let res = ''
        for(const {path, abspath, sha_base, status} of status_.files.filter(f => f.status != 'not modified'))
        {
            const ours_path = status == 'deleted' ? '/dev/null' : abspath;
            const theirs_path = status == 'new' ? '/dev/null' : this.object_path(sha_base, repo_path);
            res += fix_header(this.diff_(ours_path, theirs_path, repo_path), ours_path, theirs_path, path, status);
        }
        return res;
    }

    propose_diff_file_name()
    {
        const s = this.summary();
        // change to local time
        const isotime = (new Date()).toISOString().replaceAll('-', '').replaceAll(':', '').replaceAll('.', '');
        return `patch_${isotime}_for_${s.username}_${s.reponame}_${s.remote_branch}_${s.remote_commit_sha}.patch`;
    }

    propose_new_branch_name()
    {
        // change to local time
        const isotime = (new Date()).toISOString().replaceAll('-', '').replaceAll(':', '').replaceAll('.', '');
        return 'branch_' + isotime;
    }
}
