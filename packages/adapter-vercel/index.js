import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

/**
 * @typedef {import('esbuild').BuildOptions} BuildOptions
 */

/**
 * @param {{
 *   esbuild?: (defaultOptions: BuildOptions) => Promise<BuildOptions> | BuildOptions;
 * }} [options]
 **/
export default function (options) {
	/** @type {import('@sveltejs/kit').Adapter} */
	const adapter = {
		name: '@sveltejs/adapter-vercel',

		async adapt({ utils }) {
			const dir = '.vercel_build_output';

			utils.update_ignores({ patterns: [dir] });
			utils.rimraf(dir);

			const files = fileURLToPath(new URL('./files', import.meta.url));

			const dirs = {
				static: join(dir, 'static'),
				lambda: join(dir, 'functions/node/render')
			};

			// TODO ideally we'd have something like utils.tmpdir('vercel')
			// rather than hardcoding '.svelte-kit/vercel/entry.js', and the
			// relative import from that file to output/server/app.js
			// would be controlled. at the moment we're exposing
			// implementation details that could change
			utils.log.minor('Generating serverless function...');
			utils.copy(join(files, 'entry.js'), '.svelte-kit/vercel/entry.js');

			/** @type {BuildOptions} */
			const defaultOptions = {
				entryPoints: ['.svelte-kit/vercel/entry.js'],
				outfile: join(dirs.lambda, 'index.js'),
				bundle: true,
				inject: [join(files, 'shims.js')],
				platform: 'node'
			};

			const buildOptions =
				options && options.esbuild ? await options.esbuild(defaultOptions) : defaultOptions;

			await esbuild.build(buildOptions);

			writeFileSync(join(dirs.lambda, 'package.json'), JSON.stringify({ type: 'commonjs' }));

			utils.log.minor('Prerendering static pages...');
			await utils.prerender({
				dest: dirs.static
			});

			utils.log.minor('Copying assets...');
			utils.copy_static_files(dirs.static);
			utils.copy_client_files(dirs.static);

			utils.log.minor('Writing routes...');
			utils.copy(join(files, 'routes.json'), join(dir, 'config/routes.json'));
		}
	};

	return adapter;
}
