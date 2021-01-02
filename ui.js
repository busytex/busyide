import { Github } from '/github.js'
import { Busybox } from '/busybox.js'

export class Shell
{
    constructor(ui, paths, readme, terminal, editor, monaco, http_path)
    {
        this.monaco = monaco;
        this.http_path = http_path;
        this.share_link_log = '/tmp/share_link.log';
        this.home_dir = '/home/web_user';
        this.tmp_dir = '/tmp';
        this.OLDPWD = this.home_dir;
        this.cache_dir = '/cache';
        this.tex_ext = '.tex';
        this.readme_dir = this.home_dir + '/readme';
        this.readme_tex = this.readme_dir + '/readme.tex';
        this.hello_world = "\\documentclass[11pt]{article}\n\\begin{document}\n\n\\title{Hello}\n\\maketitle\n\n\\section{world}\nindeed!\n\n\\end{document}";

        this.shared_project = '/home/web_user/shared_project';
        this.pdf_path = '/tmp/pdf_does_not_exist_yet';
        this.log_path = '/tmp/log_does_not_exist_yet';
        this.edit_path = '/tmp/no_file_opened';
        this.tex_path = '';
        this.zip_path = '/tmp/archive.zip';
        this.arxiv_path = '/tmp/arxiv.downloaded';
        this.new_file_path = 'newfile.tex';
        this.new_dir_path = 'newfolder';
        this.current_terminal_line = '';
        this.text_extensions = ['.tex', '.bib', '.txt', '.md', '.svg', '.sh', '.py', '.csv'];
        this.busybox_applets = ['nanozip', 'bsddiff3prog', 'bsddiff', 'busybox', 'find', 'mkdir', 'pwd', 'ls', 'echo', 'cp', 'mv', 'rm', 'du', 'tar', 'touch', 'whoami', 'wc', 'cat', 'head', 'clear'];
        this.shell_builtins =  ['man', 'help', 'open', 'download', 'cd', 'purge', 'latexmk', 'git', 'clear_', 'share', 'upload'];
        this.git_applets = ['clone', 'pull', 'push', 'status'];
        this.shell_commands = this.shell_builtins.concat(this.busybox_applets).concat(this.git_applets.map(cmd => 'git ' + cmd)).sort();
        this.tic_ = 0;
        this.timer_delay_millisec = 1000;
        this.FS = null;
        this.PATH = null;
        this.github = null;
        this.terminal = terminal;
        this.editor = editor;
        this.ui = ui;
        this.paths = paths;
        this.compiler = new Worker(paths.busytex_worker_js);
        this.log_small = this.ui.log_small;
        this.log_big = this.ui.log_big;
        this.readme = readme;
        this.busybox = null;
        this.terminal_reset_sequence = '\x1bc';
        this.tabs = {};
        
        this.compiler.onmessage = this.oncompilermessage.bind(this);
        this.terminal.onKey(this.onkey.bind(this));

        const cmd = (...parts) => parts.join(' ');
        const arg = path => this.expandcollapseuser(path, false);
        const chain = (...cmds) => cmds.join(' && ');

        this.ui.clone.onclick = () => this.commands(chain('cd', cmd('git', 'clone', this.ui.github_https_path.value), cmd('open', this.PATH.join2('~', this.PATH.basename(this.ui.github_https_path.value))), cmd('cd', this.PATH.basename(this.ui.github_https_path.value))));
        this.ui.download_pdf.onclick = () => this.commands(cmd('download', arg(this.pdf_path)));
        this.ui.view_log.onclick = () => this.commands(cmd('open', arg(this.log_path)));
        this.ui.view_pdf.onclick = () => this.commands(cmd('open', arg(this.pdf_path)));
        this.ui.download.onclick = () => this.commands(cmd('download', arg(this.edit_path)));
        this.ui.upload.onclick = async () => await this.commands('upload');
        this.ui.download_zip.onclick = () => this.commands(chain('cd', cmd('nanozip', '-r', '-x', '.git', '-x', this.log_path, '-x', this.pdf_path, this.zip_path, this.PATH.basename(this.project_dir())), cmd('cd', '-'), cmd('download', arg(this.zip_path))));
        this.ui.compile.onclick = () => this.commands(cmd('latexmk', arg(this.tex_path)));
        this.ui.man.onclick = () => this.commands('man');
        this.ui.new_folder.onclick = () => this.commands(chain(cmd('mkdir', this.new_dir_path), cmd('open', this.new_dir_path)));
        this.ui.share.onclick = () => this.commands(chain(cmd('share', arg(this.project_dir()), '>', this.share_link_log), cmd('open', arg(this.share_link_log))));
        this.ui.new_file.onclick = () => this.commands(chain(cmd('echo', this.hello_world, '>', this.new_file_path), cmd('open', this.new_file_path)));
        this.ui.pull.onclick = () => this.commands(cmd('git', 'pull'));
        this.ui.github_https_path.onkeypress = this.ui.github_token.onkeypress = ev => ev.key == 'Enter' && this.ui.clone.click();
        this.ui.filetree.onchange = ev => {
            const option = this.ui.filetree.options[this.ui.filetree.selectedIndex];
            if(option.className == 'filetreedirectory')
            {
                this.open(option.value);
                if(option.text == '.git')
                    this.ui.filetree.ondblclick();
            }
            else
                this.open(option.value);
        }
        this.ui.filetree.ondblclick = ev => {
            const option = this.ui.filetree.options[this.ui.filetree.selectedIndex];
            if(option.className == 'filetreedirectory')
            {
                if(option.text == '.git')
                    this.git_status();
                else if(option.text == '.')
                    this.refresh();
                else
                    this.cd(option.value, true);
            }
        };
        this.ui.filetree.onkeydown = ev => ev.key == 'Enter' || ev.key == ' ' ? this.ui.filetree.ondblclick() : null;
        this.ui.current_file.onclick = () => this.ui.toggle_current_file_rename();
        this.ui.current_file_rename.onkeydown = ev => ev.key == 'Enter' ? (this.mv(this.ui.get_current_file(), this.ui.current_file_rename.value) || this.ui.set_current_file(this.ui.current_file_rename.value) || this.ui.toggle_current_file_rename()) : ev.key == 'Escape' ? (this.ui.set_current_file(this.ui.get_current_file()) || this.ui.toggle_current_file_rename()) : null;
		
		editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.Enter, this.ui.compile.onclick);

        this.interval_id = 0;
    }

    exists(path)
    {
        return this.FS.analyzePath(path).exists;
    }

    abspath(path)
    {
        return path.startsWith('/') ? path : this.PATH.join2(this.FS.cwd(), path);
    }

    isdir(path)
    {
        return this.FS.analyzePath(path).exists && this.FS.isDir(this.FS.lookupPath(path).node.mode);
    }

    dirty_timer(mode)
    {
        if(mode)
            this.interval_id = self.setInterval(this.save, this.timer_delay_millisec, this);
        else
        {
            self.clearInterval(this.interval_id);
            this.interval_id = 0;
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
            this.log_small(`Elapsed time: ${elapsed.toFixed(2)} sec`);
            this.tic_ = 0.0;
        }
    }

    async type(cmd)
    {
        for(const c of cmd)
            await this.onkey({key : c, domEvent: {key : null}});
        await this.onkey({key : '', domEvent: {key : 'Enter'}});
    }

    terminal_print(line, newline = '\r\n')
    {
        this.terminal.write((line || '') + newline);
    }

    terminal_prompt()
    {
        return this.terminal.write('\x1B[1;3;31mbusytex\x1B[0m:' + this.pwd(true) + '$ ');
    }
    
    async onkey({key, domEvent})
    {
        if(domEvent.key == 'Backspace')
        {
            if(this.current_terminal_line.length > 0)
            {
                this.current_terminal_line = this.current_terminal_line.slice(0, this.current_terminal_line.length - 1);
                this.terminal.write('\b \b');
            }
        }
        else if(domEvent.key == 'Enter')
        {
            this.terminal_print();
            await this.shell(this.current_terminal_line);
            this.terminal_prompt();
            this.current_terminal_line = '';
        }
        else
        {
            this.current_terminal_line += key;
            this.terminal.write(key);
        }
    }
    
    async commands(...cmds)
    {
        this.old_terminal_line = this.current_terminal_line;
        this.current_terminal_line = '';
        this.terminal.write('\b'.repeat(this.old_terminal_line.length));
        for(const cmd of cmds)
            await this.type(cmd);
        this.terminal.write(this.old_terminal_line);
        this.refresh();
    }

    async shell(current_terminal_line)
    {
        for(let cmdline of current_terminal_line.split('&&'))
        {
            let print_or_dump = (str, ...args) => this.terminal_print(str, ...args);
            let redirect_or_output = null;

            if(cmdline.includes('>'))
            {
                [cmdline, redirect_or_output] = cmdline.split('>');
                print_or_dump = str => this.FS.writeFile(redirect_or_output.trim(), str);
            }

            let [cmd, ...args] = cmdline.trim().split(' ');
            
            args = args.map(a => this.expandcollapseuser(a));
            
            try
            {
                if (cmd == '')
                {
                }
                else if(this.busybox_applets.includes(cmd))
                    print_or_dump(this.busybox.run([cmd, ...args]).stdout, '');
                else if(cmd == 'tabs')
                    print_or_dump(Object.keys(this.tabs).sort().join('\t'));
                else if(cmd == 'dirty')
                    this.ui.set_dirty(true);
                else if(cmd == 'stoptimer')
                    this.ui.timer();
                else if(cmd == 'help')
                    print_or_dump(this.shell_commands.join('\t'));
                else if(cmd == 'git' && args.length == 0)
                    this.terminal_print(this.git_applets.join('\t'));
                else if(cmd == 'git' && args.length > 0 && this.git_applets.includes(args[0]))
                    await this['git_' + args[0]](...args.slice(1));
                else if(this.shell_builtins.includes(cmd))
                    print_or_dump(await this[cmd](...args));
                else
                    this.terminal_print(cmd + ': command not found');
            }
            catch(err)
            {
                this.terminal_print('Error: ' + err.message);
            }
        }
    }

    async arxiv_clone(arxiv_https_path, cors_proxy_fmt = 'https://cors-anywhere.herokuapp.com/${url}')
    {
        const https_path = arxiv_https_path.replace('/abs/', '/e-print/');
        const repo_path = arxiv_https_path.split('/').pop();
        const project_dir = repo_path;
        
        this.terminal_print(`Downloading sources '${https_path}' into '${repo_path}'...`);
        const proxy_path = cors_proxy_fmt.replace('${url}', https_path);
        const resp = await fetch(proxy_path, {headers : {'X-Requested-With': 'XMLHttpRequest'}});
        const uint8array = new Uint8Array(await resp.arrayBuffer());
        this.FS.writeFile(this.arxiv_path, uint8array);
        //TODO: check for not found etc, resp 200 OK
        
        this.FS.mkdir(project_dir);
        this.busybox.run(['tar', '-xf', this.arxiv_path, '-C', project_dir]);

        return project_dir;
    }

    inline_clone(serialized)
    {
        const files = this.deserialize_project(serialized);
        project_dir = this.shared_project;
        this.FS.mkdir(project_dir)

        let dirs = new Set(['/', project_dir]);
        for(const {path, contents} of files.sort((lhs, rhs) => lhs['path'] < rhs['path'] ? -1 : 1))
        {
            const absolute_path = this.PATH.join2(project_dir, path);
            if(contents == null)
                this.mkdir_p(absolute_path, dirs);
            else
            {
                this.mkdir_p(this.PATH.dirname(absolute_path));
                this.FS.writeFile(absolute_path, contents);
            }
        }
        return project_dir;
    }

    async init(route, github_https_path)
    {
        let project_dir = null;

        if(github_https_path.length > 0)
        {
            project_dir = await this.git_clone(this.ui.github_https_path.value);
        }
        else if(route[0] == 'arxiv')
        {
            project_dir = await this.arxiv_clone(route[1]);
        }
        else if(route[0] == 'inline')
        {
            project_dir = this.inline_clone(route[1]);
        }
        if(project_dir != null)
        {
            this.open(project_dir);
            this.cd(project_dir, true);
        }
    }

    async run(route, busybox_module_constructor, busybox_wasm_module_promise, sha1)
    {
        if(route.length > 1 && route[0] == 'github')
            this.ui.github_https_path.value = route[1];
       
        this.compiler.postMessage(this.paths);
        this.busybox = new Busybox(busybox_module_constructor, busybox_wasm_module_promise, this.log_small.bind(this));
        await this.busybox.load()
        
        this.PATH = this.busybox.Module.PATH;
        this.FS = this.busybox.Module.FS;
        this.FS.mkdir(this.readme_dir);
        this.FS.mkdir(this.cache_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.writeFile(this.readme_tex, this.readme);
        this.FS.chdir(this.home_dir);
        this.github = new Github(sha1, this.FS, this.cache_dir, this.merge.bind(this), this.log_big.bind(this));
        await this.load_cache();
        if(this.ui.github_https_path.value.length > 0 || route.length > 1)
            await this.init(route, this.ui.github_https_path.value);
        else
            this.man();
       
        this.dirty_timer(true);
        this.terminal_prompt();
    }
   
    log_big_header(text)
    {
        this.ui.toggle_viewer('text');
        this.log_big(this.ui.log_reset_sequence);
        this.log_big(text);
    }

    async git_clone(https_path)
    {
        this.log_big_header('[git clone]'); 
        
        const token = this.ui.github_token.value;
        const route = https_path.split('/');

        let repo_path = route.pop();
        if(https_path.includes('gist.github.com'))
        {
            const gistname = repo_path;
            this.terminal_print(`Cloning from '${https_path}' into '${repo_path}'...`);
            await this.github.clone_gist(token, gistname, repo_path);
        }
        else
        {
            repo_path = route.pop();
            this.terminal_print(`Cloning from '${https_path}' into '${repo_path}'...`);
            await this.github.clone_repo(token, https_path, repo_path);
        }
        await this.save_cache();
        this.ui.set_route('github', https_path);
        return repo_path;
    }

    git_status()
    {
        this.log_big_header('[git status]');
        
        return this.github.status(this.ls_R('.', '', true, true, false, false));
    }

    git_pull()
    {
        this.log_big_header('[git pull]');
        
        return this.github.pull();
    }
    
    git_push(...args)
    {
        this.log_big_header('[git push]');
        return this.github.push_gist(...args) ? "ok!" : "error!";
    }

    serialize_project(project_dir)
    {
        //TODO: filter out artefacts
        return btoa(JSON.stringify(this.ls_R(project_dir)));
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

    async purge_cache()
    {
        const cached_files = this.FS.readdir(this.cache_dir);
        for(const file_name of cached_files)
            if(file_name != '.' && file_name != '..')
                this.FS.unlink(this.cache_dir + '/' + file_name);
        await this.save_cache();
    }

    oncompilermessage(e)
    {
        const {pdf, log, print} = e.data;
        if(pdf)
        {
            this.toc();
            this.mkdir_p(this.PATH.dirname(this.pdf_path));
            this.FS.writeFile(this.pdf_path, pdf);
            this.open(this.pdf_path, pdf);
        }
        if(log)
        {
            this.toc();
            this.mkdir_p(this.PATH.dirname(this.log_path));
            this.FS.writeFile(this.log_path, log);
        }
        if(print)
        {
            this.log_small(print);
        }
    }

    project_dir(four = '/home/web_user/proj'.split('/').length)
    {
        const cwd = this.PATH.dirname(this.tex_path)
        const project_dir = cwd.split('/').slice(0, four).join('/');
        return project_dir;
    }

    project_tmp_dir()
    {
        return this.project_dir().replace(this.home_dir, this.tmp_dir);
    }

    open_find_default_path(file_path)
    {
        const tex_files = this.ls_R(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext));
        let default_path = null;
        if(tex_files.length == 1)
            default_path = tex_files[0].path;
        else if(tex_files.length > 1)
        {
            const main_tex_files = this.ls_R(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext) && f.path.includes('main'));
            default_path = main_tex_files.length > 0 ? main_tex_files[0].path : tex_files[0].path;
        }
        if(default_path == null)
        {
            const text_files = this.ls_R(file_path, '', false).filter(f => f.contents != null && this.text_extensions.map(ext => f.path.endsWith(ext)).includes(true));
            if(text_files.length == 1)
                default_path = text_files[0].path;
            else if(text_files.length > 1)
            {
                const main_text_files = this.ls_R(file_path, '', false).filter(f => f.contents != null && f.path.toUpperCase().includes('README'));
                default_path = main_text_files.length > 0 ? main_text_files[0].path : text_files[0].path;
            }
        }
        return default_path;
    }

    open(file_path, contents)
    {
        const open_editor_tab = (file_path, contents) =>
        {
            const abspath = this.abspath(file_path);
            this.edit_path = abspath;

            if(!(abspath in this.tabs))
                this.tabs[abspath] = this.monaco.editor.createModel(contents, undefined, this.monaco.Uri.file(abspath));

            const editor_model = this.tabs[abspath];
            editor_model.setValue(contents);
            this.editor.setModel(editor_model);
            //var currentState = this.editor.saveViewState();
            //this.editor.restoreViewState(data[desiredModelId].state);
            //this.editor.focus();
        };

        if(file_path == '')
        {
            this.tex_path = '';
            this.ui.txtpreview.value = '';
            this.ui.set_current_file('');
            open_editor_tab('', '');
            this.ui.toggle_viewer('text');
            return;
        }
        else if(file_path != null)
        {
            file_path = this.expandcollapseuser(file_path);
            if(file_path != null && this.isdir(file_path))
            {
                const default_path = this.open_find_default_path(file_path);
                if(default_path == null)
                {
                    this.ui.set_current_file(this.PATH.basename(file_path));
                    open_editor_tab('', '');
                    file_path = null;
                }
                else
                    file_path = this.PATH.join2(file_path, default_path); 
            }
        }

        if(file_path == null && contents == null)
            return;

        if(file_path.endsWith('.tex'))
            this.tex_path = file_path.startsWith('/') ? file_path : (this.FS.cwd() + '/' + file_path);

        if(file_path.endsWith('.pdf') || file_path.endsWith('.jpg') || file_path.endsWith('.png') || file_path.endsWith('.svg') || file_path.endsWith('.log'))
        {
            contents = contents || (file_path.endsWith('.log') ? this.FS.readFile(file_path, {encoding: 'utf8'}) : this.FS.readFile(file_path, {encoding : 'binary'}));
            const b64encode = uint8array => btoa(uint8array.reduce((acc, i) => acc += String.fromCharCode.apply(null, [i]), ''));
            if(file_path.endsWith('.log'))
            {
                this.ui.txtpreview.value = contents;
                this.ui.toggle_viewer('text');
            }
            else if(file_path.endsWith('.svg'))
            {
                this.ui.imgpreview.src = 'data:image/svg+xml;base64,' + b64encode(contents);
                this.ui.toggle_viewer('image');
            }
            else if(file_path.endsWith('.png') || file_path.endsWith('.jpg'))
            {
                const ext = file_path.endsWith('.png') ? 'png' : 'jpg';
                this.ui.imgpreview.src = `data:image/${ext};base64,` + b64encode(contents);
                this.ui.toggle_viewer('image');
            }
            else if(file_path.endsWith('.pdf'))
            {
                this.ui.pdfpreview.src = URL.createObjectURL(new Blob([contents], {type: 'application/pdf'}));
                this.ui.toggle_viewer('pdf');
            }
        }
        else
        {
            contents = contents || this.FS.readFile(file_path, {encoding : 'utf8'});
            this.ui.set_current_file(this.PATH.basename(file_path));
            open_editor_tab(file_path, contents);
        }
    }

    save(busyshell)
    {
        for(const abspath in busyshell.tabs)
            busyshell.FS.writeFile(abspath, busyshell.tabs[abspath].getValue());
        busyshell.ui.set_dirty(false);
    }

    man()
    {
        this.cd(this.readme_dir, true);
        this.open(this.readme_tex, this.readme);
    }
    
    share(project_dir)
    {
        const serialized_project_str = this.serialize_project(project_dir);
        return `${this.http_path}/#inline/${serialized_project_str}`;
    }

    archive(project_dir)
    {
        return this.busybox.run(['nanozip', '-r', '-x', '.git', '-x', this.log_path, '-x', this.pdf_path, this.zip_path, project_dir]).stdout;
    }
    
    clear_(ansi_clear_sequence = '\x1b[H\x1b[J')
    {
        this.terminal.write(this.terminal_reset_sequence);
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
        this.pdf_path = tex_path.replace('.tex', '.pdf').replace(this.project_dir(), this.project_tmp_dir());
        this.log_path = tex_path.replace('.tex', '.log').replace(this.project_dir(), this.project_tmp_dir());
        
        console.assert(tex_path.endsWith('.tex'));
        console.assert(cwd.startsWith(this.home_dir));
        
        const project_dir = cwd.split('/').slice(0, 4).join('/');
        const source_path = tex_path.startsWith('/') ? tex_path : `${cwd}/${tex_path}`;
        const main_tex_path = source_path.slice(project_dir.length + 1);

        const files = this.ls_R(project_dir);
        this.compiler.postMessage({files : files, main_tex_path : main_tex_path, verbose : verbose});
    }

    async upload(file_path = null)
    {
        const fileupload = this.ui.fileupload;
        if(file_path != null)
            fileupload.removeAttribute('multiple');
        else
            fileupload.setAttribute('multiple', 'true');

        let log = '';

        const onloadend = ev => {
            const reader = ev.target;
            const dst_path = file_path || reader.chosen_file_name;
            this.FS.writeFile(dst_path, new Uint8Array(reader.result));
            log += `Local file [${reader.chosen_file_name}] uploaded into [${dst_path}]\r\n`;
        };
        
        return new Promise((resolve, reject) =>
        {
            fileupload.onchange = () =>
            {
                for(const file of fileupload.files)
                {
                    const reader = new FileReader();
                    reader.chosen_file_name = file.name;
                    reader.onloadend = onloadend;
                    reader.readAsArrayBuffer(file);
                }
                resolve(log);
            };
            fileupload.click();
        });
    }

    download(file_path, mime)
    {
        if(!this.FS.analyzePath(file_path).exists)
            return;

        mime = mime || 'application/octet-stream';
        let content = this.FS.readFile(file_path);
        this.ui.create_and_click_download_link(this.PATH.basename(file_path), content, mime);
    }
    
    merge(ours_path, theirs_path, parent_path, df13_diff = '/tmp/df13.diff', df23_diff = '/tmp/df23.diff', conflict_left = '<<<<<<<', conflict_right = '>>>>>>>')
    {
        const [f1, f2, f3] = [ours_path, parent_path, theirs_path];
        this.FS.writeFile(df13_diff, this.busybox.run(['bsddiff', f1, f3]).stdout_);
        this.FS.writeFile(df23_diff, this.busybox.run(['bsddiff', f2, f3]).stdout_);
        const edscript = this.busybox.run(['bsddiff3prog', '-E', df13_diff, df23_diff, f1, f2, f3]).stdout_ + 'w';
        this.busybox.run(['ed', ours_path], edscript);
        //const merged = FS.readFile(ours_path, {encoding : 'utf8'});
        return edscript.includes(conflict_left) && edscript.includes(conflict_right);
    }

    ls_R(root = '.', relative_dir_path = '', recurse = true, preserve_directories = false, include_dot_directories = false, read_contents_as_string = true, exclude = ['.git'])
    {
        let entries = [];
        if(include_dot_directories)
        {
            entries.push({path : relative_dir_path || root, name : '.'});
            entries.push({path : this.PATH.dirname(relative_dir_path || root), name : '..'});
        }
        const absolute_dir_path = this.expandcollapseuser(this.PATH.join2(root, relative_dir_path))
        for(const [name, entry] of Object.entries(this.FS.lookupPath(absolute_dir_path, {parent : false}).node.contents))
        {
            const relative_path = relative_dir_path ? this.PATH.join2(relative_dir_path, name) : name;
            const absolute_path = this.expandcollapseuser(this.PATH.join2(root, relative_path));
            if(entry.isFolder)
            {
                if(!exclude.includes(name))
                {
                    if(preserve_directories)
                        entries.push({path : relative_path, name : name});
                    if(recurse)
                        entries.push(...this.ls_R(root, relative_path, recurse, preserve_directories, include_dot_directories, read_contents_as_string, exclude));
                }
            }
            else if(absolute_path != this.log_path && absolute_path != this.pdf_path)
            {
                entries.push({path : relative_path, name : name, contents : this.FS.readFile(absolute_path, {encoding : read_contents_as_string && this.text_extensions.map(ext => absolute_path.endsWith(ext)).includes(true) ? 'utf8' : 'binary'})});
            }
        }
        return entries;
    }

    refresh(extra_files = [])
    {
        this.ui.update_file_tree(this.ls_R('.', this.pwd(true), false, true, true, true, []).concat(extra_files));

        for(const abspath in this.tabs)
        {
            if(!this.FS.analyzePath(abspath).exists)
            {
                this.tabs[abspath].dispose();
                delete this.tabs[abspath];
            }
        }
    }

    cd(path, refresh = true)
    {
        if(path == '-')
            path = this.OLDPWD;

        this.OLDPWD = this.FS.cwd();
        this.FS.chdir(this.expandcollapseuser(path || '~'));
        if(refresh)
            this.refresh();
    }

    pwd(replace_home)
    {
        const cwd = this.FS ? this.FS.cwd() : this.home_dir;
        return replace_home == true ? cwd.replace(this.home_dir, '~') : cwd;    
    }
    
    expandcollapseuser(path, expand = true)
    {
        return expand ? path.replace('~', this.home_dir) : path.replace(this.home_dir, '~');
    }
    
    mkdir_p(dirpath, dirs = new Set(['/']))
    {
        if(!dirs.has(dirpath) && !this.FS.analyzePath(dirpath).exists)
        {
            this.mkdir_p(this.PATH.dirname(dirpath), dirs);
            this.FS.mkdir(dirpath);
            dirs.add(dirpath);
        }
    }

    mv(src_file_path, dst_file_path)
    {
        const src_abspath = this.abspath(src_file_path), dst_abspath = this.abspath(dst_file_path);
        if(src_abspath == dst_abspath)
            return;

        this.dirty_timer(false);
        this.FS.rename(src_file_path, dst_file_path);
        if(this.tabs[dst_abspath])
            this.tabs[dst_abspath].dispose();
        this.tabs[dst_abspath] = this.tabs[src_abspath];
        delete this.tabs[src_abspath];
        this.refresh();
        this.dirty_timer(true);
    }
}

