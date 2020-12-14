// tex_path dir 

import { Guthub } from '/guthub.js'

export class Shell
{
    constructor(ui, paths, readme, terminal, editor, http_path, auth_token_hash, repo_path_search)
    {
        this.http_path = http_path;
        this.share_link_txt = '/tmp/share_link.txt';
        this.home_dir = '/home/web_user';
        this.cache_dir = '/cache';
        this.readme_dir = this.home_dir + '/readme';
        this.readme_tex = this.readme_dir + '/readme.tex';

        this.tic_ = 0;
        this.pdf_path = '';
        this.log_path = '';
        this.tex_path = '';
        this.current_terminal_line = '';
        this.FS = null;
        this.guthub = null;
        this.terminal = terminal;
        this.editor = editor;
        this.ui = ui;
        this.paths = paths;
        this.compiler = new Worker(paths.busytex_worker_js);
        this.log = this.ui.log;
        this.readme = readme;
        
        this.github_auth_token = auth_token_hash || ''
        if(this.github_auth_token.length > 1)
            this.github_auth_token = this.github_auth_token.slice(1);

        this.github_https_path = repo_path_search || '';
        if(this.github_https_path.length > 1)
            this.github_https_path = 'https://github.com' + this.github_https_path.slice(1);
       
        this.compiler.onmessage = this.oncompilermessage.bind(this);
        this.terminal.on('key', this.onkey.bind(this));

        this.basename = path => path.slice(path.lastIndexOf('/') + 1);
        this.ui.clone.onclick = () => this.commands(['cd', 'clone ' + ui.github_https_path.value, 'cd ' + this.basename(ui.github_https_path.value)]);
        this.ui.download_pdf.onclick = () => this.commands(['download ' + this.pdf_path]);
        this.ui.download.onclick = () => this.commands(['download ' + this.tex_path]);
        this.ui.download_zip.onclick = () => this.commands(['downloadzip ' + this.home_dir]);
        this.ui.compile.onclick = () => this.commands(['latexmk ' + this.tex_path]);
        this.ui.man.onclick = () => this.commands(['man']);
        this.ui.share.onclick = () => this.commands(['share', 'open ' + this.share_link_txt]);
        //this.ui.pull.onclick = () => this.commands(['cd ~/readme', 'ls']);
		
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, this.ui.compile.onclick);
    }

    log_reset(ansi_reset_sequence = '\x1bc')
    {
        this.log(ansi_reset_sequence);
    }

    async type(cmd, cr_key_code = 13)
    {
        for(const c of cmd)
            await this.onkey(c, {keyCode : null});
        await this.onkey('', {keyCode : cr_key_code});
    }
    
    async commands(cmds)
    {
        this.old_terminal_line = this.current_terminal_line;
        this.current_terminal_line = '';
        this.terminal.write('\b'.repeat(this.old_terminal_line.length));
        for(const cmd of cmds)
            await this.type(cmd);
        this.terminal.write(this.old_terminal_line);
    }

    async purge_cache()
    {
        const cached_files = this.FS.readdir(this.cache_dir);
        for(const file_name of cached_files)
            if(file_name != '.' && file_name != '..')
                this.FS.unlink(this.cache_dir + '/' + file_name);
        await this.save_cache();
    }

    project_dir()
    {
        const basename = this.tex_path.lastIndexOf('/');
        const cwd = this.tex_path.slice(0, basename);
        const project_dir = cwd.split('/').slice(0, 4).join('/');
        return project_dir;
    }

    serialize_project(project_dir)
    {
        const files = this.ls_R(project_dir);
        return Buffer.from(JSON.stringify(files)).toString('base64');
    }

    deserialize_project(project_str)
    {
        const files = JSON.parse(atob(project_str));
    }

    share()
    {
        const serialized_project_str = this.serialize_project(this.project_dir());
        this.FS.writeFile(this.share_link_txt, `${this.http_path}#base64project/${serialized_project_str}`);
    }

    async load_cache()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(true, x => x == null ? resolve(true) : reject(false)));
    }
    
    async save_cache()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(false, x => x == null ? resolve(true) : reject(false)));
    }

    terminal_print(line, newline = '\r\n')
    {
        this.terminal.write((line || '') + newline);
    }

    terminal_prompt()
    {
        return this.terminal.write('\x1B[1;3;31mbusytex\x1B[0m:' + this.pwd(true) + '$ ');
    }

    async onkey(key, ev, cr_key_code = 13, bs_key_code = 8)
    {
        if(ev.keyCode == bs_key_code)
        {
            if(this.current_terminal_line.length > 0)
            {
                this.current_terminal_line = this.current_terminal_line.slice(0, this.current_terminal_line.length - 1);
                this.terminal.write('\b \b');
            }
        }
        else if(ev.keyCode == cr_key_code)
        {
            this.terminal_print();
            const [cmd, arg] = this.current_terminal_line.split(' ');
            try
            {
                if (cmd == '')
                {
                }
                else if(cmd == 'clear')
                {
                    this.clear();
                }
                else if(cmd == 'pwd')
                {
                    this.terminal_print(this.pwd());
                }
                else if(cmd == 'ls')
                {
                    const res = this.ls(arg);
                    if(res.length > 0)
                        this.terminal_print(res.join(' '));
                }
                else if(cmd == 'mkdir')
                {
                    this.mkdir(arg);
                }
                else if(cmd == 'man')
                {
                    this.man();
                }
                else if(cmd == 'share')
                {
                    this.share();
                }
                else if(cmd == 'help')
                {
                    this.terminal_print(this.help().join(' '));
                }
                else if(cmd == 'download')
                {
                    this.download(arg);
                }
                else if(cmd == 'upload')
                {
                    this.terminal_print(await this.upload(arg));
                }
                else if(cmd == 'latexmk')
                {
                    await this.latexmk(arg);
                }
                else if(cmd == 'cd')
                {
                    this.cd(arg);
                }
                else if(cmd == 'clone')
                {
                    await this.clone(arg);
                }
                else if(cmd == 'push')
                {
                    await this.push(arg);
                }
                else if(cmd == 'open')
                {
                    this.open(arg);
                }
                else if(cmd == 'status')
                {
                    await this.guthub.status(this.ls_R('.'));
                }
                else if(cmd == 'save')
                {
                    this.save(arg, this.editor.getModel().getValue());
                }
                else if(cmd == 'purge')
                {
                    await this.purge_cache();
                }
                else
                {
                    this.terminal_print(cmd + ': command not found');
                }
            }
            catch(err)
            {
                this.terminal_print('Error: ' + err.message);
            }
            this.terminal_prompt();
            this.current_terminal_line = '';
        }
        else
        {
            this.current_terminal_line += key;
            this.terminal.write(key);
        }
    }

    oncompilermessage(e)
    {
        const {pdf, log, print} = e.data;
        if(pdf)
        {
            this.toc();
            this.FS.writeFile(this.pdf_path, pdf);
            this.open(this.pdf_path, pdf);
        }
        if(log)
        {
            this.toc();
            this.FS.writeFile(this.log_path, log);
        }
        if(print)
        {
            this.log(print);
        }
    }

    tic()
    {
        this.tic_ = performance.now();
    }

    toc()
    {
        if(this.tic_ > 0)
        {
            const elapsed = (performance.now() - this.tic_) / 1000.0;
            this.log(`Elapsed time: ${elapsed.toFixed(2)} sec`);
            this.tic_ = 0.0;
        }
    }

    async run(backend_emscripten_module_async, sha1)
    {
        this.compiler.postMessage(this.paths);
        
        const Module = await backend_emscripten_module_async(backend_emscripten_module_config(this.log));
        this.FS = Module.FS;
        this.FS.mkdir(this.readme_dir);
        this.FS.mkdir(this.cache_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.writeFile(this.readme_tex, this.readme);
        this.FS.chdir(this.home_dir);
        this.guthub = new Guthub(sha1, this.FS, Module, this.github_auth_token, this.cache_dir, this.log.bind(this));
        await this.load_cache();
        if(this.github_https_path.length > 0)
        {
            const repo_path = await this.clone(this.github_https_path);
            this.cd(repo_path);
        }
        else
            this.man();
        
        this.terminal_prompt();
    }

    open(file_path, contents)
    {
        if(file_path.endsWith('.tex'))
            this.tex_path = file_path.startsWith('/') ? file_path : (this.FS.cwd() + '/' + file_path);

        if(file_path.endsWith('.pdf') || file_path.endsWith('.jpg') || file_path.endsWith('.png') || file_path.endsWith('.svg'))
        {
            contents = contents || this.FS.readFile(file_path, {encoding : 'binary'});
            
            if(file_path.endsWith('.svg'))
            {
                this.ui.imgpreview.src = 'data:image/svg+xml;base64,' + btoa(String.fromCharCode.apply(null, contents));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden] = [false, true];
            }
            else if(file_path.endsWith('.png') || file_path.endsWith('.jpg'))
            {
                const ext = file_path.endsWith('.png') ? 'png' : 'jpg';
                this.ui.imgpreview.src = `data:image/${ext};base64,` + btoa(String.fromCharCode.apply(null, contents));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden] = [false, true];
            }
            else if(file_path.endsWith('.pdf'))
            {
                this.ui.pdfpreview.src = URL.createObjectURL(new Blob([contents], {type: 'application/pdf'}));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden] = [true, false];
            }
        }
        else
        {
            contents = contents || this.FS.readFile(file_path, {encoding : 'utf8'});
            this.editor.getModel().setValue(contents);
        }
    }

    man()
    {
        this.cd(this.readme_dir);
        this.open(this.readme_tex, this.readme);
    }

    help()
    {
        return ['man', 'help', 'status', 'purge', 'latexmk', 'download', 'clear', 'pwd', 'ls', 'mkdir', 'cd', 'clone', 'push', 'open', 'save'].sort();
    }

    save(file_path, contents)
    {
        this.FS.writeFile(file_path, contents);
    }

    pwd(replace_home)
    {
        const cwd = this.FS ? this.FS.cwd() : this.home_dir;
        return replace_home == true ? cwd.replace(this.home_dir, '~') : cwd;    
    }
    
    clear()
    {
        this.terminal.write('\x1bc');
    }

    ls(path)
    {
        return Object.keys(this.FS.lookupPath(path || '.').node.contents);
    }
    
    cd(path)
    {
        const expanduser = path => path.replace('~', this.home_dir);
        this.FS.chdir(expanduser(path || '~'));
    }

    mkdir(path)
    {
        this.FS.mkdir(path);
    }

    ls_R(root, relative_dir_path)
    {
        relative_dir_path = relative_dir_path || '';
        let entries = [];
        for(const [name, entry] of Object.entries(this.FS.lookupPath(`${root}/${relative_dir_path}`, {parent : false}).node.contents))
        {
            const relative_path = relative_dir_path ? `${relative_dir_path}/${name}` : name;
            const absolute_path = `${root}/${relative_path}`;
            if(entry.isFolder)
                //entries.push({path : relative_path}, ...this.ls_R(root, relative_path));
                entries.push(...this.ls_R(root, relative_path));
            else
                entries.push({path : relative_path, contents : this.FS.readFile(absolute_path, {encoding : 'binary'})});
        }
        return entries;
    }

    async latexmk(tex_path)
    {
        let cwd = this.FS.cwd();

        if(!tex_path)
        {
            const basename = this.tex_path.lastIndexOf('/');
            [cwd, tex_path] = [this.tex_path.slice(0, basename), this.tex_path.slice(1 + basename)];
        }
        
        if(tex_path.length == 0)
            return;
        
        const verbose = this.ui.verbose.value;

        this.terminal_print('Running in background...');
        this.tic();
        this.pdf_path = tex_path.replace('.tex', '.pdf');
        this.log_path = tex_path.replace('.tex', '.log');
        
        console.assert(tex_path.endsWith('.tex'));
        console.assert(cwd.startsWith(this.home_dir));
        
        const project_dir = cwd.split('/').slice(0, 4).join('/');
        const source_path = tex_path.startsWith('/') ? tex_path : `${cwd}/${tex_path}`;
        const main_tex_path = source_path.slice(project_dir.length + 1);

        const files = this.ls_R(project_dir);
        this.compiler.postMessage({files : files, main_tex_path : main_tex_path, verbose : verbose});
    }

    async upload(file_path)
    {
        const fileupload = this.ui.fileupload;
        const reader = new FileReader();
        return new Promise((resolve, reject) =>
        {
            reader.onloadend = () => {
                this.FS.writeFile(file_path, new Uint8Array(reader.result));
                resolve(`Local file [${fileupload.files[0].name}] uploaded into [${file_path}]`);
            };
            fileupload.onchange = () => reader.readAsArrayBuffer(fileupload.files[0]);
            fileupload.click();
        });
    }

    download(file_path, mime)
    {
        if(!this.FS.analyzePath(file_path).exists)
            return;

        mime = mime || 'application/octet-stream';
        let content = this.FS.readFile(file_path);
        this.ui.create_and_click_download_link(this.basename(file_path), content, mime);
    }
    
    async clone(https_path)
    {
        const repo_path = https_path.split('/').pop();
        this.terminal_print(`Cloning from '${https_path}' into '${repo_path}'...`);
        this.log_reset();
        await this.guthub.clone(https_path, repo_path);
        await this.save_cache();
        return repo_path;
    }

    async push(relative_file_path)
    {
        await this.guthub.push(relative_file_path, 'guthub');
    }
}

function backend_emscripten_module_config(log)
{
    const Module =
    {
        noInitialRun : true,

        output : '',

        print(text) 
        {
            text = arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text;
            Module.output += text;
        },

        printErr(text)
        {
            text = arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text;
            Module.setStatus('stderr: ' + (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text));
        },
        
        setStatus(text)
        {
            log(text);
        },
        
        monitorRunDependencies(left)
        {
            this.totalDependencies = Math.max(this.totalDependencies, left);
            Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
        },
        
        totalDependencies: 0,
    };
    return Module;
}

