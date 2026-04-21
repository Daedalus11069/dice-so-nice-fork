// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://riccisi.gitlab.io',
	base: '/foundryvtt-dice-so-nice',
	outDir: 'public',
	publicDir: 'static',
	integrations: [
		starlight({
			title: 'Dice So Nice!',
			favicon: '/favicon.ico',
			head: [
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/foundryvtt-dice-so-nice/favicon.png' } },
			],
			logo: {
				src: './src/assets/dsn-logo-small.png',
				alt: 'Dice So Nice logo',
			},
			customCss: ['./src/styles/custom.css'],
			social: [
				{ icon: 'gitlab', label: 'GitLab', href: 'https://gitlab.com/riccisi/foundryvtt-dice-so-nice' },
			],
			sidebar: [
				{
					label: 'User Guide',
					items: [
						{ label: 'Getting Started', slug: 'guide/getting-started' },
						{ label: 'Appearance', slug: 'guide/appearance' },
						{ label: 'Per-Actor Appearance', slug: 'guide/actor-appearance' },
						{ label: 'Preferences', slug: 'guide/preferences' },
						{ label: 'Special Effects', slug: 'guide/special-effects' },
						{ label: 'Display', slug: 'guide/performance' },
						{ label: 'Profiles & Data', slug: 'guide/save-files' },
						{ label: 'Dice Library', slug: 'guide/dice-library' },
						{ label: 'Dice Editor', slug: 'guide/dice-editor' },
						{ label: 'Persistent Dice', slug: 'guide/persistent-dice' },
						{ label: 'Rollable Area', slug: 'guide/rollable-area' },
						{ label: 'Macros', slug: 'guide/macros' },
					],
				},
				{
					label: 'Developer Guide',
					items: [
						{
							label: 'Getting Started',
							items: [
								{ label: 'Integration', slug: 'api/integration' },
								{ label: 'Hooks', slug: 'api/hooks' },
								{ label: 'Roll API', slug: 'api/roll' },
								{ label: 'Companion Messages', slug: 'api/companion-messages' },
							],
						},
						{
							label: 'Customization',
							items: [
								{ label: 'Colors & Themes', slug: 'api/customization' },
								{ label: 'Custom Terms', slug: 'api/terms' },
								{ label: 'Custom 3D Models', slug: 'api/3d-models' },
								{ label: 'TexturePacker', slug: 'api/texturepacker' },
							],
						},
						{
							label: 'Dice Systems',
							items: [
								{ label: 'System Settings', slug: 'api/system-settings' },
								{ label: 'Custom Shaders', slug: 'api/shaders' },
								{ label: 'Special Effects', slug: 'api/sfx' },
								{ label: 'Events', slug: 'api/events' },
							],
						},
						{
							label: 'Examples',
							items: [
								{ label: 'Demos', slug: 'api/demos' },
							],
						},
					],
				},
				{ label: 'Add-ons', slug: 'addons' },
			],
		}),
	],
});
