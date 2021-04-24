// gists https://developer.github.com/v3/gists/#update-a-gist
// 403 {
//   "message": "API rate limit exceeded for 84.110.59.167. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
//     "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
//     }
//

const base64_encode_utf8 = str => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {return String.fromCharCode(parseInt(p1, 16)) }));
const base64_encode_uint8array = uint8array => btoa(String.fromCharCode.apply(null, uint8array));

/*
 * function bufferToBase64(buf) {
 *     var binstr = Array.prototype.map.call(buf, function (ch) {
 *       return String.fromCharCode(ch);
*      }).join('');
*      return btoa(binstr);
*  }
*/

export class Github
{
    constructor(cache_dir, merge, sha1, rm_rf, FS, PATH, PATH_)
    {
        this.retry_delay_seconds = 2;
        this.auth_token = '';
        this.cache_dir = cache_dir;
        this.merge = merge;
        this.sha1 = sha1;
        this.rm_rf = rm_rf;
        this.FS = FS;
        this.PATH = PATH;
        this.PATH_ = PATH_;
        this.api_endpoint = 'api.github.com';
        this.ref_origin = 'refs/remotes/origin';
        this.head = 'HEAD';
        this.ref_origin_head = this.PATH.join(this.ref_origin, this.head);
        this.dot_git = '.git';
    }
    
    api(log_prefix, print, realm, repo_url, relative_url = '', method = 'GET', body = null, object_name = '')
    {
        const api = realm != 'gists' ? repo_url.replace('github.com', this.PATH.join(this.api_endpoint, realm)) : ('https://' + this.PATH.join(this.api_endpoint, 'gists', this.parse_url(repo_url).reponame));
        const headers = Object.assign({Authorization : 'Basic ' + btoa(this.auth_token), 'If-None-Match' : ''}, body != null ? {'Content-Type' : 'application/json'} : {});
        const url = api + relative_url;
        
        print(log_prefix);
        print(`${method} ${url}`);
        return fetch(url, {method : method || 'GET', headers : headers, ...(body != null ? {body : JSON.stringify(body)} : {})}).then(resp => resp.json().then(data => 
        {
            print(log_prefix + (resp.ok ? (' OK! [ ' + (data.sha || (object_name ? data[object_name].sha : '')) + ' ]') : (` FAILED! [ [${resp.status}]: [${resp.statusText}], [${data.message}] ]`)));
            return ({...data, ok : resp.ok, status : resp.status, statusText : resp.statusText}); 
        }));
    }
    
    api_check(...args)
    {
        return api(...args).then(this.check_response.bind(this));
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
        const reponame = route.pop();
        const username = route.pop();
        const gist = repo_url.includes('gist.github.com');

        return {reponame : reponame, username : username, gist: gist, path : repo_url};
    }

    format_url(username, reponame, gist, branch, commit, path)
    {
        if(gist)
            return `https://gist.github.com/${username}/${reponame}/${commit}`;
        else if(!gist && (branch || commit) && path)
            return `https://github.com/${username}/${reponame}/blob/${commit||branch}/${path}`;
        else if(!gist && branch && commit)
            return `https://github.com/${username}/${reponame}/commit/${commit}`
        else if(!gist && branch)
            return `https://github.com/${username}/${reponame}/tree/${branch}`
        else
            return `https://github.com/${username}/${reponame}`;
    }
    
    git_dir()
    {
        for(let cwd = this.FS.cwd(); cwd != '/'; cwd = this.PATH.normalize(this.PATH.join(cwd, '..')))
        {
            const dotgit = this.PATH.join(cwd, '.git');
            if(this.PATH_.exists(dotgit))
                return dotgit;
        }
        return null;
    }

    ls_tree(commit_sha, repo_path, dict = false)
    {
        const array = JSON.parse(this.FS.readFile(this.object_path({sha : commit_sha}, repo_path), {encoding: 'utf8'})).tree;
        if(dict == true)
            return Object.fromEntries(array.map(x => [x.path, x]));
        return array
    }

    commit_tree(commit, tree, repo_path = '.')
    {
        this.save_object(this.object_path(commit, repo_path), JSON.stringify(tree, null, 2));
    }

    cat_file(abspath, tree_dict = null)
    {
        const repo_path = this.PATH.normalize(this.PATH.join(this.git_dir(), '..')) + '/';

        if(!abspath.startsWith(repo_path))
            return {};
        
        if(tree_dict === null)
            tree_dict = this.ls_tree(this.rev_parse(this.ref_origin_head), repo_path, true);

        const relative_path = abspath.slice(repo_path.length);
        const file = tree_dict[relative_path];

        if(file === null)
            return {};

        abspath = this.object_path(file, repo_path);

        return {abspath : abspath, contents : this.FS.readFile(abspath, {encoding: 'utf8'})};
    }

    init(repo_path)
    {
        this.PATH_.mkdir_p(this.PATH.join(repo_path, this.dot_git, 'refs', 'remotes', 'origin'));
        this.PATH_.mkdir_p(this.PATH.join(repo_path, this.dot_git, 'objects'));
    }
    
    remote_get_url()
    {
        return this.FS.readFile(this.PATH.join(this.dot_git, 'config'), {encoding : 'utf8'}).split('\n')[1].split(' ')[2];
    }

    remote_set_url(repo_url, repo_path = '.')
    {
        this.FS.writeFile(this.PATH.join(repo_path, this.dot_git, 'config'), `[remote "origin"]\nurl = ${repo_url}`);
    }

    object_path(file, repo_path = '.')
    {
        return this.PATH.join(repo_path, this.dot_git, 'objects', file.sha.slice(0, 2), file.sha.slice(2));
    }

    save_object(obj_path, contents)
    {
        this.PATH_.mkdir_p(this.PATH.dirname(obj_path));
        this.FS.writeFile(obj_path, contents);
    }

    blob_sha(contents)
    {
        const header = `blob ${contents.length}\0`
        const byte_array = new Uint8Array(header.length + contents.length);
        byte_array.set(Array.from(header).map(c => c.charCodeAt()));
        byte_array.set(contents, header.length);
        return this.sha1(byte_array);
    }

    update_ref(ref, new_value, repo_path = '.')
    {
        this.FS.writeFile(this.PATH.join(repo_path, this.dot_git, ref), new_value);
    }

    rev_parse(ref, repo_path = '.')
    {
        ref = this.FS.readFile(this.PATH.join(repo_path, this.dot_git, ref), {encoding: 'utf8'})
        if(ref.startsWith('ref: '))
            return ref.split(': ').pop();
        return ref;
    }




    clone(print, auth_token, repo_url, repo_path, branch = null)
    {
        return this.parse_url(repo_url).gist ? this.clone_gist(print, auth_token, repo_url, repo_path) : this.clone_repo(print, auth_token, repo_url, repo_path);
    }
    
    async push(print, status, message, retry)
    {
        return this.parse_url(this.remote_get_url()).gist ? this.push_gist(print, status, message, retry) : this.push_repo(print, status, message, retry);
    }
    
    async pull(print, status)
    {
        return this.parse_url(this.remote_get_url()).gist ? this.pull_gist(print, status) : this.pull_repo(print, status);
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
            print(`[${file_path}] <- [${cached_file_path}]`);
            contents = this.FS.readFile(cached_file_path, opts);
        }
        else
        {
            print(`[${file_path}] <- [${cached_file_path}] <- [${file.url}]`);
            const resp = await fetch(file.url);
            if(!resp.ok)
            {
                print(`Dowloading [${file.url}] failed`);
                return null;
            }
            const result = await resp.json();
            console.assert(result.encoding == 'base64');
            contents = Uint8Array.from(atob(result.content), v => v.charCodeAt());
            //const resp = await fetch(file.download_url).then(r => r.arrayBuffer());
            //contents = new Uint8Array(await resp);
            this.FS.writeFile(cached_file_path, contents, {encoding: 'binary'});
            if(opts.encoding == 'utf8')
                contents = this.FS.readFile(cached_file_path, opts);
        }
        return contents;
    }

    status()
    {
        const repo_path = this.PATH.normalize(this.PATH.join(this.git_dir(), '..'));
        const base_branch = this.rev_parse(this.ref_origin_head, repo_path);
        const remote_branch = this.PATH.basename(base_branch);
        const base_commit_sha = this.rev_parse(base_branch, repo_path);
        const tree_dict = this.ls_tree(base_commit_sha, repo_path, true);
        const tree_dict_copy = {...tree_dict};
        
        const ls_R = this.PATH_.find(repo_path, '', true, true, false, false);
        let files = [];

        for(const file of ls_R)
        {
            if(!file.contents || file.path.startsWith('.git/'))
            {
                delete tree_dict[file.path];
                continue;
            }

            const sha = tree_dict[file.path].sha;
            
            if(!sha)
                files.push({path : file.path, abspath : this.PATH.join(repo_path, file.path), status : 'new'});
            else
            {
                files.push({path : file.path, abspath : this.PATH.join(repo_path, file.path), status : sha != this.blob_sha(file.contents) ? 'modified' : 'not modified'});
                delete tree_dict[file.path];
            }
        }
        
        files.push(...Object.keys(tree_dict).map(file_path => ({path : file_path, status : 'deleted'}))); 
        
        for(const f of files)
            f.abspath_remote = this.cat_file(f.abspath, tree_dict_copy).abspath;
        
        return {...this.parse_url(this.remote_get_url()), files : files, remote_branch : remote_branch, remote_commit : base_commit_sha};
    }
    
    async clone_gist(print, auth_token, repo_url, repo_path)
    {
        this.auth_token = auth_token;
        const repo = (await this.api('gists', repo_url));

        this.PATH_.mkdir_p(this.PATH.join(repo_path, '.git', 'objects'));
        this.FS.writeFile(this.PATH.join(repo_path, '.git', 'config'), `[remote "origin"]\nurl = ${repo_url}`);

        for(const file_name in repo.files)
        {
            print(`Creating [${file_name}]`);
            const file = repo.files[file_name];
            const file_path = this.PATH.join(repo_path, file_name);
            const contents = file.truncated ? (await fetch(file.raw_url).then(x => x.text())) : file.content;
            this.FS.writeFile(file_path, contents);
        }
        this.save_githubcontents(repo_path, repo);
    }

    async clone_repo(print, auth_token, repo_url, repo_path, remote_branch = null)
    {
        this.auth_token = auth_token;
        if(!remote_branch)
        {
            const repo = await this.api_check('Default branch <- ...', print, 'repos', repo_url);
            remote_branch = repo.default_branch;
        }
        print(`Branch [${remote_branch}]`);
        
        const commit = await this.api_check(`Commits of branch [${remote_branch}] <- ...`, print, 'repos', repo_url, `/commits/${remote_branch}`);

        const tree = await this.api_check(`Tree of commit [${commit.commit.tree.sha}] <- ...`, print, 'repos', repo_url, `/git/trees/${commit.commit.tree.sha}?recursive=1`);
        if(tree.truncated)
            throw new Error('Tree retrieved from GitHub is truncated: not supported yet');

        this.init(repo_path);
        this.remote_set_url(repo_url, repo_path);
        
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        
        for(const file of tree.tree)
        {
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
                    this.rm_rf(repo_path);
                    return false;
                }

                this.FS.writeFile(file_path, contents);
                this.save_object(this.object_path(file, repo_path), contents);
            }
        }
        
        tree.tree = tree.tree.filter(f => f.type == 'blob');

        this.commit_tree(commit, tree, repo_path);
        this.update_ref(this.ref_origin_head, 'ref: ' + origin_branch, repo_path);
        this.update_ref(origin_branch, commit.sha, repo_path);
        
        print(`Branch local [${remote_branch}] -> [${new_commit.sha}]`);
        print('OK!');
        return true;
    }
    
    async push_repo(print, status, message, retry)
    {
        const repo_path = this.PATH.normalize(this.PATH.join(this.git_dir(), '..'));
        const repo_url = this.remote_get_url();
        const base_branch = this.rev_parse(this.ref_origin_head, repo_path);
        const remote_branch = this.PATH.basename(base_branch);
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        const base_commit_sha = this.rev_parse(base_branch, repo_path);
        const tree = this.ls_tree(base_commit_sha);
        
        if(status.files.every(s => s == 'not modified'))
            return;
        
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
            const contents = this.FS.analyzePath(file_path).exists ? this.FS.readFile(file_path) : null;
            
            print(`Single file [${modified_deleted[0].status}], using Contents API`);
            
            const resp = await this.api(`[${modified_deleted[0].path}] -> [${modified_deleted[0].status}] ...`, print, 'repos', repo_url, this.PATH.join('/contents', file_path), ...(single_file_delete ? [ 'DELETE', {message : message, sha : blob_sha} ] : [ 'PUT', {message : message, content : base64_encode_uint8array(contents), ...(blob_sha ? {sha : blob_sha} : {})} ] ));
            this.check_response(resp);
            
            const new_commit = resp.commit, new_blob = resp.content;
            print(`Commit: [${new_commit.sha}]`);

            const new_tree = await this.api(`GitHub API: GET tree [${new_commit.tree.sha}] ...`, print, 'repos', repo_url, `/git/trees/${new_commit.tree.sha}?recursive=1`);
            this.check_response(new_tree);
            print(`Tree: [${new_commit.tree.sha}]`);

            if(single_file_upsert && blob_sha)
            {
                this.add(new_blob, contents, repo_path);
                print(`Blob local -> [${new_blob.sha}]`);
            }
            this.commit_tree(new_commit, new_tree, repo_path);
            this.update_ref(origin_branch, new_commit.sha, repo_path);
            print('OK!');
            return true;
        }
        else
        {
            print(`[${modified.length}] files modified, [${deleted.length}] files deleted`);
            // http://www.levibotelho.com/development/commit-a-file-with-the-github-api/
            
            print(`Blobs ([${modified.length}]) ->...`);
            const blob_promises = modified.map(({path, status, abspath}) => 
            {
                const contents = this.FS.readFile(abspath);
                return this.api(`Blob [${path}] -> ...`, print, 'repos', repo_url, '/git/blobs', 'POST', {encoding: 'base64', content: base64_encode_uint8array(contents)}).then(resp => 
                {
                    if(!resp.ok)
                        return null;
                    else
                    {
                        print(`Blob [${path}] local -> [${resp.sha}]...`);
                        this.add(resp, contents, repo_path);
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
            new_tree = await this.api(`Tree ->...`, print, 'repos', repo_url, '/git/trees', 'POST', new_tree);
            this.check_response(new_tree);

            let new_commit = { message : message, parents : [base_commit_sha], tree : new_tree.sha };
            new_commit = await this.api(`Commit with tree [${new_tree.sha}] -> ...`, print, 'repos', repo_url, '/git/commits', 'POST', new_commit);
            this.check_response(new_commit);
            print(`Commit [${new_commit.sha}] -> local...`);
            this.commit_tree(new_commit, new_tree, repo_path);
            
            let new_ref = { sha : new_commit.sha };
            new_ref = await this.api(`Branch remote [${remote_branch}] -> [${new_commit.sha}]...`, print, 'repos', repo_url, this.PATH.join('/git/refs/heads', remote_branch), 'PATCH', new_ref);
            this.check_response(new_ref);
            this.update_ref(origin_branch, new_commit.sha, repo_path);
            print(`Branch local [${remote_branch}] -> [${new_commit.sha}]... OK!`);

            print('OK!');
            return true;
        }
    }

    async pull_repo(print, status)
    {
        const repo_path = this.PATH.normalize(this.PATH.join(this.git_dir(), '..'));
        const repo_url = this.remote_get_url();
        const base_branch = this.rev_parse(this.ref_origin_head, repo_path);
        const base_commit_sha = this.rev_parse(base_branch, repo_path);
        const remote_branch = this.PATH.basename(base_branch);
        const origin_branch = this.PATH.join(this.ref_origin, remote_branch);
        
        const tree_dict = this.ls_tree(base_commit_sha, repo_path, true);

        const new_commit = await this.api(`Commits of branch [${remote_branch}] <- ...`, print, 'repos', repo_url, `/commits/${remote_branch}`);
        this.check_response(new_commit);

        const new_tree = await this.api(`Tree of commit [${new_commit.commit.tree.sha}] <- ...`, print, 'repos', repo_url, `/git/trees/${new_commit.commit.tree.sha}?recursive=1`);
        this.check_response(new_tree);
        if(new_tree.truncated)
            throw new Error('Tree retrieved from GitHub is truncated: not supported yet');

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
                            const conflicted = this.merge(ours_path, theirs_path, old_path);

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

                        //const contents = await this.load_file(print, file.path, file);
                        //const theirs_path = this.object_path(file);
                        //this.save_object(theirs_path, contents);

                        //const old_path = this.object_path(file_old);
                        //const conflicted = this.merge(ours_path, theirs_path, old_path);

                        //status_res.files.push({path: ours_path, status : conflicted ? 'conflict' : 'merged'});
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

        new_tree.tree = new_tree.tree.filter(f => f.type == 'blob');
        
        this.commit_tree(new_commit, new_tree, repo_path);
        this.update_ref(this.ref_origin_head, 'ref: ' + origin_branch, repo_path);
        this.update_ref(origin_branch, new_commit.sha, repo_path);

        print(`Branch local [${remote_branch}] -> [${new_commit.sha}]`);
        print('OK!');
        return status_res;
    }

    async push_gist(status, message, retry)
    {
        const repo_url = this.remote_get_url();

        // TODO: check last commit+pull? check binary files? 
        const files = status.files.filter(s => s.status != 'not modified').map(s => [s.path, {content : s.status == 'deleted' ? null : this.FS.readFile(s.abspath, {encoding: 'utf8'})}]);

        const gist = await this.api('gists', repo_url, message, 'PATCH', { files : Object.fromEntries(files) });
        this.check_response(gist);
    }

    async pull_gist(auth_token)
    {
        this.auth_token = auth_token;
        const repo = await this.api('gists', repo_url).then(r => r.json());

        let res = [];
        for(const file of repo)
        {

        }
        return res;
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
