// tex_path dir 

import { Guthub } from '/guthub.js'

export class Shell
{
    constructor(ui, paths, readme, terminal, editor, http_path)
    {
        this.http_path = http_path;
        this.share_link_log = '/tmp/share_link.log';
        this.home_dir = '/home/web_user';
        this.cache_dir = '/cache';
        this.readme_dir = this.home_dir + '/readme';
        this.readme_tex = this.readme_dir + '/readme.tex';

        this.shared_project = '/home/web_user/shared_project';
        this.pdf_path = '/tmp/pdf_does_not_exist_yet';
        this.log_path = '/tmp/log_does_not_exist_yet';
        this.tex_path = '';
        this.zip_path = '/tmp/archive.zip';
        this.current_terminal_line = '';
        this.text_extensions = ['.tex', '.bib', '.txt', '.svg', '.sh', '.py', '.csv'];
        this.tic_ = 0;
        this.FS = null;
        this.PATH = null;
        this.guthub = null;
        this.terminal = terminal;
        this.editor = editor;
        this.ui = ui;
        this.paths = paths;
        this.compiler = new Worker(paths.busytex_worker_js);
        this.log = this.ui.log;
        this.readme = readme;
        this.backend = null;
        
        this.compiler.onmessage = this.oncompilermessage.bind(this);
        this.terminal.on('key', this.onkey.bind(this));

        this.basename = path => path.slice(path.lastIndexOf('/') + 1);
        
        const cmd = (...parts) => parts.join(' ');
        const arg = path => this.expandcollapseuser(path, false);
        this.ui.clone.onclick = () => this.commands('cd', cmd('clone', ui.github_https_path.value), cmd('open', this.PATH.join2('~', this.basename(ui.github_https_path.value))), cmd('cd', this.basename(ui.github_https_path.value)));
        this.ui.download_pdf.onclick = () => this.commands(cmd('download', arg(this.pdf_path)));
        this.ui.view_log.onclick = () => this.commands(cmd('open', arg(this.log_path)));
        this.ui.view_pdf.onclick = () => this.commands(cmd('open', arg(this.pdf_path)));
        this.ui.download.onclick = () => this.commands(cmd('download', arg(this.tex_path)));
        this.ui.download_zip.onclick = () => this.commands('cd', cmd('nanozip', this.basename(this.project_dir())), cmd('cd', this.pwd(true)), cmd('download', arg(this.zip_path)));
        this.ui.compile.onclick = () => this.commands(cmd('latexmk', arg(this.tex_path)));
        this.ui.man.onclick = () => this.commands('man');
        this.ui.share.onclick = () => this.commands('share && ' + cmd('open', arg(this.share_link_log)));
        //this.ui.pull.onclick = () => this.commands('cd ~/readme', 'ls');
        this.ui.github_https_path.onkeypress = ev => ev.keyCode == 13 ? this.ui.clone.click() : null;
		
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
    
    async commands(...cmds)
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
        //TODO: filter out artefacts
        const files = this.ls_R(project_dir);
        return btoa(JSON.stringify(files));
    }

    deserialize_project(project_str)
    {
        return JSON.parse(atob(project_str));
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

            for(const cmdline of this.current_terminal_line.split('&&'))
            {
                let [cmd, ...args] = cmdline.trim().split(' ');
                
                args = args.map(a => this.expandcollapseuser(a));
                
                try
                {
                    if (cmd == '')
                    {
                    }
                    else if(cmd == 'ls')
                    {
                        const res = this.ls(...args);
                        if(res.length > 0)
                            this.terminal_print(res.join(' '));
                    }
                    else if(cmd == 'pwd')
                        this.terminal_print(this.pwd());
                    else if(cmd == 'clear')
                        this.clear();
                    else if(cmd == 'mkdir')
                        this.mkdir(...args);
                    else if(cmd == 'nanozip')
                        this.terminal_print(this.nanozip(...args));
                    else if(cmd == 'man')
                        this.man();
                    else if(cmd == 'share')
                        this.share();
                    else if(cmd == 'help')
                        this.terminal_print(this.help().join(' '));
                    else if(cmd == 'download')
                        this.download(...args);
                    else if(cmd == 'upload')
                        this.terminal_print(await this.upload(args[0]));
                    else if(cmd == 'latexmk')
                        await this.latexmk(...args);
                    else if(cmd == 'cd')
                        this.cd(args[0]);
                    else if(cmd == 'clone')
                        await this.clone(...args);
                    else if(cmd == 'push')
                        await this.push(...args);
                    else if(cmd == 'open')
                        this.open(...args);
                    else if(cmd == 'status')
                        await this.guthub.status(this.ls_R('.'));
                    else if(cmd == 'save')
                        this.save(args[0], this.editor.getModel().getValue());
                    else if(cmd == 'purge')
                        await this.purge_cache();
                    else
                        this.terminal_print(cmd + ': command not found');
                }
                catch(err)
                {
                    this.terminal_print('Error: ' + err.message);
                }
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

    async run(route, backend_emscripten_module_async, sha1)
    {
        if(route.length > 1 && route[0] == 'github')
            this.ui.github_https_path.value = route[1];
       
        this.compiler.postMessage(this.paths);
        this.backend = await backend_emscripten_module_async(backend_emscripten_module_config(this.log));
        
        this.PATH = this.backend.PATH;
        this.FS = this.backend.FS;
        this.FS.mkdir(this.readme_dir);
        this.FS.mkdir(this.cache_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.writeFile(this.readme_tex, this.readme);
        this.FS.chdir(this.home_dir);
        this.guthub = new Guthub(sha1, this.FS, this.backend, this.cache_dir, this.log.bind(this));
        await this.load_cache();
        if(this.ui.github_https_path.value.length > 0)
        {
            const project_dir = await this.clone(this.ui.github_https_path.value);
            this.open(project_dir);
            this.FS.chdir(project_dir);
        }
        else if(route.length > 1 && route[0] == 'inline')
        {
            const files = this.deserialize_project(route[1]);
            const project_dir = this.shared_project;
            this.FS.mkdir(project_dir)

            let dirs = new Set(['/', project_dir]);

            const mkdir_p = dirpath =>
            {
                if(!dirs.has(dirpath))
                {
                    mkdir_p(this.PATH.dirname(dirpath));
                    
                    this.FS.mkdir(dirpath);
                    dirs.add(dirpath);
                }
            };

            for(const {path, contents} of files.sort((lhs, rhs) => lhs['path'] < rhs['path'] ? -1 : 1))
            {
                const absolute_path = this.PATH.join2(project_dir, path);
                if(contents == null)
                    mkdir_p(absolute_path);
                else
                {
                    mkdir_p(this.PATH.dirname(absolute_path));
                    this.FS.writeFile(absolute_path, contents);
                }
            }

            this.open(project_dir);
            this.FS.chdir(project_dir);
        }
        else
            this.man();
        
        this.terminal_prompt();
    }

    open(file_path, contents)
    {
        if(this.FS.isDir(this.FS.lookupPath(file_path).node.mode))
        {
            const files = this.ls_R(file_path, '', false).filter(f => f.path.endsWith('.tex') && f.contents != null);
            let default_path = null;
            if(files.length == 1)
                default_path = files[0].path;
            else if(files.length > 1)
            {
                const main_files = files.filter(f => f.path.includes('main'));
                default_path = main_files.length > 0 ? main_files[0].path : files[0].path;
            }
            file_path = default_path != null ? this.PATH.join2(file_path, default_path) : null;
        }

        if(file_path == null && contents == null)
            return;

        if(file_path.endsWith('.tex'))
            this.tex_path = file_path.startsWith('/') ? file_path : (this.FS.cwd() + '/' + file_path);

        if(file_path.endsWith('.pdf') || file_path.endsWith('.jpg') || file_path.endsWith('.png') || file_path.endsWith('.svg') || file_path.endsWith('.log'))
        {
            contents = contents || (file_path.endsWith('.log') ? this.FS.readFile(file_path, {encoding: 'utf8'}) : this.FS.readFile(file_path, {encoding : 'binary'}));
            
            if(file_path.endsWith('.log'))
            {
                this.ui.txtpreview.value = contents;
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden, this.ui.txtpreview.hidden] = [true, true, false];
            }
            else if(file_path.endsWith('.svg'))
            {
                this.ui.imgpreview.src = 'data:image/svg+xml;base64,' + btoa(String.fromCharCode.apply(null, contents));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden, this.ui.txtpreview.hidden] = [false, true, true];
            }
            else if(file_path.endsWith('.png') || file_path.endsWith('.jpg'))
            {
                const ext = file_path.endsWith('.png') ? 'png' : 'jpg';
                this.ui.imgpreview.src = `data:image/${ext};base64,` + btoa(String.fromCharCode.apply(null, contents));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden, this.ui.txtpreview.hidden] = [false, true, true];
            }
            else if(file_path.endsWith('.pdf'))
            {
                this.ui.pdfpreview.src = URL.createObjectURL(new Blob([contents], {type: 'application/pdf'}));
                [this.ui.imgpreview.hidden, this.ui.pdfpreview.hidden, this.ui.txtpreview.hidden] = [true, false, true];
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
    
    share()
    {
        const serialized_project_str = this.serialize_project(this.project_dir());
        this.FS.writeFile(this.share_link_log, `${this.http_path}/#inline/${serialized_project_str}`);
    }

    nanozip(project_dir)
    {
        this.backend.output = '';
        this.backend.callMain(['nanozip', '-r', '-x', '.git', '-x', this.log_path, '-x', this.pdf_path, this.zip_path, project_dir]);
        return this.backend.output;
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
    
    expandcollapseuser(path, expand = true)
    {
        return expand ? path.replace('~', this.home_dir) : path.replace(this.home_dir, '~');
    }

    cd(path)
    {
        this.FS.chdir(this.expandcollapseuser(path || '~'));
    }

    mkdir(path)
    {
        this.FS.mkdir(path);
    }

    ls_R(root, relative_dir_path = '', recurse = true)
    {
        let entries = [];
        for(const [name, entry] of Object.entries(this.FS.lookupPath(`${root}/${relative_dir_path}`, {parent : false}).node.contents))
        {
            const relative_path = relative_dir_path ? `${relative_dir_path}/${name}` : name;
            const absolute_path = `${root}/${relative_path}`;
            if(entry.isFolder)
            {
                //entries.push({path : relative_path}, ...this.ls_R(root, relative_path));
                if(recurse)
                    entries.push(...this.ls_R(root, relative_path));
            }
            else if(absolute_path != this.log_path && absolute_path != this.pdf_path)
            {
                const read_text = this.text_extensions.map(ext => absolute_path.endsWith(ext)).includes(true);
                entries.push({path : relative_path, contents : this.FS.readFile(absolute_path, {encoding : read_text ? 'utf8' : 'binary'})});
            }
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
        await this.guthub.clone(this.ui.github_token.value, https_path, repo_path);
        await this.save_cache();
        this.ui.set_route('github', https_path);
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
        thisProgram : 'busybox',

        noInitialRun : true,

        output : '',

        print(text) 
        {
            text = arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text;
            Module.output += text + '\r\n';
            Module.setStatus('stdout: ' + (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text));
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

