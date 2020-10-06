import { Guthub } from '/guthub.js'

export class Shell
{
    constructor(ui, paths, readme, busy, terminal, editor, auth_token_hash, repo_path_search)
    {
        this.home_dir = '/home/web_user';
        this.cache_dir = '/cache';
        this.readme_tex = '/readme.tex';

        this.tic_ = 0;
        this.pdf_path = '';
        this.log_path = '';
        this.current_terminal_line = '';
        this.FS = null;
        this.busy = busy;
        this.guthub = null;
        this.terminal = terminal;
        this.editor = editor;
        this.ui = ui;
        this.paths = paths;
        this.compiler = new Worker(paths.busytex_worker_js);
        this.log = ui.log;
        this.readme = readme;
        
        this.github_auth_token = auth_token_hash || ''
        if(this.github_auth_token.length > 1)
            this.github_auth_token = this.github_auth_token.slice(1);

        this.github_https_path = repo_path_search || '';
        if(this.github_https_path.length > 1)
            this.github_https_path = 'https://github.com' + this.github_https_path.slice(1);
       
        this.compiler.onmessage = this.oncompilermessage;
        this.terminal.on('key', this.onkey.bind(this));
    }

    async purge_cache()
    {
        const cached_files = this.FS.readdir(this.cache_dir);
        for(const file_name of cached_files)
            if(file_name != '.' && file_name != '..')
                this.FS.unlink(this.cache_dir + '/' + file_name);
        await this.save_cache();
    }

    async load_cache()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(true, x => x == null ? resolve(true) : reject(false)));
    }
    
    async save_cache()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(false, x => x == null ? resolve(true) : reject(false)));
    }

    terminal_println(line)
    {
        this.terminal.write((line || '') + '\r\n');
    }

    terminal_prompt()
    {
        return this.terminal.write('\x1B[1;3;31memscripten\x1B[0m:' + this.pwd(true) + '$ ');
    }

    async onkey(key, ev)
    {
        const ok = 'ok!';
        if(ev.keyCode == 8)
        {
            if(this.current_terminal_line.length > 0)
            {
                this.current_terminal_line = this.current_terminal_line.slice(0, this.current_terminal_line.length - 1);
                this.terminal.write('\b \b');
            }
        }
        else if(ev.keyCode == 13)
        {
            this.terminal_println();
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
                else if(cmd == 'man')
                {
                    this.man();
                }
                else if(cmd == 'help')
                {
                    this.terminal_println(this.help().join(' '));
                }
                else if(cmd == 'download')
                {
                    this.download(arg);
                    this.terminal_println(ok);
                }
                else if(cmd == 'upload')
                {
                    this.terminal_println(await this.upload(arg));
                }
                else if(cmd == 'latexmk')
                {
                    await this.latexmk(arg);
                }
                else if(cmd == 'pwd')
                {
                    this.terminal_println(this.pwd());
                }
                else if(cmd == 'ls')
                {
                    const res = this.ls(arg);
                    if(res.length > 0)
                        this.terminal_println(res.join(' '));
                }
                else if(cmd == 'mkdir')
                {
                    this.mkdir(arg);
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
                    this.terminal_println(ok);
                }
                else if(cmd == 'open')
                {
                    this.open(arg);
                }
                else if(cmd == 'status')
                {
                    const files = this.ls_R('.');
                    await this.guthub.status(files);
                }
                else if(cmd == 'save')
                {
                    this.save(arg, this.editor.getModel().getValue());
                }
                else if(cmd == 'purge')
                {
                    await this.purge_cache();
                    this.terminal_println(ok);
                }
                else
                {
                    this.terminal_println(cmd + ': command not found');
                }
            }
            catch(err)
            {
                this.terminal_println('Error: ' + err.message);
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

    async run(busy)
    {
        this.compiler.postMessage(this.paths);
        
        await this.onload(busy);
        this.terminal_prompt();
    }

    tic()
    {
        this.tic_ = performance.now();
    }

    toc()
    {
        const elapsed = (performance.now() - this.tic_) / 1000.0;
        
        this.terminal_println(`Elapsed time: ${elapsed.toFixed(2)} sec`);
    }

    async onload(busy)
    {
        const Module = await busy(modularized(this.log));
        this.FS = Module.FS;
        this.FS.mkdir(this.cache_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.chdir(this.home_dir);
        this.guthub = new Guthub(this.FS, this.busy, this.github_auth_token, this.cache_dir, this.terminal_println.bind(this));
        await this.load_cache();
        if(this.github_https_path.length > 0)
        {
            const repo_path = await this.clone(this.github_https_path);
            this.cd(repo_path);
        }
    }

    open(file_path, contents)
    {
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
        //const expanduser = path => return path.replace('~', this.home_dir);
        this.FS.chdir(path);
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
                entries.push({path : relative_path}, ...this.ls_R(root, relative_path));
            else
                entries.push({path : relative_path, contents : this.FS.readFile(absolute_path, {encoding : 'binary'})});
        }
        return entries;
    }

    async latexmk(tex_path)
    {
        this.println('Running in background...');
        this.tic();
        this.pdf_path = tex_path.replace('.tex', '.pdf');
        this.log_path = log_path.replace('.tex', '.log');
        
        const cwd = this.FS.cwd();
        console.assert(tex_path.endsWith('.tex'));
        console.assert(cwd.startsWith(this.home_dir));
        
        const project_dir = cwd.split('/').slice(0, 4).join('/');
        const source_path = `${cwd}/${tex_path}`;
        const main_tex_path = source_path.slice(project_dir.length + 1);

        const files = this.ls_R(project_dir);
        this.compiler.postMessage({files : files, main_tex_path : main_tex_path});
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
          mime = mime || "application/octet-stream";

          let content = this.FS.readFile(file_path);
          this.ui.create_and_click_download_link(file_path, content, mime);
    }
    
    async clone(https_path)
    {
        const repo_path = https_path.split('/').pop();
        await this.guthub.clone(https_path, repo_path);
        await this.save_cache();
        return repo_path;
    }

    async push(relative_file_path)
    {
        await this.guthub.push(relative_file_path, 'guthub');
    }
}

function modularized(println)
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
            println(text);
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

