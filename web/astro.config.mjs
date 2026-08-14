// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

const REPO = 'https://github.com/darwinva97/entrevistas-senior';

export default defineConfig({
  site: 'https://entrevistas-senior.darwin-sva-97.workers.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    starlight({
      title: {
        es: 'Entrevistas Senior',
        en: 'Senior Interviews',
      },
      description:
        'Banco de 389 preguntas con respuestas, 10 cursos y simulacros de entrevista por rol y nivel.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      editLink: { baseUrl: `${REPO}/edit/master/` },
      lastUpdated: true,
      pagination: true,
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      components: {
        // Aviso propio cuando una página aún no está traducida.
        Banner: './src/components/Banner.astro',
      },
      sidebar: [
        {
          label: 'Empieza aquí',
          translations: { en: 'Start here' },
          items: [
            { slug: 'guia/como-usar', label: 'Cómo usar esto', translations: { en: 'How to use this' } },
            { slug: 'guia/plan-de-estudio', label: 'Plan de estudio', translations: { en: 'Study plan' } },
            { slug: 'guia/glosario', label: 'Glosario', translations: { en: 'Glossary' } },
            { slug: 'guia/progreso', label: 'Seguimiento', translations: { en: 'Progress tracker' } },
          ],
        },
        {
          label: 'Simulacros de entrevista',
          translations: { en: 'Interview simulations' },
          items: [
            { slug: 'entrevistas', label: 'Cómo funcionan', translations: { en: 'How they work' } },
            {
              label: 'Técnicas por rol',
              translations: { en: 'Technical, by role' },
              items: [{ autogenerate: { directory: 'entrevistas/tecnicas' } }],
            },
            {
              label: 'Funcionales y de comportamiento',
              translations: { en: 'Behavioral & functional' },
              items: [{ autogenerate: { directory: 'entrevistas/funcionales' } }],
            },
          ],
        },
        {
          label: 'Cursos',
          translations: { en: 'Courses' },
          collapsed: true,
          items: [{ autogenerate: { directory: 'cursos', collapsed: true } }],
        },
        {
          label: 'Banco de preguntas',
          translations: { en: 'Question bank' },
          items: [
            { slug: 'banco', label: 'Índice completo', translations: { en: 'Full index' } },
            { label: 'Java', collapsed: true, items: [{ autogenerate: { directory: 'banco/java-microservicios' } }] },
            { label: 'TypeScript / Node', collapsed: true, items: [{ autogenerate: { directory: 'banco/typescript-microservicios' } }] },
            { label: 'Go', collapsed: true, items: [{ autogenerate: { directory: 'banco/golang-microservicios' } }] },
            { label: 'AWS', collapsed: true, items: [{ autogenerate: { directory: 'banco/cloud/aws' } }] },
            { label: 'Azure', collapsed: true, items: [{ autogenerate: { directory: 'banco/cloud/azure' } }] },
            { label: 'GCP', collapsed: true, items: [{ autogenerate: { directory: 'banco/cloud/gcp' } }] },
            { label: 'Microfrontends', collapsed: true, items: [{ autogenerate: { directory: 'banco/microfrontends' } }] },
            { label: 'Seguridad', translations: { en: 'Security' }, collapsed: true, items: [{ autogenerate: { directory: 'banco/seguridad-vulnerabilidades' } }] },
            { label: 'APIs y versionado', translations: { en: 'APIs & versioning' }, collapsed: true, items: [{ autogenerate: { directory: 'banco/versionamiento-apis' } }] },
            { label: 'Casos de estudio', translations: { en: 'Case studies' }, collapsed: true, items: [{ autogenerate: { directory: 'banco/casos-de-estudio' } }] },
          ],
        },
        {
          label: 'Contribuir',
          translations: { en: 'Contributing' },
          items: [{ slug: 'contribuir', label: 'Cómo contribuir', translations: { en: 'How to contribute' } }],
        },
      ],
    }),
    mdx(),
  ],
});
