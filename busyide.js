import { Github } from '/github.js'
import { Busybox } from '/busybox.js'

export class Shell
{
    constructor(monaco, ui, paths, readme, versions, terminal, editor, difftool, cors_proxy_fmt = 'https://withered-shape-3305.vadimkantorov.workers.dev/?${url}')
    {
        this.monaco = monaco;
        this.ctan_package_path = 'https://www.ctan.org/json/2.0/pkg/';
        this.ctan_texlive_archive_pattern = 'https://mirrors.ctan.org/systems/texlive/tlnet/archive/${PKG}.tar.xz';
        this.ctan_archive_pattern = 'https://mirrors.ctan.org/${PKG}.zip';
        this.share_link_log = '/tmp/share_link.log';
        this.shared_project_tar = '/tmp/shared_project.tar';
        this.shared_project_targz = this.shared_project_tar + '.gz';
        this.home_dir = '/home/web_user';
        this.tmp_dir = '/tmp';
        this.tmp_decompressed = this.tmp_dir + '/decompressed';
        this.tmp_file = this.tmp_dir + '/tmpfile.bin';
        this.OLDPWD = this.home_dir;
        this.cache_dir = '/cache';
        this.cached_tokens_jsonl = this.cache_dir + '/cached_tokens.jsonl';
        this.tex_ext = '.tex';
        this.readme_dir = this.home_dir + '/readme';
        this.readme_tex = this.readme_dir + '/README.tex';
        this.versions_txt = this.readme_dir + '/versions.txt';
        this.hello_world = "\\documentclass[11pt]{article}\n\\begin{document}\n\n\\title{Hello}\n\\maketitle\n\n\\section{world}\nindeed!\n\n\\end{document}";

        this.shared_project = this.home_dir + '/shared_project';
        this.pdf_path = null;
        this.log_path = null;
        this.edit_path = null;
        this.view_path = null;
        this.tex_path = '';
        this.zip_path = this.tmp_dir + '/archive.zip';
        this.tar_path = this.tmp_dir + '/archive.tar';
        this.tar_xz_path = this.tmp_dir + '/archive.tar.xz';
        this.targz_path = this.tmp_dir + '/archive.tar.gz';
        this.arxiv_path = this.tmp_dir + '/arxiv.tar';
        this.patch_path = this.tmp_dir + '/uploaded.patch';
        this.git_log = this.tmp_dir + '/git.log';
        this.big_log = this.tmp_dir + '/big.log';
        this.small_log = this.tmp_dir + '/small.log';
        this.git_dir = this.home_dir.replace('home', '.git');
        this.empty_file = '/etc/empty';
        this.new_file_name = 'newfile';
        this.new_file_ext = '.tex';
        this.new_dir_name = 'newfolder';
        this.log_big_sink_path = null;
        this.log_small_sink_path = this.small_log;
        this.current_terminal_line = '';
        this.data_uri_prefix_tar_gz = 'data:application/tar+gzip;base64,';
        this.texmf_local = ['texmf', '.texmf'];
        this.archive_extensions = ['.zip', '.tar.gz', '.tar'];
        this.text_extensions = ['.tex', '.bib', '.sty', '.bst', '.bbl', '.txt', '.md', '.svg', '.sh', '.py', '.csv', '.tsv', '.eps', '.xml', '.json', '.md', '.r', '.c', '.cpp', '.h', '.js', '.html'];
        this.search_extensions = ['', '.tex', '.bib', '.sty', '.txt', '.md', '.sh', '.py', '.xml', '.json', '.md', '.r', '.c', '.cpp', '.h', '.js', '.html'];
        this.busybox_applets = ['busyz', 'bsddiff3prog', 'bsddiff', 'busybox', 'find', 'mkdir', 'pwd', 'ls', 'echo', 'cp', 'rm', 'du', 'tar', 'touch', 'wc', 'cat', 'head', 'clear', 'gzip', 'base64', 'sha1sum', 'whoami', 'sed', 'true', 'false', 'seq', 'patch', 'grep', 'test', 'xxd', 'xz', 'hexdump', 'unxz', 'mv'];
        this.shell_builtins =  ['cd', 'rename', 'man', 'help', 'open', 'close', 'download', 'purge', 'latexmk', 'git', 'upload', 'wget', 'init', 'dirty', 'hub', 'rgrep', 'tlmgr'];
        this.cache_applets = ['object', 'token'];
        this.git_applets = ['clone', 'pull', 'push', 'status', 'difftool', 'diff', 'fetch', 'checkout'];
        this.hub_applets = ['release'];
        this.viewer_extensions = ['.log', '.png', '.jpg', '.bmp', '.svg', '.pdf'];
        this.editor_extensions = ['', '.svg', ...this.text_extensions];
        this.shell_commands = [...this.shell_builtins, ...this.busybox_applets, ...this.git_applets.map(cmd => 'git ' + cmd), ...this.cache_applets.map(cmd => 'cache ' + cmd)].sort();
        this.tic_ = 0;
        this.timer_delay_millisec = 1000;
        this.dirty_mode = 'timer_save';
        this.FS = null;
        this.PATH = null;
        this.github = null;
        this.terminal = terminal;
        this.editor = editor;
        this.difftool = difftool;
        this.ui = ui;
        this.paths = paths;
        
        this.readme = readme;
        this.versions = versions;
        this.busybox = null;
        this.refresh_cwd = null;
        this.terminal_reset_sequence = '\x1bc';
        this.tab = null;
        this.interval_id = 0;
        this.HTTP_OK = 200;
        this.HTTP_FORBIDDEN = 403;
        this.EXIT_SUCCESS = '0';
        this.EXIT_FAILURE = '1';
        this.last_exit_code = this.EXIT_SUCCESS;
        this.cors_proxy_fmt = cors_proxy_fmt;
        
        this.cancel_file_upload = null;
        
        this.cmd = (...parts) => parts.join(' ');
        this.qq = (x = '') => '"' + x + '"';
        this.qx = (x = '') => '`' + x + '`';
        this.arg = path => this.qq(this.expandcollapseuser(path, false));
        this.and = (...cmds) => cmds.join(' && ');
        this.or = (...cmds) => cmds.join(' || ');

        this.sha1 = uint8array => this.busybox.run(['sha1sum'], uint8array).stdout.substring(0, 40);
        this.rm_rf = dirpath => this.busybox.run(['rm', '-rf', dirpath]);
        this.diff = (abspath, basepath, cwd) => this.busybox.run(['bsddiff', '-Nu', this.exists(basepath) && basepath != '/dev/null' ? basepath : this.empty_file, this.exists(abspath) && abspath != '/dev/null' ? abspath : this.empty_file]).stdout; // TODO: get newer diff from FreeBSD: https://bugs.freebsd.org/bugzilla/show_bug.cgi?id=233402

        this.read_all_text  = path => this.exists(path) ? this.FS.readFile(path, {encoding : 'utf8' }) : '';
        this.read_all_bytes = path => this.FS.readFile(path, {encoding : 'binary'});
        this.expandcollapseuser = (path, expand = true) => expand ? path.replace('~', this.home_dir) : path.replace(this.home_dir, '~');
        this.exists = path => path ? this.FS.analyzePath(path).exists : false;
        this.abspath = path => path.startsWith('/') ? path : this.PATH.normalize(this.PATH.join(this.FS.cwd(), path));
        this.isdir = path => this.exists(path) && this.FS.isDir(this.FS.lookupPath(path).node.mode);

        
        this.data_package_resolver = new BusytexDataPackageResolver(this.paths.texlive_data_packages_js, BusytexPipeline.texmf_system, this.texmf_local);
        this.compiler = new Worker(paths.busytex_worker_js);
        this.busytex_applet_versions = {};
        this.is_special_dir = abspath => [this.FS.cwd(), this.PATH.normalize(this.PATH.join(this.FS.cwd(), '..'))].includes(abspath);
        this.is_user_dir = (abspath, strict = true) => abspath.startsWith(this.home_dir + '/') || (!strict && abspath == this.home_dir);
    }

    bind()
    {
        const {cmd, arg, and, or, qq, qx, is_special_dir, is_user_dir} = this;
        const swap_value = (input, val = '') => {
            const old = input.value;
            input.value = val;
            return old;
        };
        
        self.onfocus = () => this.cancel_file_upload ? this.cancel_file_upload() : null;
        
        this.compiler.onmessage = this.oncompilermessage.bind(this);
        this.terminal.onKey(this.onkey.bind(this));

        this.ui.man.onclick = () => this.commands('man');
        this.ui.search.onclick = () => this.project_dir() && this.ui.search_query.value && this.commands(cmd('rgrep', qq(this.ui.search_query.value)));
        this.ui.apply_patch.onclick = () => this.project_dir() && this.commands(and(cmd('upload', arg(this.patch_path)), cmd('cd', arg(this.project_dir())), cmd('patch', '-p1', '-i', arg(this.patch_path)), cmd('cd', '-')));
        this.ui.clone.onclick = () => this.ui.github_https_path.value && this.commands(and('cd', cmd('git', 'clone', this.ui.github_https_path.value), cmd('cd', this.PATH.join('~', this.PATH.basename(this.ui.github_https_path.value))), cmd('open', '.')) );
        this.ui.download_diff.onclick = () => { if(!this.github.git_dir()) return null; const diff_path = this.PATH.join(this.tmp_dir, this.github.propose_diff_file_name()); return this.commands(and(cmd('git', 'diff', 'HEAD', '--output', arg(diff_path)), cmd('download', arg(diff_path)))); };
        this.ui.download_pdf.onclick = () => this.exists(this.pdf_path) && this.commands(cmd('download', arg(this.pdf_path)));
        this.ui.cache_purge.onclick = () => this.commands(and(cmd('cache', 'token', 'purge'), cmd('cache', 'object', 'purge')));
        this.ui.view_log.onclick = () => this.exists(this.log_path) && this.commands(cmd('open', arg(this.log_path)));
        this.ui.view_pdf.onclick = () => this.exists(this.pdf_path) && this.commands(cmd('open', arg(this.pdf_path)));
        this.ui.release_pdf.onclick = () => this.exists(this.pdf_path) && this.commands( cmd('hub', 'release', 'create', 'busytex'), cmd('hub', 'release', 'edit', '-a', this.pdf_path, 'busytex') ); // or() this.pdf_path && https://hub.github.com/hub-release.1.html
        this.ui.download.onclick = () => this.ui.get_current_file() && !this.isdir(this.ui.get_current_file()) && this.commands(cmd('download', arg(this.ui.get_current_file())));
        this.ui.upload.onclick = async () => await this.commands('upload');
        this.ui.import_project.onclick = this.import_project.bind(this);
        this.ui.download_zip.onclick = () => this.project_dir() && this.commands(and('cd', cmd('busyz', 'zip', '-r', this.zip_path, this.PATH.basename(this.project_dir())), cmd('cd', '-'), cmd('download', arg(this.zip_path))));
        this.ui.download_targz.onclick = () => this.project_dir() && this.commands(and(cmd('tar', '-C', arg(this.PATH.dirname(this.project_dir())), '-cf', this.tar_path, this.PATH.basename(this.project_dir())), cmd('gzip', arg(this.tar_path)), cmd('download', arg(this.targz_path))));
        this.ui.strip_comments.onclick = () => this.project_dir() && this.commands(cmd( 'sed', '-i', '-e', qq('s/^\\([^\\]*\\)\\(\\(\\\\\\\\\\)*\\)%.*/\\1\\2%/g'), qx(cmd('find', arg(this.project_dir()), '-name', qq('*.tex')) )));
        this.ui.flatten_texmf.onclick = () => this.project_dir() && this.exists(this.texmf_local[0]) && this.isdir(this.texmf_local[0]) && this.commands(this.and(cmd('mv', qx(cmd('find', this.texmf_local[0], '-type', 'f')), '.'), cmd('find', this.texmf_local[0], '-empty', '-delete')));
        this.ui.compile_project.onclick = () => this.project_dir() && this.ui.get_current_tex_path() && this.commands(cmd('latexmk', arg(this.ui.get_current_tex_path())));
        this.ui.compile_current_file.onclick = () => (this.ui.get_current_file() || '').endsWith('.tex') && !this.isdir(this.ui.get_current_file()) && this.commands(cmd('latexmk', arg(this.ui.get_current_file())));
        
        this.ui.share.onclick = () => this.share_onclick(); 
        this.ui.show_not_modified.onclick = this.ui.toggle_not_modified.bind(this);
        this.ui.show_tex_settings.onclick = async () => this.ui.update_tex_settings(await this.data_package_resolver.resolve_data_packages()) || this.ui.toggle_viewer('texsettings');

        this.ui.new_file.onclick = () =>
        {
            if(!is_user_dir(this.FS.cwd()))
                return;

            const new_path = this.new_file_path(this.new_file_name, this.new_file_ext);
            this.commands(and(cmd('echo', '-e', qq(this.hello_world.replaceAll('\\', '\\\\').replaceAll('\n', '\\n')), '>', new_path), cmd('open', new_path)));
        }
        this.ui.new_folder.onclick = () => 
        {
            if(!is_user_dir(this.FS.cwd(), false))
                return;

            const new_path = this.new_file_path(this.new_dir_name);
            this.commands(and(cmd('mkdir', new_path), cmd('open', new_path)));
        }

        this.ui.gitops.onclick = () => this.github.git_dir() && this.commands(cmd('git', 'status'));
        this.ui.refresh_fetch.onclick = () => this.commands(cmd('git', 'fetch'));
        this.ui.pull.onclick = () => this.commands(cmd('git', 'pull'));
        this.ui.commit_push.onclick = () => this.commands(cmd('git', 'push'));
        this.ui.commit_push_new_branch.onclick = () => this.commands(and(cmd('git', 'checkout', '-b', this.github.propose_new_branch_name()), cmd('git', 'push')));

        this.ui.github_https_path.onkeypress = this.ui.github_branch.onkeypress = this.ui.github_token.onkeypress = ev => ev.key == 'Enter' ? this.ui.clone.click() : null;
        this.ui.filetree.onchange = ev => this.open(this.expandcollapseuser(this.ui.get_selected_file_path() || '', false));

        this.ui.filetree.ondblclick = ev => this.filetree_onclick(ev);
        
        this.ui.rename.onclick = () => this.rename_onclick();
        this.ui.current_file_rename.onblur = () => this.ui.toggle_current_file_rename('');
        this.ui.current_file_rename.onkeydown = ev => ev.key == 'Enter' ? this.ui.rename.onclick() : ev.key == 'Escape' ? ev.target.onblur() : null;
        this.ui.remove.onclick = () => (!is_special_dir(this.ui.get_current_file(true)) && is_user_dir(this.ui.get_current_file(true))) && this.ui.get_current_file() && this.commands(and(this.isdir(this.ui.get_current_file()) ? cmd('rm', '-rf', arg(this.ui.get_current_file())) : cmd('rm', arg(this.ui.get_current_file())), cmd('open', '.'))); 
        
        this.ui.search_query.onkeydown = ev => ev.key == 'Enter' ? this.ui.search.onclick() : ev.key == 'Escape' ? (this.ui.search_query.value = '') : null;
        
        this.ui.install_tex_package.onclick = () => this.project_dir() && this.ui.current_tex_package.value && this.tlmgr('install', '--no-depends-at-all', swap_value(this.ui.current_tex_package)); //TODO: problems with terminal because of nested commands calls this.commands(cmd('tlmgr', 'install', '--no-depends-at-all', swap_value(this.ui.current_tex_package)));
        this.ui.current_tex_package.onkeydown = ev => ev.key == 'Enter' ? this.ui.install_tex_package.onclick() : ev.key == 'Escape' ? (this.ui.current_tex_package.value = '') : null;
		
        this.editor.onDidFocusEditorText(ev => this.edit_path && this.ui.set_current_file(this.PATH.basename(this.edit_path), this.edit_path, 'editing'));
        this.ui.txtpreview.onfocus = this.ui.imgpreview.onclick = () => this.view_path && this.ui.set_current_file(this.PATH.basename(this.view_path), this.view_path, 'viewing');
		this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.Enter, this.ui.compile_project.onclick);
		this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyMod.Shift | this.monaco.KeyCode.Enter, this.ui.compile_current_file.onclick);
		this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyMod.Shift | this.monaco.KeyCode.KEY_F, () => this.ui.search_query.focus());
		this.difftool.addCommand(this.monaco.KeyCode.Escape, () => this.ui.toggle_editor('editor'), '!findWidgetVisible && !inReferenceSearchEditor && !editorHasSelection'); 
        this.ui.filetree.onkeydown = ev => (ev.key == 'Enter' || ev.key == ' ') ? this.ui.filetree.ondblclick({target: this.ui.filetree.options[this.ui.filetree.selectedIndex]}) : ev.key == 'Delete' ? this.ui.remove.onclick() : null;
        
        this.ui.status.ondblclick = () => this.commands(cmd('open', this.log_small_sink_path)); 
    }

    filetree_onclick(ev)
    {
        const {arg, cmd, and} = this;
        const option = ev.target; 
        if(this.ui.isdir(option))
        {
            const samedir = option.text == '.', parentdir = option.text == '..';
            if(samedir)
                this.refresh();
            else
            {
                // TODO: open .. does not open a single tex file for some reason? go to cv/texmf and then ..
                this.commands(parentdir ? and(cmd('open', '..'), cmd('cd', '..')) : and(cmd('cd', arg(option.value)), cmd('open', '.')));
            }
        }
    };

    share_onclick()
    {
        // TODO: share multiple variants: short, full
        // TODO: remove newlines? newlines present even with base64 -w? for arxiv case
        const {arg, cmd, and} = this;
        if(this.github.git_dir())
        {
            this.log_big_header('');
            this.log_big(this.ui.get_origin() + '/#' + this.github.format_url() );
        }
        else if(this.project_dir())
        {
            const cmds = [
                cmd('tar', '-C', arg(this.PATH.dirname(this.project_dir())), '-cf', this.shared_project_tar, this.PATH.basename(this.project_dir())), 
                cmd('gzip', this.shared_project_tar), 
                cmd('echo', '-n', this.ui.get_origin() + '/#' + this.data_uri_prefix_tar_gz, '>', this.share_link_log), 
                cmd('base64', '-w', '0', this.shared_project_targz, '>>', this.share_link_log), 
                cmd('open', arg(this.share_link_log))
            ];
            this.commands(and(...cmds));
        }
    }

    rename_onclick()
    {
        //TODO: clicking on rename twice should make the box disappear
        const curfile = this.ui.get_current_file(true);
        if(!this.is_special_dir(curfile) && this.is_user_dir(curfile))
        {
            if(this.ui.current_file_rename.value)
            {
                this.rename(this.ui.get_current_file(), this.ui.current_file_rename.value);
                this.ui.set_current_file(this.ui.current_file_rename.value, this.abspath(this.ui.current_file_rename.value));
                this.ui.toggle_current_file_rename('');
            }
            else
            {
                this.ui.toggle_current_file_rename(this.ui.current_file_rename.hidden ? this.ui.get_current_file() : '');
                this.ui.current_file_rename.focus();
            }
        }
    }

    new_file_path(prefix, ext = '', max_attempts = 1000)
    {
        for(let i = 0; i < max_attempts; i++)
        {
            const path = prefix + (i == 0 ? '' : i.toString()) + ext;
            if(!this.exists(path))
                return path;
        }
        throw new Error(`Cannot create new [${prefix}{ext}]`);
    }

    dirty(mode)
    {
        if(mode == 'timer_save')
        {
            this.dirty('timer_off');
            this.interval_id = self.setInterval(this.tabs_save, this.timer_delay_millisec, this);
            this.dirty_mode = mode;
        }
        if(mode == 'timer_load')
        {
            this.dirty('timer_off');
            this.interval_id = self.setInterval(this.tabs_load, this.timer_delay_millisec, this);
            this.dirty_mode = mode;
        }
        else if(mode == 'timer_off')
        {
            self.clearInterval(this.interval_id);
            this.interval_id = 0;
            this.dirty_mode = mode;
        }

        return this.dirty_mode;
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

    terminal_prompt(red_begin_sequence = '\x1B[1;3;31m', red_end_sequence = '\x1B[0m')
    {
        return this.terminal.write(`${red_begin_sequence}busytex${red_end_sequence}:` + this.pwd(true) + '$ ');
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
        this.tabs_save(this);
        this.dirty('timer_off');

        this.old_terminal_line = this.current_terminal_line;
        this.current_terminal_line = '';
        this.terminal.write('\b'.repeat(this.old_terminal_line.length));
        for(const cmd of cmds)
            await this.type(cmd);
        this.terminal.write(this.old_terminal_line);
        this.refresh();
       
        this.tabs_load(this);
        this.dirty('timer_save');

        return this.last_exit_code;
    }

    async shell(current_terminal_line)
    {
        const toString = arg =>
        {
            if(arg === '' || arg === null || arg === undefined)
                return '';
            else if(arg === true)
                return 'ok!';
            else if(arg === false)
                return 'error!';
            else if(typeof(arg) == 'string')
                return arg;
            else if(typeof(arg) == 'number')
                return arg.toString();
            else if(Array.isArray(arg))
                return arg.map(toString).join('\t');
            else
            {
                let res = arg.stdout.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
                //if(res.length > 0 && res[res.length - 1] != '\n')
                //    res += '\r\n';
                return res;
            };
        };

        const parse_cmdline = current_terminal_line =>
        {
            let cmds = [];
            for(let cmdline of current_terminal_line.split('&&'))
            {
                let stdout_redirect = null, stdout_redirect_append = null;
                if(cmdline.includes('>>'))
                    [cmdline, stdout_redirect_append] = cmdline.split('>>');
                else if(cmdline.includes('>'))
                    [cmdline, stdout_redirect] = cmdline.split('>');

                let [cmd, ...args] = cmdline.trim().split(' ');
                args = args.map(a => this.expandcollapseuser(a));
                //args = args.map(a => a.startsWith('"') ? a.slice(1) : a).map(a => a.endsWith('"') ? a.slice(0, a.length - 1) : a);

                cmds.push({cmd : cmd, args : args, stdout_redirect : stdout_redirect, stdout_redirect_append : stdout_redirect_append});
            }

            for(const c of cmds)
            {
                let argsqx = [], argsqq = [], join = false;

                for(const a of c.args)
                {
                    if(join)
                        argsqx[argsqx.length - 1] += ' ' + a;
                    else
                        argsqx.push(a);

                    if(a.includes('`'))
                        join = !join;
                }
                join = false;
                c.args = argsqx;

                for(const a of c.args)
                {
                    if(join)
                        argsqq[argsqq.length - 1] += ' ' + (a.endsWith('"') ? a.slice(0, a.length - 1) : a);
                    else
                        argsqq.push(a.startsWith('"') ? (a.endsWith('"') ? a.slice(1, a.length - 1) : a.slice(1)) : a);

                    if((!a.includes('`')) && (a.startsWith('"') ^ a.endsWith('"')))
                        join = !join;
                }
                join = false;
                c.args = argsqq;
            }
            return cmds;
        };


        const expand_subcommand_args = (args, run_busybox_cmd = c => this.busybox.run([c.cmd, ...c.args]).stdout.trim().replaceAll('\n', ' ')) => args.map(a => a.includes('`') ? run_busybox_cmd(parse_cmdline(a.slice(1, a.length - 1))[0]).split(' ') : [a]).flat();

        const anded_commands = parse_cmdline(current_terminal_line);

        for(let {cmd, args, stdout_redirect, stdout_redirect_append} of anded_commands)
        {
            args = expand_subcommand_args(args);

            let print_or_dump = (arg, ...args) => arg && this.terminal_print(toString(arg), ...args);
            
            if(stdout_redirect_append)
            {
                print_or_dump = arg => 
                {
                    const f = this.FS.open(stdout_redirect_append.trim(), 'a');

                    if(typeof(arg) == 'string')
                    {
                        const buf = new Uint8Array(this.busybox.Module.lengthBytesUTF8(arg)+1);
                        const actualNumBytes = this.busybox.Module.stringToUTF8Array(data, buf, 0, buf.length);
                        this.FS.write(f, buf, 0, actualNumBytes);
                    }
                    else
                        this.FS.write(f, arg.stdout_binary, 0, arg.stdout_binary.length);

                    this.FS.close(f);
                }
            }
            else if(stdout_redirect)
            {
                const toString_redirect = arg =>
                {
                    if(typeof(arg) == 'string')
                        return arg;
                    return arg.stdout_binary;
                };

                print_or_dump = arg => this.FS.writeFile(stdout_redirect.trim(), toString_redirect(arg));
            }

            const urlarg = [...this.ui.get_route(), ''][0];
            args = args.map(a => a.replaceAll('$@', urlarg).replaceAll('$?', '' + this.last_exit_code));
            
            const exit_code = res => res === false ? this.EXIT_FAILURE : Number.isInteger(res) ? ('' + res) : this.EXIT_SUCCESS;
            try
            {
                if (cmd == '')
                    continue;

                this.log_small(`$ ${cmd} ` + args.join(' '));

                if(cmd == 'help')
                {
                    print_or_dump(this.shell_commands);
                    this.last_exit_code = this.EXIT_SUCCESS;
                }
                else if(cmd == 'git' && args.length == 0)
                {
                    print_or_dump(this.git_applets);
                    this.last_exit_code = this.EXIT_SUCCESS;
                }
                else if(cmd == 'cache' && args.length > 0 && this.cache_applets.includes(args[0]))
                {
                    print_or_dump(await this['cache_' + args[0]](...args.slice(1)));
                    this.last_exit_code = this.EXIT_SUCCESS;
                }
                else if(cmd == 'hub' && args.length > 0 && this.hub_applets.includes(args[0]))
                {
                    print_or_dump(await this['hub_' + args[0]](...args.slice(1)));
                    this.last_exit_code = this.EXIT_SUCCESS;
                }
                
                else if(cmd == 'git' && args.length > 0 && this.git_applets.includes(args[0]))
                {
                    const res = await this['git_' + args[0]](...args.slice(1));
                    this.last_exit_code = exit_code(res);
                    print_or_dump(res);
                }
                
                else if(this.shell_builtins.includes(cmd))
                {
                    const res = await this[cmd](...args);
                    this.last_exit_code = exit_code(res);
                    print_or_dump(res);
                }
                else if(this.busybox_applets.includes(cmd))
                {
                    const res = this.busybox.run([cmd, ...args]);
                    this.last_exit_code = '' + res.exit_code;
                    print_or_dump(res, '');

                    if(this.last_exit_code != this.EXIT_SUCCESS)
                        throw new Error(res.stderr);
                }
                
                else
                {
                    this.last_exit_code = this.EXIT_FAILURE;
                    const msg = `[${cmd}]: command not found`;
                    this.terminal_print(msg);
                    this.ui.set_error(msg);
                    break;
                }


                if(this.last_exit_code === this.EXIT_SUCCESS)
                    this.ui.set_error('');
                else
                {
                    //throw new Error(`[${cmd}] error code: [${this.last_exit_code}]`);
                    this.ui.set_error(`[${cmd}] error code: [${this.last_exit_code}]`);
                    break;
                }
            }
            catch(err)
            {
                this.last_exit_code = (this.last_exit_code === '' || this.last_exit_code === this.EXIT_SUCCESS) ? this.EXIT_FAILURE : this.last_exit_code;
                const msg = `[${cmd}] last error code: [${this.last_exit_code}], error message: [${err.message || "no message"}]`
                this.terminal_print(msg);
                this.ui.set_error(msg);
                break;
            }
        }
    }

    fetch_via_cors_proxy(url, opts)
    {
        //{headers : {'X-Requested-With': 'XMLHttpRequest'}
        //TODO: LOG every request
        return fetch(this.cors_proxy_fmt.replace('${url}', url), opts);
    }

    async wget(url, _OP = '-O', output_path = null)
    {
        //TODO: replace by curl +- compressed?
        output_path = _OP == '-P' ? this.PATH.join(output_path, this.PATH.basename(url)) : (output_path || this.PATH.basename(url));
        const resp = await this.fetch_via_cors_proxy(url);

        if(resp.status != this.HTTP_OK)
        {
            let text = '';
            try
            {
                text = await resp.text();
            }
            catch(err)
            {
                text = `Could not get response text: [${err.toString()}], stack: [${err.stack}]`;
            }
            throw new Error(`HTTP request to [${url}] failed with status [${resp.status}], status text: [${resp.statusText}], response text: [${text}]`);
        }
        this.FS.writeFile(output_path, new Uint8Array(await resp.arrayBuffer()));
    }

    inline_clone(serialized)
    {
        const files = this.deserialize_project(serialized);
        project_dir = this.shared_project;
        this.FS.mkdir(project_dir)

        let dirs = new Set(['/', project_dir]);
        for(const {path, contents} of files.sort((lhs, rhs) => lhs['path'] < rhs['path'] ? -1 : 1))
        {
            const absolute_path = this.PATH.join(project_dir, path);
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

    async init(route0, route1)
    {
        //TODO: clean up if error?
        if(!route0)
        {
            const url = new URL(route1);
            
            if(this.archive_extensions.some(ext => url.pathname.endsWith(ext)))
                route0 = 'archive';
 
            else if(this.text_extensions.some(ext => url.pathname.endsWith(ext)))
                route0 = 'file';

            else if(this.github.hosts.includes(url.host))
                route0 = 'github';
            
            else if('arxiv.org' == url.host)
                route0 = 'arxiv';
            
            else if('data:' == url.protocol && url.pathname.startsWith(this.data_uri_prefix_tar_gz.slice('data:'.length)))
                [route0, route1] = [this.data_uri_prefix_tar_gz, route1.slice(this.data_uri_prefix_tar_gz.length)];
        }
       
        if(route0 == 'github')
        {
            const parsed = this.github.parse_url(route1);
            const project_dir = parsed.reponame;
            [this.ui.github_https_path.value, this.ui.github_branch.value] = [parsed.path, parsed.branch];
            const cmds = [this.cmd('git', 'clone', this.ui.github_https_path.value, ...(parsed.branch ? ['--branch', parsed.branch] : [])), this.cmd('cd', project_dir), this.cmd('open', '.')];
            await this.commands(this.and(...cmds));
        }
        if(route0 == 'arxiv')
        {
            const arxiv_https_path = route1.replace('/abs/', '/e-print/');
            const project_dir = this.PATH.join('~', this.PATH.basename(arxiv_https_path));
            // TODO: wget -U busytex, real wget does not gzip-decompress, chrome does https://superuser.com/questions/940605/chromium-prevent-unpacking-tar-gz
            const cmds = [this.cmd('wget', arxiv_https_path, '-O', this.arxiv_path), this.cmd('mkdir', project_dir), this.cmd('tar', '-xf', this.arxiv_path, '-C', project_dir), this.cmd('cd', project_dir), this.cmd('open', '.')];
            
            this.log_big(`Opening project from arxiv [${route1}]...`);

            await this.commands(this.and(...cmds));
        }
        if(route0 == 'archive')
        {
            const file_https_path = route1;
            const basename = this.PATH.basename(file_https_path);
            const basename_noext = basename.slice(0, basename.indexOf('.'));

            let file_path = this.PATH.join(this.tmp_dir, basename);
            
            let download_cmds = [];
            if(this.exists(file_https_path))
                file_path = file_https_path;
            else
                download_cmds = [this.cmd('wget', this.arg(file_https_path), '-O', this.arg(file_path))]

            this.rm_rf(this.tmp_decompressed);
            this.mkdir_p(this.tmp_decompressed);

            const decompress_cmds = 
                
                file_https_path.endsWith('.tar.gz')
                    ? [this.cmd('gzip', '-d', this.arg(file_path)), this.cmd('tar', '-xf', this.arg(file_path.replace('.gz', '')), '-C', this.tmp_decompressed)] 
                
                : file_https_path.endsWith('.tar')
                    ? [this.cmd('tar', '-xf', this.arg(file_path), '-C', this.tmp_decompressed)] 
                
                : file_https_path.endsWith('.zip')
                    ? [this.cmd('busyz', 'unzip', this.arg(file_path), '-d', this.tmp_decompressed)]
                
                : []; 

            this.log_big(`Opening project from archive [${route1}]...`);
            
            const cmds1 = [...download_cmds, ...decompress_cmds]
            await this.commands(this.and(...cmds1));

            if(this.last_exit_code != this.EXIT_SUCCESS)
                return this.last_exit_code;
            
            const src_path = this.strip_components(this.tmp_decompressed);

            const project_dir = this.PATH.join('~', (src_path && src_path != this.tmp_decompressed) ? this.PATH.basename(src_path) : basename_noext);
            const cmds2 = [this.cmd('rename', this.arg(src_path), this.arg(project_dir)), this.cmd('cd', this.arg(project_dir)), this.cmd('open', '.')];
            await this.commands(this.and(...cmds2));
        }
        if(route0 == 'file')
        {
            const path = route1;
            const basename = this.PATH.basename(path);
            const file_path = this.PATH.join(this.tmp_dir, basename);
            const project_dir = this.PATH.join('~', basename.slice(0, basename.indexOf('.')));
            
            this.log_big(`Opening project from file [${route1}]...`);
            const cmds = [this.cmd('mkdir', this.arg(project_dir)), path.startsWith('http://') || path.startsWith('https://') ? this.cmd('wget', this.arg(path), '-P', this.arg(project_dir)) : this.cmd('cp', this.arg(path), this.arg(project_dir)), this.cmd('cd', this.arg(project_dir)), this.cmd('open', '.')];
            await this.commands(this.and(...cmds));
        }
        if(route0 == this.data_uri_prefix_tar_gz)
        {
            this.log_big(`Opening project from data URI (*.tar.gz)...`);
            const cmds = [this.cmd('echo', '$@', '>', this.share_link_log), this.cmd('sed', '-i', '-e', this.qq(`s#${this.data_uri_prefix_tar_gz}##`), this.share_link_log), this.cmd('base64', '-d', this.share_link_log, '>', this.shared_project_targz), this.cmd('gzip', '-d', this.shared_project_targz), 'cd', this.cmd('tar', '-xf', this.shared_project_tar), this.cmd('open', '.')];
            //TODO: open single subdirectory? or single non-readme
            await this.commands(this.and(...cmds));
        }

        this.log_big('OK!');

        return this.last_exit_code;
    }

    async run(busybox_module_constructor, busybox_wasm_module_promise)
    {
        this.ui.set_error('');
        
        this.compiler.postMessage({
            ...this.paths,
            texmf_local : this.texmf_local,

            preload_data_packages_js : this.paths.texlive_data_packages_js.slice(0, 1),
            data_packages_js : this.paths.texlive_data_packages_js
        });

        this.busybox = new Busybox(busybox_module_constructor, busybox_wasm_module_promise, this.log_small.bind(this));
        
        this.log_big_header('Loading BusyBox...');
        try
        {
            await this.busybox.load();
        }
        catch(err)
        {
            this.last_exit_code = this.EXIT_FAILURE;
            const msg = `[busybox] last error code: [${this.last_exit_code}], error message: [${err.message || "no message"}]`
            this.ui.set_error(msg);
            this.log_big(msg);
            return;
        }
        this.log_big('Loading BusyBox... OK!');
        
        this.PATH = this.busybox.Module.PATH;
        this.FS = this.busybox.Module.FS;
        this.FS.mkdir(this.readme_dir);
        this.FS.mkdir(this.cache_dir);
        this.mkdir_p(this.git_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.writeFile(this.readme_tex, this.readme);
        this.FS.writeFile(this.versions_txt, this.versions);
        this.FS.writeFile(this.git_log, '');
        this.FS.writeFile(this.big_log, '');
        this.FS.writeFile(this.small_log, '');
        this.FS.writeFile(this.empty_file, '');
        this.FS.chdir(this.home_dir);
        this.github = new Github(this.cache_dir, this.merge.bind(this), this.sha1.bind(this), this.rm_rf.bind(this), this.diff.bind(this), this.fetch_via_cors_proxy.bind(this), this.FS, this.PATH, this);
        
        await this.cache_load();
       
        this.terminal_prompt();
        
        const route = this.ui.get_route();
        if(route.length > 0)
        {
            let exit_code = this.EXIT_SUCCESS;
            try
            {
                exit_code = await this.init(null, ...route);
            }
            catch(err)
            {
                if(exit_code == this.EXIT_SUCCESS)
                    exit_code = this.EXIT_FAILURE;
                await this.commands('man');
                this.ui.set_error(`[init] error code: [${exit_code}], exception: [${err.toString()}]`);
            }
        }
        else
            await this.commands('man');

        this.bind();
        this.dirty('timer_save');
    }
   
    log_big_header(text = '', log_big_sink_path = null)
    {
        this.log_big(this.ui.log_reset_sequence);
        this.ui.toggle_viewer('.log', text + '\n');
        this.log_big_sink_path = log_big_sink_path || this.big_log;
    }

    log_big(text)
    {
        this.ui.log_big(text);
        if(this.log_big_sink_path && this.FS)
            this.FS.writeFile(this.log_big_sink_path, this.read_all_text(this.log_big_sink_path) + text + '\n');
    }
    
    log_small(text)
    {
        this.ui.log_small(text);
        if(this.log_small_sink_path && this.FS)
            this.FS.writeFile(this.log_small_sink_path, this.read_all_text(this.log_small_sink_path) + text + '\n');
    }

    async git_fetch()
    {
        this.log_big_header('$ git fetch', this.git_log); 
        await this.github.fetch(this.log_big.bind(this));
        await this.git_status();
    }

    async hub_release(cmd, ...args)
    {
        this.log_big_header('$ hub release ' + args.join(' '), this.git_log); 
        if(cmd == 'create')
            return this.github.release(this.log_big.bind(this), args.pop());
        else if(cmd == 'edit')
            return this.github.release(this.log_big.bind(this), args.pop(), args.pop());
    }

    rgrep(query)
    {
        const strip_project_dir = (path, project_dir = this.project_dir()) => path.startsWith(project_dir + '/') ? path.slice(project_dir.length + 1) : path;
        const is_texmf_local_dir = abspath => this.project_dir() && this.texmf_local.some(t => abspath.startsWith(this.PATH.join(this.project_dir(), t)));
        const filter_texmf_local = abspath => is_texmf_local_dir(this.FS.cwd()) ? is_texmf_local_dir(abspath) : (!is_texmf_local_dir(abspath));
        
        const stdout = this.busybox.run(['grep', query, '-n', '-i', '-r', this.project_dir()]).stdout;
        const lines = stdout.split('\n').filter(l => l.length > 0).map(l => l.split(':'));
        const search_results = lines.map(splitted => ({path : strip_project_dir(splitted[0]), abspath : splitted[0], line_number : parseInt(splitted[1]), line : splitted.slice(2).join(':')})).filter(f => this.search_extensions.some(ext => f.abspath.toLowerCase().endsWith(ext)) && filter_texmf_local(f.abspath));
        this.ui.update_search_results(query, search_results, this.open.bind(this));
        this.ui.toggle_viewer('searchresults');
    }

    async git_checkout(_b, new_branch_name)
    {
        this.log_big_header('$ git checkout -b ' + new_branch_name, this.git_log);
        await this.github.checkout(this.log_big.bind(this), new_branch_name);

        this.ui.github_branch.value = new_branch_name;
    }

    async git_clone(https_path, __branch, branch)
    {
        this.log_big_header('$ git clone ' + (branch ? `--branch ${branch} ` : '') + https_path, this.git_log); 
        const parsed = this.github.parse_url(https_path);
        
        let repo_path = parsed.reponame;
        this.log_path = this.git_log;
        this.ui.set_current_log(this.log_path);
        
        this.log_big(`Cloning from '${https_path}' into '${repo_path}'...`);
        
        let token_cached = false;
        let token = this.ui.github_token.value;
        if(!token)
        {
            this.log_big(`Searching token cache for '${https_path}'...`);
            this.ui.github_token.value = token = await this.cache_token('get', https_path)
            token_cached = token != '';
            this.log_big(token_cached ? `Token found [${token}] in cache...` : 'Token not found in cache...');
        }

        token = token || this.ui.github_token.value;
        
        const no_branch = !branch;
        if(no_branch && !parsed.gist)
            branch = this.ui.github_branch.value = await this.github.get_default_branch(this.log_big.bind(this), parsed.path);

        const exit_code = await this.github.clone(this.log_big.bind(this), token, https_path, repo_path);
        if(exit_code === false)
            return false;
        
        if(!token_cached && token != '')
        {
            this.log_big(`Caching for '${https_path}' token [${token}]...`);
            await this.cache_token('add', https_path, token);
        }
        
        await this.cache_save();
        this.ui.set_route(this.github.format_url(parsed.username, parsed.reponame, parsed.gist, no_branch ? null : branch));
    }

    git_status()
    {
        this.ui.commit_message.value = '';
        this.ui.update_git_status(this.ui.gitstatus, this.github.status(), this.github.format_url, this.git_difftool.bind(this), this.open.bind(this));
        this.ui.toggle_viewer('gitstatus');
    }

    git_difftool(file_path)
    {
        const abspath = this.abspath(file_path);

        const modified = this.FS.readFile(abspath, {encoding: 'utf8'});
        const original = this.github.cat_file(abspath).contents;
        
        this.close();
        
        const modified_model = this.monaco.editor.createModel(modified, undefined, this.monaco.Uri.file(abspath));
        const original_model = this.monaco.editor.createModel(original, modified_model.getLanguageIdentifier().language);
        
        this.difftool.setModel({original: original_model, modified: modified_model});
        this.difftool.updateOptions({ readOnly: true });

        this.ui.toggle_editor('difftool');
        this.difftool.focus();
    }

    async git_pull()
    {
        this.log_big_header('$ git pull', this.git_log);
        let status = this.github.status();
        status = await this.github.pull(this.log_big.bind(this), status);
        
        //TODO: reload editor if updated
        this.ui.update_git_status(this.ui.gitstatus, status, this.github.format_url, this.git_difftool.bind(this), this.open.bind(this));
        this.ui.toggle_viewer('gitstatus');
    }
    
    git_push()
    {
        this.log_big_header('$ git push', this.git_log); 
        return this.github.push(this.log_big.bind(this), this.github.status(), this.ui.commit_message.value);
    }
    
    git_diff(HEAD, __output, output_path)
    {
        // https://man.openbsd.org/diff.1
        this.log_big_header('$ git diff' + (output_path ? ` --output "${output_path}"` : '')); 
        
        const status = this.github.status();
        const diff = this.github.diff(status);

        if(output_path)
        {
            this.log_big('');
            this.log_big('# To apply the patch locally:');
            this.log_big('');
            this.log_big(`git clone --branch ${status.remote_branch} ${status.repo_url}`);
            this.log_big('cd ' + status.reponame);
            this.log_big('git checkout ' + status.remote_commit);
            this.log_big('git apply ' + this.PATH.basename(output_path));
            
            this.FS.writeFile(output_path, diff);
        }
        else
        {
            this.log_big_header('');
            this.log_big(diff);
            return diff;
        }
    }
    
    async cache_load()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(true, x => x == null ? resolve(true) : reject(false)));
    }
    
    async cache_save()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(false, x => x == null ? resolve(true) : reject(false)));
    }

    async cache_object(cmd)
    {
        if(cmd == 'purge')
        {
            const cached_files = this.FS.readdir(this.cache_dir);
            for(const file_name of cached_files)
                if(file_name != '.' && file_name != '..')
                    this.FS.unlink(this.PATH.join(this.cache_dir, file_name));
            await this.cache_save();
        }
    }

    async cache_token(cmd, github_https_path, token)
    {
        if(cmd == 'purge')
        {
            this.FS.unlink(this.cached_tokens_jsonl);
            await this.cache_save();
        }
        else if(cmd == 'ls')
        {
            const content = this.exists(this.cached_tokens_jsonl) ? this.FS.readFile(this.cached_tokens_jsonl, {encoding: 'utf8'}) : '';
            if(github_https_path != false)
                return content;
            else
                return content != '' ? content.split('\n').filter(s => s != '').map(s => JSON.parse(s)) : [];
        }
        else if(cmd == 'add')
        {
            const parsed = {token: token, ...this.github.parse_url(github_https_path)};
            this.FS.writeFile(this.cached_tokens_jsonl, (await this.cache_token('ls')) + JSON.stringify(parsed) + '\n');
            await this.cache_save();
        }
        else if(cmd == 'get')
        {
            const parsed = this.github.parse_url(github_https_path);
            const tokens = await this.cache_token('ls', false);
            const good = tokens.filter(t => t.username == parsed.username);
            if(good.length > 0)
                return good[0].token;
            return '';

            // for gist:
            // 1. username+reponame+[gist=true]
            // 2. username+[gist=true]
            // 3. username+[gist=false]
            // 4. [gist=true]
            // for non-gist:
            // 1. username+reponame+[gist=false]
            // 2. username
            // 3. [gist=true]
        }
    }

    oncompilermessage(e)
    {
        const {pdf, log, print, exit_code, exception, initialized, logs} = e.data;
        if(initialized)
        {
            this.busytex_applet_versions = initialized;
            this.ui.update_busytex_applet_versions(this.busytex_applet_versions);
        }
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
            this.ui.set_error(exit_code != 0 ? `[latexmk] error code: [${exit_code}]` : '');
        
            //TODO: start caching downloading all remaining data packages?
            this.data_package_resolver.cache_data_packages();
        }
        if(print)
        {
            this.log_small(print);
        }
        if(exception)
        {
            this.ui.set_error(`[latexmk] exception: [${exception}]`);
        }
    }

    project_dir(cwd = null)
    {
        const curdir = this.FS.cwd();

        if(!cwd)
            cwd = this.ui.get_current_tex_path() ? this.PATH.dirname(this.ui.get_current_tex_path()) : curdir;

        console.log('project_dir', 'curdir', curdir, 'cwd', cwd, this.home_dir);

        if(!cwd || !cwd.startsWith(this.home_dir) || cwd == this.home_dir || !curdir.startsWith(cwd))
            return null;

        return cwd.split('/').slice(0, 4).join('/');
    }

    project_tmp_dir()
    {
        return this.project_dir().replace(this.home_dir, this.tmp_dir);
    }

    find_default_path(file_path)
    {
        const tex_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext));
        let default_path = null;
        if(tex_files.length == 1)
            default_path = tex_files[0].path;
        else if(tex_files.length > 1)
        {
            const main_tex_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext) && f.path.includes('main'));
            default_path = main_tex_files.length > 0 ? main_tex_files[0].path : tex_files[0].path;
        }
        if(default_path == null)
        {
            const text_files = this.find(file_path, '', false).filter(f => f.contents != null && this.text_extensions.some(ext => f.path.toLowerCase().endsWith(ext)));
            if(text_files.length == 1)
                default_path = text_files[0].path;
            else if(text_files.length > 1)
            {
                const main_text_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.toUpperCase().includes('README'));
                default_path = main_text_files.length > 0 ? main_text_files[0].path : text_files[0].path;
            }
        }
        return default_path;
    }

    close(file_path, open = true)
    {
        if(!file_path)
            file_path = this.edit_path;

        if(!file_path)
            return;

        const abspath = this.abspath(file_path);
        
        console.log('close', this.edit_path, this.tab);
        if(this.edit_path == abspath)
        {
            if(this.tab)
                this.tab.dispose();

            this.tab = null;
            this.edit_path = null;
            if(open)
                this.open('');
        }
        console.log('close', this.edit_path, this.tab, 'done');
    }

    ls_la(abspath, file_path)
    {
        this.log_big_header('');
        this.log_big_header('$ ls -la ' + this.arg(abspath));
        this.log_big(this.busybox.run(['ls', '-la', file_path]).stdout);
    }

    open(file_path, contents, readonly, language_id_path)
    {
        // readonly https://github.com/microsoft/monaco-editor/issues/54
        const open_editor_tab = (file_path, contents = '', readonly = false, language_id_path = null, line_number = -1) =>
        {
            let abspath = file_path == '' ? '' : this.abspath(file_path);
            
            if(abspath != this.edit_path)
            {
                const oldtab = this.tab;
                console.log('open_editor_tab models before', this.monaco.editor.getModels());

                if(!language_id_path)
                    this.tab = this.monaco.editor.createModel(contents, undefined, this.monaco.Uri.file(abspath));
                else
                {
                    let lang = null;

                    if(this.edit_path == language_id_path)
                    {
                        lang = this.tab.getLanguageIdentifier().language;
                    }
                    else
                    {
                        const sidemodel = this.monaco.editor.createModel('', undefined, this.monaco.Uri.file(language_id_path));
                        lang = sidemodel.getLanguageIdentifier().language;
                        sidemodel.dispose();
                    }

                    this.tab = this.monaco.editor.createModel(contents, lang);
                }
                
                this.editor.setModel(this.tab);

                this.edit_path = abspath;

                //var decorations = this.editor.deltaDecorations([], [	{ range: new monaco.Range(3,1,5,1), options: { isWholeLine: true, linesDecorationsClassName: 'myLineDecoration' }},	{ range: new monaco.Range(7,1,7,24), options: { inlineClassName: 'myInlineDecoration' }},]);


                
                if(oldtab)
                    oldtab.dispose();

                console.log('open_editor_tab models after', this.monaco.editor.getModels());
            }
            
            this.editor.updateOptions({ readOnly: readonly });
            
            if(line_number >= 0)
            {
                // https://stackoverflow.com/questions/57246356/how-to-highlight-merge-conflict-blocks-in-monaco-editor-like-vscode
                this.editor.revealLineInCenter(line_number);
                this.editor.setPosition({column: 1, lineNumber: line_number});
            }

            //var currentState = this.editor.saveViewState();
            //this.editor.restoreViewState(data[desiredModelId].state);
            //this.editor.focus();

            this.ui.toggle_editor('editor');
        };

        const open_viewer_tab = (file_path, contents) =>
        {
            const abspath = file_path == '' ? '' : this.abspath(file_path);
            const viewer_mode = this.viewer_extensions.includes(this.PATH.extname(abspath)) ? this.PATH.extname(abspath) : '.log';
            this.view_path = abspath;
            this.ui.toggle_viewer(viewer_mode, contents);
        };

        let line_number = -1;
        if(typeof(contents) == 'number')
        {
            line_number = contents;
            contents = null;
        }
        
        if(file_path === null)
            file_path = '.';
        
        if(file_path === '')
        {
            this.tex_path = '';
            this.ui.set_current_file('');
            open_editor_tab('');
            this.ui.toggle_viewer('.log', '');
            return;
        }
        else if(file_path != null)
        {
            file_path = this.expandcollapseuser(file_path);

            if(file_path != null && this.isdir(file_path))
            {
                const abspath = this.abspath(file_path);
                const basename = this.PATH.basename(abspath);
                const default_path = (file_path == '.' || file_path == '..') ? this.find_default_path(file_path) : null;
                // open selected project tex path instead of default?
                
                contents = null;
                
                if(default_path == null)
                {
                    this.ui.set_current_file(basename, abspath, 'viewing');

                    if(file_path != '.')
                        open_editor_tab('');
                    
                    file_path = null;
                    return;
                }
                else
                {
                    file_path = this.PATH.join(abspath, default_path);
                    //this.refresh(file_path);
                }
            }
        }

        if(file_path == null && contents == null)
            return;

        const abspath = this.abspath(file_path);
        const basename = this.PATH.basename(abspath);
        const extname = this.PATH.extname(abspath).toLowerCase();
        
        if(extname == '.tex')
            this.tex_path = abspath; // file_path.startsWith('/') ? file_path : (this.FS.cwd() + '/' + file_path);
        
        if(this.viewer_extensions.includes(extname) && this.editor_extensions.includes(extname))
        {
            open_editor_tab(abspath, contents || this.read_all_text(abspath), readonly, language_id_path, line_number);
            open_viewer_tab(abspath, this.read_all_bytes(abspath));
            
            this.ui.set_current_file(basename, abspath, 'viewing');
        }
        else if(this.viewer_extensions.includes(extname))
        {
            open_viewer_tab(abspath, contents || (extname == '.log' ? this.read_all_text(abspath) : this.read_all_bytes(abspath)));
            
            this.ui.set_current_file(basename, abspath, 'viewing');
        }
        else if(this.editor_extensions.includes(extname))
        {
            open_editor_tab(abspath, contents || this.read_all_text(abspath), readonly, language_id_path, line_number);
            
            this.ui.set_current_file(basename, abspath, 'editing');
        }
        else
        {
            //if(extname == '.tar')
            //    contents = this.busybox.run(['tar', '-tvf', abspath]).stdout;
            //else if(extname == '.zip')
            //    contents = this.busybox.run(['busyz', 'unzip', '-l', abspath]).stdout;

            contents = this.busybox.run(['xxd', abspath]).stdout;

            open_viewer_tab(abspath, contents);
            
            this.ui.set_current_file(basename, abspath, 'viewing');
        }
    }

    tabs_save(busyshell)
    {
        if(busyshell.edit_path && busyshell.tab) // TODO: do not save readonly
            busyshell.FS.writeFile(busyshell.edit_path, busyshell.tab.getValue());
        busyshell.ui.set_dirty(false);
    }
    
    tabs_load(busyshell)
    {
        const abspath = busyshell.edit_path;
        const editor_model = busyshell.tab;
        if(abspath && editor_model)
        {
            const value = editor_model.getValue();
            const read = busyshell.read_all_text(abspath);

            if(value != read)
            {
                editor_model.setValue(read);
                busyshell.editor.setModel(editor_model);
            }
        }
        busyshell.ui.set_dirty(false);
    }

    man()
    {
        this.mkdir_p(this.readme_dir);
        this.FS.writeFile(this.readme_tex, this.readme);

        this.cd(this.readme_dir, true);
        this.open(this.readme_tex);
        this.refresh(this.readme_tex);
    }

    async tlmgr(install, __no_depends_at_all, pkg)
    {
        //TODO: update font maps? local font maps?
        this.log_big_header('$ tlmgr install --no-depends-at-all ' + pkg);
        
        let resp = {};
        try
        {
            resp = await this.fetch_via_cors_proxy(this.ctan_package_path + pkg);
        }
        catch(err)
        {
            resp = {status: this.HTTP_FORBIDDEN, statusText : err.toString}; 
        }

        if(this.HTTP_OK != resp.status)
        {
            this.log_big(`Package [${pkg}] not found: [${resp.status}], [${resp.statusText}]`);
            return this.EXIT_FAILURE;
        }

        const j = await resp.json();
        const texlive_package_name = j.texlive;
        console.log('TLMGR', texlive_package_name, j.ctan.path);
        
        const https_path = this.ctan_texlive_archive_pattern.replace('${PKG}', pkg);
        
        const texmf_dist = this.PATH.join(this.project_dir(), this.texmf_local[0], 'texmf-dist');
        this.mkdir_p(texmf_dist);

        //TODO: deletes with OR
        const cmds = [this.cmd('wget', https_path, '-O', this.tar_xz_path), this.cmd('unxz', this.tar_xz_path), this.cmd('tar', '-xf', this.tar_path, '-C', texmf_dist), this.cmd('find', this.arg(texmf_dist), '-name', this.qq('*.pdf'), '-delete'), this.cmd('rm', '-rf', this.arg(this.PATH.join(texmf_dist, 'tlpkg')))];
        this.log_big(`[${this.tar_xz_path}] <CORS- [${https_path}]...`);
        await this.commands(this.and(...cmds));
        this.log_big(`[${this.tar_xz_path}] -> [${texmf_dist}]...`);
    }
   
    async latexmk(tex_path)
    {
        //TODO: successful compilation changes current file, but does not change focus from editor to the viewer, so clicking again on the editor does not change it either. should not change the current file at all?
        let cwd = this.FS.cwd();
        
        if(!cwd.startsWith(this.home_dir) || !tex_path || !tex_path.endsWith(this.tex_ext))
            return;
        
        const abspath = this.abspath(tex_path);

        const verbose = this.ui.verbose.value, tex_driver = this.ui.tex_driver.value;

        this.terminal_print(`Running in background (verbosity = [${verbose}], TeX driver = [${tex_driver}])...`);
        
        // TODO: set_current_pdf / set_current_log only on response from compiler?
        this.pdf_path = abspath.replace(this.tex_ext, '.pdf').replace(this.project_dir(), this.project_tmp_dir());
        this.ui.set_current_pdf(this.pdf_path);
        
        this.log_path = abspath.replace(this.tex_ext, '.log').replace(this.project_dir(), this.project_tmp_dir());
        this.ui.set_current_log(this.log_path);
        
        const project_dir = this.project_dir(cwd);
        const main_tex_path = abspath.slice(project_dir.length + 1);
        const files = this.find(project_dir);

        const data_packages_js = this.ui.get_enabled_data_packages() === null ? null : this.ui.get_enabled_data_packages().map(data_package => this.paths.texlive_data_packages_js.find(p => p.includes(data_package))); 
        const bibtex = this.ui.bibtex.value == 'auto' ? null : (this.ui.bibtex.value == 'enabled');
        
        this.tic();
        this.compiler.postMessage({ files : files, main_tex_path : main_tex_path, verbose : verbose, bibtex : bibtex, driver : tex_driver, data_packages_js : data_packages_js });
    }

    async import_project()
    {
        const paths = await this.upload(this.tmp_dir, [...this.archive_extensions, ...this.text_extensions]);
        if(paths.length == 0)
            return;

        const path = paths[0];
        
        await this.init(this.archive_extensions.includes(this.PATH.extname(path)) ? 'archive' : 'file', path);
    }

    async upload(file_path = null, ext = [])
    {
        const upload_file = file =>
        {
            const src_name = file.name;
            const dst_path = this.isdir(file_path) ? this.PATH.join(file_path, src_name) : (file_path || src_name);
            return new Promise((resolve, reject) => 
            {
                const reader = new FileReader();
                reader.onloadend = ev => {
                    this.FS.writeFile(dst_path, new Uint8Array(reader.result));
                    resolve(dst_path);
                }
                reader.readAsArrayBuffer(file);
            });
        };
        
        const fileupload = this.ui.fileupload;
        if(file_path != null)
            fileupload.removeAttribute('multiple');
        else
            fileupload.setAttribute('multiple', 'true');
        if(ext.length == 0)
            fileupload.removeAttribute('accept');
        else
            fileupload.setAttribute('accept', ext.join(','));
        return new Promise((resolve, reject) =>
        {
            // TODO: handle cancel somehow
            // https://stackoverflow.com/questions/4628544/how-to-detect-when-cancel-is-clicked-on-file-input/32386308
            fileupload.onchange = async () =>
            {
                this.cancel_file_upload = null; 
                const uploads = Array.from(fileupload.files).map(file => upload_file(file));
                const paths = await Promise.all(uploads);
                resolve(paths);
            };
            this.cancel_file_upload = () =>
            {
                this.cancel_file_upload = null; 
                reject(this.EXIT_FAILURE); 
            };
            fileupload.click();
        });
    }

    download(file_path, mime = 'application/octet-stream')
    {
        if(!this.exists(file_path))
            return;

        this.ui.create_and_click_download_link(this.PATH.basename(file_path), this.FS.readFile(file_path), mime);
    }
    
    merge(ours_path, theirs_path, parent_path, df13_diff = '/tmp/df13.diff', df23_diff = '/tmp/df23.diff', conflict_left = '<<<<<<<', conflict_right = '>>>>>>>')
    {
        theirs_path = theirs_path || this.empty_file;
        parent_path = parent_path || this.empty_file;

        const [f1, f2, f3] = [ours_path, parent_path, theirs_path];
        this.FS.writeFile(df13_diff, this.busybox.run(['bsddiff', f1, f3]).stdout_binary);
        this.FS.writeFile(df23_diff, this.busybox.run(['bsddiff', f2, f3]).stdout_binary);
        const edscript = this.busybox.run(['bsddiff3prog', '-E', df13_diff, df23_diff, f1, f2, f3]).stdout + 'w';
        this.busybox.run(['ed', ours_path], edscript);
        
        return edscript.includes(conflict_left) && edscript.includes(conflict_right);
    }

    strip_components(path)
    {
        const a = this.FS.analyzePath(path);
        if(!a.exists)
            return null;

        if(!a.object.isFolder)
            return path;

        const children = Object.values(a.object.contents);
        if(children.length != 1 || !children[0].isFolder)
            return path;

        return this.PATH.join(path, children[0].name);
    }

    find(root = '.', relative_dir_path = '', recurse = true, preserve_directories = false, include_dot_directories = false, read_contents_as_string = true, exclude = [])
    {
        let entries = [];
        if(include_dot_directories)
        {
            const abspath = this.abspath(root);
            entries.push({ path : relative_dir_path || root, name : '.', abspath : abspath, isdir : true});

            if(abspath != '/')
                entries.push({ path : this.PATH.dirname(relative_dir_path || root), name : '..', abspath : this.PATH.normalize(this.PATH.join(root, '..')), isdir : true });
        }
        const absolute_dir_path = this.expandcollapseuser(this.PATH.join(root, relative_dir_path))
        for(const [name, entry] of Object.entries(this.FS.lookupPath(absolute_dir_path, {parent : false}).node.contents))
        {
            const relative_path = relative_dir_path ? this.PATH.join(relative_dir_path, name) : name;
            const absolute_path = this.expandcollapseuser(this.PATH.join(root, relative_path));
            if(entry.isFolder)
            {
                if(!exclude.includes(name))
                {
                    if(preserve_directories)
                        entries.push({path : relative_path, abspath : absolute_path, name : name, isdir : true});
                    if(recurse)
                        entries.push(...this.find(root, relative_path, recurse, preserve_directories, include_dot_directories, read_contents_as_string, exclude));
                }
            }
            else if(absolute_path != this.log_path && absolute_path != this.pdf_path)
            {
                entries.push({path : relative_path, abspath : absolute_path, name : name, contents : this.FS.readFile(absolute_path, {encoding : read_contents_as_string && this.text_extensions.map(ext => absolute_path.endsWith(ext)).includes(true) ? 'utf8' : 'binary'})});
            }
        }
        return entries;
    }

    refresh(selected_file_path = null)
    {
        const project_dir = this.project_dir();
        const files = this.find(this.pwd(), '', false, true, true, true, []);
        files.sort((fa, fb) => (fa.isdir ^ fb.isdir) ? (fa.isdir ? -1 : 1) : fa.name.localeCompare(fb.name));
        
        console.log('refresh', '[', selected_file_path, ']');
        //selected_file_path = selected_file_path || (this.FS.cwd() == this.refresh_cwd && this.ui.filetree.selectedIndex >= 0 ? this.ui.filetree.options[this.ui.filetree.selectedIndex].value : null);
        selected_file_path = selected_file_path || (this.FS.cwd() == this.refresh_cwd ? this.ui.get_selected_file_path() : null);
        // TODO: selected_file_path <- get_current_file(true) if in the good directory
        const project_tex_path = this.exists(this.ui.get_current_tex_path()) ? this.ui.get_current_tex_path() : (selected_file_path || '').endsWith('.tex') ? selected_file_path : null;
        console.log('project_tex_path', project_tex_path, 'get_current_tex_path', this.ui.get_current_tex_path(), 'selected_file_path:', selected_file_path);
        
        console.log('refresh', '(', selected_file_path, ')', 'current tex path (', this.ui.get_current_tex_path(), ')', 'current file (', this.ui.get_current_file(true), ')');

        this.ui.update_file_tree(files, selected_file_path);
        // TODO: keep old tex project path when adding newfile.tex
        // TODO: project file resets when going into a subdir
        this.ui.update_tex_paths(project_dir ? files.filter(f => f.path.endsWith('.tex')) : [], project_tex_path);
        
        this.ui.set_project_name(project_dir ? this.PATH.basename(project_dir) : 'N/A');

        if(this.edit_path && !this.exists(this.edit_path))
        {
            console.log('refresh', 'does not exist', '[', this.edit_path, ']');
            if(this.tab)
            {
                this.tab.dispose();
                this.tab = null;
            }
            this.edit_path = null;
            console.log('edit_path = ', '[', this.edit_path, ']');
        }

        this.refresh_cwd = this.FS.cwd();
    }

    cd(path, refresh = true)
    {
        if(path == '-')
            path = this.OLDPWD;

        this.OLDPWD = this.FS.cwd();
        path = this.expandcollapseuser(path || '~');
        this.FS.chdir(path);

        if(refresh)
            this.refresh(this.FS.cwd() != this.OLDPWD ? this.FS.cwd() : null);
    }

    pwd(replace_home)
    {
        const cwd = this.FS ? this.FS.cwd() : this.home_dir;
        return replace_home == true ? cwd.replace(this.home_dir, '~') : cwd;    
    }
    
    mkdir_p(dirpath, dirs = new Set(['/']))
    {
        //TODO: do not add dirpath
        if(!dirs.has(dirpath) && !this.FS.analyzePath(dirpath).exists)
        {
            this.mkdir_p(this.PATH.dirname(dirpath), dirs);
            this.FS.mkdir(dirpath);
            dirs.add(dirpath);
        }
    }

    rename(src_file_path, dst_file_path)
    {
        const src_abspath = this.abspath(src_file_path), dst_abspath = this.abspath(dst_file_path);
        if(src_abspath == dst_abspath)
            return;

        this.dirty('timer_off');
        this.FS.rename(src_file_path, dst_file_path);
        
        if(src_abspath == this.edit_path)
            this.edit_path = dst_abspath;
        if(src_abspath == this.view_path)
            this.view_path = dst_abspath;
        if(src_abspath == this.pdf_path)
            this.pdf_path = dst_abspath;
        if(src_abspath == this.tex_path)
            this.tex_path = dst_abspath;

        this.refresh();
        this.dirty('timer_save');
    }
}

