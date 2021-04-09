// gists https://developer.github.com/v3/gists/#update-a-gist
// 403 {
//   "message": "API rate limit exceeded for 84.110.59.167. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
//     "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
//     }
//

const delay = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));
const network_error = resp => new Error(`${resp.status}: ${resp.statusText}`);

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
/*
function ApiResult(resp, result)
{
    this.status = resp.status;
    this.statusText = resp.statusText;
    this.ok = resp.ok;
    this.result = result;
}
*/
export class Github
{
    constructor(cache_dir, merge, sha1, FS, PATH, PATH_)
    {
        this.retry_delay_seconds = 2;
        this.auth_token = '';
        this.cache_dir = cache_dir;
        this.merge = merge;
        this.sha1 = sha1;
        this.FS = FS;
        this.PATH = PATH;
        this.PATH_ = PATH_;
        this.api_endpoint = 'api.github.com';
        this.ref_origin = 'refs/remotes/origin';
        this.head = 'HEAD';
        this.ref_origin_head = this.PATH.join(this.ref_origin, this.head);
        this.dot_git = '.git';
    }
    
    api(log_prefix, print, realm, repo_url, relative_url = '', method = 'GET', body = null, result = 'json')
    {
        const api = realm != 'gists' ? repo_url.replace('github.com', this.PATH.join(this.api_endpoint, realm)) : ('https://' + this.PATH.join(this.api_endpoint, 'gists', this.parse_url(repo_url).reponame));
        const headers = Object.assign({Authorization : 'Basic ' + btoa(this.auth_token), 'If-None-Match' : ''}, body != null ? {'Content-Type' : 'application/json'} : {});
        const url = api + relative_url;
        
        print(log_prefix);
        print(`${method} ${url}`);
        return fetch(url, Object.assign({method : method || 'GET', headers : headers}, body != null ? {body : JSON.stringify(body)} : {})).then(resp => resp[result]().then(data => 
        {
            print(log_prefix + (resp.ok ? ' OK!': ' FAILED!'));
            return ({result : data, ok : resp.ok}); 
        }));
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
        const repo = (await this.api('gists', repo_url)).result;

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

    async clone_repo(print, auth_token, repo_url, repo_path, branch = null)
    {
        this.auth_token = auth_token;
        let resp = null;
        let comment = null;
        if(!branch)
        {
            resp = await this.api('Getting default branch...', print, 'repos', repo_url);
            if(!resp.ok)
                return false;
            branch = resp.result.default_branch;
        }
        print(`Branch [${branch}]`);
        
        resp = await this.api(`Getting commits of branch [${branch}]...`, print, 'repos', repo_url, `/commits/${branch}`);
        if(!resp.ok)
            return false;
        const commit = resp.result;
        print(comment + ` commit [${commit.sha}]`);

        resp = await this.api(`Getting tree of commit [${commit.commit.tree.sha}]...`, print, 'repos', repo_url, `/git/trees/${commit.commit.tree.sha}?recursive=1`);
        if(!resp.ok)
            return false;
        const tree = resp.result;
        console.assert(tree.truncated == false);

        this.init(repo_path);
        this.remote_set_url(repo_url, repo_path);
        
        const origin_branch = this.PATH.join(this.ref_origin, branch);
        
        this.commit_tree(commit, tree, repo_path);
        this.update_ref(this.ref_origin_head, 'ref: ' + origin_branch, repo_path);
        this.update_ref(origin_branch, commit.sha, repo_path);

        for(const file of tree.tree)
        {
            if(file.type == 'tree')
            {
                this.FS.mkdir(this.PATH.join(repo_path, file.path));
            }
            else if(file.type == 'blob')
            {
                const file_path = this.PATH.join(repo_path, file.path);
                const contents = await this.load_file(print, file_path, file);
                if(contents === null) return false;

                this.FS.writeFile(file_path, contents);
                this.save_object(this.object_path(file, repo_path), contents);
            }
        }
        print('OK!');
        return true;
    }

    async push_gist(status, message, retry)
    {
        const repo_url = this.remote_get_url();

        // TODO: check last commit+pull? check binary files? 
        const files = status.files.filter(s => s.status != 'not modified').map(s => [s.path, {content : s.status == 'deleted' ? null : this.FS.readFile(s.abspath, {encoding: 'utf8'})}]);

        const resp = await this.api('gists', repo_url, message, 'PATCH', { files : Object.fromEntries(files) });
        console.assert(resp.ok); 
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
        
        if(this.parse_url(repo_url).gist)
            await this.push_gist(status, message, retry);
       
        const modified = status.files.filter(s => s.status == 'modified' || s.status == 'new');
        const deleted = status.files.filter(s => s == 'deleted');
        const single_file_upsert = deleted.length == 0 && modified.length == 1;
        const single_file_delete = deleted.length == 1 && modified.length == 0;
        const no_deletes = deleted.length == 0;
        let comment = '';
        let resp = null;
        
        const mode = { blob : '100644', executable: '100755', tree: '040000', commit: '160000', blobsymlink: '120000' };

        if(single_file_upsert || single_file_delete)
        {
            const modified_deleted = [...modified, ...deleted];
            const file_path = modified_deleted[0].path;
            const blob_sha = tree.filter(f => f.path == file_path).concat([{}])[0].sha;
            const contents = this.FS.analyzePath(file_path).exists ? this.FS.readFile(file_path) : null;
            
            print(`Single file [${modified_deleted[0].status}], using Contents API`);
            
            comment = `GitHub API: [${modified_deleted[0].path}] -> [${modified_deleted[0].status}] ...`
            print(comment);
            if(single_file_upsert)
                resp = await this.api('repos', repo_url, this.PATH.join('/contents', file_path), 'PUT', {message : message, content : base64_encode_uint8array(contents), ...(blob_sha ? {sha : blob_sha} : {})} );
            else if(single_file_delete)
                resp = await this.api('repos', repo_url, this.PATH.join('/contents', file_path), 'DELETE', {message : message, sha : blob_sha} );
            
            if(!resp.ok)
            {
                print(comment + ' FAILED!');
                return false;
            }
            const new_commit = resp.result.commit, new_blob = resp.result.content;
            print(comment + ` OK! Commit: [${new_commit.sha}]`);

            comment = `GitHub API: GET tree [${new_commit.tree.sha}] ...`;
            print(comment);
            
            resp = await this.api('repos', repo_url, `/git/trees/${new_commit.tree.sha}?recursive=1`);
            if(!resp.ok)
            {
                print(comment + ' FAILED!');
                return false;
            }
            const new_tree = resp.result;
            print(comment + ` OK! Tree: [${new_commit.tree.sha}]`);

            if(single_file_upsert && blob_sha)
            {
                this.add(new_blob, contents, repo_path);
                print(`Locally: added blob [${new_blob.sha}]`);
            }
            this.commit_tree(new_commit, new_tree, repo_path);
            this.update_ref(origin_branch, new_commit.sha, repo_path);
            return true;
        }
        else if(no_deletes)
        {
            print(`[${modified.length}] files modified, no deletes, using simplified Tree API`);
            // http://www.levibotelho.com/development/commit-a-file-with-the-github-api/
            
            print(`Uploading [${modified.length}] blobs to remote... If this takes too long, you may be experiencing Internet connectivity issues...`);
            const blob_promises = modified.map(({path, status, abspath}) => 
            {
                const contents = this.FS.readFile(abspath);
                print(`Uploading [${path}]...`);
                return this.api('repos', repo_url, '/git/blobs', 'POST', {encoding: 'base64', content: base64_encode_uint8array(contents)}).then(resp => 
                {
                    if(!resp.ok)
                    {
                        print(`Upload of [${path}] failed`);
                        return null;
                    }
                    else
                    {
                        print(`Uploading [${path}] -> [${resp.result.sha}] succeeded. Caching blob locally...`);
                        this.add(resp.result, contents, repo_path);
                        return resp.result.sha;
                    }
                });
            });
            const blob_shas = await Promise.all(blob_promises);
            print(`Uploaded [${blob_promises.length}] blobs to remote`);

            let new_tree = { base_tree : tree.sha, tree : blob_shas.map((blob_sha, i) => ({path : modified[i].path, type : 'blob', mode : mode['blob'], sha : blob_sha })) };
            let resp = await this.api('repos', repo_url, '/git/trees', 'POST', new_tree);
            if(!resp.ok)
            {
                print('Tree upload failed');
                return false;
            }
            new_tree = resp.result;
            print(`Created tree on remote: ${new_tree.sha}`);

            let new_commit = { message : message, parents : [base_commit_sha], tree : new_tree.sha };
            resp = await this.api('repos', repo_url, '/git/commits', 'POST', new_commit);
            if(!resp.ok)
            {
                print('Commit failed');
                return false;
            }
            new_commit = resp.result;
            print(`Created commit on remote: ${new_commit.sha}. Caching commit locally...`);
            this.commit_tree(new_commit, new_tree, repo_path);
            
            const new_ref = {sha : new_commit.sha};
            resp = await this.api('repos', repo_url, this.PATH.join('/git/refs/heads', remote_branch), 'PATCH', new_ref);
            if(!resp.ok)
            {
                print('Update ref failed');
                return false;
            }
            print(`OK! Updated ref on remote [${remote_branch}]. Updating refs locally...`);
            this.update_ref(origin_branch, new_commit.sha, repo_path);
            return true;
        }

            
        //else if(resp.status == 409 && retry != false)
        //{
        //    console.log('retry not implemented');
        //    //await delay(this.retry_delay_seconds);
        //    //await this.put(message, sha ? ((await this.init_doc()) || this.sha) : null, false);
        //}
        //else
        //{
        //    throw network_error(resp);
        //}
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

    async pull_repo(print, repo_path = '.')
    {
        const repo_url = this.remote_get_url();
        const tree = this.ls_tree();
        const repo = await this.api('repos', repo_url, '/contents').then(r => r.json());
        
        let Q = [...repo];

        let res = [];
        while(Q.length > 0)
        {
            const file = Q.pop();
            if(file.type == 'file')
            {
                const tree_files = tree.filter(f => f.path == file.path);
                if(!this.PATH_.exists(file.path))
                {
                    const contents = await this.load_file(print, file.path, file);
                    this.FS.writeFile(file_path, contents);
                    res.push({path: file_path, status : 'deleted'});
                }
                
                else if(tree_files.length > 0 && tree_files[0].sha == file.sha) 
                    res.push({path: file.path, status : 'not modified'});
                
                else if(tree_files.length > 0 && tree_files[0].sha != file.sha) 
                {
                    const ours_path = file.path;
                    
                    const contents = await this.load_file(print, file.path, file);
                    const theirs_path = this.object_path(file);
                    this.ave_object(theirs_path, contents);

                    const old_file = tree_files[0];
                    const old_path = this.object_path(old_file);
                    const conflicted = this.merge(ours_path, theirs_path, old_path);
                    res.push({path: ours_path, status : conflicted ? 'conflict' : 'merged'});
                }
            }
            else if(file.type == 'dir')
            {
                this.PATH_.mkdir_p(this.PATH.join(repo_path, file.path));
                
                const dir = await this.api('repos', repo_url, '/contents/' + file.path).then(r => r.json());
                repo.push(...dir);
                Q.push(...dir);
            }
        }
        this.save_githubcontents(repo_path, repo);
        return res;
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
}
